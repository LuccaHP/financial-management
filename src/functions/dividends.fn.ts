import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { dividends } from '#/db/schema'
import { daysInMonth } from '#/lib/dates'
import { parseProventosXlsx } from '#/lib/proventos'
import { ensureSession } from '#/lib/session.server'
import type { ProventoRow } from '#/lib/proventos'

export type DividendRow = {
  id: string
  asset: string
  date: string
  amountCents: number
}

/** Parseia o xlsx de proventos da corretora e devolve as linhas pra conferência. */
export const parseProventosFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      // xlsx em base64 (~10 MB máx; o extrato tem poucos KB)
      file: z.string().min(1).max(14_000_000),
    }),
  )
  .handler(async ({ data }): Promise<Array<ProventoRow>> => {
    await ensureSession()
    const bytes = new Uint8Array(Buffer.from(data.file, 'base64'))
    const rows = parseProventosXlsx(bytes)
    if (rows.length === 0) {
      throw new Error('Nenhum provento encontrado na planilha.')
    }
    return rows
  })

const importInput = z.object({
  rows: z
    .array(
      z.object({
        asset: z.string().trim().min(1).max(60),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine((value) => value >= '1990-01-01' && value <= '2100-12-31', {
            message: 'Data fora do intervalo válido.',
          }),
        amountCents: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(1000),
})

/** Importa as linhas conferidas. Reimportar o mesmo extrato não duplica. */
export const importDividendsFn = createServerFn({ method: 'POST' })
  .inputValidator(importInput)
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const inserted = await db
      .insert(dividends)
      .values(
        data.rows.map((row) => ({
          userId: session.id,
          asset: row.asset.toUpperCase(),
          date: row.date,
          amountCents: row.amountCents,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: dividends.id })
    return { inserted: inserted.length, skipped: data.rows.length - inserted.length }
  })

export const listDividendsFn = createServerFn()
  .inputValidator(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(async ({ data }): Promise<Array<DividendRow>> => {
    const session = await ensureSession()
    const monthStart = `${data.month}-01`
    const monthEnd = `${data.month}-${String(daysInMonth(data.month)).padStart(2, '0')}`
    const rows = await db
      .select({
        id: dividends.id,
        asset: dividends.asset,
        date: dividends.date,
        amountCents: dividends.amountCents,
      })
      .from(dividends)
      .where(
        and(
          eq(dividends.userId, session.id),
          gte(dividends.date, monthStart),
          lte(dividends.date, monthEnd),
        ),
      )
      .orderBy(asc(dividends.date), asc(dividends.asset))
    return rows.map((row) => ({ ...row, amountCents: Number(row.amountCents) }))
  })

export const deleteDividendFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    await db
      .delete(dividends)
      .where(and(eq(dividends.id, data.id), eq(dividends.userId, session.id)))
  })
