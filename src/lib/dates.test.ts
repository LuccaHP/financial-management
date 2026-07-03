import { describe, expect, it } from 'vitest'
import {
  addMonths,
  dateInMonth,
  daysInMonth,
  formatDateBR,
  formatMonthPt,
  monthsBetween,
  parseDateBR,
} from './dates'

describe('addMonths', () => {
  it('avança e retrocede meses', () => {
    expect(addMonths('2026-07', 1)).toBe('2026-08')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-07', 12)).toBe('2027-07')
  })
})

describe('monthsBetween', () => {
  it('calcula diferença assinada', () => {
    expect(monthsBetween('2026-07', '2026-10')).toBe(3)
    expect(monthsBetween('2026-10', '2026-07')).toBe(-3)
    expect(monthsBetween('2025-11', '2026-02')).toBe(3)
  })
})

describe('daysInMonth / dateInMonth', () => {
  it('respeita meses curtos e bissextos', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-04')).toBe(30)
  })
  it('clampa o dia ao fim do mês', () => {
    expect(dateInMonth('2026-02', 31)).toBe('2026-02-28')
    expect(dateInMonth('2026-07', 15)).toBe('2026-07-15')
  })
})

describe('formatação pt-BR', () => {
  it('formata mês e data', () => {
    expect(formatMonthPt('2026-07')).toBe('julho de 2026')
    expect(formatDateBR('2026-07-02')).toBe('02/07/2026')
  })
  it('parseia data brasileira', () => {
    expect(parseDateBR('02/07/2026')).toBe('2026-07-02')
    expect(parseDateBR('31/02/2026')).toBeNull()
    expect(parseDateBR('2026-07-02')).toBeNull()
  })
})
