import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { count } from 'drizzle-orm'
import { db } from '#/db'
import { user } from '#/db/schema'
import { auth } from '#/lib/auth'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: string
}

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

/**
 * Guarda de autenticação para uso DENTRO de server functions.
 * Lança 401 se não houver sessão válida.
 */
export async function ensureSession(): Promise<SessionUser> {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  })
  if (!session) {
    throw new Error('Não autenticado')
  }
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: (session.user as { role?: string }).role ?? 'user',
  }
}

export async function ensureAdmin(): Promise<SessionUser> {
  const session = await ensureSession()
  if (session.role !== 'admin') {
    throw new Error('Acesso restrito a administradores')
  }
  return session
}

/** true quando ainda não existe nenhum usuário (modo bootstrap do 1º admin). */
export const getBootstrapStatusFn = createServerFn().handler(
  async (): Promise<{ needsBootstrap: boolean }> => {
    const [row] = await db.select({ value: count() }).from(user)
    return { needsBootstrap: row.value === 0 }
  },
)
