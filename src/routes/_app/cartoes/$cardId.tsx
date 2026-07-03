import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle2, Plus, Trash2, Wallet } from 'lucide-react'
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
  createPurchaseFn,
  deletePurchaseFn,
  getInvoiceFn,
  payInvoiceFn,
} from '#/functions/cards.fn'
import { currentMonthKey, formatDateBR, todayKey } from '#/lib/dates'
import { formatCentavos, parseBRL } from '#/lib/money'
import { accountsQuery, categoriesQuery } from '#/lib/queries'
import type { InvoiceView } from '#/functions/cards.fn'

const invoiceQuery = (cardId: string, month: string) =>
  queryOptions({
    queryKey: ['invoices', cardId, month],
    queryFn: () => getInvoiceFn({ data: { cardId, month } }),
  })

export const Route = createFileRoute('/_app/cartoes/$cardId')({
  validateSearch: z.object({
    mes: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
  loaderDeps: ({ search }) => ({ mes: search.mes }),
  loader: ({ context, params, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        invoiceQuery(params.cardId, deps.mes ?? currentMonthKey()),
      ),
      context.queryClient.ensureQueryData(accountsQuery),
      context.queryClient.ensureQueryData(categoriesQuery),
    ]),
  component: FaturaPage,
})

const STATUS_LABEL = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  paga: 'Paga',
} as const

