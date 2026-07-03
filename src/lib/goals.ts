// Projeções de objetivos (tracker independente com aportes manuais).

import { addMonths, monthOf, monthsBetween } from './dates'
import type { DateKey, MonthKey } from './dates'

export type GoalProjection = {
  percent: number
  remainingCents: number
  /** Quanto poupar por mês para atingir a meta até a data alvo (null se já atingida). */
  monthlyNeededCents: number | null
  /** Ritmo médio de poupança por mês desde o primeiro aporte (null sem histórico). */
  paceCentsPerMonth: number | null
  /** Mês previsto de conclusão no ritmo atual (null se ritmo <= 0). */
  projectedMonth: MonthKey | null
}

export function goalProjection(params: {
  targetCents: number
  savedCents: number
  targetDate: DateKey
  /** data do primeiro aporte, ou de criação do objetivo */
  sinceDate: DateKey
  today: DateKey
}): GoalProjection {
  const remainingCents = Math.max(0, params.targetCents - params.savedCents)
  const percent =
    params.targetCents > 0
      ? Math.min(100, (params.savedCents / params.targetCents) * 100)
      : 0

  if (remainingCents === 0) {
    return {
      percent: 100,
      remainingCents: 0,
      monthlyNeededCents: null,
      paceCentsPerMonth: null,
      projectedMonth: null,
    }
  }

  const monthsUntilTarget = monthsBetween(
    monthOf(params.today),
    monthOf(params.targetDate),
  )
  const monthlyNeededCents =
    monthsUntilTarget > 0
      ? Math.ceil(remainingCents / monthsUntilTarget)
      : remainingCents

  const monthsSaving = Math.max(
    1,
    monthsBetween(monthOf(params.sinceDate), monthOf(params.today)),
  )
  const paceCentsPerMonth =
    params.savedCents > 0
      ? Math.floor(params.savedCents / monthsSaving)
      : null

  const projectedMonth =
    paceCentsPerMonth && paceCentsPerMonth > 0
      ? addMonths(
          monthOf(params.today),
          Math.ceil(remainingCents / paceCentsPerMonth),
        )
      : null

  return {
    percent,
    remainingCents,
    monthlyNeededCents,
    paceCentsPerMonth,
    projectedMonth,
  }
}
