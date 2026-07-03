import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, exists, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  accounts,
  cardInstallments,
  cardPurchases,
  categories,
  creditCards,
  invoicePayments,
  transactions,
} from '#/db/schema'
import { CARD_PAYMENT_CATEGORY } from '#/lib/default-categories'
import { currentMonthKey, formatMonthPt, todayKey } from '#/lib/dates'
import {
  dueDateFor,
  installmentMonths,
  invoiceMonthFor,
  invoiceStatus,
} from '#/lib/invoice'
import { splitInstallments } from '#/lib/money'
import { ensureSession } from './auth.fn'
import type { InvoiceStatus } from '#/lib/invoice'

export type CardRow = {
  id: string
  name: string
  limitCents: number
  closingDay: number
  dueDay: number
  color: string
  archived: boolean
  usedCents: number
  currentInvoiceCents: number
  currentInvoiceMonth: string
  currentInvoiceDueDate: string
}

async function getOwnedCard(userId: string, cardId: string) {
  const [card] = await db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, userId)))
  if (!card) throw new Error('Cartão não encontrado')
  return card
}

/** Soma das parcelas cujo mês de fatura ainda não foi pago (consome limite). */
const unpaidCondition = (cardId: ReturnType<typeof sql>) => sql`
  not exists (
    select 1 from invoice_payments p
    where p.card_id = ${cardId}
      and p.invoice_month = card_installments.invoice_month
  )`

export const listCardsFn = createServerFn().handler(
  async (): Promise<Array<CardRow>> => {
    const session = await ensureSession()
    const cards = await db
      .select()
      .from(creditCards)
      .where(eq(creditCards.userId, session.id))
      .orderBy(asc(creditCards.createdAt))

    const currentMonth = currentMonthKey()
    const result: Array<CardRow> = []
    for (const card of cards) {
      const [{ usedCents }] = await db
        .select({
          usedCents: sql<number>`coalesce(sum(${cardInstallments.amountCents}), 0)::bigint`,
        })
        .from(cardInstallments)
        .where(
          and(
            eq(cardInstallments.cardId, card.id),
            unpaidCondition(sql`${cardInstallments.cardId}`),
          ),
        )
      const [{ invoiceCents }] = await db
        .select({
          invoiceCents: sql<number>`coalesce(sum(${cardInstallments.amountCents}), 0)::bigint`,
        })
        .from(cardInstallments)
        .where(
          and(
            eq(cardInstallments.cardId, card.id),
            eq(cardInstallments.invoiceMonth, currentMonth),
          ),
        )
      result.push({
        id: card.id,
        name: card.name,
        limitCents: Number(card.limitCents),
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        color: card.color,
        archived: card.archived,
        usedCents: Number(usedCents),
        currentInvoiceCents: Number(invoiceCents),
        currentInvoiceMonth: currentMonth,
        currentInvoiceDueDate: dueDateFor(
          currentMonth,
          card.closingDay,
          card.dueDay,
        ),
      })
    }
    return result
  },
)

const cardInput = z.object({
  name: z.string().trim().min(1).max(80),
  limitCents: z.number().int().positive(),
  closingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

export const createCardFn = createServerFn({ method: 'POST' })
  .inputValidator(cardInput)
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const [created] = await db
      .insert(creditCards)
      .values({ ...data, userId: session.id })
      .returning()
    return created
  })

export const updateCardFn = createServerFn({ method: 'POST' })
  .inputValidator(cardInput.extend({ id: z.uuid(), archived: z.boolean() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const { id, ...values } = data
    await getOwnedCard(session.id, id)
    const [updated] = await db
      .update(creditCards)
      .set(values)
      .where(eq(creditCards.id, id))
      .returning()
    return updated
  })

export const deleteCardFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    await getOwnedCard(session.id, data.id)
    const [{ purchases }] = await db
      .select({ purchases: sql<number>`count(*)::int` })
      .from(cardPurchases)
      .where(eq(cardPurchases.cardId, data.id))
    if (purchases > 0) {
      throw new Error('Este cartão tem compras. Arquive-o em vez de excluir.')
    }
    await db.delete(creditCards).where(eq(creditCards.id, data.id))
  })

