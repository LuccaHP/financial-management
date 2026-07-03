import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ArchiveRestore, Archive, ArrowLeftRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Dialog } from '#/components/ui/dialog'
import { FieldError, Input, Label } from '#/components/ui/input'
import { Select } from '#/components/ui/select'
import {
  createAccountFn,
  deleteAccountFn,
  transferFn,
  updateAccountFn,
} from '#/functions/accounts.fn'
import { cn } from '#/lib/cn'
import { formatCentavos, parseBRL } from '#/lib/money'
import { todayKey } from '#/lib/dates'
import { accountsQuery } from '#/lib/queries'
import type { AccountWithBalance } from '#/functions/accounts.fn'

export const Route = createFileRoute('/_app/contas')({
  loader: ({ context }) => context.queryClient.ensureQueryData(accountsQuery),
  component: ContasPage,
})

const TYPE_LABELS: Record<AccountWithBalance['type'], string> = {
  carteira: 'Carteira',
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  investimento: 'Investimentos',
}

function ContasPage() {
  const { data: accounts } = useSuspenseQuery(accountsQuery)
  const [formOpen, setFormOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [editing, setEditing] = useState<AccountWithBalance | null>(null)

  const active = accounts.filter((account) => !account.archived)
  const archived = accounts.filter((account) => account.archived)
  const totalCents = active.reduce((sum, account) => sum + account.balanceCents, 0)

  return (
    <div>
      <PageHeader
        title="Contas"
        subtitle="Carteiras, contas bancárias e investimentos"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setTransferOpen(true)}
              disabled={active.length < 2}
            >
              <ArrowLeftRight className="size-4" strokeWidth={2.5} />
              Transferir
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Nova conta
            </Button>
          </>
        }
      />

      <Card className="mb-6 inline-block">
        <CardContent className="py-3">
          <p className="text-xs font-bold tracking-wider text-muted uppercase">
            Saldo total
          </p>
          <p
            className={cn(
              'font-money text-3xl font-bold',
              totalCents >= 0 ? 'text-income' : 'text-expense',
            )}
          >
            {formatCentavos(totalCents)}
          </p>
        </CardContent>
      </Card>

      {active.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-display uppercase">Nenhuma conta ainda</p>
            <p className="mt-1 text-sm text-muted">
              Crie sua primeira conta para começar a registrar transações.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onEdit={() => {
                setEditing(account)
                setFormOpen(true)
              }}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-sm tracking-wide text-muted uppercase">
            Arquivadas
          </h2>
          <div className="grid grid-cols-1 gap-4 opacity-70 sm:grid-cols-2 xl:grid-cols-3">
            {archived.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={() => {
                  setEditing(account)
                  setFormOpen(true)
                }}
              />
            ))}
          </div>
        </div>
      )}

      <AccountFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        account={editing}
      />
      <TransferDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        accounts={active}
      />
    </div>
  )
}

