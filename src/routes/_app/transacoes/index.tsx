import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Pencil, Plus, Repeat, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { CategoryIcon } from '#/components/category-icon'
import { MonthNavigator } from '#/components/month-navigator'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Dialog } from '#/components/ui/dialog'
import { FieldError, Input, Label } from '#/components/ui/input'
import { Select } from '#/components/ui/select'
import {
  createTransactionFn,
  deleteTransactionFn,
  listTransactionsFn,
  updateTransactionFn,
} from '#/functions/transactions.fn'
import { cn } from '#/lib/cn'
import { currentMonthKey, formatDateBR, todayKey } from '#/lib/dates'
import { formatCentavos, parseBRL } from '#/lib/money'
import { accountsQuery, categoriesQuery } from '#/lib/queries'
import type { TransactionRow } from '#/functions/transactions.fn'

const searchSchema = z.object({
  mes: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  conta: z.string().optional(),
  categoria: z.string().optional(),
  tipo: z.enum(['income', 'expense', 'transfer']).optional(),
  q: z.string().optional(),
})

type Filters = {
  month: string
  accountId?: string
  categoryId?: string
  type?: 'income' | 'expense' | 'transfer'
  search?: string
}

const transactionsQuery = (filters: Filters) =>
  queryOptions({
    queryKey: ['transactions', filters],
    queryFn: () => listTransactionsFn({ data: filters }),
  })

export const Route = createFileRoute('/_app/transacoes/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => {
    const filters = depsToFilters(deps)
    return Promise.all([
      context.queryClient.ensureQueryData(transactionsQuery(filters)),
      context.queryClient.ensureQueryData(accountsQuery),
      context.queryClient.ensureQueryData(categoriesQuery),
    ])
  },
  component: TransacoesPage,
})

function depsToFilters(deps: z.infer<typeof searchSchema>): Filters {
  return {
    month: deps.mes ?? currentMonthKey(),
    accountId: deps.conta || undefined,
    categoryId: deps.categoria || undefined,
    type: deps.tipo,
    search: deps.q || undefined,
  }
}

function TransacoesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const filters = depsToFilters(search)

  const { data: rows } = useSuspenseQuery(transactionsQuery(filters))
  const { data: accounts } = useSuspenseQuery(accountsQuery)
  const { data: categories } = useSuspenseQuery(categoriesQuery)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TransactionRow | null>(null)

  const incomeCents = rows
    .filter((row) => row.type === 'income')
    .reduce((sum, row) => sum + row.amountCents, 0)
  const expenseCents = rows
    .filter((row) => row.type === 'expense')
    .reduce((sum, row) => sum + row.amountCents, 0)

  function setSearch(patch: Partial<typeof search>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Transações"
        subtitle="Despesas, receitas e transferências"
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Nova transação
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <MonthNavigator
          month={filters.month}
          onChange={(month) => setSearch({ mes: month })}
        />
        <Badge variant="income" className="text-xs">
          <ArrowUpRight className="size-3" strokeWidth={3} />
          {formatCentavos(incomeCents)}
        </Badge>
        <Badge variant="expense" className="text-xs">
          <ArrowDownLeft className="size-3" strokeWidth={3} />
          {formatCentavos(expenseCents)}
        </Badge>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Select
          value={search.tipo ?? ''}
          onChange={(e) =>
            setSearch({
              tipo: (e.target.value || undefined) as typeof search.tipo,
            })
          }
        >
          <option value="">Todos os tipos</option>
          <option value="expense">Despesas</option>
          <option value="income">Receitas</option>
          <option value="transfer">Transferências</option>
        </Select>
        <Select
          value={search.conta ?? ''}
          onChange={(e) => setSearch({ conta: e.target.value || undefined })}
        >
          <option value="">Todas as contas</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
        <Select
          value={search.categoria ?? ''}
          onChange={(e) =>
            setSearch({ categoria: e.target.value || undefined })
          }
        >
          <option value="">Todas as categorias</option>
          {categories
            .filter((category) => !category.archived)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} (
                {category.type === 'despesa' ? 'despesa' : 'receita'})
              </option>
            ))}
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-8"
            placeholder="Buscar…"
            defaultValue={search.q ?? ''}
            onChange={(e) => {
              const value = e.target.value
              setSearch({ q: value || undefined })
            }}
          />
        </div>
      </div>

      <Card>
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            Nenhuma transação neste mês com os filtros atuais.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-line bg-surface-2 text-left text-[10px] tracking-wider uppercase">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Conta</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-line">
                {rows.map((row) => (
                  <TransactionTr
                    key={row.id}
                    row={row}
                    onEdit={() => {
                      setEditing(row)
                      setFormOpen(true)
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <TransactionFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        transaction={editing}
      />
    </div>
  )
}

function TransactionTr({
  row,
  onEdit,
}: {
  row: TransactionRow
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const isTransfer = row.type === 'transfer_in' || row.type === 'transfer_out'
  const signed =
    row.type === 'income' || row.type === 'transfer_in'
      ? row.amountCents
      : -row.amountCents

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransactionFn({ data: { id: row.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error) => alert(error.message),
  })

  return (
    <tr className="hover:bg-surface-2">
      <td className="px-3 py-2 font-money whitespace-nowrap">
        {formatDateBR(row.date)}
      </td>
      <td className="px-3 py-2">
        <span className="font-bold">{row.description}</span>
        <span className="ml-2 inline-flex gap-1">
          {row.recurringRuleId && (
            <Badge variant="accent">
              <Repeat className="size-3" strokeWidth={3} />
            </Badge>
          )}
          {isTransfer && (
            <Badge variant="muted">
              <ArrowLeftRight className="size-3" strokeWidth={3} />
              Transf.
            </Badge>
          )}
          {row.isInvoicePayment && <Badge variant="muted">Fatura</Badge>}
        </span>
      </td>
      <td className="px-3 py-2">
        {row.categoryName ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="flex size-5 items-center justify-center border-2 border-line"
              style={{ background: row.categoryColor ?? '#adb5bd' }}
            >
              <CategoryIcon
                name={row.categoryIcon ?? 'tag'}
                className="size-3 text-[#14120d]"
              />
            </span>
            {row.categoryName}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-2">{row.accountName}</td>
      <td
        className={cn(
          'px-3 py-2 text-right font-money font-bold whitespace-nowrap',
          signed >= 0 ? 'text-income' : 'text-expense',
        )}
      >
        {signed >= 0 ? '+' : '−'}
        {formatCentavos(Math.abs(signed))}
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          {!isTransfer && !row.isInvoicePayment && (
            <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
              <Pencil className="size-4" strokeWidth={2.5} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            title="Excluir"
            onClick={() => {
              const message = isTransfer
                ? 'Excluir a transferência? As duas pernas serão removidas.'
                : row.isInvoicePayment
                  ? 'Excluir o pagamento? A fatura voltará a ficar em aberto.'
                  : `Excluir "${row.description}"?`
              if (confirm(message)) deleteMutation.mutate()
            }}
          >
            <Trash2 className="size-4" strokeWidth={2.5} />
          </Button>
        </div>
      </td>
    </tr>
  )
}

function TransactionFormDialog({
  open,
  onClose,
  transaction,
}: {
  open: boolean
  onClose: () => void
  transaction: TransactionRow | null
}) {
  const queryClient = useQueryClient()
  const { data: accounts } = useSuspenseQuery(accountsQuery)
  const { data: categories } = useSuspenseQuery(categoriesQuery)
  const [error, setError] = useState<string>()
  const [type, setType] = useState<'income' | 'expense'>(
    transaction?.type === 'income' ? 'income' : 'expense',
  )

  const activeAccounts = accounts.filter((account) => !account.archived)
  const typeCategories = categories.filter(
    (category) =>
      !category.archived &&
      category.type === (type === 'income' ? 'receita' : 'despesa'),
  )

  const mutation = useMutation({
    mutationFn: (data: {
      type: 'income' | 'expense'
      amountCents: number
      description: string
      date: string
      accountId: string
      categoryId: string
    }) =>
      transaction
        ? updateTransactionFn({ data: { ...data, id: transaction.id } })
        : createTransactionFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
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
      setError('Valor inválido. Use o formato 1.234,56.')
      return
    }
    mutation.mutate({
      type,
      amountCents,
      description: String(form.get('description')),
      date: String(form.get('date')),
      accountId: String(form.get('account')),
      categoryId: String(form.get('category')),
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={transaction ? 'Editar transação' : 'Nova transação'}
    >
      <form
        onSubmit={onSubmit}
        className="space-y-4"
        key={transaction?.id ?? 'new'}
      >
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['expense', 'Despesa'],
              ['income', 'Receita'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={cn(
                'cursor-pointer border-2 border-line px-3 py-2 text-xs font-bold tracking-wider uppercase',
                type === value
                  ? value === 'expense'
                    ? 'bg-expense text-[#14120d] shadow-brutal-sm'
                    : 'bg-income text-[#14120d] shadow-brutal-sm'
                  : 'bg-surface hover:bg-surface-2',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <Label htmlFor="tx-description">Descrição</Label>
          <Input
            id="tx-description"
            name="description"
            required
            maxLength={200}
            defaultValue={transaction?.description}
            placeholder="Mercado da semana"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tx-amount">Valor (R$)</Label>
            <Input
              id="tx-amount"
              name="amount"
              inputMode="decimal"
              required
              defaultValue={
                transaction
                  ? (transaction.amountCents / 100).toFixed(2).replace('.', ',')
                  : undefined
              }
              placeholder="0,00"
            />
          </div>
          <div>
            <Label htmlFor="tx-date">Data</Label>
            <Input
              id="tx-date"
              name="date"
              type="date"
              required
              defaultValue={transaction?.date ?? todayKey()}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tx-account">Conta</Label>
            <Select
              id="tx-account"
              name="account"
              required
              defaultValue={transaction?.accountId}
            >
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tx-category">Categoria</Label>
            <Select
              id="tx-category"
              name="category"
              required
              defaultValue={transaction?.categoryId ?? undefined}
            >
              {typeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {activeAccounts.length === 0 && (
          <FieldError message="Crie uma conta antes de lançar transações." />
        )}
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending || activeAccounts.length === 0}
          >
            {mutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
