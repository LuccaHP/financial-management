import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCheck,
  CreditCard,
  Pencil,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { CategoryIcon } from '#/components/category-icon'
import { MonthNavigator } from '#/components/month-navigator'
import { PageHeader } from '#/components/page-header'
import { TransactionFormDialog } from '#/components/transaction-form-dialog'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { listMonthlyBillsFn } from '#/functions/bills.fn'
import {
  deleteTransactionFn,
  setTransactionsPaidFn,
} from '#/functions/transactions.fn'
import { cn } from '#/lib/cn'
import {
  currentMonthKey,
  dateInMonth,
  formatDateBR,
  todayKey,
} from '#/lib/dates'
import { formatCentavos } from '#/lib/money'
import { accountsQuery, categoriesQuery } from '#/lib/queries'
import type { EditableTransaction } from '#/components/transaction-form-dialog'
import type { BillItem } from '#/functions/bills.fn'

const billsQuery = (month: string) =>
  queryOptions({
    queryKey: ['bills', month],
    queryFn: () => listMonthlyBillsFn({ data: { month } }),
  })

export const Route = createFileRoute('/_app/acompanhamento')({
  validateSearch: z.object({
    mes: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
  loaderDeps: ({ search }) => ({ mes: search.mes }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        billsQuery(deps.mes ?? currentMonthKey()),
      ),
      context.queryClient.ensureQueryData(accountsQuery),
      context.queryClient.ensureQueryData(categoriesQuery),
    ]),
  component: AcompanhamentoPage,
})

