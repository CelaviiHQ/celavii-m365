import { createServer as createHttpServer } from 'node:http'
import { URL } from 'node:url'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'
import { TokenStore } from './auth/token-store.js'
import { DEFAULT_SCOPES } from './types.js'
import type { AuthConfig } from './types.js'

async function main() {
  // ─── Required Configuration ──────────────────────────────────────────

  const clientId = process.env.M365_CLIENT_ID
  const clientSecret = process.env.M365_CLIENT_SECRET
  const tenantId = process.env.M365_TENANT_ID || 'common'

  if (!clientId || !clientSecret) {
    console.error(
      [
        'Error: Missing required environment variables.',
        '',
        'Required:',
        '  M365_CLIENT_ID      - Azure AD application (client) ID',
        '  M365_CLIENT_SECRET  - Azure AD client secret value (not the secret ID!)',
        '',
        'Optional:',
        '  M365_TENANT_ID      - Azure AD tenant ID (defaults to "common" for multi-tenant)',
        '  M365_REDIRECT_URI   - OAuth callback URL (defaults to http://localhost:3333/auth/callback)',
        '  M365_TOKEN_PATH     - Custom path for token storage file',
        '  M365_AUTH_PORT      - Auth server port (default: 3333)',
        '',
        'See: https://github.com/CelaviiHQ/celavii-m365#setup',
      ].join('\n'),
    )
    process.exit(1)
  }

  // ─── Optional Configuration ──────────────────────────────────────────

  const authPort = parseInt(process.env.M365_AUTH_PORT || '3333', 10)
  const authHost = process.env.M365_AUTH_HOST || 'localhost'
  const redirectUri = process.env.M365_REDIRECT_URI || `http://localhost:${authPort}/auth/callback`
  const tokenStorePath = process.env.M365_TOKEN_PATH || undefined // empty string → undefined → use default

  // ─── Shared Token Store ───────────────────────────────────────────────
  // One instance shared between the MCP server tools and the embedded
  // auth server, so tokens saved by OAuth are immediately visible to tools.

  const authConfig: AuthConfig = {
    clientId,
    clientSecret,
    tenantId,
    redirectUri,
    scopes: DEFAULT_SCOPES,
  }

  const tokenStore = new TokenStore(authConfig, tokenStorePath)

  // ─── Auth Server State ───────────────────────────────────────────────
  // Track whether the embedded auth server is actually listening so the
  // authenticate tool can report a clear error instead of sending the
  // user to a URL served by a different process.

  let authServerRunning = false

  // ─── Start MCP Server (stdio) ────────────────────────────────────────

  const server = createServer({
    clientId,
    clientSecret,
    tenantId,
    redirectUri,
    tokenStorePath,
    tokenStore,
    isAuthServerRunning: () => authServerRunning,
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  // ─── Embedded Auth Server ────────────────────────────────────────────
  // Runs alongside the stdio MCP server in the same process.
  // This means the authenticate tool's CSRF state tokens match the
  // callback handler — no more mismatch between separate processes.

  const pendingStates = new Map<string, number>()
  const STATE_TTL_MS = 10 * 60 * 1000

  function cleanExpiredStates() {
    const now = Date.now()
    for (const [state, timestamp] of pendingStates) {
      if (now - timestamp > STATE_TTL_MS) {
        pendingStates.delete(state)
      }
    }
  }

  function successPage(accountId?: string): string {
    const safeAccount = (accountId || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Celavii M365 — Authenticated</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .card { text-align: center; padding: 3rem; border-radius: 1rem; background: #1e293b; max-width: 480px; }
    h1 { color: #22c55e; margin-bottom: 0.5rem; }
    p { color: #94a3b8; line-height: 1.6; }
    .account { background: #334155; padding: 0.5rem 1rem; border-radius: 0.5rem; font-family: ui-monospace, monospace; color: #22c55e; margin: 1rem 0; display: inline-block; }
    code { background: #334155; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authenticated</h1>
    <p>Your Microsoft 365 account has been connected successfully.</p>
    ${safeAccount ? `<div class="account">${safeAccount}</div>` : ''}
    <p>You can close this tab and return to Claude Desktop.</p>
    <p style="margin-top: 2rem; font-size: 0.85rem;">Tokens stored at <code>~/.celavii-m365-tokens.json</code></p>
  </div>
</body>
</html>`
  }

  function errorPage(title: string, detail: string): string {
    const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const safeDetail = detail.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Celavii M365 — Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .card { text-align: center; padding: 3rem; border-radius: 1rem; background: #1e293b; max-width: 480px; }
    h1 { color: #ef4444; margin-bottom: 0.5rem; }
    p { color: #94a3b8; line-height: 1.6; }
    pre { background: #334155; padding: 1rem; border-radius: 0.5rem; text-align: left; overflow-x: auto; font-size: 0.85rem; color: #fca5a5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <pre>${safeDetail}</pre>
    <p>Please try authenticating again.</p>
  </div>
</body>
</html>`
  }

  const authServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${authHost}:${authPort}`)

    // Start auth flow
    if (url.pathname === '/auth') {
      cleanExpiredStates()
      const state = crypto.randomUUID()
      pendingStates.set(state, Date.now())

      const loginHint = url.searchParams.get('login_hint') || undefined

      const params = new URLSearchParams({
        client_id: authConfig.clientId,
        response_type: 'code',
        redirect_uri: authConfig.redirectUri,
        response_mode: 'query',
        scope: [...authConfig.scopes, 'openid', 'profile', 'offline_access'].join(' '),
        state,
        // Force account picker so users with multiple signed-in accounts
        // explicitly choose which to grant.
        prompt: 'select_account',
      })
      if (loginHint) params.set('login_hint', loginHint)

      const authUrl = `https://login.microsoftonline.com/${authConfig.tenantId}/oauth2/v2.0/authorize?${params}`
      res.writeHead(302, { Location: authUrl })
      res.end()
      return
    }

    // OAuth callback
    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(errorPage('Authentication Failed', errorDescription || error))
        return
      }

      if (!state || !pendingStates.has(state)) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(errorPage('Invalid Request', 'Missing or invalid state parameter. Please try again.'))
        return
      }
      pendingStates.delete(state)

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(errorPage('Missing Auth Code', 'No authorization code received.'))
        return
      }

      try {
        const accountId = await tokenStore.exchangeCode(code)
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(successPage(accountId))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        res.writeHead(500, { 'Content-Type': 'text/html' })
        res.end(errorPage('Token Exchange Failed', msg))
      }
      return
    }

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', authenticated: await tokenStore.isAuthenticated() }))
      return
    }

    // Root → redirect to /auth
    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/auth' })
      res.end()
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })

  authServer.listen(authPort, authHost, () => {
    authServerRunning = true
    // Log to stderr so it doesn't interfere with stdio MCP transport
    process.stderr.write(`Auth server listening on http://${authHost}:${authPort}/auth\n`)
  })

  // If the port is already in use, don't crash the MCP server
  authServer.on('error', (err: NodeJS.ErrnoException) => {
    authServerRunning = false
    if (err.code === 'EADDRINUSE') {
      process.stderr.write(`Auth server port ${authPort} already in use — auth server disabled\n`)
    } else {
      process.stderr.write(`Auth server error: ${err.message}\n`)
    }
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
