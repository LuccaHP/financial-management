import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, min, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { goalContributions, goals } from '#/db/schema'
import { todayKey } from '#/lib/dates'
import { goalProjection } from '#/lib/goals'
import { ensureSession } from '#/lib/session.server'
import type { GoalProjection } from '#/lib/goals'

export type GoalRow = {
  id: string
  name: string
  targetAmountCents: number
  targetDate: string
  color: string
  archived: boolean
  savedCents: number
  projection: GoalProjection
}

async function loadGoal(userId: string, goalId: string) {
  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
  if (!goal) throw new Error('Objetivo não encontrado')
  return goal
}

function toGoalRow(
  goal: typeof goals.$inferSelect,
  savedCents: number,
  firstContributionDate: string | null,
): GoalRow {
  return {
    id: goal.id,
    name: goal.name,
    targetAmountCents: Number(goal.targetAmountCents),
    targetDate: goal.targetDate,
    color: goal.color,
    archived: goal.archived,
    savedCents,
    projection: goalProjection({
      targetCents: Number(goal.targetAmountCents),
      savedCents,
      targetDate: goal.targetDate,
      sinceDate:
        firstContributionDate ?? goal.createdAt.toISOString().slice(0, 10),
      today: todayKey(),
    }),
  }
}

export const listGoalsFn = createServerFn().handler(
  async (): Promise<Array<GoalRow>> => {
    const session = await ensureSession()
    const rows = await db
      .select({
        goal: goals,
        savedCents: sql<number>`coalesce(sum(${goalContributions.amountCents}), 0)::bigint`,
        firstDate: min(goalContributions.date),
      })
      .from(goals)
      .leftJoin(goalContributions, eq(goalContributions.goalId, goals.id))
      .where(eq(goals.userId, session.id))
      .groupBy(goals.id)
      .orderBy(asc(goals.targetDate))
    return rows.map((row) =>
      toGoalRow(row.goal, Number(row.savedCents), row.firstDate),
    )
  },
)

export type GoalDetail = GoalRow & {
  contributions: Array<{
    id: string
    amountCents: number
    date: string
    note: string | null
  }>
}

export const getGoalFn = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }): Promise<GoalDetail> => {
    const session = await ensureSession()
    const goal = await loadGoal(session.id, data.id)
    const contributions = await db
      .select({
        id: goalContributions.id,
        amountCents: goalContributions.amountCents,
        date: goalContributions.date,
        note: goalContributions.note,
      })
      .from(goalContributions)
      .where(eq(goalContributions.goalId, goal.id))
      .orderBy(desc(goalContributions.date), desc(goalContributions.createdAt))
    const savedCents = contributions.reduce(
      (sum, contribution) => sum + Number(contribution.amountCents),
      0,
    )
    const firstDate =
      contributions.length > 0
        ? contributions[contributions.length - 1].date
        : null
    return {
      ...toGoalRow(goal, savedCents, firstDate),
      contributions: contributions.map((contribution) => ({
        ...contribution,
        amountCents: Number(contribution.amountCents),
      })),
    }
  })

const goalInput = z.object({
  name: z.string().trim().min(1).max(120),
  targetAmountCents: z.number().int().positive(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

export const createGoalFn = createServerFn({ method: 'POST' })
  .inputValidator(goalInput)
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const [created] = await db
      .insert(goals)
      .values({ ...data, userId: session.id })
      .returning()
    return created
  })

export const updateGoalFn = createServerFn({ method: 'POST' })
  .inputValidator(goalInput.extend({ id: z.uuid(), archived: z.boolean() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const { id, ...values } = data
    await loadGoal(session.id, id)
    const [updated] = await db
      .update(goals)
      .set(values)
      .where(eq(goals.id, id))
      .returning()
    return updated
  })

export const deleteGoalFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    await loadGoal(session.id, data.id)
    await db.delete(goals).where(eq(goals.id, data.id))
  })

export const addContributionFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      goalId: z.uuid(),
      // negativo = retirada
      amountCents: z
        .number()
        .int()
        .refine((value) => value !== 0, 'Valor não pode ser zero'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      note: z.string().trim().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await ensureSession()
    await loadGoal(session.id, data.goalId)
    await db.insert(goalContributions).values({
      goalId: data.goalId,
      amountCents: data.amountCents,
      date: data.date,
      note: data.note || null,
    })
  })

export const deleteContributionFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const [contribution] = await db
      .select({ id: goalContributions.id, goalId: goalContributions.goalId })
      .from(goalContributions)
      .where(eq(goalContributions.id, data.id))
    if (!contribution) throw new Error('Aporte não encontrado')
    await loadGoal(session.id, contribution.goalId)
    await db
      .delete(goalContributions)
      .where(eq(goalContributions.id, data.id))
  })
