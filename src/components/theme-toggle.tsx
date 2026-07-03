import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'

export function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false,
  )

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    document.cookie = `deyno-theme=${next ? 'dark' : 'light'}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={toggle}
      aria-label={dark ? 'Tema claro' : 'Tema escuro'}
      title={dark ? 'Tema claro' : 'Tema escuro'}
    >
      {dark ? (
        <Sun className="size-4" strokeWidth={2.5} />
      ) : (
        <Moon className="size-4" strokeWidth={2.5} />
      )}
    </Button>
  )
}
