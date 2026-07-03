import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Plus, Target } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Dialog } from '#/components/ui/dialog'
import { FieldError, Input, Label } from '#/components/ui/input'
import { Progress } from '#/components/ui/progress'
import { createGoalFn, listGoalsFn, updateGoalFn } from '#/functions/goals.fn'
import { formatDateBR, formatMonthPt } from '#/lib/dates'
import { formatCentavos, parseBRL } from '#/lib/money'
import type { GoalRow } from '#/functions/goals.fn'

export const goalsQuery = queryOptions({
  queryKey: ['goals'],
  queryFn: () => listGoalsFn(),
})

export const Route = createFileRoute('/_app/objetivos/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(goalsQuery),
  component: ObjetivosPage,
})

function ObjetivosPage() {
  const { data: goals } = useSuspenseQuery(goalsQuery)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<GoalRow | null>(null)

  const active = goals.filter((goal) => !goal.archived)

  return (
    <div>
      <PageHeader
        title="Objetivos"
        subtitle="Metas de poupança: viagem, reserva, entrada do apê…"
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Novo objetivo
          </Button>
        }
      />

      {active.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Target className="mx-auto mb-2 size-8" strokeWidth={2} />
            <p className="font-display uppercase">Nenhum objetivo</p>
            <p className="mt-1 text-sm text-muted">
              Crie uma meta e registre aportes para acompanhar o progresso.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={() => {
                setEditing(goal)
                setFormOpen(true)
              }}
            />
          ))}
        </div>
      )}

      <GoalFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        goal={editing}
      />
    </div>
  )
}

function GoalCard({ goal, onEdit }: { goal: GoalRow; onEdit: () => void }) {
  const done = goal.projection.remainingCents === 0
  return (
    <Card>
      <div
        className="h-2 border-b-2 border-line"
        style={{ background: goal.color }}
      />
      <CardHeader>
        <CardTitle>{goal.name}</CardTitle>
        {done ? (
          <Badge variant="income">Atingido!</Badge>
        ) : (
          <Badge variant="muted">até {formatDateBR(goal.targetDate)}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="mb-1 flex justify-between font-money text-sm">
            <strong>{formatCentavos(goal.savedCents)}</strong>
            <span className="text-muted">
              {formatCentavos(goal.targetAmountCents)}
            </span>
          </div>
          <Progress
            value={goal.projection.percent}
            tone={done ? 'income' : 'accent'}
          />
        </div>
        {!done && goal.projection.monthlyNeededCents !== null && (
          <p className="text-xs">
            Poupe{' '}
            <strong className="font-money">
              {formatCentavos(goal.projection.monthlyNeededCents)}/mês
            </strong>{' '}
            para atingir até {formatDateBR(goal.targetDate)}.
          </p>
        )}
        {!done && goal.projection.projectedMonth && (
          <p className="text-xs text-muted">
            No ritmo atual (
            {formatCentavos(goal.projection.paceCentsPerMonth ?? 0)}/mês), você
            atinge em {formatMonthPt(goal.projection.projectedMonth)}.
          </p>
        )}
        <div className="flex gap-2 border-t-2 border-line pt-3">
          <Link to="/objetivos/$goalId" params={{ goalId: goal.id }}>
            <Button size="sm">Aportes</Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Editar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function GoalFormDialog({
  open,
  onClose,
  goal,
}: {
  open: boolean
  onClose: () => void
  goal: GoalRow | null
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()

  const mutation = useMutation({
    mutationFn: (data: {
      name: string
      targetAmountCents: number
      targetDate: string
      color: string
    }) =>
      goal
        ? updateGoalFn({
            data: { ...data, id: goal.id, archived: goal.archived },
          })
        : createGoalFn({ data }),
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
    const targetAmountCents = parseBRL(String(form.get('target')))
    if (targetAmountCents === null || targetAmountCents <= 0) {
      setError('Valor da meta inválido.')
      return
    }
    mutation.mutate({
      name: String(form.get('name')),
      targetAmountCents,
      targetDate: String(form.get('targetDate')),
      color: String(form.get('color')),
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={goal ? 'Editar objetivo' : 'Novo objetivo'}
    >
      <form onSubmit={onSubmit} className="space-y-4" key={goal?.id ?? 'new'}>
        <div>
          <Label htmlFor="goal-name">Nome</Label>
          <Input
            id="goal-name"
            name="name"
            required
            maxLength={120}
            defaultValue={goal?.name}
            placeholder="Viagem ao Japão"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="goal-target">Meta (R$)</Label>
            <Input
              id="goal-target"
              name="target"
              inputMode="decimal"
              required
              defaultValue={
                goal
                  ? (goal.targetAmountCents / 100).toFixed(2).replace('.', ',')
                  : undefined
              }
              placeholder="15.000,00"
            />
          </div>
          <div>
            <Label htmlFor="goal-date">Data alvo</Label>
            <Input
              id="goal-date"
              name="targetDate"
              type="date"
              required
              defaultValue={goal?.targetDate}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="goal-color">Cor</Label>
          <Input
            id="goal-color"
            name="color"
            type="color"
            defaultValue={goal?.color ?? '#1fc161'}
            className="h-[38px] cursor-pointer p-1"
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
