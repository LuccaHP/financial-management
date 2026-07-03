import { X } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '#/lib/cn'
import type { ReactNode } from 'react'

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-[#14120d]/60"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          'relative max-h-[90dvh] w-full max-w-lg overflow-y-auto border-4 border-line bg-surface shadow-brutal-lg',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b-4 border-line bg-primary px-4 py-3">
          <h2 className="font-display text-sm tracking-wide text-primary-ink uppercase">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="cursor-pointer border-2 border-[#14120d] bg-surface p-1 text-ink hover:bg-expense hover:text-[#14120d]"
          >
            <X className="size-4" strokeWidth={3} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
