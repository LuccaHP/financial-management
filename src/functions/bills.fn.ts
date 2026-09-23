import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  accounts,
  cardInstallments,
  categories,
  creditCards,
  invoicePayments,
  recurringRules,
  transactions,
} from '#/db/schema'
import { addMonths, dateInMonth, daysInMonth, monthOf } from '#/lib/dates'
import { dueDateFor } from '#/lib/invoice'
import { ensureSession } from '#/lib/session.server'

/**
 * Item da página de acompanhamento: tudo que precisa ser pago no mês.
 * - 'lancamento': despesa já registrada (inclui recorrentes materializadas)
 * - 'prevista':   recorrente ainda não materializada (meses futuros)
 * - 'fatura':     fatura de cartão que vence no mês
 */
export type BillItem = {
  key: string
  kind: 'lancamento' | 'prevista' | 'fatura'
  description: string
  amountCents: number
  date: string
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  sourceName: string
  paid: boolean
  // referências para as ações da UI (editar/excluir/navegar)
  txId: string | null
  accountId: string | null
  categoryId: string | null
  ruleId: string | null
  cardId: string | null
}

const listInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
})

export const listMonthlyBillsFn = createServerFn()
  .inputValidator(listInput)
  .handler(async ({ data }): Promise<Array<BillItem>> => {
    const session = await ensureSession()
    const month = data.month
    const monthStart = `${month}-01`
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
    const items: Array<BillItem> = []

    // 1) Despesas lançadas no mês. Pagamentos de fatura ficam de fora:
    //    a fatura aparece como item próprio (kind 'fatura') com o status dela.
    const spent = await db
      .select({
        id: transactions.id,
        amountCents: transactions.amountCents,
        description: transactions.description,
        date: transactions.date,
        accountId: transactions.accountId,
        accountName: accounts.name,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
        paidAt: transactions.paidAt,
        invoicePaymentId: invoicePayments.id,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(
        invoicePayments,
        eq(invoicePayments.transactionId, transactions.id),
      )
      .where(
        and(
          eq(transactions.userId, session.id),
          eq(transactions.type, 'expense'),
          gte(transactions.date, monthStart),
          lte(transactions.date, monthEnd),
        ),
      )
      .orderBy(asc(transactions.date))
    for (const row of spent) {
      if (row.invoicePaymentId) continue
      items.push({
        key: `tx-${row.id}`,
        kind: 'lancamento',
        description: row.description,
        amountCents: Number(row.amountCents),
        date: row.date,
        categoryName: row.categoryName,
        categoryColor: row.categoryColor,
        categoryIcon: row.categoryIcon,
        sourceName: row.accountName,
        paid: row.paidAt !== null,
        txId: row.id,
        accountId: row.accountId,
        categoryId: row.categoryId,
        ruleId: null,
        cardId: null,
      })
    }

    // 2) Recorrentes ainda não materializadas no mês pedido (projeção).
    //    month >= nextOccurrenceMonth ⇒ a materialização ainda não passou por
    //    ali (e ocorrências apagadas pelo usuário não renascem na projeção).
    //    Ocorrências materializadas antecipadamente (ex.: marcadas como pagas
    //    num mês futuro) já entram como lançamento — ficam fora da projeção.
    const materialized = await db
      .select({ ruleId: transactions.recurringRuleId })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, session.id),
          eq(transactions.occurrenceMonth, month),
        ),
      )
    const materializedRuleIds = new Set(
      materialized.map((row) => row.ruleId).filter(Boolean),
    )
    const projected = await db
      .select({
        id: recurringRules.id,
        amountCents: recurringRules.amountCents,
        description: recurringRules.description,
        dayOfMonth: recurringRules.dayOfMonth,
        accountName: accounts.name,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
      })
      .from(recurringRules)
      .innerJoin(accounts, eq(recurringRules.accountId, accounts.id))
      .innerJoin(categories, eq(recurringRules.categoryId, categories.id))
      .where(
        and(
          eq(recurringRules.userId, session.id),
          eq(recurringRules.type, 'expense'),
          eq(recurringRules.active, true),
          lte(recurringRules.startMonth, month),
          lte(recurringRules.nextOccurrenceMonth, month),
          or(isNull(recurringRules.endMonth), gte(recurringRules.endMonth, month)),
        ),
      )
      .orderBy(asc(recurringRules.dayOfMonth))
    for (const rule of projected) {
      if (materializedRuleIds.has(rule.id)) continue
      items.push({
        key: `rule-${rule.id}-${month}`,
        kind: 'prevista',
        description: rule.description,
        amountCents: Number(rule.amountCents),
        date: dateInMonth(month, rule.dayOfMonth),
        categoryName: rule.categoryName,
        categoryColor: rule.categoryColor,
        categoryIcon: rule.categoryIcon,
        sourceName: rule.accountName,
        paid: false,
        txId: null,
        accountId: null,
        categoryId: null,
        ruleId: rule.id,
        cardId: null,
      })
    }

    // 3) Faturas de cartão que VENCEM no mês pedido. O vencimento pode cair no
    //    mês da fatura ou no seguinte, então as candidatas são month e month-1.
    const cards = await db
      .select()
      .from(creditCards)
      .where(eq(creditCards.userId, session.id))
    for (const card of cards) {
      for (const invoiceMonth of [addMonths(month, -1), month]) {
        const dueDate = dueDateFor(invoiceMonth, card.closingDay, card.dueDay)
        if (monthOf(dueDate) !== month) continue
        const [{ totalCents }] = await db
          .select({
            totalCents: sql<number>`coalesce(sum(${cardInstallments.amountCents}), 0)::bigint`,
          })
          .from(cardInstallments)
          .where(
            and(
              eq(cardInstallments.cardId, card.id),
              eq(cardInstallments.invoiceMonth, invoiceMonth),
            ),
          )
        if (Number(totalCents) === 0) continue
        const [payment] = await db
          .select({ id: invoicePayments.id })
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.cardId, card.id),
              eq(invoicePayments.invoiceMonth, invoiceMonth),
            ),
          )
        items.push({
          key: `invoice-${card.id}-${invoiceMonth}`,
          kind: 'fatura',
          description: `Fatura ${card.name}`,
          amountCents: Number(totalCents),
          date: dueDate,
          categoryName: null,
          categoryColor: card.color,
          categoryIcon: 'credit-card',
          sourceName: card.name,
          paid: payment !== undefined,
          txId: null,
          accountId: null,
          categoryId: null,
          ruleId: null,
          cardId: card.id,
        })
      }
    }

    items.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.description.localeCompare(b.description),
    )
    return items
  })

