// Guardas de sessão para uso DENTRO de handlers de server functions.
// Módulo server-only: não importe de código que roda no cliente.
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from './auth'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: string
}

/** Lança 401 se não houver sessão válida. */
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