function AccountCard({
  account,
  onEdit,
}: {
  account: AccountWithBalance
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['accounts'] })

  const archiveMutation = useMutation({
    mutationFn: () =>
      updateAccountFn({
        data: {
          id: account.id,
          name: account.name,
          type: account.type,
          initialBalanceCents: account.initialBalanceCents,
          color: account.color,
          archived: !account.archived,
        },
      }),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccountFn({ data: { id: account.id } }),
    onSuccess: invalidate,
    onError: (error) => alert(error.message),
  })

  return (
    <Card>
      <div
        className="h-2 border-b-2 border-line"
        style={{ background: account.color }}
      />
      <CardHeader>
        <CardTitle>{account.name}</CardTitle>
        <Badge variant="muted">{TYPE_LABELS[account.type]}</Badge>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            'font-money text-2xl font-bold',
            account.balanceCents >= 0 ? 'text-ink' : 'text-expense',
          )}
        >
          {formatCentavos(account.balanceCents)}
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" strokeWidth={2.5} />
            Editar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
          >
            {account.archived ? (
              <ArchiveRestore className="size-3.5" strokeWidth={2.5} />
            ) : (
              <Archive className="size-3.5" strokeWidth={2.5} />
            )}
            {account.archived ? 'Restaurar' : 'Arquivar'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (confirm(`Excluir a conta "${account.name}"?`)) {
                deleteMutation.mutate()
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-3.5" strokeWidth={2.5} />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AccountFormDialog({
  open,
  onClose,
  account,
}: {
  open: boolean
  onClose: () => void
  account: AccountWithBalance | null
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()

  const mutation = useMutation({
    mutationFn: (data: {
      name: string
      type: AccountWithBalance['type']
      initialBalanceCents: number
      color: string
    }) =>
      account
        ? updateAccountFn({
            data: { ...data, id: account.id, archived: account.archived },
          })
        : createAccountFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      onClose()
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    const form = new FormData(e.currentTarget)
    const initialBalanceCents = parseBRL(String(form.get('initialBalance')))
    if (initialBalanceCents === null) {
      setError('Saldo inicial inválido. Use o formato 1.234,56.')
      return
    }
    mutation.mutate({
      name: String(form.get('name')),
      type: String(form.get('type')) as AccountWithBalance['type'],
      initialBalanceCents,
      color: String(form.get('color')),
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={account ? 'Editar conta' : 'Nova conta'}
    >
      <form onSubmit={onSubmit} className="space-y-4" key={account?.id ?? 'new'}>
        <div>
          <Label htmlFor="account-name">Nome</Label>
          <Input
            id="account-name"
            name="name"
            required
            maxLength={80}
            defaultValue={account?.name}
            placeholder="Nubank, Carteira…"
          />
        </div>
        <div>
          <Label htmlFor="account-type">Tipo</Label>
          <Select id="account-type" name="type" defaultValue={account?.type}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="account-balance">Saldo inicial (R$)</Label>
            <Input
              id="account-balance"
              name="initialBalance"
              inputMode="decimal"
              defaultValue={
                account
                  ? (account.initialBalanceCents / 100).toFixed(2).replace('.', ',')
                  : '0,00'
              }
            />
          </div>
          <div>
            <Label htmlFor="account-color">Cor</Label>
            <Input
              id="account-color"
              name="color"
              type="color"
              defaultValue={account?.color ?? '#ffd02e'}
              className="h-[38px] cursor-pointer p-1"
            />
          </div>
        </div>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function TransferDialog({
  open,
  onClose,
  accounts,
}: {
  open: boolean
  onClose: () => void
  accounts: Array<AccountWithBalance>
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()

  const mutation = useMutation({
    mutationFn: (data: {
      fromAccountId: string
      toAccountId: string
      amountCents: number
      date: string
      description: string
    }) => transferFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      onClose()
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    const form = new FormData(e.currentTarget)
    const amountCents = parseBRL(String(form.get('amount')))
    if (amountCents === null || amountCents <= 0) {
      setError('Valor inválido.')
      return
    }
    mutation.mutate({
      fromAccountId: String(form.get('from')),
      toAccountId: String(form.get('to')),
      amountCents,
      date: String(form.get('date')),
      description: String(form.get('description')),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Transferir entre contas">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="transfer-from">De</Label>
            <Select id="transfer-from" name="from" required>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="transfer-to">Para</Label>
            <Select
              id="transfer-to"
              name="to"
              required
              defaultValue={accounts[1]?.id}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="transfer-amount">Valor (R$)</Label>
            <Input
              id="transfer-amount"
              name="amount"
              inputMode="decimal"
              required
              placeholder="0,00"
            />
          </div>
          <div>
            <Label htmlFor="transfer-date">Data</Label>
            <Input
              id="transfer-date"
              name="date"
              type="date"
              required
              defaultValue={todayKey()}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="transfer-description">Descrição (opcional)</Label>
          <Input
            id="transfer-description"
            name="description"
            maxLength={200}
            placeholder="Transferência"
          />
        </div>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Transferindo…' : 'Transferir'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