function AcompanhamentoPage() {
  const search = Route.useSearch()
  const month = search.mes ?? currentMonthKey()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const { data: items } = useSuspenseQuery(billsQuery(month))

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EditableTransaction | null>(null)

  const today = todayKey()
  const unpaid = items.filter((item) => !item.paid)
  const overdue = unpaid.filter((item) => item.date < today)
  const overdueCents = overdue.reduce((sum, item) => sum + item.amountCents, 0)
  const upcomingCents = unpaid
    .filter((item) => item.date >= today)
    .reduce((sum, item) => sum + item.amountCents, 0)
  const paidCents = items
    .filter((item) => item.paid)
    .reduce((sum, item) => sum + item.amountCents, 0)
  const unpaidTxIds = unpaid
    .filter((item) => item.kind === 'lancamento' && item.txId)
    .map((item) => item.txId!)

  const paidMutation = useMutation({
    mutationFn: (vars: { ids: Array<string>; paid: boolean }) =>
      setTransactionsPaidFn({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bills'] }),
    onError: (error) => alert(error.message),
  })

  function editItem(item: BillItem) {
    if (!item.txId || !item.accountId) return
    setEditing({
      id: item.txId,
      type: 'expense',
      amountCents: item.amountCents,
      description: item.description,
      date: item.date,
      accountId: item.accountId,
      categoryId: item.categoryId,
    })
    setFormOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Acompanhamento"
        subtitle="O que pagar no mês, ordenado por vencimento"
        actions={
          <>
            {unpaidTxIds.length > 0 && (
              <Button
                variant="secondary"
                disabled={paidMutation.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Marcar ${unpaidTxIds.length} lançamento${unpaidTxIds.length > 1 ? 's' : ''} do mês como pago${unpaidTxIds.length > 1 ? 's' : ''}?`,
                    )
                  )
                    paidMutation.mutate({ ids: unpaidTxIds, paid: true })
                }}
              >
                <CheckCheck className="size-4" strokeWidth={2.5} />
                Marcar tudo como pago
              </Button>
            )}
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Nova despesa
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <MonthNavigator
          month={month}
          onChange={(newMonth) =>
            navigate({ search: { mes: newMonth }, replace: true })
          }
        />
        {overdue.length > 0 && (
          <Badge variant="expense">
            <AlertTriangle className="size-3" strokeWidth={3} />
            {overdue.length} vencido{overdue.length > 1 ? 's' : ''} ·{' '}
            {formatCentavos(overdueCents)}
          </Badge>
        )}
        {upcomingCents > 0 && (
          <Badge variant="warn">
            A vencer {formatCentavos(upcomingCents)}
          </Badge>
        )}
        {paidCents > 0 && (
          <Badge variant="income">
            <Check className="size-3" strokeWidth={3} />
            Pago {formatCentavos(paidCents)}
          </Badge>
        )}
      </div>

      <p className="mb-4 border-2 border-line bg-surface-2 p-2 text-xs text-muted">
        Marque o quadrado ao lado do item quando pagar. Itens "previstos" vêm
        das recorrentes ativas e viram lançamentos quando o mês chega.
      </p>

      {items.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <CalendarClock
              className="mx-auto mb-2 size-8 text-muted"
              strokeWidth={2.5}
            />
            <p className="font-display uppercase">Nada a pagar neste mês</p>
            <p className="mt-1 text-sm text-muted">
              Lançamentos, recorrentes e faturas de cartão com vencimento no
              mês aparecem aqui.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y-2 divide-line">
            {items.map((item) => (
              <BillRow
                key={item.key}
                item={item}
                today={today}
                onEdit={() => editItem(item)}
                onTogglePaid={(paid) =>
                  item.txId &&
                  paidMutation.mutate({ ids: [item.txId], paid })
                }
                togglePending={paidMutation.isPending}
              />
            ))}
          </ul>
        </Card>
      )}

      <TransactionFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        transaction={editing}
        defaultDate={
          month === currentMonthKey() ? todayKey() : dateInMonth(month, 1)
        }
      />
    </div>
  )
}

function BillRow({
  item,
  today,
  onEdit,
  onTogglePaid,
  togglePending,
}: {
  item: BillItem
  today: string
  onEdit: () => void
  onTogglePaid: (paid: boolean) => void
  togglePending: boolean
}) {
  const queryClient = useQueryClient()
  const isOverdue = !item.paid && item.date < today
  const isToday = !item.paid && item.date === today

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransactionFn({ data: { id: item.txId! } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (error) => alert(error.message),
  })

  return (
    <li
      className={cn(
        'group flex items-center gap-3 p-3 hover:bg-surface-2',
        item.kind === 'prevista' && 'opacity-70 hover:opacity-100',
        item.paid && 'opacity-60',
      )}
    >
      {item.kind === 'lancamento' ? (
        <button
          type="button"
          disabled={togglePending}
          onClick={() => onTogglePaid(!item.paid)}
          title={item.paid ? 'Desmarcar pagamento' : 'Marcar como pago'}
          className={cn(
            'flex size-6 shrink-0 cursor-pointer items-center justify-center border-2 border-line',
            item.paid
              ? 'bg-income text-[#14120d]'
              : 'bg-surface hover:bg-surface-2',
          )}
        >
          {item.paid && <Check className="size-4" strokeWidth={3.5} />}
        </button>
      ) : item.kind === 'fatura' ? (
        <span
          title={
            item.paid
              ? 'Fatura paga'
              : 'Pague a fatura na tela do cartão'
          }
          className={cn(
            'flex size-6 shrink-0 items-center justify-center border-2 border-line',
            item.paid ? 'bg-income text-[#14120d]' : 'bg-surface-2',
          )}
        >
          {item.paid && <Check className="size-4" strokeWidth={3.5} />}
        </span>
      ) : (
        <span className="size-6 shrink-0 border-2 border-dashed border-line/50" />
      )}
      <div
        className={cn(
          'w-12 shrink-0 border-2 border-line py-1 text-center',
          isOverdue ? 'bg-expense text-[#14120d]' : 'bg-surface-2',
        )}
      >
        <span className="font-money text-lg font-bold">
          {item.date.slice(8, 10)}
        </span>
      </div>
      <span
        className="flex size-8 shrink-0 items-center justify-center border-2 border-line"
        style={{ background: item.categoryColor ?? '#4d79ff' }}
      >
        <CategoryIcon
          name={item.categoryIcon ?? 'tag'}
          className="size-4 text-[#14120d]"
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-bold', item.paid && 'line-through')}>
          {item.description}
        </p>
        <p className="truncate text-xs text-muted">
          {formatDateBR(item.date)}
          {item.categoryName && ` · ${item.categoryName}`}
          {` · ${item.sourceName}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.paid && (
          <Badge variant="income">
            {item.kind === 'fatura' ? 'Paga' : 'Pago'}
          </Badge>
        )}
        {isOverdue && <Badge variant="expense">Vencido</Badge>}
        {isToday && <Badge variant="warn">Hoje</Badge>}
        {item.kind === 'prevista' && <Badge variant="muted">Prevista</Badge>}
        {item.kind === 'fatura' && !item.paid && (
          <Badge variant="accent">Fatura</Badge>
        )}
        <span className="font-money text-sm font-bold">
          {formatCentavos(item.amountCents)}
        </span>
        <div className="flex gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
          {item.kind === 'lancamento' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                title="Editar"
                onClick={onEdit}
              >
                <Pencil className="size-4" strokeWidth={2.5} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Excluir"
                onClick={() => {
                  if (confirm(`Excluir "${item.description}"?`))
                    deleteMutation.mutate()
                }}
              >
                <Trash2 className="size-4" strokeWidth={2.5} />
              </Button>
            </>
          )}
          {item.kind === 'prevista' && (
            <Link to="/recorrentes" title="Editar recorrente">
              <Button variant="ghost" size="icon">
                <Repeat className="size-4" strokeWidth={2.5} />
              </Button>
            </Link>
          )}
          {item.kind === 'fatura' && item.cardId && (
            <Link
              to="/cartoes/$cardId"
              params={{ cardId: item.cardId }}
              title="Ver fatura"
            >
              <Button variant="ghost" size="icon">
                <CreditCard className="size-4" strokeWidth={2.5} />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </li>
  )
}
