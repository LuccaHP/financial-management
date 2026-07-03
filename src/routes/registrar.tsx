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

type RegistrarSearch = { token?: string }

export const Route = createFileRoute('/registrar')({
  validateSearch: (search: Record<string, unknown>): RegistrarSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  beforeLoad: async () => {
    const user = await getSessionFn()
    if (user) throw redirect({ to: '/' })
  },
  loader: () => getBootstrapStatusFn(),
  component: RegistrarPage,
})

function RegistrarPage() {
  const { needsBootstrap } = Route.useLoaderData()
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const closed = !needsBootstrap && !token

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    const data = new FormData(e.currentTarget)
    const password = String(data.get('password'))
    if (password !== String(data.get('confirm'))) {
      setError('As senhas não conferem.')
      return
    }
    setLoading(true)
    const { error: err } = await authClient.signUp.email({
      name: String(data.get('name')),
      email: String(data.get('email')),
      password,
      // validado no hook do servidor (registro somente por convite)
      ...(token ? { inviteToken: token } : {}),
    } as Parameters<typeof authClient.signUp.email>[0])
    setLoading(false)
    if (err) {
      setError(err.message ?? 'Erro ao criar conta.')
      return
    }
    const { error: signInErr } = await authClient.signIn.email({
      email: String(data.get('email')),
      password,
    })
    if (signInErr) {
      setError(signInErr.message ?? 'Conta criada. Faça login para continuar.')
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

        {closed ? (
          <div className="space-y-4 border-4 border-line bg-surface p-6 shadow-brutal-lg">
            <h1 className="font-display text-lg uppercase">
              Cadastro fechado
            </h1>
            <p className="text-sm">
              O Deyno funciona somente por convite. Peça um link de convite a
              um administrador.
            </p>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => navigate({ to: '/login' })}
            >
              Voltar ao login
            </Button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="space-y-4 border-4 border-line bg-surface p-6 shadow-brutal-lg"
          >
            <h1 className="font-display text-lg uppercase">
              {needsBootstrap ? 'Criar conta de administrador' : 'Criar conta'}
            </h1>
            {needsBootstrap && (
              <p className="border-2 border-line bg-surface-2 p-2 text-xs">
                Este é o primeiro acesso: a conta criada agora será a
                administradora do sistema.
              </p>
            )}
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" required placeholder="Seu nome" />
            </div>
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
                minLength={8}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div>
              <Label htmlFor="confirm">Confirmar senha</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Repita a senha"
              />
            </div>
            <FieldError message={error} />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Criando…' : 'Criar conta'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
