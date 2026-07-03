import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from './auth'

export const accountType = pgEnum('account_type', [
  'carteira',
  'corrente',
  'poupanca',
  'investimento',
])

export const categoryType = pgEnum('category_type', ['despesa', 'receita'])

export const transactionType = pgEnum('transaction_type', [
  'income',
  'expense',
  'transfer_in',
  'transfer_out',
])

export const recurringType = pgEnum('recurring_type', ['income', 'expense'])

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: accountType('type').notNull(),
  initialBalanceCents: bigint('initial_balance_cents', { mode: 'number' })
    .notNull()
    .default(0),
  color: text('color').notNull().default('#ffd02e'),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: categoryType('type').notNull(),
    color: text('color').notNull().default('#4d79ff'),
    icon: text('icon').notNull().default('tag'),
    isSystem: boolean('is_system').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('categories_user_name_type_uq').on(
      table.userId,
      table.name,
      table.type,
    ),
  ],
)

export const recurringRules = pgTable('recurring_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'restrict' }),
  type: recurringType('type').notNull(),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  description: text('description').notNull(),
  dayOfMonth: integer('day_of_month').notNull(),
  startMonth: char('start_month', { length: 7 }).notNull(),
  endMonth: char('end_month', { length: 7 }),
  nextOccurrenceMonth: char('next_occurrence_month', { length: 7 }).notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    type: transactionType('type').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    description: text('description').notNull(),
    date: date('date').notNull(),
    transferGroupId: uuid('transfer_group_id'),
    recurringRuleId: uuid('recurring_rule_id').references(
      () => recurringRules.id,
      { onDelete: 'set null' },
    ),
    occurrenceMonth: char('occurrence_month', { length: 7 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('transactions_user_date_idx').on(table.userId, table.date),
    index('transactions_account_idx').on(table.accountId),
    index('transactions_category_idx').on(table.categoryId),
    // idempotência da materialização de recorrentes
    uniqueIndex('transactions_recurring_occurrence_uq')
      .on(table.recurringRuleId, table.occurrenceMonth)
      .where(sql`${table.recurringRuleId} IS NOT NULL`),
  ],
)
