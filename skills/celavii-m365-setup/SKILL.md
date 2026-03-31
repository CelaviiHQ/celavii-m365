---
name: celavii-m365-setup
description: "Set up and troubleshoot Microsoft 365 MCP authentication. OAuth flow, Azure AD app registration, token management, and common error resolution."
---

# Celavii M365 Setup Skill

Authentication setup and troubleshooting for the Celavii M365 MCP server.

**Source**: [github.com/CelaviiHQ/celavii-m365](https://github.com/CelaviiHQ/celavii-m365)

## Overview

The celavii-m365 MCP server connects to Microsoft 365 via OAuth 2.0 using the Microsoft Graph API. Before using any email, calendar, OneDrive, or Power Automate tools, the user must authenticate.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `M365_CLIENT_ID` | Yes | Azure AD application (client) ID |
| `M365_CLIENT_SECRET` | Yes | Azure AD client secret **value** (not the secret ID!) |
| `M365_TENANT_ID` | No | Azure AD tenant ID. Defaults to `common` (multi-tenant) |
| `M365_REDIRECT_URI` | No | OAuth callback URL. Defaults to `http://localhost:3333/auth/callback` |
| `M365_TOKEN_PATH` | No | Custom path for token file. Defaults to `~/.celavii-m365-tokens.json` |
| `M365_AUTH_PORT` | No | Auth server port. Defaults to `3333` |

## Authentication Flow

### Step 1: Check auth status

Use the `m365_check_auth_status` tool to see if the user is already authenticated.

### Step 2: Authenticate (if needed)

Two options:

**Option A — authenticate tool:**
1. Call the `m365_authenticate` tool — it returns an OAuth URL
2. User visits the URL in their browser
3. User signs in with their Microsoft account
4. The auth server (running separately) handles the callback and stores tokens

**Option B — auth server:**
1. Run `npx celavii-m365-auth` in a terminal (or `npm run auth` from the mcp directory)
2. Visit `http://localhost:3333/auth` in a browser
3. Tokens are stored automatically

### Step 3: Verify

Call `m365_check_auth_status` again to confirm tokens are valid.

## Token Storage

- Tokens stored at `~/.celavii-m365-tokens.json` (or custom path via `M365_TOKEN_PATH`)
- File permissions: `0600` (owner read/write only)
- Contains both Graph API tokens and Flow API tokens (if authenticated)
- Tokens auto-refresh when expired (5-minute buffer before expiry)
- Call `m365_logout` tool to clear all tokens

## Token Structure

```json
{
  "graph": {
    "access_token": "...",
    "refresh_token": "...",
    "expires_at": 1234567890000
  },
  "flow": {
    "access_token": "...",
    "refresh_token": "...",
    "expires_at": 1234567890000
  }
}
```

## Required Microsoft Graph Permissions

The Azure AD app registration needs these **delegated** permissions:

| Permission | Used by |
|-----------|---------|
| `Mail.Read` | m365_list_emails, m365_search_emails, m365_read_email |
| `Mail.ReadWrite` | m365_mark_as_read, m365_move_emails, m365_draft_email |
| `Mail.Send` | m365_send_email |
| `User.Read` | Authentication verification |
| `Calendars.Read` | m365_list_events |
| `Calendars.ReadWrite` | m365_create_event, m365_accept_event, m365_decline_event, m365_cancel_event, m365_delete_event |
| `Files.Read` | m365_onedrive_list, m365_onedrive_search, m365_onedrive_download |
| `Files.ReadWrite` | m365_onedrive_upload, m365_onedrive_share, m365_onedrive_create_folder, m365_onedrive_delete |

Power Automate tools require a separate scope: `https://service.flow.microsoft.com/.default`

## Azure AD App Registration

1. Go to [Azure Portal > App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
3. Name: "Celavii M365 MCP" (or anything)
4. Supported account types: Choose based on needs
   - **Single tenant** — your org only (use your tenant ID for `M365_TENANT_ID`)
   - **Multi-tenant** — any Microsoft account (use `common` for `M365_TENANT_ID`)
5. Redirect URI: `http://localhost:3333/auth/callback` (Web platform)
6. Under **Certificates & secrets** > **Client secrets** > **New client secret**
   - Copy the **Value** column — this is `M365_CLIENT_SECRET`
   - Do NOT use the Secret ID column!
7. Under **API permissions**, add the Microsoft Graph delegated permissions listed above
8. Click **Grant admin consent** (required for org tenants)

## Common Errors

### AADSTS7000215: Invalid client secret

**Cause**: Using the secret ID instead of the secret value, or the secret has expired.
**Fix**: Go to Azure Portal > App registrations > your app > Certificates & secrets. Create a new secret and copy the **Value** column (not the ID).

### AADSTS700016: Application not found

**Cause**: Wrong `M365_CLIENT_ID` or the app was deleted.
**Fix**: Verify the Application (client) ID in Azure Portal > App registrations > your app > Overview.

### AADSTS65001: User has not consented

**Cause**: Admin consent not granted for the required permissions.
**Fix**: An Azure AD admin must grant consent in the Azure Portal under API permissions.

### AADSTS50011: Reply URL does not match

**Cause**: The redirect URI in the app registration doesn't match `M365_REDIRECT_URI`.
**Fix**: Ensure `http://localhost:3333/auth/callback` is added as a Web redirect URI in the app registration.

### Token refresh failed

**Cause**: Refresh token expired (usually after 90 days of inactivity) or was revoked.
**Fix**: Call `m365_logout` to clear stored tokens, then re-authenticate.

### Not authenticated error on tool calls

**Cause**: No tokens stored, or tokens are expired and refresh failed.
**Fix**: Call `m365_authenticate` tool and complete the OAuth flow.

## Available Auth Tools

| Tool | Description |
|------|-------------|
| `m365_authenticate` | Start OAuth flow, returns URL for browser |
| `m365_check_auth_status` | Verify if tokens exist and are valid |
| `m365_logout` | Clear all stored tokens |
| `m365_about` | Server version and capabilities info |

## Notes

- Always check auth status before attempting email/calendar/drive operations
- If any tool returns "Authentication expired", re-authenticate
- The auth server must be running for the OAuth callback to work
- Tokens persist across MCP server restarts (stored on disk)
- Multi-tenant apps (`common`) work with personal Microsoft accounts and work/school accounts
- Single-tenant apps are more secure for enterprise use
