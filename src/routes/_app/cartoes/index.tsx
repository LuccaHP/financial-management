import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Archive, ArchiveRestore, CreditCard, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Dialog } from '#/components/ui/dialog'
import { FieldError, Input, Label } from '#/components/ui/input'
import { Progress } from '#/components/ui/progress'
import {
  createCardFn,
  deleteCardFn,
  listCardsFn,
  updateCardFn,
} from '#/functions/cards.fn'
import { formatDateBR } from '#/lib/dates'
import { formatCentavos, parseBRL } from '#/lib/money'
import type { CardRow } from '#/functions/cards.fn'

export const cardsQuery = queryOptions({
  queryKey: ['cards'],
  queryFn: () => listCardsFn(),
})

export const Route = createFileRoute('/_app/cartoes/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(cardsQuery),
  component: CartoesPage,
})

function CartoesPage() {
  const { data: cards } = useSuspenseQuery(cardsQuery)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CardRow | null>(null)

  const active = cards.filter((card) => !card.archived)
  const archived = cards.filter((card) => card.archived)

  return (
    <div>
      <PageHeader
        title="Cartões"
        subtitle="Cartões de crédito, faturas e parcelamentos"
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Novo cartão
          </Button>
        }
      />

      {active.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <CreditCard className="mx-auto mb-2 size-8" strokeWidth={2} />
            <p className="font-display uppercase">Nenhum cartão</p>
            <p className="mt-1 text-sm text-muted">
              Cadastre um cartão para controlar faturas e parcelamentos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((card) => (
            <CreditCardTile
              key={card.id}
              card={card}
              onEdit={() => {
                setEditing(card)
                setFormOpen(true)
              }}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-sm tracking-wide text-muted uppercase">
            Arquivados
          </h2>
          <div className="grid grid-cols-1 gap-4 opacity-70 md:grid-cols-2 xl:grid-cols-3">
            {archived.map((card) => (
              <CreditCardTile
                key={card.id}
                card={card}
                onEdit={() => {
                  setEditing(card)
                  setFormOpen(true)
                }}
              />
            ))}
          </div>
        </div>
      )}

      <CardFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        card={editing}
      />
    </div>
  )
}

function CreditCardTile({
  card,
  onEdit,
}: {
  card: CardRow
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const usagePercent =
    card.limitCents > 0 ? (card.usedCents / card.limitCents) * 100 : 0

  const archiveMutation = useMutation({
    mutationFn: () =>
      updateCardFn({
        data: {
          id: card.id,
          name: card.name,
          limitCents: card.limitCents,
          closingDay: card.closingDay,
          dueDay: card.dueDay,
          color: card.color,
          archived: !card.archived,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCardFn({ data: { id: card.id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards'] }),
    onError: (error) => alert(error.message),
  })

  return (
    <Card>
      <div
        className="h-2 border-b-2 border-line"
        style={{ background: card.color }}
      />
      <CardHeader>
        <CardTitle>{card.name}</CardTitle>
        <Badge variant="muted">
          Fecha dia {card.closingDay} · vence dia {card.dueDay}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-bold uppercase">Limite usado</span>
            <span className="font-money">
              {formatCentavos(card.usedCents)} /{' '}
              {formatCentavos(card.limitCents)}
            </span>
          </div>
          <Progress
            value={usagePercent}
            tone={
              usagePercent >= 90
                ? 'expense'
                : usagePercent >= 60
                  ? 'warn'
                  : 'accent'
            }
          />
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold tracking-wider text-muted uppercase">
              Fatura atual
            </p>
            <p className="font-money text-xl font-bold">
              {formatCentavos(card.currentInvoiceCents)}
            </p>
            <p className="text-xs text-muted">
              vence {formatDateBR(card.currentInvoiceDueDate)}
            </p>
          </div>
          <Link
            to="/cartoes/$cardId"
            params={{ cardId: card.id }}
            search={{ mes: card.currentInvoiceMonth }}
          >
            <Button variant="secondary" size="sm">
              <Receipt className="size-3.5" strokeWidth={2.5} />
              Fatura
            </Button>
          </Link>
        </div>
        <div className="flex gap-2 border-t-2 border-line pt-3">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" strokeWidth={2.5} />
            Editar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => archiveMutation.mutate()}
          >
            {card.archived ? (
              <ArchiveRestore className="size-3.5" strokeWidth={2.5} />
            ) : (
              <Archive className="size-3.5" strokeWidth={2.5} />
            )}
            {card.archived ? 'Restaurar' : 'Arquivar'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (confirm(`Excluir o cartão "${card.name}"?`)) {
                deleteMutation.mutate()
              }
            }}
          >
            <Trash2 className="size-3.5" strokeWidth={2.5} />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CardFormDialog({
  open,
  onClose,
  card,
}: {
  open: boolean
  onClose: () => void
  card: CardRow | null
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()

  const mutation = useMutation({
    mutationFn: (data: {
      name: string
      limitCents: number
      closingDay: number
      dueDay: number
      color: string
    }) =>
      card
        ? updateCardFn({
            data: { ...data, id: card.id, archived: card.archived },
          })
        : createCardFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] })
      onClose()
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    const form = new FormData(e.currentTarget)
    const limitCents = parseBRL(String(form.get('limit')))
    if (limitCents === null || limitCents <= 0) {
      setError('Limite inválido.')
      return
    }
    mutation.mutate({
      name: String(form.get('name')),
      limitCents,
      closingDay: Number(form.get('closingDay')),
      dueDay: Number(form.get('dueDay')),
      color: String(form.get('color')),
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={card ? 'Editar cartão' : 'Novo cartão'}
    >
      <form onSubmit={onSubmit} className="space-y-4" key={card?.id ?? 'new'}>
        <div>
          <Label htmlFor="card-name">Nome</Label>
          <Input
            id="card-name"
            name="name"
            required
            maxLength={80}
            defaultValue={card?.name}
            placeholder="Nubank, Inter…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="card-limit">Limite (R$)</Label>
            <Input
              id="card-limit"
              name="limit"
              inputMode="decimal"
              required
              defaultValue={
                card
                  ? (card.limitCents / 100).toFixed(2).replace('.', ',')
                  : undefined
              }
              placeholder="5.000,00"
            />
          </div>
          <div>
            <Label htmlFor="card-color">Cor</Label>
            <Input
              id="card-color"
              name="color"
              type="color"
              defaultValue={card?.color ?? '#4d79ff'}
              className="h-[38px] cursor-pointer p-1"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="card-closing">Dia de fechamento</Label>
            <Input
              id="card-closing"
              name="closingDay"
              type="number"
              min={1}
              max={28}
              required
              defaultValue={card?.closingDay ?? 1}
            />
          </div>
          <div>
            <Label htmlFor="card-due">Dia de vencimento</Label>
            <Input
              id="card-due"
              name="dueDay"
              type="number"
              min={1}
              max={28}
              required
              defaultValue={card?.dueDay ?? 10}
            />
          </div>
        </div>
        <p className="text-xs text-muted">
          Dias de 1 a 28 para valerem em todos os meses. Compras no dia do
          fechamento ou depois caem na fatura seguinte.
        </p>
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
