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
        'Start the OAuth authentication flow for Microsoft 365. Returns a URL to visit in your browser to authorize access. Required before using any other m365_ tools. The Microsoft account picker will always be shown so you can pick which account to grant — useful when adding a second/third account or when SSO would otherwise pick the wrong one. Pass `login_hint` to pre-fill the email field.',
      inputSchema: z.object({
        login_hint: z
          .string()
          .optional()
          .describe(
            'Optional email to pre-fill in the Microsoft sign-in form (e.g., "elioth@celavii.com"). The user can still choose a different account.',
          ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
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
      const hintParam = args.login_hint ? `?login_hint=${encodeURIComponent(args.login_hint)}` : ''
      const authUrl = `http://localhost:${port}/auth${hintParam}`

      return textResponse(
        [
          'Please visit this URL to authenticate:',
          '',
          authUrl,
          '',
          args.login_hint
            ? `The Microsoft sign-in page will pre-fill: ${args.login_hint}`
            : 'You will be shown the Microsoft account picker — choose which account to connect.',
          '',
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
        'Check whether you are currently authenticated with Microsoft 365 and if your access tokens are valid. Verifies a specific account if `account_id` is provided, otherwise the default account.',
      inputSchema: z.object({
        account_id: z
          .string()
          .optional()
          .describe('Email/UPN of the account to check. Defaults to the configured default account.'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const isAuth = await tokenStore.isAuthenticated()

      if (!isAuth) {
        return textResponse(
          'Not authenticated. Use the "m365_authenticate" tool to connect your Microsoft 365 account.',
        )
      }

      try {
        await tokenStore.getGraphToken(args.account_id)
        const accounts = await tokenStore.listAccounts()
        const target = args.account_id?.toLowerCase() ?? (await tokenStore.getDefault())
        const matched = accounts.find((a) => a.id === target)
        return actionResponse('Authenticated and token is valid.', {
          authenticated: true,
          tokenValid: true,
          accountId: target,
          isDefault: matched?.isDefault ?? false,
          displayName: matched?.displayName,
          totalAccounts: accounts.length,
        })
      } catch (err) {
        return textResponse(
          `Authentication check failed: ${err instanceof Error ? err.message : 'Unknown error'}. Try re-authenticating with m365_authenticate.`,
        )
      }
    },
  )

  // ─── List Accounts ───────────────────────────────────────────────────

  server.registerTool(
    'm365_list_accounts',
    {
      title: 'List Authenticated M365 Accounts',
      description:
        'List all M365 accounts currently authenticated with this MCP server. Shows which account is the default for tool calls without an explicit `account_id`.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const accounts = await tokenStore.listAccounts()
      if (accounts.length === 0) {
        return textResponse(
          'No authenticated accounts. Use "m365_authenticate" to connect your first M365 account.',
        )
      }
      return actionResponse(
        `${accounts.length} account(s) authenticated.`,
        { accounts },
      )
    },
  )

  // ─── Set Default Account ─────────────────────────────────────────────

  server.registerTool(
    'm365_set_default_account',
    {
      title: 'Set Default M365 Account',
      description:
        'Switch which authenticated M365 account is used by default when tools are called without an explicit `account_id`.',
      inputSchema: z.object({
        account_id: z
          .string()
          .describe('Email/UPN of the account to set as default (must already be authenticated).'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        await tokenStore.setDefault(args.account_id)
        return actionResponse(`Default account is now "${args.account_id}".`, {
          defaultAccount: args.account_id.toLowerCase(),
        })
      } catch (err) {
        return textResponse(
          `Failed to set default: ${err instanceof Error ? err.message : 'Unknown error'}`,
        )
      }
    },
  )

  // ─── Remove Account ──────────────────────────────────────────────────

  server.registerTool(
    'm365_remove_account',
    {
      title: 'Remove M365 Account',
      description:
        'Remove a single authenticated M365 account from this MCP server. Other accounts remain usable. If the removed account was the default, another account is auto-promoted.',
      inputSchema: z.object({
        account_id: z.string().describe('Email/UPN of the account to remove.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const had = await tokenStore.hasAccount(args.account_id)
      await tokenStore.removeAccount(args.account_id)
      const remaining = await tokenStore.listAccounts()
      return actionResponse(
        had
          ? `Removed account "${args.account_id}". ${remaining.length} account(s) remaining.`
          : `Account "${args.account_id}" was not authenticated. No change.`,
        {
          removed: had,
          accountId: args.account_id.toLowerCase(),
          remainingCount: remaining.length,
          newDefault: remaining.find((a) => a.isDefault)?.id ?? null,
        },
      )
    },
  )

  // ─── Logout ──────────────────────────────────────────────────────────

  server.registerTool(
    'm365_logout',
    {
      title: 'Logout from Microsoft 365 (all accounts)',
      description:
        'Clear stored authentication tokens for ALL authenticated M365 accounts. Use m365_remove_account to remove a single account instead.',
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
        'All accounts logged out. Tokens have been cleared.',
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
          'Celavii M365 MCP Server v0.6.0',
          '',
          'An open-source MCP server for Microsoft 365 integration.',
          '',
          'Multi-account support: every tool accepts an optional `account_id`.',
          'When omitted, calls go to the configured default account.',
          '',
          'Capabilities:',
          '  - Email: Read, search, send, draft, organize',
          '  - Calendar: List, create, accept, decline, cancel events',
          '  - OneDrive: Browse, search, upload, download, share files',
          '  - Folders: List, create, move emails',
          '  - Rules: List, create, reorder inbox rules',
          '  - Power Automate: List, run, toggle flows',
          '  - Account management: list_accounts, set_default_account, remove_account',
          '',
          'Source: https://github.com/CelaviiHQ/celavii-m365',
          'License: MIT',
        ].join('\n'),
      )
    },
  )
}
