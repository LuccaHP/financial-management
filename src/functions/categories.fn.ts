import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { categories, transactions } from '#/db/schema'
import { ensureSession } from './auth.fn'

export const listCategoriesFn = createServerFn().handler(async () => {
  const session = await ensureSession()
  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, session.id))
    .orderBy(asc(categories.type), asc(categories.name))
})

const categoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(['despesa', 'receita']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().trim().min(1).max(40),
})

export const createCategoryFn = createServerFn({ method: 'POST' })
  .inputValidator(categoryInput)
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const [created] = await db
      .insert(categories)
      .values({ ...data, userId: session.id })
      .onConflictDoNothing()
      .returning()
    if (!created) {
      throw new Error(`Já existe uma categoria "${data.name}" desse tipo.`)
    }
    return created
  })

export const updateCategoryFn = createServerFn({ method: 'POST' })
  .inputValidator(
    categoryInput
      .omit({ type: true })
      .extend({ id: z.uuid(), archived: z.boolean() }),
  )
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const { id, ...values } = data
    const [existing] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, session.id)))
    if (!existing) throw new Error('Categoria não encontrada')
    if (existing.isSystem && existing.name !== values.name) {
      throw new Error('Categorias de sistema não podem ser renomeadas.')
    }
    const [updated] = await db
      .update(categories)
      .set(values)
      .where(and(eq(categories.id, id), eq(categories.userId, session.id)))
      .returning()
    return updated
  })

export const deleteCategoryFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const [existing] = await db
      .select()
      .from(categories)
      .where(
        and(eq(categories.id, data.id), eq(categories.userId, session.id)),
      )
    if (!existing) throw new Error('Categoria não encontrada')
    if (existing.isSystem) {
      throw new Error('Categorias de sistema não podem ser excluídas.')
    }
    const [{ used }] = await db
      .select({ used: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.categoryId, data.id))
    if (used > 0) {
      throw new Error(
        'Esta categoria tem transações. Arquive-a em vez de excluir.',
      )
    }
    await db.delete(categories).where(eq(categories.id, data.id))
  })
