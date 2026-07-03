import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CategoryIcon } from '#/components/category-icon'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Dialog } from '#/components/ui/dialog'
import { FieldError, Input, Label } from '#/components/ui/input'
import { Select } from '#/components/ui/select'
import {
  createRecurringFn,
  deleteRecurringFn,
  listRecurringFn,
  recurringUsageFn,
  toggleRecurringFn,
  updateRecurringFn,
} from '#/functions/recurring.fn'
import { cn } from '#/lib/cn'
import { currentMonthKey, formatMonthShortPt } from '#/lib/dates'
import { formatCentavos, parseBRL } from '#/lib/money'
import { accountsQuery, categoriesQuery } from '#/lib/queries'
import type { RecurringRow } from '#/functions/recurring.fn'

const recurringQuery = queryOptions({
  queryKey: ['recurring'],
  queryFn: () => listRecurringFn(),
})

const usageQuery = queryOptions({
  queryKey: ['recurring', 'usage'],
  queryFn: () => recurringUsageFn(),
})

export const Route = createFileRoute('/_app/recorrentes')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(recurringQuery),
      context.queryClient.ensureQueryData(usageQuery),
      context.queryClient.ensureQueryData(accountsQuery),
      context.queryClient.ensureQueryData(categoriesQuery),
    ]),
  component: RecorrentesPage,
})

