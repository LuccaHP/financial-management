// Todo dinheiro no sistema é inteiro em centavos (BRL).

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatCentavos(cents: number): string {
  return brl.format(cents / 100)
}

/**
 * Converte entrada do usuário em centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "1234" e prefixo "R$".
 * Retorna null para entradas inválidas.
 */
export function parseBRL(input: string): number | null {
  const raw = input.replace(/R\$\s?/g, '').trim()
  if (!raw) return null
  const negative = raw.startsWith('-')
  const cleaned = raw.replace(/^-/, '')
  if (!/^[\d.,]+$/.test(cleaned)) return null

  let normalized: string
  if (cleaned.includes(',')) {
    // vírgula é o separador decimal; pontos são milhar
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    const dots = cleaned.match(/\./g)?.length ?? 0
    const lastDot = cleaned.lastIndexOf('.')
    // um único ponto com 1-2 dígitos depois → decimal; senão milhar
    if (dots === 1 && cleaned.length - lastDot - 1 <= 2) {
      normalized = cleaned
    } else {
      normalized = cleaned.replace(/\./g, '')
    }
  }

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  const cents = Math.round(value * 100)
  return negative ? -cents : cents
}

/**
 * Divide um total em n parcelas inteiras cuja soma é exatamente o total.
 * As primeiras (total mod n) parcelas recebem um centavo a mais.
 */
export function splitInstallments(totalCents: number, n: number): number[] {
  if (n < 1 || !Number.isInteger(n)) throw new Error('parcelas inválidas')
  if (!Number.isInteger(totalCents) || totalCents < 0)
    throw new Error('valor inválido')
  const base = Math.floor(totalCents / n)
  const remainder = totalCents - base * n
  return Array.from({ length: n }, (_, i) => (i < remainder ? base + 1 : base))
}
