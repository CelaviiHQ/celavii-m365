---
name: celavii-m365-email
description: "Read, search, send, draft, and manage Outlook emails via Microsoft Graph API. Supports folder filtering, search queries, HTML sanitization, CC/BCC, importance levels, and batch read/unread marking."
---

# Celavii M365 Email Skill

Read, search, send, and manage Outlook emails via the celavii-m365 MCP server.

**Prerequisite**: User must be authenticated. If not, use the `m365_authenticate` tool first (see `celavii-m365-setup` skill).

## Tools

### m365_list_emails

List emails from a mailbox folder.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `folder` | string | No | Folder name or ID. Defaults to `inbox`. |
| `count` | integer | No | Number of emails (1-50). Defaults to 25. |
| `skip` | integer | No | Emails to skip (pagination). |
| `unread_only` | boolean | No | Only return unread emails. |

**Supported folder names**: `inbox`, `sent`, `drafts`, `deleted`, `trash`, `junk`, `spam`, `archive`, `outbox`

These are aliases that map to Microsoft Graph well-known folder names:
- `sent` -> `sentitems`
- `deleted` / `trash` -> `deleteditems`
- `junk` / `spam` -> `junkemail`

You can also pass a folder ID (from `m365_list_folders`) for custom folders.

**Returns**: Subject, sender, date, preview (150 chars), read status, attachment flag, importance, and message ID.

### m365_search_emails

Search emails with multiple filters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | No | Full-text search across subject, body, participants. |
| `from` | string | No | Filter by sender email address (exact match). |
| `subject` | string | No | Filter by subject line (partial match via `contains()`). |
| `has_attachments` | boolean | No | Filter by attachment presence. |
| `unread_only` | boolean | No | Only unread emails. |
| `folder` | string | No | Folder to search in. Omit for all folders. |
| `count` | integer | No | Max results (1-50). Defaults to 25. |

**How filters work**:
- `from` and `subject` use OData `$filter` — combined with AND logic
- `query` uses `$search` — Microsoft's full-text search
- Filters and search can be combined in the same request
- All user input is OData-escaped to prevent injection

**Examples**:
- "Find emails from john@example.com" → `{ from: "john@example.com" }`
- "Search for invoices" → `{ query: "invoice" }`
- "Unread emails with attachments" → `{ unread_only: true, has_attachments: true }`
- "Emails about the project from Sarah" → `{ query: "project", from: "sarah@company.com" }`

### m365_read_email

Read the full content of a specific email.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The email message ID. |
| `include_raw_html` | boolean | No | Include raw HTML body (use with caution). |

**Security**: HTML email bodies are **sanitized by default** — script tags, style tags, and all HTML markup are stripped to prevent prompt injection from malicious email content. Only clean text is returned.

The `include_raw_html` flag adds the original HTML alongside the sanitized text. Only use this when specifically debugging email rendering — never for normal email reading.

**Returns**: Subject, from, to, CC, date, importance, attachment status, read status, and the full body text.

### m365_send_email

Compose and send an email.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to` | string[] | Yes | Array of recipient email addresses. |
| `subject` | string | Yes | Email subject line. |
| `body` | string | Yes | Email body. HTML is auto-detected. |
| `cc` | string[] | No | Array of CC addresses. |
| `bcc` | string[] | No | Array of BCC addresses. |
| `importance` | string | No | `low`, `normal`, or `high`. Defaults to `normal`. |

**HTML auto-detection**: If the body contains HTML tags (e.g., `<p>`, `<div>`, `<html>`), it's automatically sent as HTML. Otherwise sent as plain text.

**Important**: Always confirm with the user before sending emails. Read back the recipient(s), subject, and body for confirmation.

### m365_draft_email

Create a draft email without sending it. Saved to the Drafts folder.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to` | string[] | Yes | Array of recipient email addresses. |
| `subject` | string | Yes | Email subject line. |
| `body` | string | Yes | Email body content. |
| `cc` | string[] | No | Array of CC addresses. |
| `importance` | string | No | `low`, `normal`, or `high`. |

**Returns**: The draft message ID (can be used to send later via Graph API).

### m365_mark_as_read

Mark one or more emails as read or unread.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ids` | string[] | Yes | Array of email message IDs. |
| `is_read` | boolean | Yes | `true` = mark as read, `false` = mark as unread. |

**Batch support**: Processes all IDs concurrently using `Promise.allSettled`. Reports both success and failure counts.

## Common Workflows

### Check new mail
1. `m365_list_emails` with `unread_only: true`
2. `m365_read_email` for any email the user wants to see
3. Optionally `m365_mark_as_read` after reading

### Search and respond
1. `m365_search_emails` with filters
2. `m365_read_email` to read the full message
3. `m365_send_email` to reply (manually construct the reply — no reply-to-thread support yet)

### Draft review workflow
1. `m365_draft_email` to create the draft
2. User reviews in Outlook
3. User sends from Outlook when ready

## Pagination

- `m365_list_emails` supports `skip` for offset-based pagination
- Results are always sorted by `receivedDateTime desc` (newest first)
- Maximum 50 emails per request
- For large mailboxes, use `skip` to page through: first call `skip: 0`, then `skip: 25`, then `skip: 50`, etc.

## Notes

- Email IDs are long opaque strings — always get them from `m365_list_emails` or `m365_search_emails`
- The `bodyPreview` in list results is truncated to 150 characters
- Importance flags: emails marked `high` show `[HIGH]`, `low` show `[LOW]` in formatted output
- Unread emails show `[UNREAD]` flag, emails with attachments show `[ATTACHMENTS]`
- All tool responses are text-formatted for readability, not raw JSON
- If any email tool returns "Not authenticated", use the `m365_authenticate` tool first
