import { GRAPH_API_BASE, FLOW_API_BASE } from './types.js'
import type { TokenStore } from './auth/token-store.js'

// ─── Error Class ─────────────────────────────────────────────────────────────

export class GraphApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message)
    this.name = 'GraphApiError'
  }
}

// ─── OData Helpers ───────────────────────────────────────────────────────────

/** Escape a string for use in OData filter expressions. */
export function escapeOData(value: string): string {
  // Double single-quotes, strip control characters
  return value.replace(/'/g, "''").replace(/[\x00-\x1f\x7f]/g, '')
}

/** Strip HTML tags and decode entities for safe text output. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Graph API Client ────────────────────────────────────────────────────────

export class GraphClient {
  constructor(private tokenStore: TokenStore) {}

  private async request(
    baseUrl: string,
    token: string,
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(`${baseUrl}${path}`)
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.set(key, value)
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'celavii-m365/0.1.0',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    // Handle download redirects (302 with Location header)
    if (res.status === 302) {
      const location = res.headers.get('location')
      if (location) return { downloadUrl: location }
    }

    // Parse body — Graph API returns empty bodies for 202 (send/accept/decline/cancel)
    // and 204 (delete). Check Content-Length and content-type before parsing.
    const contentType = res.headers.get('content-type') || ''
    const contentLength = res.headers.get('content-length')
    const hasJsonBody = contentType.includes('application/json') && contentLength !== '0'

    let json: unknown = {}

    if (hasJsonBody) {
      try {
        json = await res.json()
      } catch {
        // If response is OK but unparseable, return empty (e.g., 202 with no body)
        if (res.ok) return {}
        throw new GraphApiError(
          `HTTP ${res.status}: Failed to parse response`,
          'PARSE_ERROR',
          res.status,
        )
      }
    } else if (!res.ok) {
      // Error with non-JSON body — try to read as text for diagnostics
      const text = await res.text().catch(() => '')
      throw new GraphApiError(
        text || `HTTP ${res.status}`,
        'UNKNOWN_ERROR',
        res.status,
      )
    }

    // Successful empty responses (202 Accepted, 204 No Content)
    if (res.ok) return json

    // Error responses with JSON body
    const err = json as { error?: { code?: string; message?: string } }
    const msg = err?.error?.message || `HTTP ${res.status}`
    const code = err?.error?.code || 'UNKNOWN_ERROR'

    if (res.status === 401) {
      throw new GraphApiError(
        'Authentication expired. Please re-authenticate.',
        'UNAUTHORIZED',
        401,
      )
    }

    throw new GraphApiError(msg, code, res.status)
  }

  // ─── Graph API Methods ─────────────────────────────────────────────────
  // All methods accept an optional `accountId`. When omitted, the configured
  // default account is used. When provided, must match an authenticated account.

  async graphGet(
    path: string,
    queryParams?: Record<string, string>,
    accountId?: string,
  ): Promise<unknown> {
    const token = await this.tokenStore.getGraphToken(accountId)
    return this.request(GRAPH_API_BASE, token, 'GET', path, undefined, queryParams)
  }

  async graphPost(path: string, body?: unknown, accountId?: string): Promise<unknown> {
    const token = await this.tokenStore.getGraphToken(accountId)
    return this.request(GRAPH_API_BASE, token, 'POST', path, body)
  }

  async graphPatch(path: string, body: unknown, accountId?: string): Promise<unknown> {
    const token = await this.tokenStore.getGraphToken(accountId)
    return this.request(GRAPH_API_BASE, token, 'PATCH', path, body)
  }

  async graphDelete(path: string, accountId?: string): Promise<unknown> {
    const token = await this.tokenStore.getGraphToken(accountId)
    return this.request(GRAPH_API_BASE, token, 'DELETE', path)
  }

  /** Fetch paginated results, collecting up to maxCount items. */
  async graphGetPaginated(
    path: string,
    queryParams?: Record<string, string>,
    maxCount = 50,
    accountId?: string,
  ): Promise<unknown[]> {
    const items: unknown[] = []
    let nextUrl: string | undefined

    const token = await this.tokenStore.getGraphToken(accountId)
    const result = (await this.request(GRAPH_API_BASE, token, 'GET', path, undefined, queryParams)) as {
      value?: unknown[]
      '@odata.nextLink'?: string
    }

    if (result.value) items.push(...result.value)
    nextUrl = result['@odata.nextLink']

    while (nextUrl && items.length < maxCount) {
      const res = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'celavii-m365/0.5.0',
        },
      })
      const page = (await res.json()) as { value?: unknown[]; '@odata.nextLink'?: string }
      if (page.value) items.push(...page.value)
      nextUrl = page['@odata.nextLink']
    }

    return items.slice(0, maxCount)
  }

  /** Get a pre-authenticated download URL for a OneDrive item. */
  async graphGetDownloadUrl(path: string, accountId?: string): Promise<string> {
    const token = await this.tokenStore.getGraphToken(accountId)
    const url = `${GRAPH_API_BASE}${path}`

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'celavii-m365/0.1.0',
      },
      redirect: 'manual',
    })

    if (res.status === 302) {
      return res.headers.get('location') || ''
    }

    // Some items return the URL in the body
    const json = (await res.json()) as { '@microsoft.graph.downloadUrl'?: string }
    return json['@microsoft.graph.downloadUrl'] || ''
  }

  // ─── Flow API Methods ─────────────────────────────────────────────────

  async flowGet(path: string, accountId?: string): Promise<unknown> {
    const token = await this.tokenStore.getFlowToken(accountId)
    return this.request(FLOW_API_BASE, token, 'GET', path)
  }

  async flowPost(path: string, body?: unknown, accountId?: string): Promise<unknown> {
    const token = await this.tokenStore.getFlowToken(accountId)
    return this.request(FLOW_API_BASE, token, 'POST', path, body)
  }

  async flowPatch(path: string, body: unknown, accountId?: string): Promise<unknown> {
    const token = await this.tokenStore.getFlowToken(accountId)
    return this.request(FLOW_API_BASE, token, 'PATCH', path, body)
  }
}
