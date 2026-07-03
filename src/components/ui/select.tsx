import { ChevronDown } from 'lucide-react'
import { cn } from '#/lib/cn'
import type { SelectHTMLAttributes } from 'react'

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'w-full cursor-pointer appearance-none border-2 border-line bg-surface px-3 py-2 pr-9 text-sm text-ink',
          'focus:shadow-brutal-sm focus:outline-none',
          'disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
        strokeWidth={3}
      />
    </div>
  )
}
