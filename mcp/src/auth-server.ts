/**
 * OAuth callback server for celavii-m365.
 *
 * Run this separately from the MCP server to handle the browser-based
 * OAuth redirect from Microsoft. It listens on a local port, exchanges
 * the auth code for tokens, and stores them so the MCP server can use them.
 *
 * Usage:
 *   npx celavii-m365-auth          (when installed globally)
 *   node dist/auth-server.js       (from the mcp directory)
 *   npm run auth                   (development)
 */

import { createServer as createHttpServer } from 'node:http'
import { URL } from 'node:url'
import { TokenStore } from './auth/token-store.js'
import type { AuthConfig } from './types.js'
import { DEFAULT_SCOPES } from './types.js'

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.M365_AUTH_PORT || '3333', 10)
const HOST = process.env.M365_AUTH_HOST || 'localhost'

const clientId = process.env.M365_CLIENT_ID
const clientSecret = process.env.M365_CLIENT_SECRET
const tenantId = process.env.M365_TENANT_ID || 'common'
const redirectUri = process.env.M365_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`
const tokenStorePath = process.env.M365_TOKEN_PATH || undefined

if (!clientId || !clientSecret) {
  console.error(
    [
      'Error: Missing required environment variables.',
      '',
      '  M365_CLIENT_ID      - Azure AD application (client) ID',
      '  M365_CLIENT_SECRET  - Azure AD client secret value',
      '',
      'Optional:',
      '  M365_TENANT_ID      - Defaults to "common"',
      '  M365_AUTH_PORT      - Server port (default: 3333)',
      '  M365_TOKEN_PATH     - Custom token storage path',
      '',
      'You can set these in a .env file or export them in your shell.',
    ].join('\n'),
  )
  process.exit(1)
}

const authConfig: AuthConfig = {
  clientId,
  clientSecret,
  tenantId,
  redirectUri,
  scopes: DEFAULT_SCOPES,
}

const tokenStore = new TokenStore(authConfig, tokenStorePath)

// ─── CSRF State Tracking ──────────────────────────────────────────────────────

const pendingStates = new Map<string, number>()
const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function cleanExpiredStates() {
  const now = Date.now()
  for (const [state, timestamp] of pendingStates) {
    if (now - timestamp > STATE_TTL_MS) {
      pendingStates.delete(state)
    }
  }
}

// ─── HTML Templates ───────────────────────────────────────────────────────────

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
    <p>You can close this tab and return to your IDE.</p>
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
    <p>Please try authenticating again from your IDE.</p>
  </div>
</body>
</html>`
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = createHttpServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)

  // ── Start auth flow ──────────────────────────────────────────────────
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

  // ── OAuth callback ───────────────────────────────────────────────────
  if (url.pathname === '/auth/callback') {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    // Handle errors from Microsoft
    if (error) {
      console.error(`OAuth error: ${error} — ${errorDescription}`)
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end(errorPage('Authentication Failed', errorDescription || error))
      return
    }

    // Validate state parameter (CSRF protection)
    if (!state || !pendingStates.has(state)) {
      console.error('Invalid or missing state parameter')
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end(errorPage('Invalid Request', 'Missing or invalid state parameter. This may be a CSRF attempt or the request expired.'))
      return
    }
    pendingStates.delete(state)

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end(errorPage('Missing Auth Code', 'No authorization code received from Microsoft.'))
      return
    }

    // Exchange code for tokens
    try {
      const accountId = await tokenStore.exchangeCode(code)
      console.log(`Authentication successful! Tokens stored for ${accountId}.`)
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(successPage(accountId))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('Token exchange failed:', msg)
      res.writeHead(500, { 'Content-Type': 'text/html' })
      res.end(errorPage('Token Exchange Failed', msg))
    }
    return
  }

  // ── Health check ─────────────────────────────────────────────────────
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', authenticated: await tokenStore.isAuthenticated() }))
    return
  }

  // ── Default: redirect to /auth ────────────────────────────────────────
  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/auth' })
    res.end()
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
})

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║           Celavii M365 — Auth Server                 ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Visit to authenticate:                              ║
║  → http://${HOST}:${PORT}/auth${' '.repeat(Math.max(0, 36 - `http://${HOST}:${PORT}/auth`.length))}║
║                                                      ║
║  Or use the authenticate tool in your IDE.           ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
`)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down auth server...')
  server.close()
  process.exit(0)
})
