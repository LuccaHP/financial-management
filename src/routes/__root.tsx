import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import { getThemeFn } from '#/functions/theme.fn'
import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Deyno — Finanças Pessoais',
      },
      {
        name: 'theme-color',
        content: '#ffd02e',
      },
      // rótulo curto sob o ícone quando adicionado à tela inicial (iOS)
      {
        name: 'apple-mobile-web-app-title',
        content: 'Deyno',
      },
      {
        name: 'apple-mobile-web-app-status-bar-style',
        content: 'default',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      // BASE_URL respeita o APP_BASE_PATH (ex.: /deyno/ em produção)
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: `${import.meta.env.BASE_URL}favicon.svg`,
      },
      {
        rel: 'icon',
        sizes: '48x48 32x32 16x16',
        href: `${import.meta.env.BASE_URL}favicon.ico`,
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: `${import.meta.env.BASE_URL}apple-touch-icon.png?v=2`,
      },
      {
        rel: 'manifest',
        href: `${import.meta.env.BASE_URL}manifest.json?v=2`,
      },
    ],
  }),
  loader: () => getThemeFn(),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const theme = Route.useLoaderData()
  return (
    <html lang="pt-BR" className={theme === 'dark' ? 'dark' : undefined}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
