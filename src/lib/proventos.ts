// Parser do extrato de proventos (xlsx exportado pela B3/corretora).
// Formato esperado: colunas "Produto" ("TICKER - NOME"), "Pagamento"
// (DD/MM/YYYY ou serial do Excel), "Tipo de Evento" e "Valor líquido".
// Linhas de rodapé ("Total") e vazias são ignoradas.
import { strFromU8, unzipSync } from 'fflate'
import { parseDateBR } from './dates'
import { parseBRL } from './money'

export type ProventoRow = {
  asset: string
  date: string // YYYY-MM-DD
  amountCents: number
  event: string | null
}

function unescapeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Shared strings: um <si> pode ter vários runs <t> (rich text) — concatena. */
function parseSharedStrings(xml: string): string[] {
  const items = xml.match(/<si>[\s\S]*?<\/si>/g) ?? []
  return items.map((si) => {
    const runs = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []
    return unescapeXml(
      runs.map((run) => run.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, '')).join(''),
    )
  })
}

/** Células de uma linha: letra da coluna → valor resolvido como string. */
function parseRowCells(
  rowXml: string,
  sharedStrings: string[],
): Map<string, string> {
  const cells = new Map<string, string>()
  const cellRe =
    /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g
  for (const match of rowXml.matchAll(cellRe)) {
    const attrs = match[1]
    const inner = match[2] ?? ''
    const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1]
    if (!ref) continue
    const type = attrs.match(/\bt="(\w+)"/)?.[1]
    let value: string | undefined
    if (type === 'inlineStr') {
      const runs = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []
      value = runs
        .map((run) => run.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, ''))
        .join('')
    } else {
      value = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
    }
    if (value === undefined) continue
    value = unescapeXml(value)
    if (type === 's') {
      const index = Number(value)
      value = sharedStrings[index] ?? ''
    }
    cells.set(ref, value)
  }
  return cells
}

/** Serial do Excel (sistema 1900) → 'YYYY-MM-DD'. Epoch Unix = serial 25569. */
function excelSerialToDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 10)
}

function toIsoDate(raw: string): string | null {
  const br = parseDateBR(raw)
  if (br) return br
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const serial = Number(raw)
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    return excelSerialToDate(serial)
  }
  return null
}

function toCents(raw: string): number | null {
  // célula numérica do xlsx usa ponto decimal; digitado pode vir '1.234,56'
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) return Math.round(numeric * 100)
  return parseBRL(raw)
}

/** Parseia o xlsx de proventos. Lança Error com mensagem amigável se o formato não bater. */
export function parseProventosXlsx(bytes: Uint8Array): Array<ProventoRow> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('Arquivo inválido — envie o .xlsx exportado da corretora.')
  }

  const sheetPath = Object.keys(files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()[0]
  if (!sheetPath) {
    throw new Error('Planilha sem abas — envie o .xlsx exportado da corretora.')
  }
  const sharedStrings = files['xl/sharedStrings.xml']
    ? parseSharedStrings(strFromU8(files['xl/sharedStrings.xml']))
    : []
  const sheetXml = strFromU8(files[sheetPath])
  const rowsXml = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []

  // localiza o cabeçalho e mapeia as colunas pelo nome
  let columns: { asset: string; date: string; amount: string; event?: string } | null =
    null
  const rows: Array<ProventoRow> = []
  for (const rowXml of rowsXml) {
    const cells = parseRowCells(rowXml, sharedStrings)
    if (!columns) {
      let assetCol: string | undefined
      let dateCol: string | undefined
      let amountCol: string | undefined
      let eventCol: string | undefined
      for (const [col, value] of cells) {
        const label = value.trim().toLowerCase()
        if (label === 'produto') assetCol = col
        else if (label === 'pagamento') dateCol = col
        else if (label.startsWith('valor')) amountCol = col
        else if (label.startsWith('tipo')) eventCol = col
      }
      if (assetCol && dateCol && amountCol) {
        columns = { asset: assetCol, date: dateCol, amount: amountCol, event: eventCol }
      }
      continue
    }

    const produto = cells.get(columns.asset)?.trim() ?? ''
    const pagamento = cells.get(columns.date)?.trim() ?? ''
    const valor = cells.get(columns.amount)?.trim() ?? ''
    if (!produto || !pagamento || !valor) continue // vazias e rodapé "Total"

    const date = toIsoDate(pagamento)
    const amountCents = toCents(valor)
    if (!date || amountCents === null || amountCents <= 0) continue

    // "XPML11 - XP MALLS FDO INV IMOB FII" → "XPML11"
    const asset = (produto.split(' - ')[0] ?? produto).trim().toUpperCase()
    const event = columns.event
      ? (cells.get(columns.event)?.trim() ?? null) || null
      : null
    rows.push({ asset, date, amountCents, event })
  }

  if (!columns) {
    throw new Error(
      'Não achei as colunas "Produto", "Pagamento" e "Valor" — é o xlsx de proventos da corretora?',
    )
  }
  return rows
}
