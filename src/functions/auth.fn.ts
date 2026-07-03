import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { count } from 'drizzle-orm'
import { db } from '#/db'
import { user } from '#/db/schema'
import { auth } from '#/lib/auth'
import type { SessionUser } from '#/lib/session.server'

export type { SessionUser }

/** Sessão atual (ou null). Usada nos beforeLoad das rotas. */
export const getSessionFn = createServerFn().handler(
  async (): Promise<SessionUser | null> => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    })
    if (!session) return null
    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: (session.user as { role?: string }).role ?? 'user',
    }
  },
)

/** true quando ainda não existe nenhum usuário (modo bootstrap do 1º admin). */
export const getBootstrapStatusFn = createServerFn().handler(
  async (): Promise<{ needsBootstrap: boolean }> => {
    const [row] = await db.select({ value: count() }).from(user)
    return { needsBootstrap: row.value === 0 }
  },
)
