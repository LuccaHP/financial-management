import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArchiveRestore, Archive, ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Dialog } from '#/components/ui/dialog'
import { FieldError, Input, Label } from '#/components/ui/input'
import { Progress } from '#/components/ui/progress'
import {
  addContributionFn,
  deleteContributionFn,
  deleteGoalFn,
  getGoalFn,
  updateGoalFn,
} from '#/functions/goals.fn'
import { cn } from '#/lib/cn'
import { formatDateBR, formatMonthPt, todayKey } from '#/lib/dates'
import { formatCentavos, parseBRL } from '#/lib/money'
import type { GoalDetail } from '#/functions/goals.fn'

const goalQuery = (goalId: string) =>
  queryOptions({
    queryKey: ['goals', goalId],
    queryFn: () => getGoalFn({ data: { id: goalId } }),
  })

export const Route = createFileRoute('/_app/objetivos/$goalId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(goalQuery(params.goalId)),
  component: ObjetivoDetailPage,
})

function ObjetivoDetailPage() {
  const { goalId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: goal } = useSuspenseQuery(goalQuery(goalId))
  const [contributionOpen, setContributionOpen] = useState(false)
  const [withdrawal, setWithdrawal] = useState(false)

  const done = goal.projection.remainingCents === 0

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['goals'] })
  }

  const archiveMutation = useMutation({
    mutationFn: () =>
      updateGoalFn({
        data: {
          id: goal.id,
          name: goal.name,
          targetAmountCents: goal.targetAmountCents,
          targetDate: goal.targetDate,
          color: goal.color,
          archived: !goal.archived,
        },
      }),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteGoalFn({ data: { id: goal.id } }),
    onSuccess: () => {
      invalidate()
      navigate({ to: '/objetivos' })
    },
    onError: (error) => alert(error.message),
  })

  return (
    <div>
      <Link
        to="/objetivos"
        className="mb-3 inline-flex items-center gap-1 text-xs font-bold uppercase hover:underline"
      >
        <ArrowLeft className="size-3.5" strokeWidth={3} />
        Objetivos
      </Link>
      <PageHeader
        title={goal.name}
        subtitle={`Meta de ${formatCentavos(goal.targetAmountCents)} até ${formatDateBR(goal.targetDate)}`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setWithdrawal(true)
                setContributionOpen(true)
              }}
              disabled={goal.savedCents <= 0}
            >
              <Minus className="size-4" strokeWidth={2.5} />
              Retirada
            </Button>
            <Button
              onClick={() => {
                setWithdrawal(false)
                setContributionOpen(true)
              }}
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Novo aporte
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="font-money text-3xl font-bold">
                {formatCentavos(goal.savedCents)}
              </p>
              <p className="font-money text-sm text-muted">
                de {formatCentavos(goal.targetAmountCents)} (
                {Math.floor(goal.projection.percent)}%)
              </p>
            </div>
            <Progress
              value={goal.projection.percent}
              tone={done ? 'income' : 'accent'}
              className="h-7"
            />
            {done ? (
              <Badge variant="income">Objetivo atingido! 🎉</Badge>
            ) : (
              <div className="space-y-1 text-sm">
                {goal.projection.monthlyNeededCents !== null && (
                  <p>
                    Poupe{' '}
                    <strong className="font-money">
                      {formatCentavos(goal.projection.monthlyNeededCents)}/mês
                    </strong>{' '}
                    para atingir até {formatDateBR(goal.targetDate)}.
                  </p>
                )}
                {goal.projection.projectedMonth ? (
                  <p className="text-muted">
                    No ritmo atual (
                    {formatCentavos(goal.projection.paceCentsPerMonth ?? 0)}
                    /mês), você atinge em{' '}
                    {formatMonthPt(goal.projection.projectedMonth)}.
                  </p>
                ) : (
                  <p className="text-muted">
                    Registre aportes para ver a projeção pelo ritmo atual.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => archiveMutation.mutate()}
            >
              {goal.archived ? (
                <ArchiveRestore className="size-3.5" strokeWidth={2.5} />
              ) : (
                <Archive className="size-3.5" strokeWidth={2.5} />
              )}
              {goal.archived ? 'Restaurar' : 'Arquivar'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (
                  confirm(
                    `Excluir o objetivo "${goal.name}" e todos os aportes?`,
                  )
                ) {
                  deleteMutation.mutate()
                }
              }}
            >
              <Trash2 className="size-3.5" strokeWidth={2.5} />
              Excluir objetivo
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de aportes</CardTitle>
        </CardHeader>
        {goal.contributions.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            Nenhum aporte registrado ainda.
          </p>
        ) : (
          <ul className="divide-y-2 divide-line">
            {goal.contributions.map((contribution) => (
              <ContributionRow
                key={contribution.id}
                contribution={contribution}
              />
            ))}
          </ul>
        )}
      </Card>

      <ContributionDialog
        open={contributionOpen}
        onClose={() => setContributionOpen(false)}
        goal={goal}
        withdrawal={withdrawal}
      />
    </div>
  )
}

function ContributionRow({
  contribution,
}: {
  contribution: GoalDetail['contributions'][number]
}) {
  const queryClient = useQueryClient()
  const negative = contribution.amountCents < 0

  const deleteMutation = useMutation({
    mutationFn: () => deleteContributionFn({ data: { id: contribution.id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['goals'] }),
    onError: (error) => alert(error.message),
  })

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="font-money text-sm whitespace-nowrap">
        {formatDateBR(contribution.date)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted">
        {contribution.note ?? (negative ? 'Retirada' : 'Aporte')}
      </span>
      <span
        className={cn(
          'font-money font-bold whitespace-nowrap',
          negative ? 'text-expense' : 'text-income',
        )}
      >
        {negative ? '−' : '+'}
        {formatCentavos(Math.abs(contribution.amountCents))}
      </span>
      <Button
        variant="ghost"
        size="icon"
        title="Excluir"
        onClick={() => {
          if (confirm('Excluir este lançamento?')) deleteMutation.mutate()
        }}
      >
        <Trash2 className="size-4" strokeWidth={2.5} />
      </Button>
    </li>
  )
}

function ContributionDialog({
  open,
  onClose,
  goal,
  withdrawal,
}: {
  open: boolean
  onClose: () => void
  goal: GoalDetail
  withdrawal: boolean
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()

  const mutation = useMutation({
    mutationFn: (data: {
      goalId: string
      amountCents: number
      date: string
      note?: string
    }) => addContributionFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
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
      goalId: goal.id,
      amountCents: withdrawal ? -amountCents : amountCents,
      date: String(form.get('date')),
      note: String(form.get('note')) || undefined,
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={withdrawal ? 'Registrar retirada' : 'Novo aporte'}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="contribution-amount">Valor (R$)</Label>
            <Input
              id="contribution-amount"
              name="amount"
              inputMode="decimal"
              required
              autoFocus
              placeholder="500,00"
            />
          </div>
          <div>
            <Label htmlFor="contribution-date">Data</Label>
            <Input
              id="contribution-date"
              name="date"
              type="date"
              required
              defaultValue={todayKey()}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="contribution-note">Observação (opcional)</Label>
          <Input
            id="contribution-note"
            name="note"
            maxLength={200}
            placeholder="13º salário, venda do usado…"
          />
        </div>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant={withdrawal ? 'danger' : 'income'}
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? 'Salvando…'
              : withdrawal
                ? 'Registrar retirada'
                : 'Registrar aporte'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
