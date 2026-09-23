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
        href: `${import.meta.env.BASE_URL}logo192.png`,
      },
      {
        rel: 'manifest',
        href: `${import.meta.env.BASE_URL}manifest.json`,
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
