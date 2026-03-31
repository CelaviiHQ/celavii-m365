---
name: celavii-m365-calendar
description: "Manage Outlook calendar events via Microsoft Graph API. List events by date range, create events with attendees and timezones, accept/decline invitations, cancel/delete events."
---

# Celavii M365 Calendar Skill

Manage Outlook calendar events via the celavii-m365 MCP server.

**Prerequisite**: User must be authenticated. If not, use the `m365_authenticate` tool first (see `celavii-m365-setup` skill).

## Tool Names

All calendar tools use the `m365_` prefix: `m365_list_events`, `m365_create_event`, `m365_accept_event`, `m365_decline_event`, `m365_cancel_event`, `m365_delete_event`.

## Tools

### m365_list_events

List calendar events within a date range.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | string | No | Start date in ISO 8601 (e.g., `2026-03-30T00:00:00`). Defaults to now. |
| `end_date` | string | No | End date in ISO 8601. Defaults to 30 days from start. |
| `count` | integer | No | Max events to return (1-50). Defaults to 25. |

**How it works**: Uses the Microsoft Graph `calendarView` endpoint which automatically expands recurring events into individual occurrences within the date range.

**Returns per event**: Subject, start/end times, location, attendees with response status, cancelled/all-day flags, and event ID.

**Date handling tips**:
- "What's on my calendar today?" → set `start_date` to today at midnight, `end_date` to tomorrow at midnight
- "Next week's meetings" → set start to next Monday, end to next Sunday
- "This month" → set start to first of month, end to last of month
- Always use ISO 8601 format: `2026-03-30T00:00:00`

### m365_create_event

Create a new calendar event.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subject` | string | Yes | Event title. |
| `start` | string | Yes | Start datetime in ISO 8601. |
| `end` | string | Yes | End datetime in ISO 8601. |
| `body` | string | No | Event description/notes. |
| `location` | string | No | Event location (free text). |
| `attendees` | string[] | No | Array of attendee email addresses. |
| `is_all_day` | boolean | No | Whether this is an all-day event. |
| `timezone` | string | No | Timezone (e.g., `America/Chicago`). Defaults to `UTC`. |

**Timezone handling**:
- Always ask the user for their timezone if creating events
- Common timezones: `America/New_York`, `America/Chicago`, `America/Denver`, `America/Los_Angeles`, `Europe/London`, `Europe/Amsterdam`, `Asia/Tokyo`
- Microsoft also accepts Windows timezone names: `Eastern Standard Time`, `Central European Standard Time`, etc.
- If the user says "3pm", ask what timezone — don't assume

**All-day events**: Set `is_all_day: true`. The start/end should be date-only boundaries (e.g., start: `2026-04-01T00:00:00`, end: `2026-04-02T00:00:00` for a single all-day event).

**Attendees**: Each attendee is added as "required" type. They receive a meeting invitation via email.

**Returns**: Event ID and web link (URL to open in Outlook).

**Creating meetings — what to ask the user**:

When a user asks to create a meeting or calendar event, gather the following before creating it. Ask for any missing details:

1. **Subject/title** — What is the meeting about?
2. **Date and time** — When? (ask for timezone if not already known)
3. **Duration** — How long? (default to 30 minutes if not specified)
4. **Attendees** — Who should be invited? (email addresses)
5. **Microsoft Teams link** — "Would you like to add a Teams meeting link?" (Many users want virtual meetings by default. If yes, set `location` to `"Microsoft Teams Meeting"` and add `"This is a Microsoft Teams meeting."` to the body. Note: the Graph API will auto-generate the Teams join link when `isOnlineMeeting` is detected.)
6. **Location** — If not a Teams meeting, ask for a physical location or video link
7. **Description/agenda** — "Any agenda items or notes to include in the invite?"
8. **Importance** — For critical meetings, note this in the body

**Pro tip**: If the user says "set up a call" or "schedule a meeting", proactively ask about Teams and attendees. Don't create a bare event with just a title and time — the invite should be useful to recipients.

### m365_accept_event

Accept a calendar event invitation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The event ID to accept. |
| `comment` | string | No | Optional comment to the organizer. |
| `send_response` | boolean | No | Send response to organizer. Defaults to true. |

### m365_decline_event

Decline a calendar event invitation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The event ID to decline. |
| `comment` | string | No | Optional reason for declining. |
| `send_response` | boolean | No | Send response to organizer. Defaults to true. |

### m365_cancel_event

Cancel a calendar event you organized. Notifies all attendees.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The event ID to cancel. |
| `comment` | string | No | Optional cancellation message to attendees. |

**Important**: Only works for events where the user is the **organizer**. Use `decline_event` for events organized by others.

### m365_delete_event

Permanently delete a calendar event.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The event ID to delete. |

**Warning**: This is permanent. Unlike cancel, this does NOT notify attendees. Use `m365_cancel_event` to properly cancel meetings with attendees.

## Common Workflows

### Check today's schedule
1. `m365_list_events` with today's date range
2. Present events in chronological order with timezone info

### Schedule a meeting
1. Ask user for: subject, date/time, duration, attendees, timezone
2. Ask: "Would you like to add a Microsoft Teams meeting link?"
3. Ask: "Any agenda or notes to include in the invite?"
4. Calculate end time from start + duration
5. `m365_create_event` with all details (include Teams location and body notes if requested)
6. Share the event link with the user

### Respond to invitations
1. `m365_list_events` to see upcoming events
2. Identify events needing response (check response status)
3. `m365_accept_event` or `m365_decline_event` with optional comment

### Cancel a meeting
1. Confirm the event details with user
2. `m365_cancel_event` with an explanatory comment
3. Attendees are notified automatically

## Event Display Format

Events are formatted as:
```
1. Weekly Team Standup [ALL DAY]
   When: 3/30/2026 9:00 AM - 3/30/2026 9:30 AM
   Location: Conference Room B
   Attendees: John Smith (accepted), Jane Doe (tentativelyAccepted)
   ID: AAMkAG...
```

Flags:
- `[CANCELLED]` — event was cancelled
- `[ALL DAY]` — all-day event

Attendee response statuses: `accepted`, `declined`, `tentativelyAccepted`, `none` (no response yet)

## Notes

- Event IDs are long opaque strings — always get them from `m365_list_events`
- The `calendarView` endpoint is used (not `/events`), so recurring events are expanded
- Events are sorted by `start/dateTime asc` (chronological)
- Maximum 50 events per request
- There is no "update event" tool yet — to reschedule, delete and recreate
- There is no reply/forward for events — attendees are set at creation time
- If an event tool returns "Not authenticated", use the `m365_authenticate` tool first
