import { cn } from '#/lib/cn'

/**
 * Barra de progresso brutalist com listras diagonais.
 * `tone` muda conforme o estado (orçamento ok / perto do limite / estourado).
 */
export function Progress({
  value,
  tone = 'income',
  className,
}: {
  /** 0–100 (valores acima de 100 são clampados visualmente) */
  value: number
  tone?: 'income' | 'warn' | 'expense' | 'accent' | 'primary'
  className?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const tones = {
    income: 'bg-income',
    warn: 'bg-warn',
    expense: 'bg-expense',
    accent: 'bg-accent',
    primary: 'bg-primary',
  }
  return (
    <div
      className={cn(
        'h-5 w-full border-2 border-line bg-surface',
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full border-r-2 border-line transition-[width] duration-300',
          clamped === 0 && 'border-r-0',
          tones[tone],
        )}
        style={{
          width: `${clamped}%`,
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent 0 6px, rgba(20,18,13,0.18) 6px 12px)',
        }}
      />
    </div>
  )
}
