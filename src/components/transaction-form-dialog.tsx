// Dialog compartilhado de criar/editar transação (usado em Transações e
// Acompanhamento). Extraído de routes/_app/transacoes/index.tsx.
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Dialog } from '#/components/ui/dialog'
import { FieldError, Input, Label } from '#/components/ui/input'
import { Select } from '#/components/ui/select'
import {
  createTransactionFn,
  updateTransactionFn,
} from '#/functions/transactions.fn'
import { cn } from '#/lib/cn'
import { todayKey } from '#/lib/dates'
import { parseBRL } from '#/lib/money'
import { accountsQuery, categoriesQuery } from '#/lib/queries'

export type EditableTransaction = {
  id: string
  type: 'income' | 'expense' | 'transfer_in' | 'transfer_out'
  amountCents: number
  description: string
  date: string
  accountId: string
  categoryId: string | null
}

export function TransactionFormDialog({
  open,
  onClose,
  transaction,
  defaultDate,
}: {
  open: boolean
  onClose: () => void
  transaction: EditableTransaction | null
  /** Data pré-preenchida ao criar (ex.: dentro do mês em exibição). */
  defaultDate?: string
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
      queryClient.invalidateQueries({ queryKey: ['bills'] })
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
              defaultValue={transaction?.date ?? defaultDate ?? todayKey()}
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
