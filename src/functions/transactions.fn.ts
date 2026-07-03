import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { accounts, categories, invoicePayments, transactions } from '#/db/schema'
import { daysInMonth } from '#/lib/dates'
import { ensureSession } from './auth.fn'

export type TransactionRow = {
  id: string
  type: 'income' | 'expense' | 'transfer_in' | 'transfer_out'
  amountCents: number
  description: string
  date: string
  transferGroupId: string | null
  recurringRuleId: string | null
  accountId: string
  accountName: string
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  isInvoicePayment: boolean
}

const listInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  accountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  search: z.string().trim().max(120).optional(),
})

export const listTransactionsFn = createServerFn()
  .inputValidator(listInput)
  .handler(async ({ data }): Promise<Array<TransactionRow>> => {
    const session = await ensureSession()
    const monthStart = `${data.month}-01`
    const monthEnd = `${data.month}-${String(daysInMonth(data.month)).padStart(2, '0')}`

    const filters = [
      eq(transactions.userId, session.id),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd),
    ]
    if (data.accountId) filters.push(eq(transactions.accountId, data.accountId))
    if (data.categoryId)
      filters.push(eq(transactions.categoryId, data.categoryId))
    if (data.type === 'transfer') {
      filters.push(sql`${transactions.type} in ('transfer_in', 'transfer_out')`)
    } else if (data.type) {
      filters.push(eq(transactions.type, data.type))
    }
    if (data.search) {
      filters.push(ilike(transactions.description, `%${data.search}%`))
    }

    const rows = await db
      .select({
        id: transactions.id,
        type: transactions.type,
        amountCents: transactions.amountCents,
        description: transactions.description,
        date: transactions.date,
        transferGroupId: transactions.transferGroupId,
        recurringRuleId: transactions.recurringRuleId,
        accountId: transactions.accountId,
        accountName: accounts.name,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
        invoicePaymentId: invoicePayments.id,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(
        invoicePayments,
        eq(invoicePayments.transactionId, transactions.id),
      )
      .where(and(...filters))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))

    return rows.map(({ invoicePaymentId, ...row }) => ({
      ...row,
      amountCents: Number(row.amountCents),
      isInvoicePayment: invoicePaymentId !== null,
    }))
  })

const transactionInput = z.object({
  type: z.enum(['income', 'expense']),
  amountCents: z.number().int().positive(),
  description: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountId: z.uuid(),
  categoryId: z.uuid(),
})

async function assertOwnership(
  userId: string,
  accountId: string,
  categoryId: string,
) {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
  if (!account) throw new Error('Conta não encontrada')
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
  if (!category) throw new Error('Categoria não encontrada')
}

export const createTransactionFn = createServerFn({ method: 'POST' })
  .inputValidator(transactionInput)
  .handler(async ({ data }) => {
    const session = await ensureSession()
    await assertOwnership(session.id, data.accountId, data.categoryId)
    const [created] = await db
      .insert(transactions)
      .values({ ...data, userId: session.id })
      .returning()
    return created
  })

export const updateTransactionFn = createServerFn({ method: 'POST' })
  .inputValidator(transactionInput.extend({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const { id, ...values } = data
    await assertOwnership(session.id, values.accountId, values.categoryId)
    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, session.id)))
    if (!existing) throw new Error('Transação não encontrada')
    if (existing.type === 'transfer_in' || existing.type === 'transfer_out') {
      throw new Error(
        'Transferências não podem ser editadas — exclua e crie outra.',
      )
    }
    const [updated] = await db
      .update(transactions)
      .set(values)
      .where(eq(transactions.id, id))
      .returning()
    return updated
  })

export const deleteTransactionFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const [existing] = await db
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.id, data.id), eq(transactions.userId, session.id)),
      )
    if (!existing) throw new Error('Transação não encontrada')
    if (existing.transferGroupId) {
      // exclui as duas pernas da transferência
      await db
        .delete(transactions)
        .where(eq(transactions.transferGroupId, existing.transferGroupId))
      return
    }
    // se for pagamento de fatura, o invoice_payments cai junto (CASCADE) e a fatura reabre
    await db.delete(transactions).where(eq(transactions.id, data.id))
  })

/** Meses com transações (para o navegador de mês não ficar vazio). */
export const transactionMonthsFn = createServerFn().handler(async () => {
  const session = await ensureSession()
  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
    })
    .from(transactions)
    .where(eq(transactions.userId, session.id))
    .groupBy(sql`1`)
    .orderBy(sql`1`)
  return rows.map((row) => row.month)
})