function RecorrentesPage() {
  const { data: rules } = useSuspenseQuery(recurringQuery)
  const { data: usage } = useSuspenseQuery(usageQuery)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringRow | null>(null)

  const monthlyNet = rules
    .filter((rule) => rule.active)
    .reduce(
      (sum, rule) =>
        sum + (rule.type === 'income' ? rule.amountCents : -rule.amountCents),
      0,
    )

  return (
    <div>
      <PageHeader
        title="Recorrentes"
        subtitle="Lançamentos fixos mensais: salário, aluguel, assinaturas…"
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Nova recorrência
          </Button>
        }
      />

      <div className="mb-4">
        <Badge variant={monthlyNet >= 0 ? 'income' : 'expense'}>
          Impacto mensal: {monthlyNet >= 0 ? '+' : '−'}
          {formatCentavos(Math.abs(monthlyNet))}
        </Badge>
      </div>

      <Card>
        {rules.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            Nenhuma recorrência. Cadastre seu salário e contas fixas para o
            Deyno lançá-los automaticamente todo mês.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-line bg-surface-2 text-left text-[10px] tracking-wider uppercase">
                  <th className="px-3 py-2">Dia</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Conta</th>
                  <th className="px-3 py-2">Período</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-center">Ativa</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-line">
                {rules.map((rule) => (
                  <RecurringTr
                    key={rule.id}
                    rule={rule}
                    postedCount={usage[rule.id] ?? 0}
                    onEdit={() => {
                      setEditing(rule)
                      setFormOpen(true)
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RecurringFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        rule={editing}
      />
    </div>
  )
}

function RecurringTr({
  rule,
  postedCount,
  onEdit,
}: {
  rule: RecurringRow
  postedCount: number
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['recurring'] })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
  }

  const toggleMutation = useMutation({
    mutationFn: () =>
      toggleRecurringFn({ data: { id: rule.id, active: !rule.active } }),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecurringFn({ data: { id: rule.id } }),
    onSuccess: invalidate,
    onError: (error) => alert(error.message),
  })

  return (
    <tr className={cn('hover:bg-surface-2', !rule.active && 'opacity-50')}>
      <td className="px-3 py-2 font-money font-bold">{rule.dayOfMonth}</td>
      <td className="px-3 py-2 font-bold">
        {rule.description}
        {postedCount > 0 && (
          <span className="ml-2 text-[10px] font-normal text-muted">
            {postedCount} lançamento{postedCount > 1 ? 's' : ''}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="flex size-5 items-center justify-center border-2 border-line"
            style={{ background: rule.categoryColor }}
          >
            <CategoryIcon
              name={rule.categoryIcon}
              className="size-3 text-[#14120d]"
            />
          </span>
          {rule.categoryName}
        </span>
      </td>
      <td className="px-3 py-2">{rule.accountName}</td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">
        {formatMonthShortPt(rule.startMonth)}
        {' → '}
        {rule.endMonth ? formatMonthShortPt(rule.endMonth) : 'sempre'}
      </td>
      <td
        className={cn(
          'px-3 py-2 text-right font-money font-bold whitespace-nowrap',
          rule.type === 'income' ? 'text-income' : 'text-expense',
        )}
      >
        {rule.type === 'income' ? '+' : '−'}
        {formatCentavos(rule.amountCents)}
      </td>
      <td className="px-3 py-2 text-center">
        <button
          type="button"
          role="switch"
          aria-checked={rule.active}
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
          className={cn(
            'inline-flex h-6 w-11 cursor-pointer items-center border-2 border-line p-0.5 transition-colors',
            rule.active ? 'justify-end bg-income' : 'justify-start bg-surface-2',
          )}
        >
          <span className="block size-4 border-2 border-line bg-surface" />
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
            <Pencil className="size-4" strokeWidth={2.5} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Excluir"
            onClick={() => {
              if (
                confirm(
                  `Excluir a recorrência "${rule.description}"? Lançamentos já feitos são mantidos.`,
                )
              ) {
                deleteMutation.mutate()
              }
            }}
          >
            <Trash2 className="size-4" strokeWidth={2.5} />
          </Button>
        </div>
      </td>
    </tr>
  )
}

function RecurringFormDialog({
  open,
  onClose,
  rule,
}: {
  open: boolean
  onClose: () => void
  rule: RecurringRow | null
}) {
  const queryClient = useQueryClient()
  const { data: accounts } = useSuspenseQuery(accountsQuery)
  const { data: categories } = useSuspenseQuery(categoriesQuery)
  const [error, setError] = useState<string>()
  const [type, setType] = useState<'income' | 'expense'>(
    rule?.type ?? 'expense',
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
      dayOfMonth: number
      startMonth: string
      endMonth: string | null
      accountId: string
      categoryId: string
    }) =>
      rule
        ? updateRecurringFn({
            data: { ...data, id: rule.id, active: rule.active },
          })
        : createRecurringFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring'] })
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
      setError('Valor inválido.')
      return
    }
    mutation.mutate({
      type,
      amountCents,
      description: String(form.get('description')),
      dayOfMonth: Number(form.get('day')),
      startMonth: String(form.get('startMonth')),
      endMonth: String(form.get('endMonth')) || null,
      accountId: String(form.get('account')),
      categoryId: String(form.get('category')),
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={rule ? 'Editar recorrência' : 'Nova recorrência'}
    >
      <form onSubmit={onSubmit} className="space-y-4" key={rule?.id ?? 'new'}>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['expense', 'Despesa fixa'],
              ['income', 'Receita fixa'],
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
          <Label htmlFor="rec-description">Descrição</Label>
          <Input
            id="rec-description"
            name="description"
            required
            maxLength={200}
            defaultValue={rule?.description}
            placeholder="Aluguel, Salário, Netflix…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rec-amount">Valor (R$)</Label>
            <Input
              id="rec-amount"
              name="amount"
              inputMode="decimal"
              required
              defaultValue={
                rule
                  ? (rule.amountCents / 100).toFixed(2).replace('.', ',')
                  : undefined
              }
              placeholder="0,00"
            />
          </div>
          <div>
            <Label htmlFor="rec-day">Dia do mês</Label>
            <Input
              id="rec-day"
              name="day"
              type="number"
              min={1}
              max={31}
              required
              defaultValue={rule?.dayOfMonth ?? 5}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rec-start">Primeiro mês</Label>
            <Input
              id="rec-start"
              name="startMonth"
              type="month"
              required
              defaultValue={rule?.startMonth ?? currentMonthKey()}
            />
          </div>
          <div>
            <Label htmlFor="rec-end">Último mês (opcional)</Label>
            <Input
              id="rec-end"
              name="endMonth"
              type="month"
              defaultValue={rule?.endMonth ?? undefined}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rec-account">Conta</Label>
            <Select
              id="rec-account"
              name="account"
              required
              defaultValue={rule?.accountId}
            >
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="rec-category">Categoria</Label>
            <Select
              id="rec-category"
              name="category"
              required
              defaultValue={rule?.categoryId}
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
          <FieldError message="Crie uma conta antes de cadastrar recorrências." />
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