export const createPurchaseFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      cardId: z.uuid(),
      categoryId: z.uuid(),
      description: z.string().trim().min(1).max(200),
      totalAmountCents: z.number().int().positive(),
      installmentsCount: z.number().int().min(1).max(24),
      purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const card = await getOwnedCard(session.id, data.cardId)
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, data.categoryId),
          eq(categories.userId, session.id),
        ),
      )
    if (!category) throw new Error('Categoria não encontrada')

    const firstInvoiceMonth = invoiceMonthFor(
      data.purchaseDate,
      card.closingDay,
    )
    // não permitir compra caindo em fatura já paga
    const [alreadyPaid] = await db
      .select({ id: invoicePayments.id })
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.cardId, card.id),
          eq(invoicePayments.invoiceMonth, firstInvoiceMonth),
        ),
      )
    if (alreadyPaid) {
      throw new Error(
        `A fatura de ${formatMonthPt(firstInvoiceMonth)} já foi paga. Use outra data.`,
      )
    }

    const amounts = splitInstallments(
      data.totalAmountCents,
      data.installmentsCount,
    )
    const months = installmentMonths(firstInvoiceMonth, data.installmentsCount)

    await db.transaction(async (tx) => {
      const [purchase] = await tx
        .insert(cardPurchases)
        .values({
          userId: session.id,
          cardId: card.id,
          categoryId: data.categoryId,
          description: data.description,
          totalAmountCents: data.totalAmountCents,
          installmentsCount: data.installmentsCount,
          purchaseDate: data.purchaseDate,
          firstInvoiceMonth,
        })
        .returning()
      await tx.insert(cardInstallments).values(
        amounts.map((amountCents, index) => ({
          purchaseId: purchase.id,
          cardId: card.id,
          installmentNumber: index + 1,
          amountCents,
          invoiceMonth: months[index],
        })),
      )
    })
  })

export const deletePurchaseFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const [purchase] = await db
      .select()
      .from(cardPurchases)
      .where(
        and(
          eq(cardPurchases.id, data.id),
          eq(cardPurchases.userId, session.id),
        ),
      )
    if (!purchase) throw new Error('Compra não encontrada')
    const [paid] = await db
      .select({ id: invoicePayments.id })
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.cardId, purchase.cardId),
          exists(
            db
              .select({ one: sql`1` })
              .from(cardInstallments)
              .where(
                and(
                  eq(cardInstallments.purchaseId, purchase.id),
                  eq(
                    cardInstallments.invoiceMonth,
                    invoicePayments.invoiceMonth,
                  ),
                ),
              ),
          ),
        ),
      )
    if (paid) {
      throw new Error(
        'Esta compra tem parcelas em fatura já paga e não pode ser excluída.',
      )
    }
    await db.delete(cardPurchases).where(eq(cardPurchases.id, data.id))
  })

export type InvoiceLine = {
  installmentId: string
  purchaseId: string
  description: string
  purchaseDate: string
  installmentNumber: number
  installmentsCount: number
  amountCents: number
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
}

export type InvoiceView = {
  card: {
    id: string
    name: string
    color: string
    limitCents: number
    closingDay: number
    dueDay: number
  }
  month: string
  lines: Array<InvoiceLine>
  totalCents: number
  status: InvoiceStatus
  dueDate: string
  payment: {
    accountName: string
    paidAt: string
    amountCents: number
  } | null
}

