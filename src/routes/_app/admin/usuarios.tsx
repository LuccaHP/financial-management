import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Ban, Check, Copy, Link2, Plus, Trash2, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardHeader, CardTitle } from '#/components/ui/card'
import { Dialog } from '#/components/ui/dialog'
import { FieldError, Input, Label } from '#/components/ui/input'
import {
  createInviteFn,
  listInvitesFn,
  listUsersFn,
  revokeInviteFn,
} from '#/functions/admin.fn'
import { authAdminClient } from '#/lib/auth-admin-client'
import { formatDateBR } from '#/lib/dates'

const usersQuery = queryOptions({
  queryKey: ['admin', 'users'],
  queryFn: () => listUsersFn(),
})

const invitesQuery = queryOptions({
  queryKey: ['admin', 'invites'],
  queryFn: () => listInvitesFn(),
})

export const Route = createFileRoute('/_app/admin/usuarios')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(usersQuery),
      context.queryClient.ensureQueryData(invitesQuery),
    ]),
  component: UsuariosPage,
})

function UsuariosPage() {
  const { user: currentUser } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const { data: users } = useSuspenseQuery(usersQuery)
  const { data: invites } = useSuspenseQuery(invitesQuery)
  const [createOpen, setCreateOpen] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string>()
  const [copied, setCopied] = useState(false)

  const inviteMutation = useMutation({
    mutationFn: () => createInviteFn({ data: { email: '' } }),
    onSuccess: ({ url }) => {
      setInviteUrl(url)
      setCopied(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] })
    },
    onError: (error) => alert(error.message),
  })

  const banMutation = useMutation({
    mutationFn: async ({ id, banned }: { id: string; banned: boolean }) => {
      const result = banned
        ? await authAdminClient.admin.unbanUser({ userId: id })
        : await authAdminClient.admin.banUser({ userId: id })
      if (result.error) throw new Error(result.error.message)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (error) => alert(error.message),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeInviteFn({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] }),
  })

  const pendingInvites = invites.filter(
    (invite) =>
      invite.usedAt === null && new Date(invite.expiresAt) > new Date(),
  )

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Gerencie quem tem acesso ao Deyno"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
            >
              <Link2 className="size-4" strokeWidth={2.5} />
              Gerar link de convite
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" strokeWidth={2.5} />
              Criar usuário
            </Button>
          </>
        }
      />

      {inviteUrl && (
        <div className="mb-4 flex flex-wrap items-center gap-2 border-2 border-line bg-primary/20 p-3">
          <span className="text-xs font-bold uppercase">Convite gerado:</span>
          <code className="min-w-0 flex-1 truncate border-2 border-line bg-surface px-2 py-1 font-money text-xs">
            {inviteUrl}
          </code>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(inviteUrl)
              setCopied(true)
            }}
          >
            {copied ? (
              <Check className="size-3.5" strokeWidth={2.5} />
            ) : (
              <Copy className="size-3.5" strokeWidth={2.5} />
            )}
            {copied ? 'Copiado!' : 'Copiar'}
          </Button>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Usuários ({users.length})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-line bg-surface-2 text-left text-[10px] tracking-wider uppercase">
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Papel</th>
                <th className="px-3 py-2">Desde</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-line">
              {users.map((row) => (
                <tr key={row.id} className="hover:bg-surface-2">
                  <td className="px-3 py-2 font-bold">
                    {row.name}
                    {row.id === currentUser.id && (
                      <span className="ml-1 text-xs font-normal text-muted">
                        (você)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{row.email}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex gap-1">
                      <Badge
                        variant={row.role === 'admin' ? 'accent' : 'muted'}
                      >
                        {row.role === 'admin' ? 'Admin' : 'Usuário'}
                      </Badge>
                      {row.banned && <Badge variant="expense">Banido</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-money whitespace-nowrap">
                    {formatDateBR(row.createdAt.toISOString().slice(0, 10))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.id !== currentUser.id && (
                      <Button
                        variant={row.banned ? 'income' : 'danger'}
                        size="sm"
                        onClick={() =>
                          banMutation.mutate({
                            id: row.id,
                            banned: row.banned ?? false,
                          })
                        }
                        disabled={banMutation.isPending}
                      >
                        {row.banned ? (
                          <>
                            <UserCheck className="size-3.5" strokeWidth={2.5} />
                            Reativar
                          </>
                        ) : (
                          <>
                            <Ban className="size-3.5" strokeWidth={2.5} />
                            Banir
                          </>
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Convites pendentes ({pendingInvites.length})</CardTitle>
        </CardHeader>
        {pendingInvites.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            Nenhum convite pendente.
          </p>
        ) : (
          <ul className="divide-y-2 divide-line">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center gap-3 px-4 py-2 text-sm"
              >
                <code className="min-w-0 flex-1 truncate font-money text-xs text-muted">
                  …{invite.token.slice(-12)}
                </code>
                <span className="text-xs whitespace-nowrap text-muted">
                  expira {formatDateBR(invite.expiresAt.slice(0, 10))}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Revogar convite"
                  onClick={() => revokeMutation.mutate(invite.id)}
                >
                  <Trash2 className="size-4" strokeWidth={2.5} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  )
}

function CreateUserDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()

  const mutation = useMutation({
    mutationFn: async (data: {
      name: string
      email: string
      password: string
    }) => {
      const result = await authAdminClient.admin.createUser({
        name: data.name,
        email: data.email,
        password: data.password,
        role: 'user',
      })
      if (result.error) throw new Error(result.error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      onClose()
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    const form = new FormData(e.currentTarget)
    mutation.mutate({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Criar usuário">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="new-user-name">Nome</Label>
          <Input id="new-user-name" name="name" required maxLength={120} />
        </div>
        <div>
          <Label htmlFor="new-user-email">E-mail</Label>
          <Input id="new-user-email" name="email" type="email" required />
        </div>
        <div>
          <Label htmlFor="new-user-password">Senha temporária</Label>
          <Input
            id="new-user-password"
            name="password"
            type="text"
            required
            minLength={8}
            placeholder="Mínimo 8 caracteres"
          />
          <p className="mt-1 text-xs text-muted">
            Compartilhe a senha com a pessoa; ela pode trocá-la em
            Configurações.
          </p>
        </div>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Criando…' : 'Criar usuário'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
