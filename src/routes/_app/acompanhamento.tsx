import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, CalendarClock } from 'lucide-react'
import { z } from 'zod'
import { CategoryIcon } from '#/components/category-icon'
import { MonthNavigator } from '#/components/month-navigator'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Card } from '#/components/ui/card'
import { listMonthlyBillsFn } from '#/functions/bills.fn'
import { cn } from '#/lib/cn'
import { currentMonthKey, formatDateBR, todayKey } from '#/lib/dates'
import { formatCentavos } from '#/lib/money'
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
    context.queryClient.ensureQueryData(
      billsQuery(deps.mes ?? currentMonthKey()),
    ),
  component: AcompanhamentoPage,
})

function AcompanhamentoPage() {
  const search = Route.useSearch()
  const month = search.mes ?? currentMonthKey()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: items } = useSuspenseQuery(billsQuery(month))

  const today = todayKey()
  const unpaid = items.filter((item) => !item.paid)
  const totalCents = items.reduce((sum, item) => sum + item.amountCents, 0)
  const overdue = unpaid.filter((item) => item.date < today)
  const overdueCents = overdue.reduce((sum, item) => sum + item.amountCents, 0)
  const upcomingCents = unpaid
    .filter((item) => item.date >= today)
    .reduce((sum, item) => sum + item.amountCents, 0)

  return (
    <div>
      <PageHeader
        title="Acompanhamento"
        subtitle="O que pagar no mês, ordenado por vencimento"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
          <Badge variant="warn">
            A vencer {formatCentavos(upcomingCents)}
          </Badge>
        )}
      </div>

      <p className="mb-4 border-2 border-line bg-surface-2 p-2 text-xs text-muted">
        Itens "previstos" vêm das recorrentes ativas e viram lançamentos de
        verdade quando o mês chega.
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
              <BillRow key={item.key} item={item} today={today} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function BillRow({ item, today }: { item: BillItem; today: string }) {
  const isOverdue = !item.paid && item.date < today
  const isToday = !item.paid && item.date === today

  return (
    <li
      className={cn(
        'flex items-center gap-3 p-3',
        item.kind === 'prevista' && 'opacity-70',
      )}
    >
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
        <p className="truncate font-bold">{item.description}</p>
        <p className="truncate text-xs text-muted">
          {formatDateBR(item.date)}
          {item.categoryName && ` · ${item.categoryName}`}
          {` · ${item.sourceName}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.paid && <Badge variant="income">Paga</Badge>}
        {isOverdue && <Badge variant="expense">Vencido</Badge>}
        {isToday && <Badge variant="warn">Hoje</Badge>}
        {item.kind === 'prevista' && <Badge variant="muted">Prevista</Badge>}
        {item.kind === 'fatura' && !item.paid && (
          <Badge variant="accent">Fatura</Badge>
        )}
        <span className="font-money text-sm font-bold">
          {formatCentavos(item.amountCents)}
        </span>
      </div>
    </li>
  )
}