export const getInvoiceFn = createServerFn()
  .inputValidator(
    z.object({
      cardId: z.uuid(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
    }),
  )
  .handler(async ({ data }): Promise<InvoiceView> => {
    const session = await ensureSession()
    const card = await getOwnedCard(session.id, data.cardId)

    const lines = await db
      .select({
        installmentId: cardInstallments.id,
        purchaseId: cardPurchases.id,
        description: cardPurchases.description,
        purchaseDate: cardPurchases.purchaseDate,
        installmentNumber: cardInstallments.installmentNumber,
        installmentsCount: cardPurchases.installmentsCount,
        amountCents: cardInstallments.amountCents,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
      })
      .from(cardInstallments)
      .innerJoin(
        cardPurchases,
        eq(cardInstallments.purchaseId, cardPurchases.id),
      )
      .leftJoin(categories, eq(cardPurchases.categoryId, categories.id))
      .where(
        and(
          eq(cardInstallments.cardId, card.id),
          eq(cardInstallments.invoiceMonth, data.month),
        ),
      )
      .orderBy(asc(cardPurchases.purchaseDate))

    const [payment] = await db
      .select({
        accountName: accounts.name,
        paidAt: invoicePayments.paidAt,
        amountCents: invoicePayments.amountCents,
      })
      .from(invoicePayments)
      .innerJoin(accounts, eq(invoicePayments.accountId, accounts.id))
      .where(
        and(
          eq(invoicePayments.cardId, card.id),
          eq(invoicePayments.invoiceMonth, data.month),
        ),
      )

    const totalCents = lines.reduce(
      (sum, line) => sum + Number(line.amountCents),
      0,
    )

    return {
      card: {
        id: card.id,
        name: card.name,
        color: card.color,
        limitCents: Number(card.limitCents),
        closingDay: card.closingDay,
        dueDay: card.dueDay,
      },
      month: data.month,
      lines: lines.map((line) => ({
        ...line,
        amountCents: Number(line.amountCents),
      })),
      totalCents,
      status: invoiceStatus({
        invoiceMonth: data.month,
        closingDay: card.closingDay,
        today: todayKey(),
        isPaid: payment !== undefined,
      }),
      dueDate: dueDateFor(data.month, card.closingDay, card.dueDay),
      payment: payment
        ? {
            accountName: payment.accountName,
            paidAt: payment.paidAt.toISOString(),
            amountCents: Number(payment.amountCents),
          }
        : null,
    }
  })

export const payInvoiceFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      cardId: z.uuid(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      accountId: z.uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const card = await getOwnedCard(session.id, data.cardId)
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(eq(accounts.id, data.accountId), eq(accounts.userId, session.id)),
      )
    if (!account) throw new Error('Conta não encontrada')

    const [{ totalCents }] = await db
      .select({
        totalCents: sql<number>`coalesce(sum(${cardInstallments.amountCents}), 0)::bigint`,
      })
      .from(cardInstallments)
      .where(
        and(
          eq(cardInstallments.cardId, card.id),
          eq(cardInstallments.invoiceMonth, data.month),
        ),
      )
    if (Number(totalCents) <= 0) {
      throw new Error('Esta fatura não tem valor a pagar.')
    }

    const [existing] = await db
      .select({ id: invoicePayments.id })
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.cardId, card.id),
          eq(invoicePayments.invoiceMonth, data.month),
        ),
      )
    if (existing) throw new Error('Esta fatura já foi paga.')

    const [systemCategory] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, session.id),
          eq(categories.name, CARD_PAYMENT_CATEGORY),
          eq(categories.type, 'despesa'),
        ),
      )

    await db.transaction(async (tx) => {
      const [transaction] = await tx
        .insert(transactions)
        .values({
          userId: session.id,
          accountId: data.accountId,
          categoryId: systemCategory?.id ?? null,
          type: 'expense',
          amountCents: Number(totalCents),
          description: `Fatura ${card.name} — ${formatMonthPt(data.month)}`,
          date: data.date,
        })
        .returning()
      await tx.insert(invoicePayments).values({
        userId: session.id,
        cardId: card.id,
        invoiceMonth: data.month,
        accountId: data.accountId,
        amountCents: Number(totalCents),
        transactionId: transaction.id,
      })
    })
  })
