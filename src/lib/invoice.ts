// Lógica pura de faturas de cartão de crédito.
// Regra: compra em dia < closingDay entra na fatura do mês da compra;
// compra no dia do fechamento ou depois entra na fatura do mês seguinte.

import { addMonths, dateInMonth, monthOf } from './dates'
import type { DateKey, MonthKey } from './dates'

export function invoiceMonthFor(
  purchaseDate: DateKey,
  closingDay: number,
): MonthKey {
  const day = Number(purchaseDate.slice(8, 10))
  const month = monthOf(purchaseDate)
  return day < closingDay ? month : addMonths(month, 1)
}

/** Meses de fatura das n parcelas, a partir da primeira. */
export function installmentMonths(
  firstInvoiceMonth: MonthKey,
  count: number,
): MonthKey[] {
  return Array.from({ length: count }, (_, i) =>
    addMonths(firstInvoiceMonth, i),
  )
}

/** Data em que a fatura do mês M fecha (compras a partir dela caem em M+1). */
export function closingDateFor(
  invoiceMonth: MonthKey,
  closingDay: number,
): DateKey {
  return dateInMonth(invoiceMonth, closingDay)
}

/** Vencimento: dueDay no próprio mês se vier depois do fechamento; senão no mês seguinte. */
export function dueDateFor(
  invoiceMonth: MonthKey,
  closingDay: number,
  dueDay: number,
): DateKey {
  const dueMonth = dueDay > closingDay ? invoiceMonth : addMonths(invoiceMonth, 1)
  return dateInMonth(dueMonth, dueDay)
}

export type InvoiceStatus = 'aberta' | 'fechada' | 'paga'

export function invoiceStatus(params: {
  invoiceMonth: MonthKey
  closingDay: number
  today: DateKey
  isPaid: boolean
}): InvoiceStatus {
  if (params.isPaid) return 'paga'
  const closing = closingDateFor(params.invoiceMonth, params.closingDay)
  return params.today >= closing ? 'fechada' : 'aberta'
}
