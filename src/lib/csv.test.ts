import { describe, expect, it } from 'vitest'
import { parseTransactionsCsv, serializeTransactionsCsv } from './csv'

describe('CSV round-trip', () => {
  it('exporta e reimporta sem perdas', () => {
    const csv = serializeTransactionsCsv([
      {
        date: '2026-07-02',
        type: 'expense',
        description: 'Mercado da semana',
        amountCents: 45678,
        categoryName: 'Mercado',
        accountName: 'Nubank',
      },
      {
        date: '2026-07-05',
        type: 'income',
        description: 'Salário',
        amountCents: 1_000_000,
        categoryName: 'Salário',
        accountName: 'Nubank',
      },
    ])
    expect(csv.startsWith('﻿')).toBe(true)

    const result = parseTransactionsCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      date: '2026-07-02',
      type: 'expense',
      description: 'Mercado da semana',
      amountCents: 45678,
      categoryName: 'Mercado',
      accountName: 'Nubank',
    })
    expect(result.rows[1].amountCents).toBe(1_000_000)
  })

  it('pula transferências com aviso', () => {
    const csv = serializeTransactionsCsv([
      {
        date: '2026-07-02',
        type: 'transfer_out',
        description: 'Transferência',
        amountCents: 10000,
        categoryName: null,
        accountName: 'Nubank',
      },
    ])
    const result = parseTransactionsCsv(csv)
    expect(result.rows).toHaveLength(0)
    expect(result.skippedTransfers).toBe(1)
  })

  it('reporta erros por linha e mantém linhas válidas', () => {
    const csv = [
      'data;tipo;descricao;valor;categoria;conta',
      '02/07/2026;despesa;Almoço;25,00;Alimentação;Carteira',
      '31/02/2026;despesa;Data ruim;10,00;Outros;Carteira',
      '02/07/2026;pix;Tipo ruim;10,00;Outros;Carteira',
      '02/07/2026;despesa;;10,00;Outros;Carteira',
    ].join('\n')
    const result = parseTransactionsCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toHaveLength(3)
    expect(result.errors.map((error) => error.line)).toEqual([3, 4, 5])
  })

  it('categoria vazia vira Outros', () => {
    const csv = [
      'data;tipo;descricao;valor;categoria;conta',
      '02/07/2026;despesa;Sem categoria;5,00;;Carteira',
    ].join('\n')
    const result = parseTransactionsCsv(csv)
    expect(result.rows[0].categoryName).toBe('Outros')
  })
})
