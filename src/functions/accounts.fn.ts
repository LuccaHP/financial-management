import { createServerFn } from '@tanstack/react-start'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { accounts, transactions } from '#/db/schema'
import { ensureSession } from './auth.fn'

export type AccountWithBalance = {
  id: string
  name: string
  type: 'carteira' | 'corrente' | 'poupanca' | 'investimento'
  initialBalanceCents: number
  color: string
  archived: boolean
  balanceCents: number
}

const signedSum = sql<number>`coalesce(sum(
  case when ${transactions.type} in ('income', 'transfer_in')
    then ${transactions.amountCents}
    else -${transactions.amountCents}
  end), 0)::bigint`

export const listAccountsFn = createServerFn().handler(
  async (): Promise<Array<AccountWithBalance>> => {
    const session = await ensureSession()
    const rows = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        initialBalanceCents: accounts.initialBalanceCents,
        color: accounts.color,
        archived: accounts.archived,
        movementCents: signedSum,
      })
      .from(accounts)
      .leftJoin(transactions, eq(transactions.accountId, accounts.id))
      .where(eq(accounts.userId, session.id))
      .groupBy(accounts.id)
      .orderBy(accounts.createdAt)
    return rows.map(({ movementCents, ...account }) => ({
      ...account,
      balanceCents: account.initialBalanceCents + Number(movementCents),
    }))
  },
)

const accountInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['carteira', 'corrente', 'poupanca', 'investimento']),
  initialBalanceCents: z.number().int(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

export const createAccountFn = createServerFn({ method: 'POST' })
  .inputValidator(accountInput)
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const [created] = await db
      .insert(accounts)
      .values({ ...data, userId: session.id })
      .returning()
    return created
  })

export const updateAccountFn = createServerFn({ method: 'POST' })
  .inputValidator(accountInput.extend({ id: z.uuid(), archived: z.boolean() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const { id, ...values } = data
    const [updated] = await db
      .update(accounts)
      .set(values)
      .where(and(eq(accounts.id, id), eq(accounts.userId, session.id)))
      .returning()
    if (!updated) throw new Error('Conta não encontrada')
    return updated
  })

export const deleteAccountFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const [{ used }] = await db
      .select({ used: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.accountId, data.id))
    if (used > 0) {
      throw new Error(
        'Esta conta tem transações. Arquive-a em vez de excluir.',
      )
    }
    await db
      .delete(accounts)
      .where(and(eq(accounts.id, data.id), eq(accounts.userId, session.id)))
  })

export const transferFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      fromAccountId: z.uuid(),
      toAccountId: z.uuid(),
      amountCents: z.number().int().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: z.string().trim().max(200).default(''),
    }),
  )
  .handler(async ({ data }) => {
    const session = await ensureSession()
    if (data.fromAccountId === data.toAccountId) {
      throw new Error('Escolha contas diferentes para transferir.')
    }
    // ambas as contas precisam ser do usuário
    const owned = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, session.id))
    const ownedIds = new Set(owned.map((a) => a.id))
    if (!ownedIds.has(data.fromAccountId) || !ownedIds.has(data.toAccountId)) {
      throw new Error('Conta não encontrada')
    }
    const description = data.description || 'Transferência'
    await db.transaction(async (tx) => {
      const groupId = crypto.randomUUID()
      await tx.insert(transactions).values([
        {
          userId: session.id,
          accountId: data.fromAccountId,
          type: 'transfer_out',
          amountCents: data.amountCents,
          description,
          date: data.date,
          transferGroupId: groupId,
        },
        {
          userId: session.id,
          accountId: data.toAccountId,
          type: 'transfer_in',
          amountCents: data.amountCents,
          description,
          date: data.date,
          transferGroupId: groupId,
        },
      ])
    })
  })
