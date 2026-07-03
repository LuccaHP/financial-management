// Contrato CSV do Deyno (export = import):
// UTF-8 com BOM, delimitador ';', colunas data;tipo;descricao;valor;categoria;conta
// data DD/MM/YYYY, valor 1234,56, tipo receita|despesa|transferencia.
// Transferências e pagamentos de fatura são exportados mas pulados no import.

import Papa from 'papaparse'
import { formatDateBR, parseDateBR } from './dates'
import { parseBRL } from './money'
import type { DateKey } from './dates'

export const CSV_HEADERS = [
  'data',
  'tipo',
  'descricao',
  'valor',
  'categoria',
  'conta',
] as const

export type CsvExportRow = {
  date: DateKey
  type: 'income' | 'expense' | 'transfer_in' | 'transfer_out'
  description: string
  amountCents: number
  categoryName: string | null
  accountName: string
}

export function serializeTransactionsCsv(rows: Array<CsvExportRow>): string {
  const data = rows.map((row) => ({
    data: formatDateBR(row.date),
    tipo:
      row.type === 'income'
        ? 'receita'
        : row.type === 'expense'
          ? 'despesa'
          : 'transferencia',
    descricao: row.description,
    valor: (row.amountCents / 100).toFixed(2).replace('.', ','),
    categoria: row.categoryName ?? '',
    conta: row.accountName,
  }))
  const csv = Papa.unparse(data, {
    delimiter: ';',
    columns: [...CSV_HEADERS],
  })
  return '﻿' + csv
}

export type CsvParsedRow = {
  line: number
  date: DateKey
  type: 'income' | 'expense'
  description: string
  amountCents: number
  categoryName: string
  accountName: string
}

export type CsvRowError = { line: number; message: string }

export type CsvParseResult = {
  rows: Array<CsvParsedRow>
  errors: Array<CsvRowError>
  skippedTransfers: number
}

export function parseTransactionsCsv(content: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(
    content.replace(/^﻿/, ''),
    {
      header: true,
      delimiter: ';',
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim().toLowerCase(),
    },
  )

  const rows: Array<CsvParsedRow> = []
  const errors: Array<CsvRowError> = []
  let skippedTransfers = 0

  parsed.data.forEach((raw, index) => {
    const line = index + 2 // 1 = cabeçalho
    const tipo = (raw.tipo ?? '').trim().toLowerCase()

    if (tipo === 'transferencia' || tipo === 'transferência') {
      skippedTransfers += 1
      return
    }
    if (tipo !== 'receita' && tipo !== 'despesa') {
      errors.push({
        line,
        message: `Tipo inválido "${raw.tipo ?? ''}" (use receita ou despesa).`,
      })
      return
    }

    const date = parseDateBR(raw.data ?? '')
    if (!date) {
      errors.push({
        line,
        message: `Data inválida "${raw.data ?? ''}" (use DD/MM/AAAA).`,
      })
      return
    }

    const amountCents = parseBRL(raw.valor ?? '')
    if (amountCents === null || amountCents <= 0) {
      errors.push({
        line,
        message: `Valor inválido "${raw.valor ?? ''}".`,
      })
      return
    }

    const description = (raw.descricao ?? '').trim()
    if (!description) {
      errors.push({ line, message: 'Descrição vazia.' })
      return
    }

    const accountName = (raw.conta ?? '').trim()
    if (!accountName) {
      errors.push({ line, message: 'Conta vazia.' })
      return
    }

    rows.push({
      line,
      date,
      type: tipo === 'receita' ? 'income' : 'expense',
      description,
      amountCents,
      categoryName: (raw.categoria ?? '').trim() || 'Outros',
      accountName,
    })
  })

  return { rows, errors, skippedTransfers }
}
