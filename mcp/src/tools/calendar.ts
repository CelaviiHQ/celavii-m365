import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { CalendarEvent } from '../types.js'
import { CALENDAR_SELECT_FIELDS } from '../types.js'
import { formatEvent, textResponse } from '../utils/formatting.js'

export function registerCalendarTools(server: McpServer, client: GraphClient) {
  // ─── List Events ─────────────────────────────────────────────────────

  server.registerTool(
    'list_events',
    {
      title: 'List Calendar Events',
      description:
        'List calendar events within a date range. Defaults to the next 30 days.',
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
          .describe('Maximum number of events to return. Defaults to 25.'),
      }),
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

      const formatted = events.map((e, i) => formatEvent(e, i)).join('\n\n')
      return textResponse(`Found ${events.length} event(s):\n\n${formatted}`)
    },
  )

  // ─── Create Event ────────────────────────────────────────────────────

  server.registerTool(
    'create_event',
    {
      title: 'Create Calendar Event',
      description:
        'Create a new calendar event with optional attendees and location.',
      inputSchema: z.object({
        subject: z.string().describe('Event title/subject.'),
        start: z.string().describe('Start datetime in ISO 8601 format.'),
        end: z.string().describe('End datetime in ISO 8601 format.'),
        body: z.string().optional().describe('Event description/body.'),
        location: z.string().optional().describe('Event location.'),
        attendees: z
          .array(z.string())
          .optional()
          .describe('Array of attendee email addresses.'),
        is_all_day: z
          .boolean()
          .optional()
          .describe('Whether this is an all-day event.'),
        timezone: z
          .string()
          .optional()
          .describe('Timezone for the event (e.g., "America/Chicago"). Defaults to UTC.'),
      }),
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

      return textResponse(lines.join('\n'))
    },
  )

  // ─── Accept Event ────────────────────────────────────────────────────

  server.registerTool(
    'accept_event',
    {
      title: 'Accept Calendar Event',
      description: 'Accept a calendar event invitation.',
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
    },
    async (args) => {
      await client.graphPost(`/me/events/${encodeURIComponent(args.id)}/accept`, {
        comment: args.comment || '',
        sendResponse: args.send_response !== false,
      })
      return textResponse('Event accepted.')
    },
  )

  // ─── Decline Event ───────────────────────────────────────────────────

  server.registerTool(
    'decline_event',
    {
      title: 'Decline Calendar Event',
      description: 'Decline a calendar event invitation.',
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
    },
    async (args) => {
      await client.graphPost(`/me/events/${encodeURIComponent(args.id)}/decline`, {
        comment: args.comment || '',
        sendResponse: args.send_response !== false,
      })
      return textResponse('Event declined.')
    },
  )

  // ─── Cancel Event ────────────────────────────────────────────────────

  server.registerTool(
    'cancel_event',
    {
      title: 'Cancel Calendar Event',
      description: 'Cancel a calendar event that you organized. Sends cancellation to all attendees.',
      inputSchema: z.object({
        id: z.string().describe('The event ID to cancel.'),
        comment: z
          .string()
          .optional()
          .describe('Optional cancellation message to attendees.'),
      }),
    },
    async (args) => {
      await client.graphPost(`/me/events/${encodeURIComponent(args.id)}/cancel`, {
        comment: args.comment || '',
      })
      return textResponse('Event cancelled. Attendees have been notified.')
    },
  )

  // ─── Delete Event ────────────────────────────────────────────────────

  server.registerTool(
    'delete_event',
    {
      title: 'Delete Calendar Event',
      description: 'Permanently delete a calendar event.',
      inputSchema: z.object({
        id: z.string().describe('The event ID to delete.'),
      }),
    },
    async (args) => {
      await client.graphDelete(`/me/events/${encodeURIComponent(args.id)}`)
      return textResponse('Event deleted.')
    },
  )
}
