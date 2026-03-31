import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { CalendarEvent } from '../types.js'
import { CALENDAR_SELECT_FIELDS } from '../types.js'
import { formatEvent, textResponse, paginatedResponse, actionResponse } from '../utils/formatting.js'

export function registerCalendarTools(server: McpServer, client: GraphClient) {
  // ─── List Events ─────────────────────────────────────────────────────

  server.registerTool(
    'm365_list_events',
    {
      title: 'List Calendar Events',
      description:
        'List calendar events from Microsoft 365 within a date range. Returns subject, time (with timezone), location, attendees, and event ID. Defaults to the next 30 days.',
      inputSchema: z.object({
        start_date: z
          .string()
          .optional()
          .describe('Start date in ISO 8601 format (e.g., 2026-03-30T00:00:00). Defaults to now.'),
        end_date: z
          .string()
          .optional()
          .describe('End date in ISO 8601 format. Defaults to 30 days from start.'),
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of events to return (1-50). Defaults to 25.'),
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
      const now = new Date()
      const startDate = args.start_date || now.toISOString()
      const endDate =
        args.end_date || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const count = args.count || 25

      const events = (await client.graphGetPaginated(
        '/me/calendarView',
        {
          startDateTime: startDate,
          endDateTime: endDate,
          $top: String(count),
          $orderby: 'start/dateTime asc',
          $select: CALENDAR_SELECT_FIELDS,
        },
        count,
      )) as CalendarEvent[]

      if (events.length === 0) {
        return textResponse('No events found in the specified date range.')
      }

      return paginatedResponse(events, events.length, 0, formatEvent, 'event(s)', args.response_format)
    },
  )

  // ─── Create Event ────────────────────────────────────────────────────

  server.registerTool(
    'm365_create_event',
    {
      title: 'Create Calendar Event',
      description:
        'Create a new calendar event in Microsoft 365 with optional attendees, location, and timezone. Attendees receive an invitation email.',
      inputSchema: z.object({
        subject: z.string().describe('Event title/subject.'),
        start: z.string().describe('Start datetime in ISO 8601 format (e.g., 2026-04-01T14:00:00).'),
        end: z.string().describe('End datetime in ISO 8601 format.'),
        body: z.string().optional().describe('Event description/body.'),
        location: z.string().optional().describe('Event location (e.g., "Conference Room A" or a Teams link).'),
        attendees: z
          .array(z.string())
          .optional()
          .describe('Array of attendee email addresses. They will receive invitation emails.'),
        is_all_day: z
          .boolean()
          .optional()
          .describe('Whether this is an all-day event.'),
        timezone: z
          .string()
          .optional()
          .describe('IANA timezone for the event (e.g., "America/Chicago", "America/New_York"). Defaults to UTC.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const tz = args.timezone || 'UTC'

      const event: Record<string, unknown> = {
        subject: args.subject,
        start: { dateTime: args.start, timeZone: tz },
        end: { dateTime: args.end, timeZone: tz },
        isAllDay: args.is_all_day || false,
      }

      if (args.body) {
        event.body = { contentType: 'Text', content: args.body }
      }
      if (args.location) {
        event.location = { displayName: args.location }
      }
      if (args.attendees?.length) {
        event.attendees = args.attendees.map((email) => ({
          emailAddress: { address: email },
          type: 'required',
        }))
      }

      const result = (await client.graphPost('/me/events', event)) as { id: string; webLink?: string }

      const lines = [`Event created successfully.`, `ID: ${result.id}`]
      if (result.webLink) lines.push(`Link: ${result.webLink}`)

      return actionResponse(lines.join('\n'), { created: true, id: result.id, webLink: result.webLink })
    },
  )

  // ─── Accept Event ────────────────────────────────────────────────────

  server.registerTool(
    'm365_accept_event',
    {
      title: 'Accept Calendar Event',
      description: 'Accept a calendar event invitation in Microsoft 365. Sends a response to the organizer by default.',
      inputSchema: z.object({
        id: z.string().describe('The event ID to accept.'),
        comment: z
          .string()
          .optional()
          .describe('Optional comment to include with your acceptance.'),
        send_response: z
          .boolean()
          .optional()
          .describe('Whether to send a response to the organizer. Defaults to true.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      await client.graphPost(`/me/events/${encodeURIComponent(args.id)}/accept`, {
        comment: args.comment || '',
        sendResponse: args.send_response !== false,
      })
      return actionResponse('Event accepted.', { accepted: true, id: args.id })
    },
  )

  // ─── Decline Event ───────────────────────────────────────────────────

  server.registerTool(
    'm365_decline_event',
    {
      title: 'Decline Calendar Event',
      description: 'Decline a calendar event invitation in Microsoft 365. Sends a response to the organizer by default.',
      inputSchema: z.object({
        id: z.string().describe('The event ID to decline.'),
        comment: z
          .string()
          .optional()
          .describe('Optional comment to include with your decline.'),
        send_response: z
          .boolean()
          .optional()
          .describe('Whether to send a response to the organizer. Defaults to true.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      await client.graphPost(`/me/events/${encodeURIComponent(args.id)}/decline`, {
        comment: args.comment || '',
        sendResponse: args.send_response !== false,
      })
      return actionResponse('Event declined.', { declined: true, id: args.id })
    },
  )

  // ─── Cancel Event ────────────────────────────────────────────────────

  server.registerTool(
    'm365_cancel_event',
    {
      title: 'Cancel Calendar Event',
      description: 'Cancel a calendar event that you organized in Microsoft 365. Sends cancellation notification to all attendees. Only the organizer can cancel.',
      inputSchema: z.object({
        id: z.string().describe('The event ID to cancel.'),
        comment: z
          .string()
          .optional()
          .describe('Optional cancellation message sent to attendees.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      await client.graphPost(`/me/events/${encodeURIComponent(args.id)}/cancel`, {
        comment: args.comment || '',
      })
      return actionResponse('Event cancelled. Attendees have been notified.', { cancelled: true, id: args.id })
    },
  )

  // ─── Delete Event ────────────────────────────────────────────────────

  server.registerTool(
    'm365_delete_event',
    {
      title: 'Delete Calendar Event',
      description: 'Permanently delete a calendar event from Microsoft 365. This action cannot be undone. Use m365_cancel_event instead if you want to notify attendees.',
      inputSchema: z.object({
        id: z.string().describe('The event ID to delete.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      await client.graphDelete(`/me/events/${encodeURIComponent(args.id)}`)
      return actionResponse('Event deleted.', { deleted: true, id: args.id })
    },
  )
}
