import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { PiggyBank } from 'lucide-react'
import { getBootstrapStatusFn, getSessionFn } from '#/functions/auth.fn'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import { FieldError, Input, Label } from '#/components/ui/input'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const user = await getSessionFn()
    if (user) throw redirect({ to: '/' })
  },
  loader: () => getBootstrapStatusFn(),
  component: LoginPage,
})

function LoginPage() {
  const { needsBootstrap } = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    setLoading(true)
    const data = new FormData(e.currentTarget)
    const { error: err } = await authClient.signIn.email({
      email: String(data.get('email')),
      password: String(data.get('password')),
    })
    setLoading(false)
    if (err) {
      setError(
        err.status === 401
          ? 'E-mail ou senha incorretos.'
          : (err.message ?? 'Erro ao entrar. Tente novamente.'),
      )
      return
    }
    await router.invalidate()
    navigate({ to: '/' })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-[-2px] inline-flex items-center gap-2 border-4 border-line bg-primary px-4 py-2 shadow-brutal">
          <PiggyBank className="size-6 text-primary-ink" strokeWidth={2.5} />
          <span className="font-display text-2xl text-primary-ink uppercase">
            Deyno
          </span>
        </div>
        <form
          onSubmit={onSubmit}
          className="space-y-4 border-4 border-line bg-surface p-6 shadow-brutal-lg"
        >
          <h1 className="font-display text-lg uppercase">Entrar</h1>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <FieldError message={error} />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
          {needsBootstrap && (
            <p className="border-2 border-line bg-surface-2 p-2 text-center text-xs">
              Primeiro acesso?{' '}
              <a href="/registrar" className="font-bold underline">
                Crie a conta de administrador
              </a>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
