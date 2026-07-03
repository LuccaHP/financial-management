import { cn } from '#/lib/cn'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'income'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink',
  secondary: 'bg-surface text-ink',
  danger: 'bg-expense text-[#14120d]',
  income: 'bg-income text-[#14120d]',
  ghost:
    'border-transparent shadow-none bg-transparent text-ink hover:border-line hover:bg-surface-2 hover:translate-0 hover:shadow-none',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
  icon: 'p-2',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 border-2 border-line font-bold uppercase tracking-wide',
        'shadow-brutal transition-[translate,box-shadow] duration-100',
        'hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal-lg',
        'active:translate-x-1 active:translate-y-1 active:shadow-none',
        'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
