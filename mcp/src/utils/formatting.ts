import type { EmailMessage, CalendarEvent, DriveItem } from '../types.js'

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

  const start = event.isAllDay
    ? new Date(event.start.dateTime).toLocaleDateString()
    : new Date(event.start.dateTime).toLocaleString()
  const end = event.isAllDay
    ? new Date(event.end.dateTime).toLocaleDateString()
    : new Date(event.end.dateTime).toLocaleString()

  const lines = [
    `${prefix}${event.subject}${cancelledFlag}${allDayFlag}`,
    `  When: ${start} - ${end}`,
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
