import { cn } from '#/lib/cn'
import type { HTMLAttributes } from 'react'

type Variant = 'default' | 'income' | 'expense' | 'warn' | 'accent' | 'muted'

const variants: Record<Variant, string> = {
  default: 'bg-primary text-primary-ink',
  income: 'bg-income text-[#14120d]',
  expense: 'bg-expense text-[#14120d]',
  warn: 'bg-warn text-[#14120d]',
  accent: 'bg-accent text-white',
  muted: 'bg-surface-2 text-ink',
}

export function Badge({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border-2 border-line px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
