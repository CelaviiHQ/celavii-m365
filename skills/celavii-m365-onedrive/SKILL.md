---
name: celavii-m365-onedrive
description: "Browse, search, upload, download, and share files in OneDrive via Microsoft Graph API. Manage folders, create sharing links, and handle file operations."
---

# Celavii M365 OneDrive Skill

Browse, search, upload, download, and share OneDrive files via the celavii-m365 MCP server.

**Prerequisite**: User must be authenticated. If not, use the `m365_authenticate` tool first (see `celavii-m365-setup` skill).

## Tools

### m365_onedrive_list

List files and folders at a path in OneDrive.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | No | Folder path (e.g., `/Documents/Reports`). Defaults to root. |
| `count` | integer | No | Max items to return (1-100). Defaults to 25. |

**Path format**: Always use forward slashes starting from root: `/Documents`, `/Documents/Reports/2026`.

**Returns per item**: Type (folder/file), name, size (human-readable), last modified date, web URL, and item ID.

### m365_onedrive_search

Search for files and folders by name or content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query (searches file names and content). |
| `count` | integer | No | Max results (1-50). Defaults to 25. |

**How search works**: Microsoft Graph's search indexes both file names and file contents (for supported formats like Word, Excel, PDF, text files). Results include files from anywhere in the user's OneDrive.

### m365_onedrive_download

Get a temporary, pre-authenticated download URL for a file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The file item ID. |

**Important**: The returned URL is temporary and expires after a short time (typically 1 hour). It includes authentication built in, so anyone with the URL can download the file during that window.

**Note**: This returns a URL — it does not download the file contents into the conversation. The user needs to open the URL in a browser or use it in another tool.

### m365_onedrive_upload

Upload a file to OneDrive.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Destination path including filename (e.g., `/Documents/report.pdf`). |
| `content` | string | Yes | File content as text or base64-encoded string. |
| `content_type` | string | No | MIME type (e.g., `application/pdf`). Auto-detected if omitted. |

**Size limit**: This uses the simple upload API, suitable for files under 4MB. For larger files, the user should upload through the OneDrive web interface.

**Common MIME types**:
- `text/plain` — .txt files
- `text/csv` — .csv files
- `application/json` — .json files
- `application/pdf` — .pdf files
- `image/png`, `image/jpeg` — images
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` — .xlsx
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` — .docx

**Conflict behavior**: If a file already exists at the path, it will be **overwritten**.

### m365_onedrive_share

Create a sharing link for a file or folder.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The item ID to share. |
| `type` | string | No | `view` (read-only), `edit`, or `embed`. Defaults to `view`. |
| `scope` | string | No | `anonymous` (anyone with link) or `organization`. Defaults to `anonymous`. |

**Sharing types**:
- `view` — Read-only access. Best for sharing reports, documents for review.
- `edit` — Full edit access. Use for collaborative documents.
- `embed` — Embeddable in web pages. Use for embedding in websites or apps.

**Sharing scopes**:
- `anonymous` — Anyone with the link can access (no sign-in required).
- `organization` — Only people in the same Microsoft 365 organization.

**Note**: Organization policies may restrict anonymous sharing. If it fails, try `organization` scope.

### m365_onedrive_create_folder

Create a new folder in OneDrive.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Name for the new folder. |
| `parent_path` | string | No | Parent folder path (e.g., `/Documents`). Defaults to root. |

**Conflict behavior**: If a folder with the same name exists, it will be automatically renamed (e.g., `Reports 1`).

### m365_onedrive_delete

Permanently delete a file or folder from OneDrive.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The item ID to delete. |

**Warning**: This is permanent — deleted items go to the OneDrive recycle bin but cannot be recovered via this tool. Always confirm with the user before deleting.

## Common Workflows

### Browse files
1. `m365_onedrive_list` with no path to see root contents
2. `m365_onedrive_list` with a path to drill into folders
3. Continue navigating by path

### Find a file
1. `m365_onedrive_search` with the file name or content keywords
2. `m365_onedrive_download` to get a download link
3. Or `m365_onedrive_share` to create a sharing link

### Upload a document
1. Ask user for the file content and destination path
2. `m365_onedrive_upload` with path and content
3. Optionally `m365_onedrive_share` to create a link

### Share a file
1. Find the file via `m365_onedrive_list` or `m365_onedrive_search`
2. `m365_onedrive_share` with the item ID
3. Return the sharing URL to the user

### Organize files
1. `m365_onedrive_create_folder` to create folder structure
2. Upload files to the new folders
3. Delete old/unwanted files with `m365_onedrive_delete`

## Item Display Format

Items are formatted as:
```
1. [FOLDER] Reports
   Size: 12 items
   Modified: 3/30/2026, 2:15:00 PM
   URL: https://onedrive.live.com/...
   ID: 01ABC...

2. [application/pdf] Q1-Report.pdf
   Size: 2.4 MB
   Modified: 3/28/2026, 10:30:00 AM
   URL: https://onedrive.live.com/...
   ID: 01DEF...
```

## Notes

- Item IDs are required for download, share, and delete operations — get them from `m365_onedrive_list` or `m365_onedrive_search`
- Paths always start with `/` from the OneDrive root
- File sizes are displayed in human-readable format (B, KB, MB, GB, TB)
- Items are sorted alphabetically by name when listing
- Search results may include items from anywhere in OneDrive, not just the current folder
- Upload is limited to text/base64 content that fits in a single request (< 4MB)
- If any tool returns "Not authenticated", use the `m365_authenticate` tool first
