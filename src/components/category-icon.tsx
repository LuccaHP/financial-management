import { icons } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function kebabToPascal(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** Ícone lucide por nome kebab-case ('shopping-cart'), com fallback. */
export function CategoryIcon({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const Icon: LucideIcon =
    icons[kebabToPascal(name) as keyof typeof icons] ?? icons.Tag
  return <Icon className={className} strokeWidth={2.5} />
}
