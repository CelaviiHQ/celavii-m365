---
name: celavii-m365-organize
description: "Organize Outlook mail with folders, rules, and email moves. Create folder hierarchies, set up auto-sort inbox rules with conditions/actions, move emails between folders, and manage rule execution order."
metadata:
  {
    "openclaw":
      {
        "emoji": "🗂️",
        "requires": { "env": ["M365_CLIENT_ID", "M365_CLIENT_SECRET"] },
        "primaryEnv": "M365_CLIENT_ID",
      },
  }
---

# Celavii M365 Organize Skill

Organize Outlook mail with folders, rules, and batch email moves via the celavii-m365 MCP server.

**Prerequisite**: User must be authenticated. If not, use the `authenticate` tool first (see `celavii-m365-setup` skill).

## Folder Tools

### list_folders

List all mail folders with item and unread counts.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parent_folder` | string | No | Parent folder name or ID to list child folders of. Defaults to top-level. |

**Returns per folder**: Display name, total items, unread items, sub-folder count, and folder ID.

### create_folder

Create a new mail folder.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Name for the new folder. |
| `parent_folder` | string | No | Parent folder name or ID. Defaults to top-level. |

**Nesting**: You can create sub-folders by specifying a parent. For example, create "Q1" inside "Projects" by setting `parent_folder: "Projects"` (use the folder ID if "Projects" is a custom folder).

### move_emails

Move one or more emails to a destination folder.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ids` | string[] | Yes | Array of email message IDs to move. |
| `destination_folder` | string | Yes | Folder name or ID. |

**Well-known folder names**: `inbox`, `sent`, `drafts`, `deleted`, `trash`, `junk`, `spam`, `archive`, `outbox`

These are automatically resolved to the correct folder ID before moving.

**Batch support**: Processes all IDs concurrently. Reports both success and failure counts.

## Rule Tools

### list_rules

List all inbox rules.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `detailed` | boolean | No | If true, return full JSON with all conditions and actions. |

**Default output**: Rule name, sequence number, enabled status, and ID.
**Detailed output**: Full JSON including all conditions and actions for each rule.

Rules are sorted by sequence number (lower = runs first).

### create_rule

Create a new inbox rule.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Display name for the rule. |
| `enabled` | boolean | No | Whether the rule is active. Defaults to true. |
| `from_addresses` | string[] | No | Trigger when email is from these addresses. |
| `subject_contains` | string[] | No | Trigger when subject contains these strings. |
| `has_attachments` | boolean | No | Trigger when email has attachments. |
| `move_to_folder` | string | No | **Folder ID** to move matching emails to. |
| `mark_as_read` | boolean | No | Mark matching emails as read. |
| `stop_processing` | boolean | No | Stop processing additional rules. Defaults to false. |

**Important**: `move_to_folder` requires a **folder ID**, not a folder name. Use `list_folders` first to get the ID.

**Conditions**: Multiple conditions are combined with AND logic — all conditions must match for the rule to trigger.

**Typical rule creation workflow**:
1. `list_folders` — get the folder ID for the destination
2. `create_rule` — set conditions and actions

### update_rule_sequence

Change the execution order of a rule.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The rule ID to update. |
| `sequence` | integer | Yes | New sequence number (lower = runs first, minimum 1). |

Rules run in sequence order. Lower numbers execute first. Use this to prioritize important rules.

### delete_rule

Delete an inbox rule.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The rule ID to delete. |

## Common Workflows

### Organize existing emails
1. `list_folders` to see current folder structure
2. `create_folder` for any new folders needed
3. `search_emails` (from email skill) to find emails to organize
4. `move_emails` to move them to the right folders

### Set up auto-sorting
1. `list_folders` to get the destination folder ID
2. `create_rule` with conditions and `move_to_folder` action
3. Optionally set `mark_as_read: true` for low-priority rules
4. `list_rules` to verify the rule was created

### Example: Auto-sort GitHub notifications
```
Step 1: create_folder({ name: "GitHub" })
Step 2: list_folders() → get the ID of the "GitHub" folder
Step 3: create_rule({
  name: "GitHub Notifications",
  from_addresses: ["notifications@github.com"],
  move_to_folder: "<folder-id-from-step-2>",
  mark_as_read: true
})
```

### Example: Flag important client emails
```
create_rule({
  name: "VIP Client Alerts",
  from_addresses: ["ceo@bigclient.com", "pm@bigclient.com"],
  stop_processing: true
})
```
Note: This rule just matches — without a move action, it stops other rules from processing, keeping the email in the inbox.

### Reorder rules for priority
1. `list_rules` to see current sequence
2. `update_rule_sequence` to change order
3. Lower sequence = higher priority (runs first)

## Well-Known Folder Name Mapping

| You can say | Graph API uses |
|------------|----------------|
| `inbox` | `inbox` |
| `sent` | `sentitems` |
| `drafts` | `drafts` |
| `deleted`, `trash` | `deleteditems` |
| `junk`, `spam` | `junkemail` |
| `archive` | `archive` |
| `outbox` | `outbox` |

These work in `list_emails`, `search_emails`, `move_emails`, and folder operations.

## Notes

- Folder IDs are required for rule `move_to_folder` — always get them from `list_folders` first
- Rules apply to **new incoming emails only** — they don't retroactively process existing emails
- To apply a rule's logic to existing emails, use `search_emails` + `move_emails` manually
- Multiple conditions on a rule use AND logic (all must match)
- `stop_processing: true` prevents subsequent rules from running on a matching email
- Maximum 100 folders returned per `list_folders` call
- If any tool returns "Not authenticated", use the `authenticate` tool first
