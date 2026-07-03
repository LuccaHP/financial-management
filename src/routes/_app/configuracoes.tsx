import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { KeyRound, Moon, Sun, UserPen } from 'lucide-react'
import { PageHeader } from '#/components/page-header'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { FieldError, Input, Label } from '#/components/ui/input'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/_app/configuracoes')({
  component: ConfiguracoesPage,
})

function ConfiguracoesPage() {
  const { user } = Route.useRouteContext()

  return (
    <div>
      <PageHeader title="Configurações" subtitle={user.email} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProfileCard initialName={user.name} />
        <PasswordCard />
        <ThemeCard />
      </div>
    </div>
  )
}

function ProfileCard({ initialName }: { initialName: string }) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: async (name: string) => {
      const result = await authClient.updateUser({ name })
      if (result.error) throw new Error(result.error.message)
    },
    onSuccess: async () => {
      setSaved(true)
      await router.invalidate()
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPen className="size-4" strokeWidth={2.5} />
          Perfil
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            setError(undefined)
            setSaved(false)
            mutation.mutate(
              String(new FormData(e.currentTarget).get('name')),
            )
          }}
        >
          <div>
            <Label htmlFor="profile-name">Nome</Label>
            <Input
              id="profile-name"
              name="name"
              required
              maxLength={120}
              defaultValue={initialName}
            />
          </div>
          <FieldError message={error} />
          {saved && (
            <p className="text-xs font-bold text-income">Nome atualizado!</p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: async (data: {
      currentPassword: string
      newPassword: string
    }) => {
      const result = await authClient.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        revokeOtherSessions: true,
      })
      if (result.error) {
        throw new Error(
          result.error.status === 400
            ? 'Senha atual incorreta.'
            : (result.error.message ?? 'Erro ao trocar a senha.'),
        )
      }
    },
    onSuccess: () => setSaved(true),
    onError: (mutationError) => setError(mutationError.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" strokeWidth={2.5} />
          Trocar senha
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            setError(undefined)
            setSaved(false)
            const form = new FormData(e.currentTarget)
            const newPassword = String(form.get('new'))
            if (newPassword !== String(form.get('confirm'))) {
              setError('As senhas não conferem.')
              return
            }
            mutation.mutate({
              currentPassword: String(form.get('current')),
              newPassword,
            })
            e.currentTarget.reset()
          }}
        >
          <div>
            <Label htmlFor="password-current">Senha atual</Label>
            <Input
              id="password-current"
              name="current"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="password-new">Nova senha</Label>
              <Input
                id="password-new"
                name="new"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="password-confirm">Confirmar</Label>
              <Input
                id="password-confirm"
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          </div>
          <FieldError message={error} />
          {saved && (
            <p className="text-xs font-bold text-income">
              Senha alterada! Outras sessões foram desconectadas.
            </p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Trocando…' : 'Trocar senha'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function ThemeCard() {
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false,
  )

  function setTheme(next: boolean) {
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    document.cookie = `deyno-theme=${next ? 'dark' : 'light'}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tema</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button
          variant={dark ? 'secondary' : 'primary'}
          onClick={() => setTheme(false)}
        >
          <Sun className="size-4" strokeWidth={2.5} />
          Claro
        </Button>
        <Button
          variant={dark ? 'primary' : 'secondary'}
          onClick={() => setTheme(true)}
        >
          <Moon className="size-4" strokeWidth={2.5} />
          Escuro
        </Button>
      </CardContent>
    </Card>
  )
}
