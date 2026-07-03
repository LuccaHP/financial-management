import { describe, expect, it } from 'vitest'
import {
  dueDateFor,
  installmentMonths,
  invoiceMonthFor,
  invoiceStatus,
} from './invoice'

describe('invoiceMonthFor (fechamento dia 5)', () => {
  it('compra na véspera do fechamento entra na fatura do mês', () => {
    expect(invoiceMonthFor('2026-07-04', 5)).toBe('2026-07')
  })
  it('compra no dia do fechamento vai para o mês seguinte', () => {
    expect(invoiceMonthFor('2026-07-05', 5)).toBe('2026-08')
  })
  it('compra depois do fechamento vai para o mês seguinte', () => {
    expect(invoiceMonthFor('2026-07-20', 5)).toBe('2026-08')
  })
  it('virada de ano', () => {
    expect(invoiceMonthFor('2026-12-10', 5)).toBe('2027-01')
  })
})

describe('installmentMonths', () => {
  it('gera meses consecutivos cruzando o ano', () => {
    expect(installmentMonths('2026-11', 4)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ])
  })
})

describe('dueDateFor', () => {
  it('vencimento no próprio mês quando due > closing', () => {
    expect(dueDateFor('2026-07', 5, 12)).toBe('2026-07-12')
  })
  it('vencimento no mês seguinte quando due <= closing', () => {
    expect(dueDateFor('2026-07', 25, 5)).toBe('2026-08-05')
  })
})

describe('invoiceStatus', () => {
  const base = { invoiceMonth: '2026-07', closingDay: 5 }
  it('aberta antes do fechamento', () => {
    expect(invoiceStatus({ ...base, today: '2026-07-04', isPaid: false })).toBe(
      'aberta',
    )
  })
  it('fechada no dia do fechamento', () => {
    expect(invoiceStatus({ ...base, today: '2026-07-05', isPaid: false })).toBe(
      'fechada',
    )
  })
  it('paga tem prioridade', () => {
    expect(invoiceStatus({ ...base, today: '2026-07-01', isPaid: true })).toBe(
      'paga',
    )
  })
})
