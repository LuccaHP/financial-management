import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { z } from 'zod'
import { BrutalTooltip } from '#/components/charts/brutal-tooltip'
import { MonthNavigator } from '#/components/month-navigator'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Progress } from '#/components/ui/progress'
import { getDashboardFn } from '#/functions/dashboard.fn'
import { cn } from '#/lib/cn'
import { currentMonthKey, formatMonthShortPt } from '#/lib/dates'
import { formatCentavos } from '#/lib/money'
import type { DashboardData } from '#/functions/dashboard.fn'
import type { LucideIcon } from 'lucide-react'

const dashboardQuery = (month: string) =>
  queryOptions({
    queryKey: ['dashboard', month],
    queryFn: () => getDashboardFn({ data: { month } }),
  })

export const Route = createFileRoute('/_app/')({
  validateSearch: z.object({
    mes: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
  loaderDeps: ({ search }) => ({ mes: search.mes }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      dashboardQuery(deps.mes ?? currentMonthKey()),
    ),
  component: DashboardPage,
})

function DashboardPage() {
  const search = Route.useSearch()
  const month = search.mes ?? currentMonthKey()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data } = useSuspenseQuery(dashboardQuery(month))

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral das suas finanças"
        actions={
          <MonthNavigator
            month={month}
            onChange={(newMonth) =>
              navigate({ search: { mes: newMonth }, replace: true })
            }
          />
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Wallet}
          label="Saldo total"
          valueCents={data.totalBalanceCents}
          tone={data.totalBalanceCents >= 0 ? 'income' : 'expense'}
        />
        <KpiCard
          icon={ArrowUpRight}
          label="Receitas do mês"
          valueCents={data.monthIncomeCents}
          tone="income"
        />
        <KpiCard
          icon={ArrowDownLeft}
          label="Despesas do mês"
          valueCents={data.monthExpenseCents}
          tone="expense"
        />
        <Link to="/cartoes" className="block">
          <KpiCard
            icon={CreditCard}
            label="Faturas em aberto"
            valueCents={data.openInvoicesCents}
            tone={data.openInvoicesCents > 0 ? 'warn' : 'income'}
          />
        </Link>
      </div>

      {data.budgetAlerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {data.budgetAlerts.map((alert) => {
            const overflow = alert.spentCents > alert.limitCents
            return (
              <Link
                key={alert.categoryName}
                to="/orcamentos"
                search={{ mes: month }}
                className={cn(
                  'flex items-center gap-2 border-2 p-3 text-sm font-bold',
                  overflow
                    ? 'border-expense bg-expense/15 text-expense shadow-[4px_4px_0_0_var(--color-expense)]'
                    : 'border-warn bg-warn/15 shadow-[4px_4px_0_0_var(--color-warn)]',
                )}
              >
                <AlertTriangle className="size-4 shrink-0" strokeWidth={2.5} />
                {overflow ? (
                  <>
                    Orçamento de {alert.categoryName} estourado:{' '}
                    {formatCentavos(alert.spentCents)} de{' '}
                    {formatCentavos(alert.limitCents)}
                  </>
                ) : (
                  <>
                    {alert.categoryName} já usou{' '}
                    {Math.floor((alert.spentCents / alert.limitCents) * 100)}%
                    do orçamento
                  </>
                )}
              </Link>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExpensesPieCard data={data} />
        <IncomeVsExpenseCard data={data} />
        <BalanceEvolutionCard data={data} />
        <GoalsPreviewCard data={data} />
      </div>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  valueCents,
  tone,
}: {
  icon: LucideIcon
  label: string
  valueCents: number
  tone: 'income' | 'expense' | 'warn'
}) {
  const tones = {
    income: 'text-income',
    expense: 'text-expense',
    warn: 'text-warn',
  }
  return (
    <Card className="h-full">
      <CardContent className="flex items-start justify-between gap-2 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-wider text-muted uppercase">
            {label}
          </p>
          <p
            className={cn(
              'font-money text-xl font-bold break-all xl:text-2xl',
              tones[tone],
            )}
          >
            {formatCentavos(valueCents)}
          </p>
        </div>
        <span className="shrink-0 border-2 border-line bg-surface-2 p-2">
          <Icon className="size-4" strokeWidth={2.5} />
        </span>
      </CardContent>
    </Card>
  )
}

function ExpensesPieCard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Despesas por categoria</CardTitle>
        <Badge variant="expense">{formatCentavos(data.monthExpenseCents)}</Badge>
      </CardHeader>
      <CardContent>
        {data.expensesByCategory.length === 0 ? (
          <EmptyChart message="Sem despesas neste mês." />
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.expensesByCategory}
                  dataKey="valueCents"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={90}
                  stroke="var(--line)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {data.expensesByCategory.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<BrutalTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="w-full space-y-1 text-xs sm:max-w-[45%]">
              {data.expensesByCategory.slice(0, 7).map((entry) => (
                <li
                  key={entry.name}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="size-3 shrink-0 border border-line"
                      style={{ background: entry.color }}
                    />
                    <span className="truncate">{entry.name}</span>
                  </span>
                  <span className="font-money font-bold whitespace-nowrap">
                    {formatCentavos(entry.valueCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function IncomeVsExpenseCard({ data }: { data: DashboardData }) {
  const hasData = data.incomeVsExpense.some(
    (row) => row.incomeCents > 0 || row.expenseCents > 0,
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>Receitas × Despesas</CardTitle>
        <Badge variant="muted">últimos 6 meses</Badge>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyChart message="Sem lançamentos no período." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.incomeVsExpense} barGap={2}>
              <CartesianGrid
                stroke="var(--line)"
                strokeOpacity={0.15}
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tickFormatter={(value: string) =>
                  formatMonthShortPt(value).slice(0, 3)
                }
                tick={{ fontSize: 10, fontWeight: 700 }}
                stroke="var(--ink)"
              />
              <YAxis
                tickFormatter={(value: number) =>
                  `${Math.round(value / 100000)}k`
                }
                tick={{ fontSize: 10 }}
                stroke="var(--ink)"
                width={34}
              />
              <Tooltip
                content={
                  <BrutalTooltip
                    labelFormatter={(label) => formatMonthShortPt(label)}
                  />
                }
                cursor={{ fill: 'var(--surface-2)' }}
              />
              <Bar
                dataKey="incomeCents"
                name="Receitas"
                fill="var(--color-income)"
                stroke="var(--line)"
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Bar
                dataKey="expenseCents"
                name="Despesas"
                fill="var(--color-expense)"
                stroke="var(--line)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function BalanceEvolutionCard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolução do saldo</CardTitle>
        <Badge variant="muted">últimos 6 meses</Badge>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.balanceEvolution}>
            <CartesianGrid
              stroke="var(--line)"
              strokeOpacity={0.15}
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tickFormatter={(value: string) =>
                formatMonthShortPt(value).slice(0, 3)
              }
              tick={{ fontSize: 10, fontWeight: 700 }}
              stroke="var(--ink)"
            />
            <YAxis
              tickFormatter={(value: number) =>
                `${Math.round(value / 100000)}k`
              }
              tick={{ fontSize: 10 }}
              stroke="var(--ink)"
              width={40}
            />
            <Tooltip
              content={
                <BrutalTooltip
                  labelFormatter={(label) => formatMonthShortPt(label)}
                />
              }
            />
            <Line
              type="stepAfter"
              dataKey="balanceCents"
              name="Saldo"
              stroke="var(--color-accent)"
              strokeWidth={3}
              dot={{
                stroke: 'var(--line)',
                strokeWidth: 2,
                fill: 'var(--color-accent)',
                r: 4,
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function GoalsPreviewCard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Objetivos</CardTitle>
        <Link
          to="/objetivos"
          className="text-xs font-bold uppercase hover:underline"
        >
          Ver todos
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.goalsPreview.length === 0 ? (
          <EmptyChart message="Nenhum objetivo ativo." />
        ) : (
          data.goalsPreview.map((goal) => {
            const percent =
              goal.targetCents > 0
                ? Math.min(100, (goal.savedCents / goal.targetCents) * 100)
                : 0
            return (
              <Link
                key={goal.id}
                to="/objetivos/$goalId"
                params={{ goalId: goal.id }}
                className="block"
              >
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-bold">{goal.name}</span>
                  <span className="font-money whitespace-nowrap text-muted">
                    {formatCentavos(goal.savedCents)} /{' '}
                    {formatCentavos(goal.targetCents)}
                  </span>
                </div>
                <Progress
                  value={percent}
                  tone={percent >= 100 ? 'income' : 'accent'}
                />
              </Link>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center border-2 border-dashed border-line/40">
      <p className="text-sm text-muted">{message}</p>
    </div>
  )
}
