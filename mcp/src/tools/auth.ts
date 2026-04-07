import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { TokenStore } from '../auth/token-store.js'
import { textResponse, actionResponse } from '../utils/formatting.js'

export function registerAuthTools(
  server: McpServer,
  _client: GraphClient,
  tokenStore: TokenStore,
  options?: { isAuthServerRunning?: () => boolean },
) {
  // ─── Authenticate ────────────────────────────────────────────────────

  server.registerTool(
    'm365_authenticate',
    {
      title: 'Authenticate with Microsoft 365',
      description:
        'Start the OAuth authentication flow for Microsoft 365. Returns a URL to visit in your browser to authorize access. Required before using any other m365_ tools.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      if (options?.isAuthServerRunning && !options.isAuthServerRunning()) {
        return textResponse(
          [
            'Error: The embedded auth server is not running (port is in use by another process).',
            '',
            'To fix this:',
            `  1. Stop the process using port ${process.env.M365_AUTH_PORT || '3333'}, or`,
            '  2. Set M365_AUTH_PORT to a different port and restart.',
          ].join('\n'),
        )
      }

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
    'm365_check_auth_status',
    {
      title: 'Check Authentication Status',
      description:
        'Check whether you are currently authenticated with Microsoft 365 and if your access tokens are valid. Use this to verify connectivity before other operations.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      const isAuth = await tokenStore.isAuthenticated()

      if (!isAuth) {
        return textResponse(
          'Not authenticated. Use the "m365_authenticate" tool to connect your Microsoft 365 account.',
        )
      }

      try {
        await tokenStore.getGraphToken()
        return actionResponse(
          'Authenticated and token is valid.',
          { authenticated: true, tokenValid: true },
        )
      } catch (err) {
        return textResponse(
          `Authentication found but token may be expired: ${err instanceof Error ? err.message : 'Unknown error'}. Try re-authenticating with m365_authenticate.`,
        )
      }
    },
  )

  // ─── Logout ──────────────────────────────────────────────────────────

  server.registerTool(
    'm365_logout',
    {
      title: 'Logout from Microsoft 365',
      description:
        'Clear stored authentication tokens for Microsoft 365. You will need to re-authenticate with m365_authenticate after this.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      await tokenStore.clear()
      return actionResponse(
        'Successfully logged out. Tokens have been cleared.',
        { loggedOut: true },
      )
    },
  )

  // ─── About ───────────────────────────────────────────────────────────

  server.registerTool(
    'm365_about',
    {
      title: 'About Celavii M365',
      description:
        'Get information about this MCP server, its version, and available capabilities.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      return textResponse(
        [
          'Celavii M365 MCP Server v0.5.0',
          '',
          'An open-source MCP server for Microsoft 365 integration.',
          '',
          'Capabilities:',
          '  - Email: Read, search, send, draft, organize (m365_list_emails, m365_search_emails, ...)',
          '  - Calendar: List, create, accept, decline, cancel events (m365_list_events, ...)',
          '  - OneDrive: Browse, search, upload, download, share files (m365_onedrive_list, ...)',
          '  - Folders: List, create, move emails between folders (m365_list_folders, ...)',
          '  - Rules: List, create, reorder inbox rules (m365_list_rules, ...)',
          '  - Power Automate: List, run, toggle flows (m365_flow_list, ...)',
          '',
          'Source: https://github.com/CelaviiHQ/celavii-m365',
          'License: MIT',
        ].join('\n'),
      )
    },
  )
}
