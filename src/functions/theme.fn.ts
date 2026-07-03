import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

export type Theme = 'light' | 'dark'

export const getThemeFn = createServerFn().handler((): Theme => {
  return getCookie('deyno-theme') === 'dark' ? 'dark' : 'light'
})
