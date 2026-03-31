import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import { escapeOData, sanitizeHtml } from '../client.js'
import type { EmailMessage } from '../types.js'
import { EMAIL_SELECT_FIELDS, EMAIL_DETAIL_FIELDS, DEFAULT_PAGE_SIZE, MAX_RESULT_COUNT } from '../types.js'
import { resolveMailFolderPath } from '../utils/folders.js'
import { formatEmail, textResponse, paginatedResponse, actionResponse, batchResponse } from '../utils/formatting.js'

export function registerEmailTools(server: McpServer, client: GraphClient) {
  // ─── List Emails ─────────────────────────────────────────────────────

  server.registerTool(
    'm365_list_emails',
    {
      title: 'List Emails',
      description:
        'List emails from a Microsoft 365 mailbox folder. Returns subject, sender, date, read status, and message ID for each email. Use skip parameter for pagination.',
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
          .describe('Number of emails to skip for pagination. Use with count to page through results.'),
        unread_only: z
          .boolean()
          .optional()
          .describe('If true, only return unread emails.'),
        response_format: z
          .enum(['text', 'json'])
          .optional()
          .describe("Output format: 'text' for human-readable (default), 'json' for structured data."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const path = resolveMailFolderPath(args.folder)
      const count = args.count || DEFAULT_PAGE_SIZE
      const skip = args.skip || 0

      const queryParams: Record<string, string> = {
        $top: String(count),
        $orderby: 'receivedDateTime desc',
        $select: EMAIL_SELECT_FIELDS,
      }

      if (skip) queryParams.$skip = String(skip)
      if (args.unread_only) queryParams.$filter = 'isRead eq false'

      const emails = (await client.graphGetPaginated(path, queryParams, count)) as EmailMessage[]
      // Graph doesn't reliably return total count, so estimate based on whether we got a full page
      const total = emails.length < count ? skip + emails.length : skip + emails.length + 1

      if (emails.length === 0) {
        return textResponse('No emails found.')
      }

      return paginatedResponse(emails, total, skip, formatEmail, 'email(s)', args.response_format)
    },
  )

  // ─── Search Emails ───────────────────────────────────────────────────

  server.registerTool(
    'm365_search_emails',
    {
      title: 'Search Emails',
      description:
        'Search emails in Microsoft 365 using filters like sender, subject, keywords, attachment status, and read status. Combines filters with AND logic.',
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
        response_format: z
          .enum(['text', 'json'])
          .optional()
          .describe("Output format: 'text' for human-readable (default), 'json' for structured data."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const path = resolveMailFolderPath(args.folder)
      const count = args.count || DEFAULT_PAGE_SIZE

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

      return paginatedResponse(emails, emails.length, 0, formatEmail, 'email(s)', args.response_format)
    },
  )

  // ─── Read Email ──────────────────────────────────────────────────────

  server.registerTool(
    'm365_read_email',
    {
      title: 'Read Email',
      description:
        'Read the full content of a specific email by its message ID. Returns headers, body (sanitized by default to prevent prompt injection), and metadata. Use include_raw_html with caution.',
      inputSchema: z.object({
        id: z.string().describe('The email message ID.'),
        include_raw_html: z
          .boolean()
          .optional()
          .describe('If true, include the raw HTML body in addition to sanitized text. Use with caution.'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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
    'm365_send_email',
    {
      title: 'Send Email',
      description:
        'Compose and send an email via Microsoft 365. Supports multiple recipients, CC/BCC, HTML content (auto-detected), and importance levels. This action cannot be undone.',
      inputSchema: z.object({
        to: z
          .array(z.string())
          .describe('Array of recipient email addresses.'),
        subject: z.string().describe('Email subject line.'),
        body: z.string().describe('Email body content. HTML is auto-detected from tags.'),
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
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
      return actionResponse(
        `Email sent successfully to ${args.to.join(', ')}.`,
        { sent: true, to: args.to, subject: args.subject },
      )
    },
  )

  // ─── Draft Email ─────────────────────────────────────────────────────

  server.registerTool(
    'm365_draft_email',
    {
      title: 'Create Draft Email',
      description:
        'Create a draft email in Microsoft 365 without sending it. Saved to the Drafts folder. Use m365_send_email to send instead.',
      inputSchema: z.object({
        to: z
          .array(z.string())
          .describe('Array of recipient email addresses.'),
        subject: z.string().describe('Email subject line.'),
        body: z.string().describe('Email body content. HTML is auto-detected from tags.'),
        cc: z
          .array(z.string())
          .optional()
          .describe('Array of CC email addresses.'),
        importance: z
          .enum(['low', 'normal', 'high'])
          .optional()
          .describe('Email importance level.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
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
      return actionResponse(
        `Draft created successfully. ID: ${result.id}`,
        { created: true, id: result.id },
      )
    },
  )

  // ─── Mark as Read/Unread ─────────────────────────────────────────────

  server.registerTool(
    'm365_mark_as_read',
    {
      title: 'Mark Email as Read/Unread',
      description:
        'Mark one or more emails as read or unread in Microsoft 365. Provide an array of message IDs. Reports which IDs failed if any.',
      inputSchema: z.object({
        ids: z
          .array(z.string())
          .describe('Array of email message IDs to update.'),
        is_read: z
          .boolean()
          .describe('Set to true to mark as read, false for unread.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const results = await Promise.allSettled(
        args.ids.map((id) =>
          client.graphPatch(`/me/messages/${encodeURIComponent(id)}`, {
            isRead: args.is_read,
          }),
        ),
      )

      const status = args.is_read ? 'read' : 'unread'
      return batchResponse(results, args.ids, `Marked as ${status}`)
    },
  )
}
