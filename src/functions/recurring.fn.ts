import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { accounts, categories, recurringRules, transactions } from '#/db/schema'
import { addMonths, currentMonthKey } from '#/lib/dates'
import { pendingOccurrences } from '#/lib/recurring'
import { ensureSession } from './auth.fn'

/**
 * Materializa as ocorrências pendentes das regras ativas do usuário.
 * Idempotente: o unique parcial (recurring_rule_id, occurrence_month) garante
 * que reexecuções e corridas não dupliquem lançamentos. Ocorrências apagadas
 * pelo usuário não renascem porque next_occurrence_month só anda para frente.
 */
export async function ensureRecurringMaterialized(userId: string) {
  const currentMonth = currentMonthKey()
  const dueRules = await db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.userId, userId),
        eq(recurringRules.active, true),
        lte(recurringRules.nextOccurrenceMonth, currentMonth),
      ),
    )

  for (const rule of dueRules) {
    const occurrences = pendingOccurrences({
      nextOccurrenceMonth: rule.nextOccurrenceMonth,
      endMonth: rule.endMonth,
      dayOfMonth: rule.dayOfMonth,
      currentMonth,
    })
    await db.transaction(async (tx) => {
      if (occurrences.length > 0) {
        await tx
          .insert(transactions)
          .values(
            occurrences.map((occurrence) => ({
              userId,
              accountId: rule.accountId,
              categoryId: rule.categoryId,
              type: rule.type,
              amountCents: rule.amountCents,
              description: rule.description,
              date: occurrence.date,
              recurringRuleId: rule.id,
              occurrenceMonth: occurrence.month,
            })),
          )
          .onConflictDoNothing()
      }
      const finished =
        rule.endMonth !== null && rule.endMonth <= currentMonth
      await tx
        .update(recurringRules)
        .set({
          nextOccurrenceMonth: addMonths(currentMonth, 1),
          ...(finished ? { active: false } : {}),
        })
        .where(eq(recurringRules.id, rule.id))
    })
  }
}

export const ensureRecurringMaterializedFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const session = await ensureSession()
  await ensureRecurringMaterialized(session.id)
})

export type RecurringRow = {
  id: string
  type: 'income' | 'expense'
  amountCents: number
  description: string
  dayOfMonth: number
  startMonth: string
  endMonth: string | null
  nextOccurrenceMonth: string
  active: boolean
  accountId: string
  accountName: string
  categoryId: string
  categoryName: string
  categoryColor: string
  categoryIcon: string
}

export const listRecurringFn = createServerFn().handler(
  async (): Promise<Array<RecurringRow>> => {
    const session = await ensureSession()
    const rows = await db
      .select({
        id: recurringRules.id,
        type: recurringRules.type,
        amountCents: recurringRules.amountCents,
        description: recurringRules.description,
        dayOfMonth: recurringRules.dayOfMonth,
        startMonth: recurringRules.startMonth,
        endMonth: recurringRules.endMonth,
        nextOccurrenceMonth: recurringRules.nextOccurrenceMonth,
        active: recurringRules.active,
        accountId: recurringRules.accountId,
        accountName: accounts.name,
        categoryId: recurringRules.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
      })
      .from(recurringRules)
      .innerJoin(accounts, eq(recurringRules.accountId, accounts.id))
      .innerJoin(categories, eq(recurringRules.categoryId, categories.id))
      .where(eq(recurringRules.userId, session.id))
      .orderBy(asc(recurringRules.dayOfMonth))
    return rows.map((row) => ({ ...row, amountCents: Number(row.amountCents) }))
  },
)

const recurringInput = z.object({
  type: z.enum(['income', 'expense']),
  amountCents: z.number().int().positive(),
  description: z.string().trim().min(1).max(200),
  dayOfMonth: z.number().int().min(1).max(31),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  endMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  accountId: z.uuid(),
  categoryId: z.uuid(),
})

export const createRecurringFn = createServerFn({ method: 'POST' })
  .inputValidator(recurringInput)
  .handler(async ({ data }) => {
    const session = await ensureSession()
    if (data.endMonth && data.endMonth < data.startMonth) {
      throw new Error('O mês final não pode ser antes do inicial.')
    }
    const [created] = await db
      .insert(recurringRules)
      .values({
        ...data,
        userId: session.id,
        // materialização backfilla a partir daqui
        nextOccurrenceMonth: data.startMonth,
      })
      .returning()
    return created
  })

export const updateRecurringFn = createServerFn({ method: 'POST' })
  .inputValidator(recurringInput.extend({ id: z.uuid(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const { id, ...values } = data
    if (values.endMonth && values.endMonth < values.startMonth) {
      throw new Error('O mês final não pode ser antes do inicial.')
    }
    const [updated] = await db
      .update(recurringRules)
      .set(values)
      .where(
        and(eq(recurringRules.id, id), eq(recurringRules.userId, session.id)),
      )
      .returning()
    if (!updated) throw new Error('Recorrência não encontrada')
    return updated
  })

export const toggleRecurringFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    await db
      .update(recurringRules)
      .set({ active: data.active })
      .where(
        and(
          eq(recurringRules.id, data.id),
          eq(recurringRules.userId, session.id),
        ),
      )
  })

export const deleteRecurringFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    // transações já lançadas ficam (recurring_rule_id vira NULL via FK)
    await db
      .delete(recurringRules)
      .where(
        and(
          eq(recurringRules.id, data.id),
          eq(recurringRules.userId, session.id),
        ),
      )
  })

/** Contagem de lançamentos já materializados por regra (para a UI). */
export const recurringUsageFn = createServerFn().handler(async () => {
  const session = await ensureSession()
  const rows = await db
    .select({
      ruleId: transactions.recurringRuleId,
      total: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, session.id),
        sql`${transactions.recurringRuleId} is not null`,
      ),
    )
    .groupBy(transactions.recurringRuleId)
  return Object.fromEntries(rows.map((row) => [row.ruleId, row.total]))
})
