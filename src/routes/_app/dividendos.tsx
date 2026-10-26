import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { HandCoins, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { z } from 'zod'
import { MonthNavigator } from '#/components/month-navigator'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Dialog } from '#/components/ui/dialog'
import {
  deleteDividendFn,
  importDividendsFn,
  listDividendsFn,
  parseProventosFn,
} from '#/functions/dividends.fn'
import { currentMonthKey, formatDateBR, formatMonthPt } from '#/lib/dates'
import { formatCentavos } from '#/lib/money'
import type { DividendRow } from '#/functions/dividends.fn'
import type { ProventoRow } from '#/lib/proventos'

const dividendsQuery = (month: string) =>
  queryOptions({
    queryKey: ['dividends', month],
    queryFn: () => listDividendsFn({ data: { month } }),
  })

export const Route = createFileRoute('/_app/dividendos')({
  validateSearch: z.object({
    mes: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
  loaderDeps: ({ search }) => ({ mes: search.mes }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      dividendsQuery(deps.mes ?? currentMonthKey()),
    ),
  component: DividendosPage,
})

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

function DividendosPage() {
  const search = Route.useSearch()
  const month = search.mes ?? currentMonthKey()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const { data: rows } = useSuspenseQuery(dividendsQuery(month))

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Array<ProventoRow> | null>(null)

  const totalCents = rows.reduce((sum, row) => sum + row.amountCents, 0)
  const assetCount = new Set(rows.map((row) => row.asset)).size

  const parseMutation = useMutation({
    mutationFn: async (file: File) =>
      parseProventosFn({ data: { file: await fileToBase64(file) } }),
    onSuccess: (parsed) => setPreview(parsed),
    onError: (error) => alert(error.message),
  })

  const importMutation = useMutation({
    mutationFn: (toImport: Array<ProventoRow>) =>
      importDividendsFn({
        data: {
          rows: toImport.map(({ asset, date, amountCents }) => ({
            asset,
            date,
            amountCents,
          })),
        },
      }),
    onSuccess: ({ inserted, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ['dividends'] })
      setPreview(null)
      alert(
        `${inserted} provento${inserted === 1 ? '' : 's'} importado${inserted === 1 ? '' : 's'}` +
          (skipped > 0 ? ` · ${skipped} já existia${skipped === 1 ? '' : 'm'}` : ''),
      )
    },
    onError: (error) => alert(error.message),
  })

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    parseMutation.mutate(file)
  }

  return (
    <div>
      <PageHeader
        title="Dividendos"
        subtitle="Proventos de ações e FIIs, importados do extrato da corretora"
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={onFileChange}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={parseMutation.isPending}
            >
              <Upload className="size-4" strokeWidth={2.5} />
              {parseMutation.isPending ? 'Lendo…' : 'Importar extrato'}
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
        {rows.length > 0 && (
          <>
            <Badge variant="income">
              + {formatCentavos(totalCents)} no mês
            </Badge>
            <Badge variant="muted">
              {rows.length} pagamento{rows.length > 1 ? 's' : ''} de{' '}
              {assetCount} ativo{assetCount > 1 ? 's' : ''}
            </Badge>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <HandCoins
              className="mx-auto mb-2 size-8 text-muted"
              strokeWidth={2.5}
            />
            <p className="font-display uppercase">
              Nenhum provento em {formatMonthPt(month)}
            </p>
            <p className="mt-1 text-sm text-muted">
              Exporte o extrato de proventos da corretora (.xlsx) e importe
              aqui — eu preencho ativo, data e valor.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y-2 divide-line">
            {rows.map((row) => (
              <DividendLine key={row.id} row={row} />
            ))}
          </ul>
        </Card>
      )}

      <PreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onConfirm={(toImport) => importMutation.mutate(toImport)}
        pending={importMutation.isPending}
      />
    </div>
  )
}

function DividendLine({ row }: { row: DividendRow }) {
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: () => deleteDividendFn({ data: { id: row.id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dividends'] }),
    onError: (error) => alert(error.message),
  })

  return (
    <li className="group flex items-center gap-3 p-3 hover:bg-surface-2">
      <span className="flex w-10 shrink-0 flex-col items-center border-2 border-line bg-surface-2 py-0.5 sm:w-11">
        <span className="font-money text-lg leading-none font-bold">
          {row.date.slice(8, 10)}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{row.asset}</p>
        <p className="truncate text-xs text-muted">{formatDateBR(row.date)}</p>
      </div>
      <span className="font-money text-sm font-bold whitespace-nowrap text-income">
        +{formatCentavos(row.amountCents)}
      </span>
      <div className="md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          title="Excluir"
          onClick={() => {
            if (confirm(`Excluir ${row.asset} de ${formatDateBR(row.date)}?`))
              deleteMutation.mutate()
          }}
        >
          <Trash2 className="size-4" strokeWidth={2.5} />
        </Button>
      </div>
    </li>
  )
}

function PreviewDialog({
  preview,
  onClose,
  onConfirm,
  pending,
}: {
  preview: Array<ProventoRow> | null
  onClose: () => void
  onConfirm: (rows: Array<ProventoRow>) => void
  pending: boolean
}) {
  if (!preview) return null
  const totalCents = preview.reduce((sum, row) => sum + row.amountCents, 0)
  const dates = preview.map((row) => row.date).sort()
  const firstDate = dates[0]
  const lastDate = dates[dates.length - 1]

  return (
    <Dialog open onClose={onClose} title="Conferir proventos">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="income">+ {formatCentavos(totalCents)}</Badge>
          <Badge variant="muted">
            {preview.length} linha{preview.length > 1 ? 's' : ''} ·{' '}
            {formatDateBR(firstDate)} a {formatDateBR(lastDate)}
          </Badge>
        </div>
        <div className="max-h-72 overflow-y-auto border-2 border-line">
          <ul className="divide-y-2 divide-line">
            {preview.map((row, index) => (
              <li
                key={`${row.asset}-${row.date}-${index}`}
                className="flex items-center gap-3 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{row.asset}</p>
                  <p className="truncate text-xs text-muted">
                    {formatDateBR(row.date)}
                    {row.event && ` · ${row.event}`}
                  </p>
                </div>
                <span className="font-money text-sm font-bold whitespace-nowrap text-income">
                  +{formatCentavos(row.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="border-2 border-line bg-surface-2 p-2 text-xs text-muted">
          Reimportar o mesmo extrato não duplica: linhas idênticas (ativo,
          data e valor) são ignoradas.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending} onClick={() => onConfirm(preview)}>
            {pending
              ? 'Importando…'
              : `Importar ${preview.length} provento${preview.length > 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
