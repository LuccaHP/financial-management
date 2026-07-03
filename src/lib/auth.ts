import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { and, count, eq, gt, isNull } from 'drizzle-orm'
import { db } from '#/db'
import { categories, invites, user } from '#/db/schema'
import { DEFAULT_CATEGORIES } from './default-categories'

async function userCount(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(user)
  return row.value
}

async function findValidInvite(token: string) {
  const [invite] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.token, token),
        isNull(invites.usedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
  return invite
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  hooks: {
    // Registro é fechado: só o primeiro usuário (bootstrap) ou quem tem convite válido.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return
      if ((await userCount()) === 0) return

      const inviteToken = (ctx.body as { inviteToken?: string } | undefined)
        ?.inviteToken
      if (!inviteToken) {
        throw new APIError('FORBIDDEN', {
          message: 'Cadastro somente por convite.',
        })
      }
      const invite = await findValidInvite(inviteToken)
      if (!invite) {
        throw new APIError('FORBIDDEN', {
          message: 'Convite inválido, expirado ou já utilizado.',
        })
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          // primeiro usuário do sistema vira admin
          const isFirst = (await userCount()) === 0
          return {
            data: { ...newUser, role: isFirst ? 'admin' : 'user' },
          }
        },
        after: async (newUser, ctx) => {
          const inviteToken = (
            ctx?.body as { inviteToken?: string } | undefined
          )?.inviteToken
          if (inviteToken) {
            await db
              .update(invites)
              .set({ usedAt: new Date(), usedBy: newUser.id })
              .where(eq(invites.token, inviteToken))
          }
          await db.insert(categories).values(
            DEFAULT_CATEGORIES.map((cat) => ({
              userId: newUser.id,
              name: cat.name,
              type: cat.type,
              color: cat.color,
              icon: cat.icon,
              isSystem: cat.isSystem ?? false,
            })),
          )
        },
      },
    },
  },
  plugins: [admin(), tanstackStartCookies()],
})
