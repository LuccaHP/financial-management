import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { getContext } from './integrations/tanstack-query/root-provider'

export function getRouter() {
  const context = getContext()
  const basepath = import.meta.env.VITE_APP_BASE_PATH || undefined

  const router = createTanStackRouter({
    routeTree,
    context,
    basepath,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
