import { describe, expect, it } from 'vitest'
import { goalProjection } from './goals'

describe('goalProjection', () => {
  it('calcula poupança mensal necessária', () => {
    const projection = goalProjection({
      targetCents: 1_200_000, // R$ 12.000
      savedCents: 0,
      targetDate: '2027-07-01',
      sinceDate: '2026-07-01',
      today: '2026-07-02',
    })
    // 12 meses até a meta → R$ 1.000/mês
    expect(projection.monthlyNeededCents).toBe(100_000)
    expect(projection.percent).toBe(0)
    expect(projection.paceCentsPerMonth).toBeNull()
    expect(projection.projectedMonth).toBeNull()
  })

  it('projeta conclusão pelo ritmo atual', () => {
    const projection = goalProjection({
      targetCents: 600_000,
      savedCents: 200_000, // poupou 200k em 4 meses → 50k/mês
      targetDate: '2027-12-01',
      sinceDate: '2026-03-10',
      today: '2026-07-02',
    })
    expect(projection.paceCentsPerMonth).toBe(50_000)
    // faltam 400k → 8 meses → 2027-03
    expect(projection.projectedMonth).toBe('2027-03')
  })

  it('meta atingida', () => {
    const projection = goalProjection({
      targetCents: 100_000,
      savedCents: 120_000,
      targetDate: '2026-12-01',
      sinceDate: '2026-01-01',
      today: '2026-07-02',
    })
    expect(projection.percent).toBe(100)
    expect(projection.remainingCents).toBe(0)
    expect(projection.monthlyNeededCents).toBeNull()
  })

  it('data alvo no passado pede o restante de uma vez', () => {
    const projection = goalProjection({
      targetCents: 100_000,
      savedCents: 40_000,
      targetDate: '2026-05-01',
      sinceDate: '2026-01-01',
      today: '2026-07-02',
    })
    expect(projection.monthlyNeededCents).toBe(60_000)
  })
})
