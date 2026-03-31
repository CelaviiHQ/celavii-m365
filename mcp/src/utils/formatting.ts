import type { EmailMessage, CalendarEvent, DriveItem } from '../types.js'
import { CHARACTER_LIMIT } from '../types.js'

/** Format a single email for display. */
export function formatEmail(email: EmailMessage, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : ''
  const readStatus = email.isRead ? '' : ' [UNREAD]'
  const attachmentFlag = email.hasAttachments ? ' [ATTACHMENTS]' : ''
  const importanceFlag = email.importance !== 'normal' ? ` [${email.importance.toUpperCase()}]` : ''

  return [
    `${prefix}${email.subject}${readStatus}${attachmentFlag}${importanceFlag}`,
    `  From: ${email.from?.emailAddress?.name || 'Unknown'} <${email.from?.emailAddress?.address || ''}>`,
    `  Date: ${new Date(email.receivedDateTime).toLocaleString()}`,
    `  Preview: ${email.bodyPreview?.slice(0, 150) || '(no preview)'}`,
    `  ID: ${email.id}`,
  ].join('\n')
}

/** Format a calendar event for display. */
export function formatEvent(event: CalendarEvent, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : ''
  const cancelledFlag = event.isCancelled ? ' [CANCELLED]' : ''
  const allDayFlag = event.isAllDay ? ' [ALL DAY]' : ''

  const tz = event.start.timeZone || ''
  const start = event.isAllDay
    ? new Date(event.start.dateTime).toLocaleDateString()
    : new Date(event.start.dateTime).toLocaleString()
  const end = event.isAllDay
    ? new Date(event.end.dateTime).toLocaleDateString()
    : new Date(event.end.dateTime).toLocaleString()
  const tzLabel = tz && tz !== 'UTC' ? ` (${tz})` : tz === 'UTC' ? ' (UTC)' : ''

  const lines = [
    `${prefix}${event.subject}${cancelledFlag}${allDayFlag}`,
    `  When: ${start} - ${end}${tzLabel}`,
  ]

  if (event.location?.displayName) {
    lines.push(`  Location: ${event.location.displayName}`)
  }
  if (event.attendees?.length) {
    const attendeeList = event.attendees
      .map((a) => `${a.emailAddress.name || a.emailAddress.address} (${a.status.response})`)
      .join(', ')
    lines.push(`  Attendees: ${attendeeList}`)
  }
  lines.push(`  ID: ${event.id}`)

  return lines.join('\n')
}

/** Format a OneDrive item for display. */
export function formatDriveItem(item: DriveItem, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : ''
  const typeFlag = item.folder ? '[FOLDER]' : `[${item.file?.mimeType || 'FILE'}]`
  const sizeStr = item.folder
    ? `${item.folder.childCount} items`
    : formatFileSize(item.size)

  return [
    `${prefix}${typeFlag} ${item.name}`,
    `  Size: ${sizeStr}`,
    `  Modified: ${new Date(item.lastModifiedDateTime).toLocaleString()}`,
    `  URL: ${item.webUrl}`,
    `  ID: ${item.id}`,
  ].join('\n')
}

/** Format bytes into human-readable size. */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** Create a standard MCP text response. */
export function textResponse(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

/** Create a standard MCP JSON response. */
export function jsonResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

/** Create a standard MCP error response. */
export function errorResponse(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }] }
}

/**
 * Create a paginated list response with optional structuredContent.
 * Supports response_format: 'json' for structured output, 'text' for human-readable.
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  offset: number,
  formatFn: (item: T, index: number) => string,
  label: string,
  responseFormat?: string,
) {
  const hasMore = total > offset + items.length
  const structured = {
    total,
    count: items.length,
    offset,
    has_more: hasMore,
    ...(hasMore ? { next_offset: offset + items.length } : {}),
  }

  if (responseFormat === 'json') {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ ...structured, items }, null, 2) }],
      structuredContent: { ...structured, items },
    }
  }

  const formatted = items.map((item, i) => formatFn(item, i + offset)).join('\n\n')
  let text = `Found ${total} ${label} (showing ${items.length}):\n\n${formatted}`

  if (hasMore) {
    text += `\n\n--- More results available. Use skip/offset: ${offset + items.length} to see next page. ---`
  }

  // Truncate if needed
  if (text.length > CHARACTER_LIMIT) {
    text = text.slice(0, CHARACTER_LIMIT) + '\n\n[Response truncated. Use smaller count or add filters to reduce results.]'
  }

  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: structured,
  }
}

/**
 * Create a response with structuredContent for action results.
 */
export function actionResponse(text: string, data: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: data,
  }
}

/**
 * Create a batch operation response with details about failures.
 */
export function batchResponse(
  results: PromiseSettledResult<unknown>[],
  ids: string[],
  successLabel: string,
) {
  const succeeded: string[] = []
  const failed: { id: string; error: string }[] = []

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      succeeded.push(ids[i])
    } else {
      failed.push({
        id: ids[i],
        error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
      })
    }
  })

  const lines = [`${successLabel}: ${succeeded.length} succeeded.`]
  if (failed.length > 0) {
    lines.push(`${failed.length} failed:`)
    failed.forEach((f) => lines.push(`  - ${f.id}: ${f.error}`))
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
    structuredContent: { succeeded: succeeded.length, failed: failed.length, failures: failed },
  }
}
