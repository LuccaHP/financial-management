import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// O driver do Postgres (`pg`) só roda no servidor. Quando um módulo com efeito
// colateral (#/db, #/lib/auth) é importado por uma rota, o import sobrevive à
// remoção do corpo da server function e arrasta o `pg` (que usa `Buffer`) pro
// bundle do navegador, quebrando o app. Aqui trocamos esses módulos node-only
// por um stub vazio APENAS no ambiente do cliente; o servidor usa o `pg` real.
function stubNodeOnlyInClient(): Plugin {
  const STUB = new Set(['pg', 'pg-native', 'pg-cloudflare', 'cloudflare:sockets'])
  const VIRTUAL = '\0virtual:node-only-stub'
  return {
    name: 'stub-node-only-in-client',
    enforce: 'pre',
    resolveId(id) {
      if (this.environment?.name === 'client' && STUB.has(id)) return VIRTUAL
      return null
    },
    load(id) {
      if (id !== VIRTUAL) return null
      // Proxy recursivo: satisfaz qualquer acesso (pg.Pool, pg.types, new pg.Client…)
      // sem nunca executar de verdade — no cliente esse código nunca roda.
      return [
        'const handler = { get: () => proxy, apply: () => proxy, construct: () => proxy }',
        'const proxy = new Proxy(function () {}, handler)',
        'export default proxy',
        'export const Pool = proxy',
        'export const Client = proxy',
        'export const types = proxy',
      ].join('\n')
    },
  }
}

function normalizeBasePath(value: string | undefined) {
  if (!value || value === '/') return ''
  return `/${value.replace(/^\/+|\/+$/g, '')}`
}

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = normalizeBasePath(env.APP_BASE_PATH ?? env.VITE_APP_BASE_PATH)

  return {
    base: basePath ? `${basePath}/` : '/',
    define: {
      'import.meta.env.VITE_APP_BASE_PATH': JSON.stringify(basePath),
    },
    resolve: { tsconfigPaths: true },
    plugins: [
      stubNodeOnlyInClient(),
      devtools(),
      nitro({
        baseURL: basePath,
        rollupConfig: { external: [/^@sentry\//] }
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  }
})

export default config
