// Meses são strings 'YYYY-MM'; datas são strings 'YYYY-MM-DD'.
// O fuso de referência do sistema é America/Sao_Paulo.

export type MonthKey = string // 'YYYY-MM'
export type DateKey = string // 'YYYY-MM-DD'

const SP_TZ = 'America/Sao_Paulo'

const spDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: SP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Data de hoje em São Paulo, como 'YYYY-MM-DD'. */
export function todayKey(now: Date = new Date()): DateKey {
  return spDateFormat.format(now)
}

/** Mês corrente em São Paulo, como 'YYYY-MM'. */
export function currentMonthKey(now: Date = new Date()): MonthKey {
  return todayKey(now).slice(0, 7)
}

export function monthOf(date: DateKey): MonthKey {
  return date.slice(0, 7)
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`
}

/** Diferença b − a em meses (positivo se b é depois de a). */
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Monta 'YYYY-MM-DD' clampando o dia ao tamanho do mês. */
export function dateInMonth(month: MonthKey, day: number): DateKey {
  const clamped = Math.min(day, daysInMonth(month))
  return `${month}-${String(clamped).padStart(2, '0')}`
}

const MONTH_NAMES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** '2026-07' → 'julho de 2026' */
export function formatMonthPt(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES_PT[m - 1]} de ${y}`
}

/** '2026-07' → 'jul/2026' */
export function formatMonthShortPt(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES_PT[m - 1].slice(0, 3)}/${y}`
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' */
export function formatDateBR(date: DateKey): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

/** 'DD/MM/YYYY' → 'YYYY-MM-DD' (null se inválida) */
export function parseDateBR(input: string): DateKey | null {
  const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const [, d, m, y] = match
  const day = Number(d)
  const month = Number(m)
  if (month < 1 || month > 12) return null
  const key = `${y}-${String(month).padStart(2, '0')}`
  if (day < 1 || day > daysInMonth(key)) return null
  return `${key}-${String(day).padStart(2, '0')}`
}
