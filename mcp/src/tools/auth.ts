import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { TokenStore } from '../auth/token-store.js'
import { textResponse } from '../utils/formatting.js'

export function registerAuthTools(
  server: McpServer,
  _client: GraphClient,
  tokenStore: TokenStore,
) {
  // ─── Authenticate ────────────────────────────────────────────────────

  server.registerTool(
    'authenticate',
    {
      title: 'Authenticate with Microsoft 365',
      description:
        'Start the OAuth authentication flow. Returns a URL to visit in your browser to authorize access to your Microsoft 365 account.',
      inputSchema: z.object({}),
    },
    async () => {
      const port = process.env.M365_AUTH_PORT || '3333'
      const authUrl = `http://localhost:${port}/auth`

      return textResponse(
        [
          'Please visit this URL to authenticate:',
          '',
          authUrl,
          '',
          'Sign in with your Microsoft 365 account.',
          'After authenticating, return here and retry your request.',
        ].join('\n'),
      )
    },
  )

  // ─── Check Auth Status ───────────────────────────────────────────────

  server.registerTool(
    'check_auth_status',
    {
      title: 'Check Authentication Status',
      description:
        'Check whether you are currently authenticated with Microsoft 365 and if your tokens are valid.',
      inputSchema: z.object({}),
    },
    async () => {
      const isAuth = await tokenStore.isAuthenticated()

      if (!isAuth) {
        return textResponse(
          'Not authenticated. Use the "authenticate" tool to connect your Microsoft 365 account.',
        )
      }

      try {
        // Verify the token actually works
        await tokenStore.getGraphToken()
        return textResponse('Authenticated and token is valid.')
      } catch (err) {
        return textResponse(
          `Authentication found but token may be expired: ${err instanceof Error ? err.message : 'Unknown error'}. Try re-authenticating.`,
        )
      }
    },
  )

  // ─── Logout ──────────────────────────────────────────────────────────

  server.registerTool(
    'logout',
    {
      title: 'Logout from Microsoft 365',
      description:
        'Clear stored authentication tokens. You will need to re-authenticate after this.',
      inputSchema: z.object({}),
    },
    async () => {
      await tokenStore.clear()
      return textResponse('Successfully logged out. Tokens have been cleared.')
    },
  )

  // ─── About ───────────────────────────────────────────────────────────

  server.registerTool(
    'about',
    {
      title: 'About Celavii M365',
      description:
        'Get information about this MCP server, its version, and available capabilities.',
      inputSchema: z.object({}),
    },
    async () => {
      return textResponse(
        [
          'Celavii M365 MCP Server v0.3.1',
          '',
          'An open-source MCP server for Microsoft 365 integration.',
          '',
          'Capabilities:',
          '  - Email: Read, search, send, draft, organize',
          '  - Calendar: List, create, accept, decline, cancel events',
          '  - OneDrive: Browse, search, upload, download, share files',
          '  - Folders: List, create, move emails between folders',
          '  - Rules: List, create, reorder inbox rules',
          '  - Power Automate: List, run, toggle flows',
          '',
          'Source: https://github.com/CelaviiHQ/celavii-m365',
          'License: MIT',
        ].join('\n'),
      )
    },
  )
}
