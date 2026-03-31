/**
 * Streamable HTTP transport for celavii-m365.
 *
 * Runs the MCP server + OAuth auth server on a single HTTP port.
 * This solves the CSRF mismatch between separate MCP/auth processes
 * and works across all Claude Desktop tabs (Code, Cowork, Chat).
 *
 * Usage:
 *   npx celavii-m365-http                        (when installed globally)
 *   node dist/remote/index.js                     (from the mcp directory)
 *   npm run http                                  (development)
 *
 * The server exposes:
 *   POST /mcp              — MCP Streamable HTTP endpoint
 *   GET  /mcp              — MCP SSE stream (reconnection)
 *   DELETE /mcp            — MCP session termination
 *   GET  /auth             — Start Microsoft OAuth flow
 *   GET  /auth/callback    — OAuth redirect handler
 *   GET  /health           — Health check
 */

import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { createServer } from '../server.js'
import { TokenStore } from '../auth/token-store.js'
import { DEFAULT_SCOPES } from '../types.js'
import type { AuthConfig } from '../types.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.M365_AUTH_PORT || '3333', 10)
const HOST = process.env.M365_AUTH_HOST || '127.0.0.1'

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
      'Required:',
      '  M365_CLIENT_ID      - Azure AD application (client) ID',
      '  M365_CLIENT_SECRET  - Azure AD client secret value (not the secret ID!)',
      '',
      'Optional:',
      '  M365_TENANT_ID      - Azure AD tenant ID (defaults to "common" for multi-tenant)',
      '  M365_REDIRECT_URI   - OAuth callback URL (defaults to http://localhost:3333/auth/callback)',
      '  M365_TOKEN_PATH     - Custom path for token storage file',
      '  M365_AUTH_PORT      - Server port (default: 3333)',
      '',
      'See: https://github.com/CelaviiHQ/celavii-m365#setup',
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

// Shared token store — used by both MCP tools and OAuth routes
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

function successPage(): string {
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
    code { background: #334155; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authenticated</h1>
    <p>Your Microsoft 365 account has been connected successfully.</p>
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

// ─── Express App ──────────────────────────────────────────────────────────────

const app = createMcpExpressApp({ host: HOST })

// ─── OAuth Routes ─────────────────────────────────────────────────────────────

app.get('/auth', (_req: Request, res: Response) => {
  cleanExpiredStates()

  const state = randomUUID()
  pendingStates.set(state, Date.now())

  const params = new URLSearchParams({
    client_id: authConfig.clientId,
    response_type: 'code',
    redirect_uri: authConfig.redirectUri,
    response_mode: 'query',
    scope: [...authConfig.scopes, 'offline_access'].join(' '),
    state,
  })

  const authUrl = `https://login.microsoftonline.com/${authConfig.tenantId}/oauth2/v2.0/authorize?${params}`

  res.redirect(authUrl)
})

app.get('/auth/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined
  const state = req.query.state as string | undefined
  const error = req.query.error as string | undefined
  const errorDescription = req.query.error_description as string | undefined

  // Handle errors from Microsoft
  if (error) {
    console.error(`OAuth error: ${error} — ${errorDescription}`)
    res.status(400).type('html').send(errorPage('Authentication Failed', errorDescription || error))
    return
  }

  // Validate state parameter (CSRF protection)
  if (!state || !pendingStates.has(state)) {
    console.error('Invalid or missing state parameter')
    res.status(400).type('html').send(
      errorPage('Invalid Request', 'Missing or invalid state parameter. This may be a CSRF attempt or the request expired.'),
    )
    return
  }
  pendingStates.delete(state)

  if (!code) {
    res.status(400).type('html').send(errorPage('Missing Auth Code', 'No authorization code received from Microsoft.'))
    return
  }

  // Exchange code for tokens
  try {
    await tokenStore.exchangeCode(code)
    console.log('Authentication successful! Tokens stored.')
    res.type('html').send(successPage())
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Token exchange failed:', msg)
    res.status(500).type('html').send(errorPage('Token Exchange Failed', msg))
  }
})

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', async (_req: Request, res: Response) => {
  res.json({ status: 'ok', authenticated: await tokenStore.isAuthenticated() })
})

// Root redirects to /auth
app.get('/', (_req: Request, res: Response) => {
  res.redirect('/auth')
})

// ─── MCP Streamable HTTP Transport ────────────────────────────────────────────

// Map to store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {}

function createMcpServer() {
  return createServer({
    clientId: clientId!,
    clientSecret: clientSecret!,
    tenantId,
    redirectUri,
    tokenStorePath,
  })
}

app.post('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined

  try {
    let transport: StreamableHTTPServerTransport

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId]
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          console.log(`MCP session initialized: ${sid}`)
          transports[sid] = transport
        },
      })

      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid && transports[sid]) {
          console.log(`MCP session closed: ${sid}`)
          delete transports[sid]
        }
      }

      const server = createMcpServer()
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
      return
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      })
      return
    }

    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error('Error handling MCP request:', error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      })
    }
  }
})

app.get('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID')
    return
  }

  const transport = transports[sessionId]
  await transport.handleRequest(req, res)
})

app.delete('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID')
    return
  }

  const transport = transports[sessionId]
  await transport.handleRequest(req, res)
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  console.log(`
Celavii M365 — HTTP Server
===========================

  MCP endpoint:  http://${HOST}:${PORT}/mcp
  Auth:          http://${HOST}:${PORT}/auth
  Health:        http://${HOST}:${PORT}/health

  Ready for connections from Claude Desktop.
`)
})

process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  for (const sessionId in transports) {
    try {
      await transports[sessionId].close()
      delete transports[sessionId]
    } catch {
      // Ignore cleanup errors
    }
  }
  process.exit(0)
})
