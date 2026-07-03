import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Copy, Pencil, X } from 'lucide-react'
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
import { Progress } from '#/components/ui/progress'
import {
  copyBudgetsFn,
  deleteBudgetFn,
  listBudgetsFn,
  upsertBudgetFn,
} from '#/functions/budgets.fn'
import { cn } from '#/lib/cn'
import { addMonths, currentMonthKey } from '#/lib/dates'
import { formatCentavos, parseBRL } from '#/lib/money'
import type { BudgetRow } from '#/functions/budgets.fn'

const budgetsQuery = (month: string) =>
  queryOptions({
    queryKey: ['budgets', month],
    queryFn: () => listBudgetsFn({ data: { month } }),
  })

export const Route = createFileRoute('/_app/orcamentos')({
  validateSearch: z.object({
    mes: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
  loaderDeps: ({ search }) => ({ mes: search.mes }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      budgetsQuery(deps.mes ?? currentMonthKey()),
    ),
  component: OrcamentosPage,
})

function OrcamentosPage() {
  const search = Route.useSearch()
  const month = search.mes ?? currentMonthKey()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()

  const { data: rows } = useSuspenseQuery(budgetsQuery(month))
  const [editing, setEditing] = useState<BudgetRow | null>(null)

  const withLimit = rows.filter((row) => row.limitCents !== null)
  const withoutLimit = rows.filter((row) => row.limitCents === null)
  const totalLimit = withLimit.reduce(
    (sum, row) => sum + (row.limitCents ?? 0),
    0,
  )
  const totalSpent = withLimit.reduce((sum, row) => sum + row.spentCents, 0)
  const overflowCount = withLimit.filter(
    (row) => row.spentCents > (row.limitCents ?? 0),
  ).length

  const copyMutation = useMutation({
    mutationFn: () =>
      copyBudgetsFn({
        data: { fromMonth: addMonths(month, -1), toMonth: month },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
    onError: (error) => alert(error.message),
  })

  return (
    <div>
      <PageHeader
        title="Orçamentos"
        subtitle="Limites de gasto por categoria no mês"
        actions={
          <Button
            variant="secondary"
            onClick={() => copyMutation.mutate()}
            disabled={copyMutation.isPending}
          >
            <Copy className="size-4" strokeWidth={2.5} />
            Copiar do mês anterior
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <MonthNavigator
          month={month}
          onChange={(newMonth) =>
            navigate({ search: { mes: newMonth }, replace: true })
          }
        />
        {withLimit.length > 0 && (
          <Badge variant={totalSpent > totalLimit ? 'expense' : 'muted'}>
            {formatCentavos(totalSpent)} de {formatCentavos(totalLimit)}
          </Badge>
        )}
        {overflowCount > 0 && (
          <Badge variant="expense">
            <AlertTriangle className="size-3" strokeWidth={3} />
            {overflowCount} estourado{overflowCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <p className="mb-4 border-2 border-line bg-surface-2 p-2 text-xs text-muted">
        Gastos no cartão de crédito contam no orçamento quando a fatura é paga
        (categoria "Cartão de Crédito").
      </p>

      {withLimit.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <p className="font-display uppercase">Nenhum orçamento definido</p>
            <p className="mt-1 text-sm text-muted">
              Defina um limite para as categorias abaixo e acompanhe o
              progresso do mês.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {withLimit.map((row) => (
            <BudgetCard
              key={row.categoryId}
              row={row}
              onEdit={() => setEditing(row)}
            />
          ))}
        </div>
      )}

      {withoutLimit.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-sm tracking-wide text-muted uppercase">
            Sem limite definido
          </h2>
          <div className="flex flex-wrap gap-2">
            {withoutLimit.map((row) => (
              <button
                key={row.categoryId}
                type="button"
                onClick={() => setEditing(row)}
                className="flex cursor-pointer items-center gap-2 border-2 border-line bg-surface px-3 py-1.5 text-xs font-bold hover:bg-surface-2"
              >
                <span
                  className="flex size-5 items-center justify-center border-2 border-line"
                  style={{ background: row.categoryColor }}
                >
                  <CategoryIcon
                    name={row.categoryIcon}
                    className="size-3 text-[#14120d]"
                  />
                </span>
                {row.categoryName}
                {row.spentCents > 0 && (
                  <span className="font-money text-muted">
                    {formatCentavos(row.spentCents)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <BudgetDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        row={editing}
        month={month}
      />
    </div>
  )
}

function BudgetCard({ row, onEdit }: { row: BudgetRow; onEdit: () => void }) {
  const queryClient = useQueryClient()
  const limit = row.limitCents ?? 0
  const percent = limit > 0 ? (row.spentCents / limit) * 100 : 0
  const overflow = row.spentCents > limit
  const remaining = limit - row.spentCents

  const removeMutation = useMutation({
    mutationFn: () => deleteBudgetFn({ data: { id: row.budgetId! } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budgets'] }),
  })

  return (
    <Card className={cn(overflow && 'border-expense shadow-[4px_4px_0_0_var(--color-expense)]')}>
      <div className="flex items-center gap-3 p-4">
        <span
          className="flex size-9 shrink-0 items-center justify-center border-2 border-line"
          style={{ background: row.categoryColor }}
        >
          <CategoryIcon
            name={row.categoryIcon}
            className="size-4 text-[#14120d]"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-bold">{row.categoryName}</span>
            <span className="font-money text-sm">
              <strong>{formatCentavos(row.spentCents)}</strong>
              <span className="text-muted"> / {formatCentavos(limit)}</span>
            </span>
          </div>
          <Progress
            value={percent}
            tone={overflow ? 'expense' : percent >= 80 ? 'warn' : 'income'}
          />
          <p
            className={cn(
              'mt-1 text-xs font-bold',
              overflow ? 'text-expense' : 'text-muted',
            )}
          >
            {overflow
              ? `Estourado em ${formatCentavos(row.spentCents - limit)}`
              : `Restam ${formatCentavos(remaining)}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} title="Editar limite">
            <Pencil className="size-4" strokeWidth={2.5} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Remover limite"
            onClick={() => removeMutation.mutate()}
          >
            <X className="size-4" strokeWidth={2.5} />
          </Button>
        </div>
      </div>
    </Card>
  )
}

function BudgetDialog({
  open,
  onClose,
  row,
  month,
}: {
  open: boolean
  onClose: () => void
  row: BudgetRow | null
  month: string
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()

  const mutation = useMutation({
    mutationFn: (limitCents: number) =>
      upsertBudgetFn({
        data: { categoryId: row!.categoryId, month, limitCents },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      onClose()
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  if (!row) return null

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    const limitCents = parseBRL(
      String(new FormData(e.currentTarget).get('limit')),
    )
    if (limitCents === null || limitCents <= 0) {
      setError('Limite inválido.')
      return
    }
    mutation.mutate(limitCents)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Limite para ${row.categoryName}`}
    >
      <form onSubmit={onSubmit} className="space-y-4" key={row.categoryId}>
        <div>
          <Label htmlFor="budget-limit">Limite mensal (R$)</Label>
          <Input
            id="budget-limit"
            name="limit"
            inputMode="decimal"
            required
            autoFocus
            defaultValue={
              row.limitCents !== null
                ? (row.limitCents / 100).toFixed(2).replace('.', ',')
                : undefined
            }
            placeholder="800,00"
          />
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