function FaturaPage() {
  const { cardId } = Route.useParams()
  const search = Route.useSearch()
  const month = search.mes ?? currentMonthKey()
  const navigate = useNavigate({ from: Route.fullPath })

  const { data: invoice } = useSuspenseQuery(invoiceQuery(cardId, month))
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  return (
    <div>
      <Link
        to="/cartoes"
        className="mb-3 inline-flex items-center gap-1 text-xs font-bold uppercase hover:underline"
      >
        <ArrowLeft className="size-3.5" strokeWidth={3} />
        Cartões
      </Link>
      <PageHeader
        title={invoice.card.name}
        subtitle={`Fecha dia ${invoice.card.closingDay} · vence dia ${invoice.card.dueDay}`}
        actions={
          <>
            {invoice.status !== 'paga' && invoice.totalCents > 0 && (
              <Button variant="income" onClick={() => setPayOpen(true)}>
                <Wallet className="size-4" strokeWidth={2.5} />
                Pagar fatura
              </Button>
            )}
            <Button onClick={() => setPurchaseOpen(true)}>
              <Plus className="size-4" strokeWidth={2.5} />
              Nova compra
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
        <Badge
          variant={
            invoice.status === 'paga'
              ? 'income'
              : invoice.status === 'fechada'
                ? 'warn'
                : 'default'
          }
        >
          {STATUS_LABEL[invoice.status]}
        </Badge>
        <Badge variant="muted">vence {formatDateBR(invoice.dueDate)}</Badge>
      </div>

      {invoice.payment && (
        <div className="mb-4 flex items-center gap-2 border-2 border-line bg-income/20 p-3 text-sm">
          <CheckCircle2 className="size-4 text-income" strokeWidth={2.5} />
          Paga com <strong>{invoice.payment.accountName}</strong> em{' '}
          {formatDateBR(invoice.payment.paidAt.slice(0, 10))} —{' '}
          <span className="font-money font-bold">
            {formatCentavos(invoice.payment.amountCents)}
          </span>
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between border-b-2 border-line bg-surface-2 px-4 py-3">
          <span className="font-display text-sm uppercase">
            Total da fatura
          </span>
          <span className="font-money text-2xl font-bold">
            {formatCentavos(invoice.totalCents)}
          </span>
        </div>
        {invoice.lines.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            Nenhum lançamento nesta fatura.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-line text-left text-[10px] tracking-wider uppercase">
                  <th className="px-3 py-2">Compra</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-line">
                {invoice.lines.map((line) => (
                  <InvoiceLineTr
                    key={line.installmentId}
                    line={line}
                    invoicePaid={invoice.status === 'paga'}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <PurchaseDialog
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        invoice={invoice}
      />
      <PayInvoiceDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        invoice={invoice}
      />
    </div>
  )
}

function InvoiceLineTr({
  line,
  invoicePaid,
}: {
  line: InvoiceView['lines'][number]
  invoicePaid: boolean
}) {
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: () => deletePurchaseFn({ data: { id: line.purchaseId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['cards'] })
    },
    onError: (error) => alert(error.message),
  })

  return (
    <tr className="hover:bg-surface-2">
      <td className="px-3 py-2 font-money whitespace-nowrap">
        {formatDateBR(line.purchaseDate)}
      </td>
      <td className="px-3 py-2 font-bold">
        {line.description}
        {line.installmentsCount > 1 && (
          <span className="ml-1 font-money text-xs font-normal text-muted">
            ({line.installmentNumber}/{line.installmentsCount})
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        {line.categoryName ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="flex size-5 items-center justify-center border-2 border-line"
              style={{ background: line.categoryColor ?? '#adb5bd' }}
            >
              <CategoryIcon
                name={line.categoryIcon ?? 'tag'}
                className="size-3 text-[#14120d]"
              />
            </span>
            {line.categoryName}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-money font-bold whitespace-nowrap">
        {formatCentavos(line.amountCents)}
      </td>
      <td className="px-3 py-2 text-right">
        {!invoicePaid && (
          <Button
            variant="ghost"
            size="icon"
            title="Excluir compra (todas as parcelas)"
            onClick={() => {
              if (
                confirm(
                  `Excluir a compra "${line.description}"? Todas as parcelas serão removidas.`,
                )
              ) {
                deleteMutation.mutate()
              }
            }}
          >
            <Trash2 className="size-4" strokeWidth={2.5} />
          </Button>
        )}
      </td>
    </tr>
  )
}

function PurchaseDialog({
  open,
  onClose,
  invoice,
}: {
  open: boolean
  onClose: () => void
  invoice: InvoiceView
}) {
  const queryClient = useQueryClient()
  const { data: categories } = useSuspenseQuery(categoriesQuery)
  const [error, setError] = useState<string>()

  const expenseCategories = categories.filter(
    (category) => !category.archived && category.type === 'despesa',
  )

  const mutation = useMutation({
    mutationFn: (data: {
      cardId: string
      categoryId: string
      description: string
      totalAmountCents: number
      installmentsCount: number
      purchaseDate: string
    }) => createPurchaseFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['cards'] })
      onClose()
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    const form = new FormData(e.currentTarget)
    const totalAmountCents = parseBRL(String(form.get('amount')))
    if (totalAmountCents === null || totalAmountCents <= 0) {
      setError('Valor inválido.')
      return
    }
    mutation.mutate({
      cardId: invoice.card.id,
      categoryId: String(form.get('category')),
      description: String(form.get('description')),
      totalAmountCents,
      installmentsCount: Number(form.get('installments')),
      purchaseDate: String(form.get('date')),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Nova compra no cartão">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="purchase-description">Descrição</Label>
          <Input
            id="purchase-description"
            name="description"
            required
            maxLength={200}
            placeholder="Notebook, tênis…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="purchase-amount">Valor total (R$)</Label>
            <Input
              id="purchase-amount"
              name="amount"
              inputMode="decimal"
              required
              placeholder="0,00"
            />
          </div>
          <div>
            <Label htmlFor="purchase-installments">Parcelas</Label>
            <Select
              id="purchase-installments"
              name="installments"
              defaultValue="1"
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).map((count) => (
                <option key={count} value={count}>
                  {count}x
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="purchase-date">Data da compra</Label>
            <Input
              id="purchase-date"
              name="date"
              type="date"
              required
              defaultValue={todayKey()}
            />
          </div>
          <div>
            <Label htmlFor="purchase-category">Categoria</Label>
            <Select id="purchase-category" name="category" required>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted">
          Compras no dia {invoice.card.closingDay} ou depois entram na fatura
          do mês seguinte. Parcelas se distribuem nas faturas seguintes.
        </p>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Lançando…' : 'Lançar compra'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function PayInvoiceDialog({
  open,
  onClose,
  invoice,
}: {
  open: boolean
  onClose: () => void
  invoice: InvoiceView
}) {
  const queryClient = useQueryClient()
  const { data: accounts } = useSuspenseQuery(accountsQuery)
  const [error, setError] = useState<string>()

  const activeAccounts = accounts.filter((account) => !account.archived)

  const mutation = useMutation({
    mutationFn: (data: {
      cardId: string
      month: string
      accountId: string
      date: string
    }) => payInvoiceFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['cards'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      onClose()
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    const form = new FormData(e.currentTarget)
    mutation.mutate({
      cardId: invoice.card.id,
      month: invoice.month,
      accountId: String(form.get('account')),
      date: String(form.get('date')),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Pagar fatura">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="border-2 border-line bg-surface-2 p-3 text-center">
          <p className="text-xs font-bold tracking-wider text-muted uppercase">
            Valor da fatura
          </p>
          <p className="font-money text-2xl font-bold">
            {formatCentavos(invoice.totalCents)}
          </p>
        </div>
        <div>
          <Label htmlFor="pay-account">Debitar da conta</Label>
          <Select id="pay-account" name="account" required>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="pay-date">Data do pagamento</Label>
          <Input
            id="pay-date"
            name="date"
            type="date"
            required
            defaultValue={todayKey()}
          />
        </div>
        {activeAccounts.length === 0 && (
          <FieldError message="Crie uma conta para pagar a fatura." />
        )}
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="income"
            disabled={mutation.isPending || activeAccounts.length === 0}
          >
            {mutation.isPending ? 'Pagando…' : 'Confirmar pagamento'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
