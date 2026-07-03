import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { accounts, categories, transactions } from './finance'

export const creditCards = pgTable('credit_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  limitCents: bigint('limit_cents', { mode: 'number' }).notNull(),
  // 1–28 para evitar meses curtos
  closingDay: integer('closing_day').notNull(),
  dueDay: integer('due_day').notNull(),
  color: text('color').notNull().default('#4d79ff'),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const cardPurchases = pgTable('card_purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  cardId: uuid('card_id')
    .notNull()
    .references(() => creditCards.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, {
    onDelete: 'set null',
  }),
  description: text('description').notNull(),
  totalAmountCents: bigint('total_amount_cents', { mode: 'number' }).notNull(),
  installmentsCount: integer('installments_count').notNull().default(1),
  purchaseDate: date('purchase_date').notNull(),
  firstInvoiceMonth: char('first_invoice_month', { length: 7 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const cardInstallments = pgTable(
  'card_installments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => cardPurchases.id, { onDelete: 'cascade' }),
    // denormalizado para consultas rápidas de fatura
    cardId: uuid('card_id')
      .notNull()
      .references(() => creditCards.id, { onDelete: 'cascade' }),
    installmentNumber: integer('installment_number').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    invoiceMonth: char('invoice_month', { length: 7 }).notNull(),
  },
  (table) => [
    index('card_installments_card_month_idx').on(
      table.cardId,
      table.invoiceMonth,
    ),
  ],
)

export const invoicePayments = pgTable(
  'invoice_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id')
      .notNull()
      .references(() => creditCards.id, { onDelete: 'cascade' }),
    invoiceMonth: char('invoice_month', { length: 7 }).notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    // apagar a transação de pagamento "despaga" a fatura
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('invoice_payments_card_month_uq').on(
      table.cardId,
      table.invoiceMonth,
    ),
  ],
)
