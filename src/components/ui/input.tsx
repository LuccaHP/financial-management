import { cn } from '#/lib/cn'
import type { InputHTMLAttributes, LabelHTMLAttributes } from 'react'

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full border-2 border-line bg-surface px-3 py-2 text-sm text-ink',
        'placeholder:text-muted',
        'focus:shadow-brutal-sm focus:outline-none',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        'mb-1 block text-xs font-bold tracking-wider text-ink uppercase',
        className,
      )}
      {...props}
    />
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 border-l-4 border-expense pl-2 text-xs font-bold text-expense">
      {message}
    </p>
  )
}
