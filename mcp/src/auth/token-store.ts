import { readFile, writeFile, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { TokenSet, TokenPair, AuthConfig } from '../types.js'

const DEFAULT_TOKEN_PATH = join(homedir(), '.celavii-m365-tokens.json')
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000 // 5 minutes

export class TokenStore {
  private tokens: TokenPair | null = null
  private loaded = false

  constructor(
    private config: AuthConfig,
    private storagePath: string = DEFAULT_TOKEN_PATH,
  ) {}

  // ─── Persistence ─────────────────────────────────────────────────────────

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    // Support env-based refresh token (for Cowork/Chat where filesystem is sandboxed)
    const envRefreshToken = process.env.M365_REFRESH_TOKEN
    if (envRefreshToken && !this.tokens) {
      try {
        const graphTokens = await this.refreshToken(
          {
            access_token: '',
            refresh_token: envRefreshToken,
            expires_at: 0,
          },
          this.config.scopes.join(' '),
        )
        this.tokens = { graph: graphTokens }
        this.loaded = true
        return
      } catch {
        // Fall through to file-based loading
      }
    }

    if (!existsSync(this.storagePath)) return

    try {
      const raw = await readFile(this.storagePath, 'utf-8')
      const data = JSON.parse(raw)

      // Support both legacy flat format and new nested format
      if (data.graph) {
        this.tokens = data as TokenPair
      } else if (data.access_token) {
        this.tokens = {
          graph: {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: data.expires_at,
            scope: data.scope,
          },
          ...(data.flow_access_token
            ? {
                flow: {
                  access_token: data.flow_access_token,
                  refresh_token: data.flow_refresh_token,
                  expires_at: data.flow_expires_at,
                },
              }
            : {}),
        }
      }
    } catch {
      // Corrupt file — start fresh
      this.tokens = null
    }
  }

  private async save(): Promise<void> {
    await writeFile(this.storagePath, JSON.stringify(this.tokens, null, 2), 'utf-8')
    await chmod(this.storagePath, 0o600)
  }

  // ─── Token Refresh ───────────────────────────────────────────────────────

  private async refreshToken(tokenSet: TokenSet, scope?: string): Promise<TokenSet> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokenSet.refresh_token,
      ...(scope ? { scope } : {}),
    })

    const res = await fetch(
      `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      },
    )

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Token refresh failed (${res.status}): ${body}`)
    }

    const data = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokenSet.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    }
  }

  private isExpired(tokenSet: TokenSet): boolean {
    return Date.now() >= tokenSet.expires_at - TOKEN_EXPIRY_BUFFER_MS
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  async getGraphToken(): Promise<string> {
    await this.load()

    if (!this.tokens?.graph) {
      throw new Error('Not authenticated. Please run the authenticate tool first.')
    }

    if (this.isExpired(this.tokens.graph)) {
      this.tokens.graph = await this.refreshToken(
        this.tokens.graph,
        this.config.scopes.join(' '),
      )
      await this.save()
    }

    return this.tokens.graph.access_token
  }

  async getFlowToken(): Promise<string> {
    await this.load()

    if (!this.tokens?.flow) {
      throw new Error('Not authenticated for Power Automate. Please authenticate with flow scope.')
    }

    if (this.isExpired(this.tokens.flow)) {
      this.tokens.flow = await this.refreshToken(
        this.tokens.flow,
        'https://service.flow.microsoft.com/.default',
      )
      await this.save()
    }

    return this.tokens.flow.access_token
  }

  async storeTokens(graphTokens: TokenSet, flowTokens?: TokenSet): Promise<void> {
    this.tokens = {
      graph: graphTokens,
      ...(flowTokens ? { flow: flowTokens } : {}),
    }
    await this.save()
  }

  async isAuthenticated(): Promise<boolean> {
    await this.load()
    return this.tokens?.graph != null
  }

  async clear(): Promise<void> {
    this.tokens = null
    this.loaded = false
    try {
      const { unlink } = await import('node:fs/promises')
      await unlink(this.storagePath)
    } catch {
      // File may not exist
    }
  }

  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      response_mode: 'query',
      scope: [...this.config.scopes, 'offline_access'].join(' '),
      state: crypto.randomUUID(),
    })

    return `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/authorize?${params}`
  }

  async exchangeCode(code: string): Promise<void> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      scope: [...this.config.scopes, 'offline_access'].join(' '),
    })

    const res = await fetch(
      `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      },
    )

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Token exchange failed (${res.status}): ${body}`)
    }

    const data = (await res.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    await this.storeTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    })
  }
}
