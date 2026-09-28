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
import { Dialog } from '#/components/ui/dialog'
import {
  listMonthlyBillsFn,
  setRecurringOccurrencePaidFn,
} from '#/functions/bills.fn'
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

/** Estado visível do item, derivado da data e do pago. */
function billStatus(item: BillItem, today: string) {
  if (item.paid) return 'paid' as const
  if (item.date < today) return 'overdue' as const
  if (item.date === today) return 'today' as const
  if (item.kind === 'prevista') return 'projected' as const
  if (item.kind === 'fatura') return 'invoice' as const
  return 'upcoming' as const
}

function StatusBadge({ item, today }: { item: BillItem; today: string }) {
  const status = billStatus(item, today)
  if (status === 'paid')
    return (
      <Badge variant="income">{item.kind === 'fatura' ? 'Paga' : 'Pago'}</Badge>
    )
  if (status === 'overdue') return <Badge variant="expense">Vencido</Badge>
  if (status === 'today') return <Badge variant="warn">Hoje</Badge>
  if (status === 'projected') return <Badge variant="muted">Prevista</Badge>
  if (status === 'invoice') return <Badge variant="accent">Fatura</Badge>
  return null
}

function AcompanhamentoPage() {
  const search = Route.useSearch()
  const month = search.mes ?? currentMonthKey()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const { data: items } = useSuspenseQuery(billsQuery(month))

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EditableTransaction | null>(null)
  const [detail, setDetail] = useState<BillItem | null>(null)

  const today = todayKey()
  const unpaid = items.filter((item) => !item.paid)
  const totalCents = items.reduce((sum, item) => sum + item.amountCents, 0)
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
  const unpaidRules = unpaid.filter(
    (item) => item.kind === 'prevista' && item.ruleId,
  )
  const bulkCount = unpaidTxIds.length + unpaidRules.length

  const paidMutation = useMutation({
    mutationFn: (vars: { item: BillItem; paid: boolean }) =>
      vars.item.kind === 'prevista'
        ? setRecurringOccurrencePaidFn({
            data: {
              ruleId: vars.item.ruleId!,
              month: vars.item.date.slice(0, 7),
              paid: vars.paid,
            },
          })
        : setTransactionsPaidFn({
            data: { ids: [vars.item.txId!], paid: vars.paid },
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
    onError: (error) => alert(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTransactionFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (error) => alert(error.message),
  })

  const bulkMutation = useMutation({
    mutationFn: async () => {
      if (unpaidTxIds.length > 0) {
        await setTransactionsPaidFn({ data: { ids: unpaidTxIds, paid: true } })
      }
      await Promise.all(
        unpaidRules.map((item) =>
          setRecurringOccurrencePaidFn({
            data: {
              ruleId: item.ruleId!,
              month: item.date.slice(0, 7),
              paid: true,
            },
          }),
        ),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
    onError: (error) => alert(error.message),
  })

  function editItem(item: BillItem) {
    if (!item.txId || !item.accountId) return
    setDetail(null)
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
            {bulkCount > 0 && (
              <Button
                variant="secondary"
                disabled={bulkMutation.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Marcar ${bulkCount} item${bulkCount > 1 ? 's' : ''} do mês como pago${bulkCount > 1 ? 's' : ''}?`,
                    )
                  )
                    bulkMutation.mutate()
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <MonthNavigator
          month={month}
          onChange={(newMonth) =>
            navigate({ search: { mes: newMonth }, replace: true })
          }
        />
        {items.length > 0 && (
          <Badge variant="muted">Total {formatCentavos(totalCents)}</Badge>
        )}
        {overdue.length > 0 && (
          <Badge variant="expense">
            <AlertTriangle className="size-3" strokeWidth={3} />
            {overdue.length} vencido{overdue.length > 1 ? 's' : ''} ·{' '}
            {formatCentavos(overdueCents)}
          </Badge>
        )}
        {upcomingCents > 0 && (
          <Badge variant="warn">A vencer {formatCentavos(upcomingCents)}</Badge>
        )}
        {paidCents > 0 && (
          <Badge variant="income">
            <Check className="size-3" strokeWidth={3} />
            Pago {formatCentavos(paidCents)}
          </Badge>
        )}
      </div>

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
                onOpen={() => setDetail(item)}
                onTogglePaid={(paid) => paidMutation.mutate({ item, paid })}
                togglePending={paidMutation.isPending}
              />
            ))}
          </ul>
        </Card>
      )}

      <BillDetailDialog
        item={detail}
        today={today}
        onClose={() => setDetail(null)}
        onEdit={() => detail && editItem(detail)}
        onTogglePaid={(paid) =>
          detail && paidMutation.mutate({ item: detail, paid })
        }
        onDelete={() => {
          if (!detail?.txId) return
          if (confirm(`Excluir "${detail.description}"?`)) {
            deleteMutation.mutate(detail.txId)
            setDetail(null)
          }
        }}
        actionPending={paidMutation.isPending || deleteMutation.isPending}
      />

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
  onOpen,
  onTogglePaid,
  togglePending,
}: {
  item: BillItem
  today: string
  onOpen: () => void
  onTogglePaid: (paid: boolean) => void
  togglePending: boolean
}) {
  const isOverdue = !item.paid && item.date < today

  return (
    <li className="flex items-center gap-2.5 p-3 hover:bg-surface-2 sm:gap-3">
      {item.kind === 'fatura' ? (
        <span
          title={item.paid ? 'Fatura paga' : 'Pague a fatura na tela do cartão'}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center border-2 border-line',
            item.paid ? 'bg-income text-[#14120d]' : 'bg-surface-2',
          )}
        >
          {item.paid && <Check className="size-4" strokeWidth={3.5} />}
        </span>
      ) : (
        <button
          type="button"
          disabled={togglePending}
          aria-pressed={item.paid}
          title={item.paid ? 'Desmarcar pagamento' : 'Marcar como pago'}
          onClick={() => onTogglePaid(!item.paid)}
          className={cn(
            'flex size-6 shrink-0 cursor-pointer items-center justify-center border-2 border-line',
            item.paid
              ? 'bg-income text-[#14120d]'
              : 'bg-surface hover:bg-surface-2',
          )}
        >
          {item.paid && <Check className="size-4" strokeWidth={3.5} />}
        </button>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left sm:gap-3"
      >
        <span
          className={cn(
            'flex w-10 shrink-0 flex-col items-center border-2 border-line py-0.5 sm:w-11',
            isOverdue ? 'bg-expense text-[#14120d]' : 'bg-surface-2',
          )}
        >
          <span className="font-money text-lg leading-none font-bold">
            {item.date.slice(8, 10)}
          </span>
        </span>

        <span
          className="flex size-8 shrink-0 items-center justify-center border-2 border-line"
          style={{ background: item.categoryColor ?? '#4d79ff' }}
        >
          <CategoryIcon
            name={item.categoryIcon ?? 'tag'}
            className="size-4 text-[#14120d]"
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{item.description}</span>
          <span className="block truncate text-xs text-muted">
            {formatDateBR(item.date)}
            {item.categoryName && ` · ${item.categoryName}`}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-money text-sm font-bold whitespace-nowrap">
            {formatCentavos(item.amountCents)}
          </span>
          <StatusBadge item={item} today={today} />
        </span>
      </button>
    </li>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b-2 border-line py-2 last:border-b-0">
      <span className="text-xs tracking-wider text-muted uppercase">
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-sm font-bold">
        {children}
      </span>
    </div>
  )
}

function BillDetailDialog({
  item,
  today,
  onClose,
  onEdit,
  onTogglePaid,
  onDelete,
  actionPending,
}: {
  item: BillItem | null
  today: string
  onClose: () => void
  onEdit: () => void
  onTogglePaid: (paid: boolean) => void
  onDelete: () => void
  actionPending: boolean
}) {
  if (!item) return null
  const kindLabel =
    item.kind === 'prevista'
      ? 'Recorrente prevista'
      : item.kind === 'fatura'
        ? 'Fatura de cartão'
        : 'Lançamento'

  return (
    <Dialog open={item !== null} onClose={onClose} title={item.description}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center border-2 border-line"
            style={{ background: item.categoryColor ?? '#4d79ff' }}
          >
            <CategoryIcon
              name={item.categoryIcon ?? 'tag'}
              className="size-6 text-[#14120d]"
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-money text-2xl font-bold">
              {formatCentavos(item.amountCents)}
            </p>
            <div className="mt-0.5">
              <StatusBadge item={item} today={today} />
            </div>
          </div>
        </div>

        <div className="border-2 border-line px-3">
          <InfoRow label="Vencimento">{formatDateBR(item.date)}</InfoRow>
          {item.categoryName && (
            <InfoRow label="Categoria">{item.categoryName}</InfoRow>
          )}
          <InfoRow label="Origem">{item.sourceName}</InfoRow>
          <InfoRow label="Tipo">{kindLabel}</InfoRow>
        </div>

        {item.kind === 'prevista' && (
          <p className="border-2 border-line bg-surface-2 p-2 text-xs text-muted">
            Ainda não é um lançamento — marcar como pago já cria a despesa deste
            mês. A recorrência também materializa sozinha quando o mês chega.
          </p>
        )}
        {item.kind === 'fatura' && (
          <p className="border-2 border-line bg-surface-2 p-2 text-xs text-muted">
            Faturas são quitadas na tela do cartão (debitando uma conta).
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {item.kind === 'fatura' && item.cardId ? (
            <Link
              to="/cartoes/$cardId"
              params={{ cardId: item.cardId }}
              onClick={onClose}
            >
              <Button variant="secondary">
                <CreditCard className="size-4" strokeWidth={2.5} />
                Ir para o cartão
              </Button>
            </Link>
          ) : (
            <Button
              variant={item.paid ? 'secondary' : 'primary'}
              disabled={actionPending}
              onClick={() => onTogglePaid(!item.paid)}
            >
              <Check className="size-4" strokeWidth={2.5} />
              {item.paid ? 'Desmarcar pagamento' : 'Marcar como pago'}
            </Button>
          )}

          {item.kind === 'prevista' && (
            <Link to="/recorrentes" onClick={onClose}>
              <Button variant="secondary">
                <Repeat className="size-4" strokeWidth={2.5} />
                Editar recorrente
              </Button>
            </Link>
          )}

          {item.kind === 'lancamento' && (
            <>
              <Button variant="secondary" onClick={onEdit}>
                <Pencil className="size-4" strokeWidth={2.5} />
                Editar
              </Button>
              <Button
                variant="danger"
                disabled={actionPending}
                onClick={onDelete}
              >
                <Trash2 className="size-4" strokeWidth={2.5} />
                Excluir
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}
