// ─── Microsoft Graph API Types ───────────────────────────────────────────────

export interface GraphApiResponse<T = unknown> {
  value: T[]
  '@odata.context'?: string
  '@odata.nextLink'?: string
  '@odata.count'?: number
}

export interface GraphApiSingleResponse<T = unknown> {
  '@odata.context'?: string
  [key: string]: unknown
}

// ─── Auth Types ──────────────────────────────────────────────────────────────

export interface TokenSet {
  access_token: string
  refresh_token: string
  expires_at: number
  scope?: string
}

export interface TokenPair {
  graph: TokenSet
  flow?: TokenSet
}

export interface AuthConfig {
  clientId: string
  clientSecret: string
  tenantId: string
  redirectUri: string
  scopes: string[]
}

// ─── Email Types ─────────────────────────────────────────────────────────────

export interface EmailAddress {
  emailAddress: {
    name: string
    address: string
  }
}

export interface EmailMessage {
  id: string
  subject: string
  from: EmailAddress
  toRecipients: EmailAddress[]
  ccRecipients?: EmailAddress[]
  bccRecipients?: EmailAddress[]
  receivedDateTime: string
  bodyPreview: string
  body?: {
    contentType: string
    content: string
  }
  hasAttachments: boolean
  importance: 'low' | 'normal' | 'high'
  isRead: boolean
  internetMessageHeaders?: Array<{
    name: string
    value: string
  }>
}

export interface MailFolder {
  id: string
  displayName: string
  parentFolderId: string
  childFolderCount: number
  unreadItemCount: number
  totalItemCount: number
}

// ─── Calendar Types ──────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  subject: string
  bodyPreview: string
  body?: {
    contentType: string
    content: string
  }
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  location?: {
    displayName: string
  }
  attendees?: Array<{
    emailAddress: {
      name: string
      address: string
    }
    status: {
      response: string
    }
    type: string
  }>
  organizer?: EmailAddress
  isAllDay: boolean
  isCancelled: boolean
  responseStatus?: {
    response: string
  }
  webLink?: string
}

// ─── OneDrive Types ──────────────────────────────────────────────────────────

export interface DriveItem {
  id: string
  name: string
  size: number
  createdDateTime: string
  lastModifiedDateTime: string
  webUrl: string
  folder?: {
    childCount: number
  }
  file?: {
    mimeType: string
  }
  parentReference?: {
    path: string
    id: string
  }
  '@microsoft.graph.downloadUrl'?: string
}

export interface SharingLink {
  id: string
  link: {
    type: string
    scope: string
    webUrl: string
  }
}

// ─── Inbox Rule Types ────────────────────────────────────────────────────────

export interface InboxRule {
  id: string
  displayName: string
  sequence: number
  isEnabled: boolean
  conditions?: Record<string, unknown>
  actions?: Record<string, unknown>
}

// ─── Power Automate Types ────────────────────────────────────────────────────

export interface FlowEnvironment {
  name: string
  properties: {
    displayName: string
    isDefault: boolean
  }
}

export interface Flow {
  name: string
  id: string
  properties: {
    displayName: string
    state: string
    createdTime: string
    lastModifiedTime: string
  }
}

export interface FlowRun {
  name: string
  properties: {
    startTime: string
    endTime?: string
    status: string
    trigger: {
      name: string
    }
  }
}

// ─── Server Config ───────────────────────────────────────────────────────────

export interface ServerConfig {
  clientId: string
  clientSecret: string
  tenantId: string
  redirectUri?: string
  tokenStorePath?: string
  defaultTimezone?: string
}

// ─── Shared Constants ────────────────────────────────────────────────────────

export const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0'
export const FLOW_API_BASE = 'https://api.flow.microsoft.com'

export const DEFAULT_SCOPES = [
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'User.Read',
  'Calendars.Read',
  'Calendars.ReadWrite',
  'Files.Read',
  'Files.ReadWrite',
]

export const FLOW_SCOPE = 'https://service.flow.microsoft.com/.default'

export const EMAIL_SELECT_FIELDS = [
  'id', 'subject', 'from', 'toRecipients', 'ccRecipients',
  'receivedDateTime', 'bodyPreview', 'hasAttachments', 'importance', 'isRead',
].join(',')

export const EMAIL_DETAIL_FIELDS = [
  'id', 'subject', 'from', 'toRecipients', 'ccRecipients', 'bccRecipients',
  'receivedDateTime', 'bodyPreview', 'body', 'hasAttachments', 'importance',
  'isRead', 'internetMessageHeaders',
].join(',')

export const CALENDAR_SELECT_FIELDS = [
  'id', 'subject', 'bodyPreview', 'start', 'end', 'location',
  'attendees', 'organizer', 'isAllDay', 'isCancelled', 'responseStatus', 'webLink',
].join(',')

export const ONEDRIVE_SELECT_FIELDS = [
  'id', 'name', 'size', 'createdDateTime', 'lastModifiedDateTime',
  'webUrl', 'folder', 'file', 'parentReference',
].join(',')

export const DEFAULT_PAGE_SIZE = 25
export const MAX_RESULT_COUNT = 50
export const UPLOAD_THRESHOLD = 4 * 1024 * 1024 // 4MB
