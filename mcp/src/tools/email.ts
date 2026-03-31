import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import { escapeOData, sanitizeHtml } from '../client.js'
import type { EmailMessage } from '../types.js'
import { EMAIL_SELECT_FIELDS, EMAIL_DETAIL_FIELDS, DEFAULT_PAGE_SIZE, MAX_RESULT_COUNT } from '../types.js'
import { resolveMailFolderPath } from '../utils/folders.js'
import { formatEmail, textResponse, errorResponse } from '../utils/formatting.js'

export function registerEmailTools(server: McpServer, client: GraphClient) {
  // ─── List Emails ─────────────────────────────────────────────────────

  server.registerTool(
    'list_emails',
    {
      title: 'List Emails',
      description:
        'List emails from a mailbox folder. Returns subject, sender, date, read status, and ID for each email.',
      inputSchema: z.object({
        folder: z
          .string()
          .optional()
          .describe('Folder name (inbox, sent, drafts, deleted, junk, archive) or folder ID. Defaults to inbox.'),
        count: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULT_COUNT)
          .optional()
          .describe(`Number of emails to return (1-${MAX_RESULT_COUNT}). Defaults to ${DEFAULT_PAGE_SIZE}.`),
        skip: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Number of emails to skip for pagination.'),
        unread_only: z
          .boolean()
          .optional()
          .describe('If true, only return unread emails.'),
      }),
    },
    async (args) => {
      const path = resolveMailFolderPath(args.folder)
      const count = args.count || DEFAULT_PAGE_SIZE

      const queryParams: Record<string, string> = {
        $top: String(count),
        $orderby: 'receivedDateTime desc',
        $select: EMAIL_SELECT_FIELDS,
      }

      if (args.skip) queryParams.$skip = String(args.skip)
      if (args.unread_only) queryParams.$filter = 'isRead eq false'

      const emails = (await client.graphGetPaginated(path, queryParams, count)) as EmailMessage[]

      if (emails.length === 0) {
        return textResponse('No emails found.')
      }

      const formatted = emails.map((e, i) => formatEmail(e, i)).join('\n\n')
      return textResponse(`Found ${emails.length} email(s):\n\n${formatted}`)
    },
  )

  // ─── Search Emails ───────────────────────────────────────────────────

  server.registerTool(
    'search_emails',
    {
      title: 'Search Emails',
      description:
        'Search emails using filters like sender, subject, keywords, attachment status, and read status.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('General search query (searches subject, body, and participants).'),
        from: z
          .string()
          .optional()
          .describe('Filter by sender email address.'),
        subject: z
          .string()
          .optional()
          .describe('Filter by subject line (partial match).'),
        has_attachments: z
          .boolean()
          .optional()
          .describe('Filter for emails with or without attachments.'),
        unread_only: z
          .boolean()
          .optional()
          .describe('Only return unread emails.'),
        folder: z
          .string()
          .optional()
          .describe('Folder to search in. Defaults to all folders.'),
        count: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULT_COUNT)
          .optional()
          .describe(`Max results to return (1-${MAX_RESULT_COUNT}). Defaults to ${DEFAULT_PAGE_SIZE}.`),
      }),
    },
    async (args) => {
      const path = resolveMailFolderPath(args.folder)
      const count = args.count || DEFAULT_PAGE_SIZE

      // Build OData filter
      const filters: string[] = []
      if (args.from) {
        filters.push(`from/emailAddress/address eq '${escapeOData(args.from)}'`)
      }
      if (args.subject) {
        filters.push(`contains(subject, '${escapeOData(args.subject)}')`)
      }
      if (args.has_attachments !== undefined) {
        filters.push(`hasAttachments eq ${args.has_attachments}`)
      }
      if (args.unread_only) {
        filters.push('isRead eq false')
      }

      const queryParams: Record<string, string> = {
        $top: String(count),
        $orderby: 'receivedDateTime desc',
        $select: EMAIL_SELECT_FIELDS,
      }

      if (filters.length > 0) {
        queryParams.$filter = filters.join(' and ')
      }
      if (args.query) {
        queryParams.$search = `"${escapeOData(args.query)}"`
      }

      const emails = (await client.graphGetPaginated(path, queryParams, count)) as EmailMessage[]

      if (emails.length === 0) {
        return textResponse('No emails matching your search criteria.')
      }

      const formatted = emails.map((e, i) => formatEmail(e, i)).join('\n\n')
      return textResponse(`Found ${emails.length} email(s):\n\n${formatted}`)
    },
  )

  // ─── Read Email ──────────────────────────────────────────────────────

  server.registerTool(
    'read_email',
    {
      title: 'Read Email',
      description:
        'Read the full content of a specific email by its ID. Returns sanitized text by default to prevent prompt injection from email content.',
      inputSchema: z.object({
        id: z.string().describe('The email message ID.'),
        include_raw_html: z
          .boolean()
          .optional()
          .describe('If true, include the raw HTML body in addition to sanitized text. Use with caution.'),
      }),
    },
    async (args) => {
      const email = (await client.graphGet(`/me/messages/${encodeURIComponent(args.id)}`, {
        $select: EMAIL_DETAIL_FIELDS,
      })) as EmailMessage

      const lines = [
        `Subject: ${email.subject}`,
        `From: ${email.from?.emailAddress?.name || 'Unknown'} <${email.from?.emailAddress?.address || ''}>`,
        `To: ${email.toRecipients?.map((r) => `${r.emailAddress.name} <${r.emailAddress.address}>`).join(', ') || ''}`,
      ]

      if (email.ccRecipients?.length) {
        lines.push(
          `CC: ${email.ccRecipients.map((r) => `${r.emailAddress.name} <${r.emailAddress.address}>`).join(', ')}`,
        )
      }

      lines.push(`Date: ${new Date(email.receivedDateTime).toLocaleString()}`)
      lines.push(`Importance: ${email.importance}`)
      lines.push(`Has Attachments: ${email.hasAttachments}`)
      lines.push(`Read: ${email.isRead}`)
      lines.push('')

      // Always provide sanitized text version
      if (email.body?.content) {
        if (email.body.contentType === 'html') {
          lines.push('--- Body (sanitized text) ---')
          lines.push(sanitizeHtml(email.body.content))

          if (args.include_raw_html) {
            lines.push('')
            lines.push('--- Body (raw HTML) ---')
            lines.push(email.body.content)
          }
        } else {
          lines.push('--- Body ---')
          lines.push(email.body.content)
        }
      }

      return textResponse(lines.join('\n'))
    },
  )

  // ─── Send Email ──────────────────────────────────────────────────────

  server.registerTool(
    'send_email',
    {
      title: 'Send Email',
      description: 'Compose and send an email. Supports HTML content, CC/BCC, and importance levels.',
      inputSchema: z.object({
        to: z
          .array(z.string())
          .describe('Array of recipient email addresses.'),
        subject: z.string().describe('Email subject line.'),
        body: z.string().describe('Email body content. HTML is auto-detected.'),
        cc: z
          .array(z.string())
          .optional()
          .describe('Array of CC email addresses.'),
        bcc: z
          .array(z.string())
          .optional()
          .describe('Array of BCC email addresses.'),
        importance: z
          .enum(['low', 'normal', 'high'])
          .optional()
          .describe('Email importance level. Defaults to normal.'),
      }),
    },
    async (args) => {
      const isHtml = /<[a-z][\s\S]*>/i.test(args.body)

      const message = {
        subject: args.subject,
        body: {
          contentType: isHtml ? 'HTML' : 'Text',
          content: args.body,
        },
        toRecipients: args.to.map((addr) => ({
          emailAddress: { address: addr },
        })),
        ...(args.cc
          ? {
              ccRecipients: args.cc.map((addr) => ({
                emailAddress: { address: addr },
              })),
            }
          : {}),
        ...(args.bcc
          ? {
              bccRecipients: args.bcc.map((addr) => ({
                emailAddress: { address: addr },
              })),
            }
          : {}),
        ...(args.importance ? { importance: args.importance } : {}),
      }

      await client.graphPost('/me/sendMail', { message })
      return textResponse(`Email sent successfully to ${args.to.join(', ')}.`)
    },
  )

  // ─── Draft Email ─────────────────────────────────────────────────────

  server.registerTool(
    'draft_email',
    {
      title: 'Create Draft Email',
      description: 'Create a draft email without sending it. Saved to the Drafts folder.',
      inputSchema: z.object({
        to: z
          .array(z.string())
          .describe('Array of recipient email addresses.'),
        subject: z.string().describe('Email subject line.'),
        body: z.string().describe('Email body content. HTML is auto-detected.'),
        cc: z
          .array(z.string())
          .optional()
          .describe('Array of CC email addresses.'),
        importance: z
          .enum(['low', 'normal', 'high'])
          .optional()
          .describe('Email importance level.'),
      }),
    },
    async (args) => {
      const isHtml = /<[a-z][\s\S]*>/i.test(args.body)

      const draft = {
        subject: args.subject,
        body: {
          contentType: isHtml ? 'HTML' : 'Text',
          content: args.body,
        },
        toRecipients: args.to.map((addr) => ({
          emailAddress: { address: addr },
        })),
        ...(args.cc
          ? {
              ccRecipients: args.cc.map((addr) => ({
                emailAddress: { address: addr },
              })),
            }
          : {}),
        ...(args.importance ? { importance: args.importance } : {}),
      }

      const result = (await client.graphPost('/me/messages', draft)) as { id: string }
      return textResponse(`Draft created successfully. ID: ${result.id}`)
    },
  )

  // ─── Mark as Read/Unread ─────────────────────────────────────────────

  server.registerTool(
    'mark_as_read',
    {
      title: 'Mark Email as Read/Unread',
      description: 'Mark one or more emails as read or unread.',
      inputSchema: z.object({
        ids: z
          .array(z.string())
          .describe('Array of email message IDs to update.'),
        is_read: z
          .boolean()
          .describe('Set to true to mark as read, false for unread.'),
      }),
    },
    async (args) => {
      const results = await Promise.allSettled(
        args.ids.map((id) =>
          client.graphPatch(`/me/messages/${encodeURIComponent(id)}`, {
            isRead: args.is_read,
          }),
        ),
      )

      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      const status = args.is_read ? 'read' : 'unread'
      if (failed === 0) {
        return textResponse(`Marked ${succeeded} email(s) as ${status}.`)
      }
      return textResponse(
        `Marked ${succeeded} email(s) as ${status}. ${failed} failed.`,
      )
    },
  )
}
