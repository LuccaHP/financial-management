import {
  bigint,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'

// Proventos recebidos (dividendos/JCP de ações e FIIs). Alimentado pelo
// parse de prints da corretora na página /dividendos.
export const dividends = pgTable(
  'dividends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // ticker ou nome do ativo como veio no print (ex.: MXRF11, PETR4)
    asset: text('asset').notNull(),
    date: date('date').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('dividends_user_date_idx').on(table.userId, table.date),
    // reimportar o mesmo print não duplica linhas
    uniqueIndex('dividends_user_asset_date_amount_uq').on(
      table.userId,
      table.asset,
      table.date,
      table.amountCents,
    ),
  ],
)
