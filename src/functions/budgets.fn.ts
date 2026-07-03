import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { budgets, categories, transactions } from '#/db/schema'
import { daysInMonth } from '#/lib/dates'
import { ensureSession } from '#/lib/session.server'

export type BudgetRow = {
  budgetId: string | null
  categoryId: string
  categoryName: string
  categoryColor: string
  categoryIcon: string
  limitCents: number | null
  spentCents: number
}

const monthInput = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })

/**
 * Todas as categorias de despesa ativas com limite (se definido) e gasto do mês.
 * O gasto conta apenas transações de conta — compras no cartão entram quando a
 * fatura é paga (categoria "Cartão de Crédito").
 */
export const listBudgetsFn = createServerFn()
  .inputValidator(monthInput)
  .handler(async ({ data }): Promise<Array<BudgetRow>> => {
    const session = await ensureSession()
    const monthStart = `${data.month}-01`
    const monthEnd = `${data.month}-${String(daysInMonth(data.month)).padStart(2, '0')}`

    const spent = db
      .select({
        categoryId: transactions.categoryId,
        spentCents:
          sql<number>`coalesce(sum(${transactions.amountCents}), 0)::bigint`.as(
            'spent_cents',
          ),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, session.id),
          eq(transactions.type, 'expense'),
          gte(transactions.date, monthStart),
          lte(transactions.date, monthEnd),
        ),
      )
      .groupBy(transactions.categoryId)
      .as('spent')

    const monthBudgets = db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, session.id), eq(budgets.month, data.month)))
      .as('month_budgets')

    const rows = await db
      .select({
        budgetId: monthBudgets.id,
        categoryId: categories.id,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
        limitCents: monthBudgets.limitCents,
        spentCents: spent.spentCents,
      })
      .from(categories)
      .leftJoin(monthBudgets, eq(monthBudgets.categoryId, categories.id))
      .leftJoin(spent, eq(spent.categoryId, categories.id))
      .where(
        and(
          eq(categories.userId, session.id),
          eq(categories.type, 'despesa'),
          eq(categories.archived, false),
        ),
      )
      .orderBy(asc(categories.name))

    return rows.map((row) => ({
      ...row,
      limitCents: row.limitCents === null ? null : Number(row.limitCents),
      spentCents: Number(row.spentCents ?? 0),
    }))
  })

export const upsertBudgetFn = createServerFn({ method: 'POST' })
  .inputValidator(
    monthInput.extend({
      categoryId: z.uuid(),
      limitCents: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, data.categoryId),
          eq(categories.userId, session.id),
          eq(categories.type, 'despesa'),
        ),
      )
    if (!category) throw new Error('Categoria não encontrada')
    await db
      .insert(budgets)
      .values({
        userId: session.id,
        categoryId: data.categoryId,
        month: data.month,
        limitCents: data.limitCents,
      })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.categoryId, budgets.month],
        set: { limitCents: data.limitCents },
      })
  })

export const deleteBudgetFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    await db
      .delete(budgets)
      .where(and(eq(budgets.id, data.id), eq(budgets.userId, session.id)))
  })

/** Copia os limites do mês anterior que ainda não existem no mês alvo. */
export const copyBudgetsFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      fromMonth: z.string().regex(/^\d{4}-\d{2}$/),
      toMonth: z.string().regex(/^\d{4}-\d{2}$/),
    }),
  )
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const source = await db
      .select()
      .from(budgets)
      .where(
        and(eq(budgets.userId, session.id), eq(budgets.month, data.fromMonth)),
      )
    if (source.length === 0) {
      throw new Error('O mês anterior não tem orçamentos para copiar.')
    }
    await db
      .insert(budgets)
      .values(
        source.map((budget) => ({
          userId: session.id,
          categoryId: budget.categoryId,
          month: data.toMonth,
          limitCents: budget.limitCents,
        })),
      )
      .onConflictDoNothing()
    return { copied: source.length }
  })
