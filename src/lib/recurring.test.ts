import { describe, expect, it } from 'vitest'
import { pendingOccurrences } from './recurring'

describe('pendingOccurrences', () => {
  it('gera do próximo mês pendente até o corrente', () => {
    const result = pendingOccurrences({
      nextOccurrenceMonth: '2026-05',
      endMonth: null,
      dayOfMonth: 10,
      currentMonth: '2026-07',
    })
    expect(result).toEqual([
      { month: '2026-05', date: '2026-05-10' },
      { month: '2026-06', date: '2026-06-10' },
      { month: '2026-07', date: '2026-07-10' },
    ])
  })

  it('não gera nada quando já está em dia', () => {
    expect(
      pendingOccurrences({
        nextOccurrenceMonth: '2026-08',
        endMonth: null,
        dayOfMonth: 5,
        currentMonth: '2026-07',
      }),
    ).toEqual([])
  })

  it('respeita endMonth no passado', () => {
    const result = pendingOccurrences({
      nextOccurrenceMonth: '2026-04',
      endMonth: '2026-05',
      dayOfMonth: 1,
      currentMonth: '2026-07',
    })
    expect(result.map((occurrence) => occurrence.month)).toEqual([
      '2026-04',
      '2026-05',
    ])
  })

  it('clampa o dia 31 em meses curtos', () => {
    const result = pendingOccurrences({
      nextOccurrenceMonth: '2026-02',
      endMonth: null,
      dayOfMonth: 31,
      currentMonth: '2026-04',
    })
    expect(result.map((occurrence) => occurrence.date)).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('cruza a virada do ano', () => {
    const result = pendingOccurrences({
      nextOccurrenceMonth: '2026-11',
      endMonth: null,
      dayOfMonth: 15,
      currentMonth: '2027-01',
    })
    expect(result.map((occurrence) => occurrence.month)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
    ])
  })
})
