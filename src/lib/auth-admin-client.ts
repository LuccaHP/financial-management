import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'

const basePath = import.meta.env.VITE_APP_BASE_PATH || ''

export const authAdminClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? `${window.location.origin}${basePath}/api/auth`
      : undefined,
  plugins: [adminClient()],
})