/**
 * Marca uma ocorrência PREVISTA de recorrente como paga: materializa o
 * lançamento do mês antecipadamente (idempotente pelo unique parcial
 * rule+mês) já com paid_at. Quando o mês chegar, a materialização normal
 * faz onConflictDoNothing e não duplica.
 */
export const setRecurringOccurrencePaidFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      ruleId: z.uuid(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      paid: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const [rule] = await db
      .select()
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.id, data.ruleId),
          eq(recurringRules.userId, session.id),
        ),
      )
    if (!rule) throw new Error('Recorrente não encontrada')
    if (
      data.month < rule.startMonth ||
      (rule.endMonth !== null && data.month > rule.endMonth)
    ) {
      throw new Error('Mês fora da vigência da recorrente')
    }

    await db
      .insert(transactions)
      .values({
        userId: session.id,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        type: rule.type,
        amountCents: rule.amountCents,
        description: rule.description,
        date: dateInMonth(data.month, rule.dayOfMonth),
        recurringRuleId: rule.id,
        occurrenceMonth: data.month,
      })
      .onConflictDoNothing()
    await db
      .update(transactions)
      .set({ paidAt: data.paid ? new Date() : null })
      .where(
        and(
          eq(transactions.recurringRuleId, rule.id),
          eq(transactions.occurrenceMonth, data.month),
        ),
      )
  })
