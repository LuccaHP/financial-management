import { randomBytes } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { invites, user } from '#/db/schema'
import { ensureAdmin } from '#/lib/session.server'

export const listUsersFn = createServerFn().handler(async () => {
  await ensureAdmin()
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
})

export type InviteRow = {
  id: string
  token: string
  email: string | null
  expiresAt: string
  usedAt: string | null
  usedByName: string | null
  createdAt: string
}

export const listInvitesFn = createServerFn().handler(
  async (): Promise<Array<InviteRow>> => {
    await ensureAdmin()
    const rows = await db
      .select({
        id: invites.id,
        token: invites.token,
        email: invites.email,
        expiresAt: invites.expiresAt,
        usedAt: invites.usedAt,
        usedByName: user.name,
        createdAt: invites.createdAt,
      })
      .from(invites)
      .leftJoin(user, eq(invites.usedBy, user.id))
      .orderBy(desc(invites.createdAt))
    return rows.map((row) => ({
      ...row,
      expiresAt: row.expiresAt.toISOString(),
      usedAt: row.usedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
  },
)

export const createInviteFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ email: z.string().trim().email().optional().or(z.literal('')) }),
  )
  .handler(async ({ data }): Promise<{ url: string }> => {
    const admin = await ensureAdmin()
    const token = randomBytes(32).toString('hex')
    await db.insert(invites).values({
      token,
      email: data.email || null,
      createdBy: admin.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    const headers = getRequestHeaders()
    const origin =
      process.env.PUBLIC_URL ??
      process.env.BETTER_AUTH_URL ??
      `http://${headers.get?.('host') ?? 'localhost:3000'}`
    return { url: `${origin.replace(/\/$/, '')}/registrar?token=${token}` }
  })

export const revokeInviteFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await ensureAdmin()
    await db.delete(invites).where(eq(invites.id, data.id))
  })
