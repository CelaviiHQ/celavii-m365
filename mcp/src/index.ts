import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

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
        '',
        'See: https://github.com/CelaviiHQ/celavii-m365#setup',
      ].join('\n'),
    )
    process.exit(1)
  }

  // ─── Optional Configuration ──────────────────────────────────────────

  const redirectUri = process.env.M365_REDIRECT_URI || undefined
  const tokenStorePath = process.env.M365_TOKEN_PATH || undefined

  // ─── Start Server ────────────────────────────────────────────────────

  const server = createServer({
    clientId,
    clientSecret,
    tenantId,
    redirectUri,
    tokenStorePath,
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
