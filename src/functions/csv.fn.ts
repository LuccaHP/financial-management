import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { accounts, categories, transactions } from '#/db/schema'
import { serializeTransactionsCsv } from '#/lib/csv'
import { daysInMonth } from '#/lib/dates'
import { ensureSession } from './auth.fn'

/** Exporta as transações do mês (ou todas) como CSV. */
export const exportCsvFn = createServerFn()
  .inputValidator(
    z.object({
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ csv: string; count: number }> => {
    const session = await ensureSession()
    const filters = [eq(transactions.userId, session.id)]
    if (data.month) {
      filters.push(
        gte(transactions.date, `${data.month}-01`),
        lte(
          transactions.date,
          `${data.month}-${String(daysInMonth(data.month)).padStart(2, '0')}`,
        ),
      )
    }
    const rows = await db
      .select({
        date: transactions.date,
        type: transactions.type,
        description: transactions.description,
        amountCents: transactions.amountCents,
        categoryName: categories.name,
        accountName: accounts.name,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...filters))
      .orderBy(asc(transactions.date), asc(transactions.createdAt))

    return {
      csv: serializeTransactionsCsv(
        rows.map((row) => ({ ...row, amountCents: Number(row.amountCents) })),
      ),
      count: rows.length,
    }
  })

const importRow = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['income', 'expense']),
  description: z.string().trim().min(1).max(200),
  amountCents: z.number().int().positive(),
  categoryName: z.string().trim().min(1).max(60),
  accountName: z.string().trim().min(1).max(80),
})

/**
 * Importa linhas já validadas no cliente. Contas precisam existir;
 * categorias desconhecidas são criadas (tipo conforme a linha).
 */
export const importCsvFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ rows: z.array(importRow).min(1).max(5000) }))
  .handler(async ({ data }): Promise<{ imported: number }> => {
    const session = await ensureSession()

    const userAccounts = await db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.userId, session.id))
    const accountByName = new Map(
      userAccounts.map((account) => [account.name.toLowerCase(), account.id]),
    )

    const missingAccounts = [
      ...new Set(
        data.rows
          .map((row) => row.accountName)
          .filter((name) => !accountByName.has(name.toLowerCase())),
      ),
    ]
    if (missingAccounts.length > 0) {
      throw new Error(
        `Contas não encontradas: ${missingAccounts.join(', ')}. Crie-as antes de importar.`,
      )
    }

    const neededCategories = [
      ...new Map(
        data.rows.map((row) => [
          `${row.categoryName.toLowerCase()}|${row.type}`,
          {
            name: row.categoryName,
            type: (row.type === 'income' ? 'receita' : 'despesa') as
              | 'receita'
              | 'despesa',
          },
        ]),
      ).values(),
    ]

    const imported = await db.transaction(async (tx) => {
      // cria categorias que faltam (idempotente pelo unique)
      await tx
        .insert(categories)
        .values(
          neededCategories.map((category) => ({
            userId: session.id,
            name: category.name,
            type: category.type,
          })),
        )
        .onConflictDoNothing()

      const userCategories = await tx
        .select({
          id: categories.id,
          name: categories.name,
          type: categories.type,
        })
        .from(categories)
        .where(
          and(
            eq(categories.userId, session.id),
            inArray(
              categories.name,
              neededCategories.map((category) => category.name),
            ),
          ),
        )
      const categoryByKey = new Map(
        userCategories.map((category) => [
          `${category.name.toLowerCase()}|${category.type}`,
          category.id,
        ]),
      )

      const values = data.rows.map((row) => ({
        userId: session.id,
        accountId: accountByName.get(row.accountName.toLowerCase())!,
        categoryId:
          categoryByKey.get(
            `${row.categoryName.toLowerCase()}|${row.type === 'income' ? 'receita' : 'despesa'}`,
          ) ?? null,
        type: row.type,
        amountCents: row.amountCents,
        description: row.description,
        date: row.date,
      }))
      await tx.insert(transactions).values(values)
      return values.length
    })

    return { imported }
  })
