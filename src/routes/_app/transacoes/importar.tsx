import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, CheckCircle2, FileUp, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { FieldError } from '#/components/ui/input'
import { importCsvFn } from '#/functions/csv.fn'
import { parseTransactionsCsv } from '#/lib/csv'
import { formatDateBR } from '#/lib/dates'
import { formatCentavos } from '#/lib/money'
import { accountsQuery } from '#/lib/queries'
import { cn } from '#/lib/cn'
import type { CsvParseResult } from '#/lib/csv'

export const Route = createFileRoute('/_app/transacoes/importar')({
  loader: ({ context }) => context.queryClient.ensureQueryData(accountsQuery),
  component: ImportarPage,
})

function ImportarPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: accounts } = useSuspenseQuery(accountsQuery)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string>()
  const [result, setResult] = useState<CsvParseResult | null>(null)
  const [error, setError] = useState<string>()

  const accountNames = new Set(
    accounts.map((account) => account.name.toLowerCase()),
  )
  const unknownAccounts = result
    ? [
        ...new Set(
          result.rows
            .map((row) => row.accountName)
            .filter((name) => !accountNames.has(name.toLowerCase())),
        ),
      ]
    : []

  const importMutation = useMutation({
    mutationFn: () =>
      importCsvFn({
        data: {
          rows: result!.rows.map(({ line, ...row }) => row),
        },
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      alert(`${data.imported} transações importadas!`)
      navigate({ to: '/transacoes' })
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(undefined)
    setResult(null)
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const content = await file.text()
    const parsed = parseTransactionsCsv(content)
    if (parsed.rows.length === 0 && parsed.errors.length === 0) {
      setError(
        'Nenhuma linha reconhecida. Confira o cabeçalho: data;tipo;descricao;valor;categoria;conta',
      )
      return
    }
    setResult(parsed)
  }

  const canImport =
    result !== null &&
    result.rows.length > 0 &&
    unknownAccounts.length === 0 &&
    !importMutation.isPending

  return (
    <div>
      <Link
        to="/transacoes"
        className="mb-3 inline-flex items-center gap-1 text-xs font-bold uppercase hover:underline"
      >
        <ArrowLeft className="size-3.5" strokeWidth={3} />
        Transações
      </Link>
      <PageHeader
        title="Importar CSV"
        subtitle="Formato: data;tipo;descricao;valor;categoria;conta (o mesmo do export)"
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileChange}
          />
          <Button onClick={() => fileInputRef.current?.click()}>
            <FileUp className="size-4" strokeWidth={2.5} />
            Escolher arquivo
          </Button>
          {fileName && <Badge variant="muted">{fileName}</Badge>}
          {result && (
            <>
              <Badge variant="income">{result.rows.length} válidas</Badge>
              {result.errors.length > 0 && (
                <Badge variant="expense">
                  {result.errors.length} com erro
                </Badge>
              )}
              {result.skippedTransfers > 0 && (
                <Badge variant="warn">
                  {result.skippedTransfers} transferências puladas
                </Badge>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {unknownAccounts.length > 0 && (
        <div className="mb-4 flex items-center gap-2 border-2 border-expense bg-expense/15 p-3 text-sm font-bold text-expense">
          <AlertTriangle className="size-4 shrink-0" strokeWidth={2.5} />
          Contas não encontradas: {unknownAccounts.join(', ')}. Crie-as em{' '}
          <Link to="/contas" className="underline">
            Contas
          </Link>{' '}
          antes de importar.
        </div>
      )}

      {result && result.errors.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Linhas com erro (serão ignoradas)</CardTitle>
          </CardHeader>
          <ul className="max-h-48 divide-y-2 divide-line overflow-y-auto">
            {result.errors.map((rowError) => (
              <li
                key={rowError.line}
                className="px-4 py-2 text-xs text-expense"
              >
                <strong>Linha {rowError.line}:</strong> {rowError.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result && result.rows.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Pré-visualização</CardTitle>
            <Badge variant="muted">{result.rows.length} linhas</Badge>
          </CardHeader>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b-2 border-line bg-surface-2 text-left text-[10px] tracking-wider uppercase">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Conta</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-line">
                {result.rows.map((row) => (
                  <tr key={row.line}>
                    <td className="px-3 py-1.5 font-money whitespace-nowrap">
                      {formatDateBR(row.date)}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge
                        variant={row.type === 'income' ? 'income' : 'expense'}
                      >
                        {row.type === 'income' ? 'Receita' : 'Despesa'}
                      </Badge>
                    </td>
                    <td className="max-w-48 truncate px-3 py-1.5">
                      {row.description}
                    </td>
                    <td className="px-3 py-1.5">{row.categoryName}</td>
                    <td
                      className={cn(
                        'px-3 py-1.5',
                        !accountNames.has(row.accountName.toLowerCase()) &&
                          'font-bold text-expense',
                      )}
                    >
                      {row.accountName}
                    </td>
                    <td className="px-3 py-1.5 text-right font-money font-bold whitespace-nowrap">
                      {formatCentavos(row.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <FieldError message={error} />
      {result && result.rows.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="income"
            size="lg"
            disabled={!canImport}
            onClick={() => importMutation.mutate()}
          >
            {importMutation.isPending ? (
              'Importando…'
            ) : (
              <>
                <Upload className="size-4" strokeWidth={2.5} />
                Importar {result.rows.length} transações
              </>
            )}
          </Button>
          <span className="flex items-center gap-1 text-xs text-muted">
            <CheckCircle2 className="size-3.5" strokeWidth={2.5} />
            Categorias novas são criadas automaticamente.
          </span>
        </div>
      )}
    </div>
  )
}
