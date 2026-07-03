import { createServerFn } from '@tanstack/react-start'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  accounts,
  budgets,
  cardInstallments,
  categories,
  creditCards,
  goalContributions,
  goals,
  invoicePayments,
  transactions,
} from '#/db/schema'
import { addMonths, daysInMonth } from '#/lib/dates'
import { ensureSession } from '#/lib/session.server'

export type DashboardData = {
  month: string
  totalBalanceCents: number
  monthIncomeCents: number
  monthExpenseCents: number
  openInvoicesCents: number
  expensesByCategory: Array<{
    name: string
    color: string
    valueCents: number
  }>
  incomeVsExpense: Array<{
    month: string
    incomeCents: number
    expenseCents: number
  }>
  balanceEvolution: Array<{ month: string; balanceCents: number }>
  budgetAlerts: Array<{
    categoryName: string
    categoryColor: string
    spentCents: number
    limitCents: number
  }>
  goalsPreview: Array<{
    id: string
    name: string
    color: string
    savedCents: number
    targetCents: number
  }>
}

const monthRange = (month: string) => ({
  start: `${month}-01`,
  end: `${month}-${String(daysInMonth(month)).padStart(2, '0')}`,
})

export const getDashboardFn = createServerFn()
  .inputValidator(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(async ({ data }): Promise<DashboardData> => {
    const session = await ensureSession()
    const userId = session.id
    const { start, end } = monthRange(data.month)

    // saldo total: iniciais + movimento assinado de todas as contas ativas
    const [{ initialCents }] = await db
      .select({
        initialCents: sql<number>`coalesce(sum(${accounts.initialBalanceCents}), 0)::bigint`,
      })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.archived, false)))
    const [{ movementCents }] = await db
      .select({
        movementCents: sql<number>`coalesce(sum(
          case when ${transactions.type} in ('income', 'transfer_in')
            then ${transactions.amountCents} else -${transactions.amountCents} end
        ), 0)::bigint`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(eq(transactions.userId, userId), eq(accounts.archived, false)))

    // receitas/despesas do mês selecionado (sem transferências)
    const [monthTotals] = await db
      .select({
        incomeCents: sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.type} = 'income'), 0)::bigint`,
        expenseCents: sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.type} = 'expense'), 0)::bigint`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.date, start),
          lte(transactions.date, end),
        ),
      )

    // faturas em aberto: parcelas até o mês selecionado sem pagamento
    const [{ openInvoicesCents }] = await db
      .select({
        openInvoicesCents: sql<number>`coalesce(sum(${cardInstallments.amountCents}), 0)::bigint`,
      })
      .from(cardInstallments)
      .innerJoin(creditCards, eq(cardInstallments.cardId, creditCards.id))
      .where(
        and(
          eq(creditCards.userId, userId),
          eq(creditCards.archived, false),
          lte(cardInstallments.invoiceMonth, data.month),
          sql`not exists (
            select 1 from ${invoicePayments}
            where ${invoicePayments.cardId} = ${cardInstallments.cardId}
              and ${invoicePayments.invoiceMonth} = ${cardInstallments.invoiceMonth}
          )`,
        ),
      )

    // pizza: despesas do mês por categoria
    const expensesByCategory = await db
      .select({
        name: sql<string>`coalesce(${categories.name}, 'Sem categoria')`,
        color: sql<string>`coalesce(${categories.color}, '#adb5bd')`,
        valueCents: sql<number>`sum(${transactions.amountCents})::bigint`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, 'expense'),
          gte(transactions.date, start),
          lte(transactions.date, end),
        ),
      )
      .groupBy(categories.name, categories.color)
      .orderBy(sql`3 desc`)

    // últimos 6 meses: receita × despesa e evolução de saldo
    const sixMonthsAgo = addMonths(data.month, -5)
    const monthly = await db
      .select({
        month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
        incomeCents: sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.type} = 'income'), 0)::bigint`,
        expenseCents: sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.type} = 'expense'), 0)::bigint`,
        netCents: sql<number>`coalesce(sum(
          case when ${transactions.type} in ('income', 'transfer_in')
            then ${transactions.amountCents} else -${transactions.amountCents} end
        ), 0)::bigint`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          lte(transactions.date, end),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`)

    const months: Array<string> = []
    for (let m = sixMonthsAgo; m <= data.month; m = addMonths(m, 1)) {
      months.push(m)
    }
    const byMonth = new Map(monthly.map((row) => [row.month, row]))
    const incomeVsExpense = months.map((month) => ({
      month,
      incomeCents: Number(byMonth.get(month)?.incomeCents ?? 0),
      expenseCents: Number(byMonth.get(month)?.expenseCents ?? 0),
    }))

    // evolução do saldo: acumulado desde o início até cada mês da janela
    let runningCents = Number(initialCents)
    for (const row of monthly) {
      if (row.month < sixMonthsAgo) runningCents += Number(row.netCents)
    }
    const balanceEvolution = months.map((month) => {
      runningCents += Number(byMonth.get(month)?.netCents ?? 0)
      return { month, balanceCents: runningCents }
    })

    // alertas de orçamento (>= 80% do limite no mês selecionado)
    const budgetAlerts = await db
      .select({
        categoryName: categories.name,
        categoryColor: categories.color,
        spentCents: sql<number>`coalesce((
          select sum(t.amount_cents) from transactions t
          where t.user_id = ${userId}
            and t.category_id = ${budgets.categoryId}
            and t.type = 'expense'
            and t.date >= ${start} and t.date <= ${end}
        ), 0)::bigint`,
        limitCents: budgets.limitCents,
      })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id))
      .where(and(eq(budgets.userId, userId), eq(budgets.month, data.month)))

    // objetivos ativos (até 4, mais próximos do alvo primeiro)
    const goalsPreview = await db
      .select({
        id: goals.id,
        name: goals.name,
        color: goals.color,
        targetCents: goals.targetAmountCents,
        savedCents: sql<number>`coalesce(sum(${goalContributions.amountCents}), 0)::bigint`,
      })
      .from(goals)
      .leftJoin(goalContributions, eq(goalContributions.goalId, goals.id))
      .where(and(eq(goals.userId, userId), eq(goals.archived, false)))
      .groupBy(goals.id)
      .orderBy(goals.targetDate)
      .limit(4)

    return {
      month: data.month,
      totalBalanceCents: Number(initialCents) + Number(movementCents),
      monthIncomeCents: Number(monthTotals.incomeCents),
      monthExpenseCents: Number(monthTotals.expenseCents),
      openInvoicesCents: Number(openInvoicesCents),
      expensesByCategory: expensesByCategory.map((row) => ({
        ...row,
        valueCents: Number(row.valueCents),
      })),
      incomeVsExpense,
      balanceEvolution,
      budgetAlerts: budgetAlerts
        .map((row) => ({
          ...row,
          spentCents: Number(row.spentCents),
          limitCents: Number(row.limitCents),
        }))
        .filter((row) => row.spentCents >= row.limitCents * 0.8)
        .sort((a, b) => b.spentCents / b.limitCents - a.spentCents / a.limitCents),
      goalsPreview: goalsPreview.map((row) => ({
        ...row,
        targetCents: Number(row.targetCents),
        savedCents: Number(row.savedCents),
      })),
    }
  })
