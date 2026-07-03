import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { addMonths, currentMonthKey, formatMonthPt } from '#/lib/dates'
import type { MonthKey } from '#/lib/dates'

export function MonthNavigator({
  month,
  onChange,
}: {
  month: MonthKey
  onChange: (month: MonthKey) => void
}) {
  const isCurrent = month === currentMonthKey()
  return (
    <div className="inline-flex items-center border-2 border-line bg-surface shadow-brutal-sm">
      <button
        type="button"
        onClick={() => onChange(addMonths(month, -1))}
        aria-label="Mês anterior"
        className="cursor-pointer border-r-2 border-line p-2 hover:bg-surface-2"
      >
        <ChevronLeft className="size-4" strokeWidth={3} />
      </button>
      <span className="min-w-40 px-3 text-center text-sm font-bold uppercase">
        {formatMonthPt(month)}
      </span>
      <button
        type="button"
        onClick={() => onChange(addMonths(month, 1))}
        aria-label="Próximo mês"
        className="cursor-pointer border-l-2 border-line p-2 hover:bg-surface-2"
      >
        <ChevronRight className="size-4" strokeWidth={3} />
      </button>
      {!isCurrent && (
        <Button
          variant="ghost"
          size="sm"
          className="border-l-2 border-line normal-case"
          onClick={() => onChange(currentMonthKey())}
        >
          Hoje
        </Button>
      )}
    </div>
  )
}
