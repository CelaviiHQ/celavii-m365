import { readFile, writeFile, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { GRAPH_API_BASE } from '../types.js'
import type {
  TokenSet,
  TokenPair,
  AuthConfig,
  AccountTokens,
  MultiAccountStore,
} from '../types.js'

const DEFAULT_TOKEN_PATH = join(homedir(), '.celavii-m365-tokens.json')
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Multi-account token store. Persists a map of `accountId → AccountTokens`
 * plus a `default` pointer. Account IDs are the lowercased UPN/email
 * derived from `/me` at auth time. Backwards-compatible with the single-
 * account file format from older versions (auto-migrates on first load).
 */
export class TokenStore {
  private store: MultiAccountStore | null = null
  private loaded = false

  constructor(
    private config: AuthConfig,
    private storagePath: string = DEFAULT_TOKEN_PATH,
  ) {}

  // ─── Persistence ─────────────────────────────────────────────────────────

  private async load(): Promise<void> {
    if (this.loaded) return

    // Support env-based refresh token (for Cowork/Chat where filesystem is sandboxed).
    // Single-account fallback only — env-based multi-account is not supported.
    const envRefreshToken = process.env.M365_REFRESH_TOKEN
    if (envRefreshToken && !this.store) {
      try {
        const graphTokens = await this.refreshToken(
          { access_token: '', refresh_token: envRefreshToken, expires_at: 0 },
          this.config.scopes.join(' '),
        )
        const identity = await this.fetchIdentity(graphTokens.access_token).catch(() => undefined)
        const accountId = (identity?.userPrincipalName || identity?.mail || 'env-account').toLowerCase()
        this.store = {
          default: accountId,
          accounts: { [accountId]: { graph: graphTokens, identity } },
        }
        this.loaded = true
        return
      } catch (err) {
        process.stderr.write(
          `[celavii-m365] M365_REFRESH_TOKEN exchange failed: ${err instanceof Error ? err.message : err}\n`,
        )
        // Fall through to file-based loading
      }
    }

    if (!existsSync(this.storagePath)) return

    try {
      const raw = await readFile(this.storagePath, 'utf-8')
      const data = JSON.parse(raw)

      if (data && typeof data === 'object' && 'accounts' in data && 'default' in data) {
        // New multi-account format
        this.store = data as MultiAccountStore
      } else if (data && data.graph) {
        // Legacy nested single-account format → migrate
        this.store = await this.migrateFromSingleAccount(data as TokenPair)
      } else if (data && data.access_token) {
        // Even older flat single-account format → migrate
        const pair: TokenPair = {
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
        this.store = await this.migrateFromSingleAccount(pair)
      }
    } catch {
      this.store = null
    }

    if (this.store) {
      this.loaded = true
    }
  }

  private async save(): Promise<void> {
    if (!this.store) return
    await writeFile(this.storagePath, JSON.stringify(this.store, null, 2), 'utf-8')
    await chmod(this.storagePath, 0o600)
  }

  /** Migrate a legacy single-account token file to the multi-account store. */
  private async migrateFromSingleAccount(pair: TokenPair): Promise<MultiAccountStore> {
    let accountId = 'legacy-account'
    let identity: AccountTokens['identity']
    try {
      identity = await this.fetchIdentity(pair.graph.access_token)
      accountId = (identity?.userPrincipalName || identity?.mail || accountId).toLowerCase()
    } catch {
      // Token may already be expired; key as 'legacy-account' until refresh
    }
    return {
      default: accountId,
      accounts: {
        [accountId]: {
          graph: pair.graph,
          ...(pair.flow ? { flow: pair.flow } : {}),
          ...(identity ? { identity } : {}),
        },
      },
    }
  }

  // ─── Identity Lookup ─────────────────────────────────────────────────────

  /** Call `/me` with a fresh token to get the user's identity. */
  private async fetchIdentity(accessToken: string): Promise<AccountTokens['identity']> {
    const res = await fetch(`${GRAPH_API_BASE}/me?$select=id,displayName,mail,userPrincipalName`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'celavii-m365/0.5.0',
      },
    })
    if (!res.ok) throw new Error(`/me lookup failed: HTTP ${res.status}`)
    const data = (await res.json()) as {
      id: string
      displayName?: string
      mail?: string
      userPrincipalName?: string
    }
    return {
      id: data.id,
      displayName: data.displayName,
      mail: data.mail,
      userPrincipalName: data.userPrincipalName,
    }
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

  // ─── Account Resolution ──────────────────────────────────────────────────

  /** Resolve an account ID, falling back to the default. Throws if no match. */
  private async resolveAccountId(accountId?: string): Promise<string> {
    await this.load()
    if (!this.store) {
      throw new Error('Not authenticated. Please run the m365_authenticate tool first.')
    }
    if (accountId) {
      const id = accountId.toLowerCase()
      if (!this.store.accounts[id]) {
        const known = Object.keys(this.store.accounts).join(', ') || '(none)'
        throw new Error(`Unknown account "${accountId}". Known accounts: ${known}`)
      }
      return id
    }
    if (!this.store.default || !this.store.accounts[this.store.default]) {
      throw new Error('No default account set. Use m365_set_default_account or pass account_id.')
    }
    return this.store.default
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /** Get a Graph access token for the given account (or the default). */
  async getGraphToken(accountId?: string): Promise<string> {
    const id = await this.resolveAccountId(accountId)
    const account = this.store!.accounts[id]

    if (this.isExpired(account.graph)) {
      account.graph = await this.refreshToken(account.graph, this.config.scopes.join(' '))
      await this.save()
    }

    return account.graph.access_token
  }

  /** Get a Power Automate token for the given account (or the default). */
  async getFlowToken(accountId?: string): Promise<string> {
    const id = await this.resolveAccountId(accountId)
    const account = this.store!.accounts[id]

    if (!account.flow) {
      throw new Error(
        `Not authenticated for Power Automate on account "${id}". Re-authenticate with the flow scope.`,
      )
    }

    if (this.isExpired(account.flow)) {
      account.flow = await this.refreshToken(
        account.flow,
        'https://service.flow.microsoft.com/.default',
      )
      await this.save()
    }

    return account.flow.access_token
  }

  /** True if there is at least one authenticated account. */
  async isAuthenticated(): Promise<boolean> {
    await this.load()
    return this.store != null && Object.keys(this.store.accounts).length > 0
  }

  /** True if the named account exists. */
  async hasAccount(accountId: string): Promise<boolean> {
    await this.load()
    return this.store != null && this.store.accounts[accountId.toLowerCase()] != null
  }

  /** List all authenticated accounts with metadata. */
  async listAccounts(): Promise<
    Array<{
      id: string
      isDefault: boolean
      displayName?: string
      mail?: string
      userPrincipalName?: string
      hasFlow: boolean
      graphExpiresAt: number
    }>
  > {
    await this.load()
    if (!this.store) return []
    return Object.entries(this.store.accounts).map(([id, account]) => ({
      id,
      isDefault: this.store!.default === id,
      displayName: account.identity?.displayName,
      mail: account.identity?.mail,
      userPrincipalName: account.identity?.userPrincipalName,
      hasFlow: account.flow != null,
      graphExpiresAt: account.graph.expires_at,
    }))
  }

  /** Set which account is the default for tool calls without `account_id`. */
  async setDefault(accountId: string): Promise<void> {
    await this.load()
    if (!this.store) throw new Error('No accounts authenticated.')
    const id = accountId.toLowerCase()
    if (!this.store.accounts[id]) {
      throw new Error(`Unknown account "${accountId}".`)
    }
    this.store.default = id
    await this.save()
  }

  /** Get the current default account ID. */
  async getDefault(): Promise<string | null> {
    await this.load()
    return this.store?.default ?? null
  }

  /** Remove a single account. If it was the default, picks another (or null). */
  async removeAccount(accountId: string): Promise<void> {
    await this.load()
    if (!this.store) return
    const id = accountId.toLowerCase()
    if (!this.store.accounts[id]) return

    delete this.store.accounts[id]
    if (this.store.default === id) {
      const remaining = Object.keys(this.store.accounts)
      this.store.default = remaining[0] ?? null
    }

    if (Object.keys(this.store.accounts).length === 0) {
      // Remove the file entirely when no accounts remain
      this.store = null
      this.loaded = false
      try {
        const { unlink } = await import('node:fs/promises')
        await unlink(this.storagePath)
      } catch {
        // File may not exist
      }
    } else {
      await this.save()
    }
  }

  /** Remove ALL accounts (legacy `clear` semantics). */
  async clear(): Promise<void> {
    this.store = null
    this.loaded = false
    try {
      const { unlink } = await import('node:fs/promises')
      await unlink(this.storagePath)
    } catch {
      // File may not exist
    }
  }

  /** Build the OAuth authorize URL. */
  getAuthUrl(loginHint?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      response_mode: 'query',
      scope: [...this.config.scopes, 'openid', 'profile', 'offline_access'].join(' '),
      state: crypto.randomUUID(),
      // Force the Microsoft account picker so users with multiple signed-in
      // accounts (or active SSO sessions) explicitly choose which to grant.
      prompt: 'select_account',
    })
    if (loginHint) params.set('login_hint', loginHint)

    return `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/authorize?${params}`
  }

  /**
   * Exchange an authorization code for tokens, derive the account identity
   * via `/me`, and store under that key. Returns the account ID it was stored as.
   */
  async exchangeCode(code: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      scope: [...this.config.scopes, 'openid', 'profile', 'offline_access'].join(' '),
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

    const graphTokens: TokenSet = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    }

    // Derive identity from /me to use as the account key
    let identity: AccountTokens['identity']
    try {
      identity = await this.fetchIdentity(graphTokens.access_token)
    } catch (err) {
      throw new Error(
        `Token exchange succeeded but identity lookup failed: ${err instanceof Error ? err.message : err}`,
      )
    }

    const accountId = (identity?.userPrincipalName || identity?.mail || identity?.id || '').toLowerCase()
    if (!accountId) {
      throw new Error('Could not derive account ID from /me response')
    }

    await this.load() // hydrate any existing accounts
    if (!this.store) {
      this.store = { default: accountId, accounts: {} }
    }
    this.store.accounts[accountId] = {
      graph: graphTokens,
      ...(this.store.accounts[accountId]?.flow ? { flow: this.store.accounts[accountId].flow } : {}),
      identity,
    }
    // First account becomes default automatically
    if (!this.store.default || !this.store.accounts[this.store.default]) {
      this.store.default = accountId
    }
    this.loaded = true
    await this.save()

    return accountId
  }
}
