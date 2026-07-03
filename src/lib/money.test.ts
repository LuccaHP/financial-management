import { describe, expect, it } from 'vitest'
import { formatCentavos, parseBRL, splitInstallments } from './money'

describe('formatCentavos', () => {
  it('formata valores em BRL', () => {
    expect(formatCentavos(123456).replace(/ /g, ' ')).toBe('R$ 1.234,56')
    expect(formatCentavos(0).replace(/ /g, ' ')).toBe('R$ 0,00')
    expect(formatCentavos(-500).replace(/ /g, ' ')).toBe('-R$ 5,00')
  })
})

describe('parseBRL', () => {
  it('aceita formato brasileiro', () => {
    expect(parseBRL('1.234,56')).toBe(123456)
    expect(parseBRL('1234,56')).toBe(123456)
    expect(parseBRL('R$ 1.234,56')).toBe(123456)
    expect(parseBRL('0,99')).toBe(99)
  })
  it('aceita formato com ponto decimal', () => {
    expect(parseBRL('1234.56')).toBe(123456)
    expect(parseBRL('1234')).toBe(123400)
    expect(parseBRL('10.5')).toBe(1050)
  })
  it('trata pontos de milhar sem vírgula', () => {
    expect(parseBRL('1.234.567')).toBe(123456700)
  })
  it('aceita negativos', () => {
    expect(parseBRL('-10,00')).toBe(-1000)
  })
  it('rejeita entradas inválidas', () => {
    expect(parseBRL('')).toBeNull()
    expect(parseBRL('abc')).toBeNull()
    expect(parseBRL('12a,00')).toBeNull()
  })
})

describe('splitInstallments', () => {
  it('divide exatamente quando é múltiplo', () => {
    expect(splitInstallments(12000, 12)).toEqual(Array(12).fill(1000))
  })
  it('distribui o resto nas primeiras parcelas', () => {
    expect(splitInstallments(1000, 3)).toEqual([334, 333, 333])
    expect(splitInstallments(100, 7)).toEqual([15, 15, 14, 14, 14, 14, 14])
  })
  it('a soma sempre bate com o total', () => {
    for (const [total, n] of [
      [999999, 12],
      [1, 5],
      [123457, 11],
    ] as const) {
      const parts = splitInstallments(total, n)
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      expect(parts).toHaveLength(n)
    }
  })
  it('rejeita parâmetros inválidos', () => {
    expect(() => splitInstallments(100, 0)).toThrow()
    expect(() => splitInstallments(-1, 2)).toThrow()
  })
})
