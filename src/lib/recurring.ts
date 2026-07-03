// Lógica pura da materialização de transações recorrentes.

import { addMonths, dateInMonth } from './dates'
import type { DateKey, MonthKey } from './dates'

export type PendingOccurrence = { month: MonthKey; date: DateKey }

/**
 * Meses pendentes de lançamento para uma regra, de nextOccurrenceMonth até
 * o mês corrente (limitado por endMonth). O dia é clampado ao fim do mês.
 */
export function pendingOccurrences(params: {
  nextOccurrenceMonth: MonthKey
  endMonth: MonthKey | null
  dayOfMonth: number
  currentMonth: MonthKey
}): Array<PendingOccurrence> {
  const stop =
    params.endMonth && params.endMonth < params.currentMonth
      ? params.endMonth
      : params.currentMonth
  const result: Array<PendingOccurrence> = []
  for (
    let month = params.nextOccurrenceMonth;
    month <= stop;
    month = addMonths(month, 1)
  ) {
    result.push({ month, date: dateInMonth(month, params.dayOfMonth) })
  }
  return result
}
