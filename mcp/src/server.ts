import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { GraphClient } from './client.js'
import { TokenStore } from './auth/token-store.js'
import { DEFAULT_SCOPES } from './types.js'

import { registerAuthTools } from './tools/auth.js'
import { registerEmailTools } from './tools/email.js'
import { registerCalendarTools } from './tools/calendar.js'
import { registerFolderTools } from './tools/folders.js'
import { registerOneDriveTools } from './tools/onedrive.js'
import { registerRuleTools } from './tools/rules.js'
import { registerPowerAutomateTools } from './tools/power-automate.js'

// ─── Server Config ───────────────────────────────────────────────────────────

export interface CreateServerOptions {
  clientId: string
  clientSecret: string
  tenantId: string
  redirectUri?: string
  tokenStorePath?: string
  tokenStore?: TokenStore
  isAuthServerRunning?: () => boolean
}

// ─── Server Factory ──────────────────────────────────────────────────────────

export function createServer(options: CreateServerOptions): McpServer {
  const { clientId, clientSecret, tenantId, redirectUri, tokenStorePath } = options

  // Initialize the MCP server
  const server = new McpServer(
    {
      name: 'celavii-m365',
      version: '0.3.4',
    },
    {
      capabilities: {
        logging: {},
      },
    },
  )

  // Use provided token store or create a new one
  const tokenStore = options.tokenStore || new TokenStore(
    {
      clientId,
      clientSecret,
      tenantId,
      redirectUri: redirectUri || 'http://localhost:3333/auth/callback',
      scopes: DEFAULT_SCOPES,
    },
    tokenStorePath,
  )

  const client = new GraphClient(tokenStore)

  // Register all tool groups
  registerAuthTools(server, client, tokenStore, {
    isAuthServerRunning: options.isAuthServerRunning,
  })
  registerEmailTools(server, client)
  registerCalendarTools(server, client)
  registerFolderTools(server, client)
  registerOneDriveTools(server, client)
  registerRuleTools(server, client)
  registerPowerAutomateTools(server, client)

  return server
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export { GraphClient, GraphApiError } from './client.js'
export { TokenStore } from './auth/token-store.js'
