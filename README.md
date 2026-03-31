# Celavii M365

An open-source [MCP](https://modelcontextprotocol.io) server that connects Microsoft 365 — Outlook, Calendar, OneDrive, and Power Automate — to AI-powered IDEs like Claude Code, Windsurf, Cursor, and more.

## Features

| Module | Tools | What you can do |
|--------|-------|----------------|
| **Email** | 6 | Read, search, send, draft, mark read, organize |
| **Calendar** | 6 | List, create, accept, decline, cancel, delete events |
| **OneDrive** | 7 | Browse, search, upload, download, share, create folders |
| **Folders** | 3 | List, create mail folders, move emails |
| **Rules** | 4 | List, create, reorder, delete inbox rules |
| **Power Automate** | 5 | List environments, list/run/toggle flows, view run history |
| **Auth** | 4 | Authenticate, check status, logout, about |

**35 tools** total, all fully typed with Zod validation.

## Quick Start

### 1. Create an Azure AD App Registration

1. Go to [Azure Portal > App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
3. Set a name (e.g., "Celavii M365 MCP")
4. Set **Redirect URI** to `http://localhost:3333/auth/callback` (Web platform)
5. Under **Certificates & secrets**, create a new client secret — copy the **value** (not the secret ID!)
6. Under **API permissions**, add Microsoft Graph permissions:
   - `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`
   - `User.Read`
   - `Calendars.Read`, `Calendars.ReadWrite`
   - `Files.Read`, `Files.ReadWrite`
7. Click **Grant admin consent** (or have an admin do it)

### 2. Install the Plugin

Choose the method that works best for your setup:

<details>
<summary><b>Option A: Claude Desktop — Plugin Upload (Recommended)</b></summary>

1. Download the latest `celavii-m365-plugin.zip` from [Releases](https://github.com/CelaviiHQ/celavii-m365/releases), or build it yourself:
   ```bash
   git clone https://github.com/CelaviiHQ/celavii-m365.git
   cd celavii-m365
   ./build-plugin.sh
   ```
2. In Claude Desktop, click the **+** button next to the prompt box
3. Select **Plugins** → **Add plugin**
4. Click **Browse files** and select `celavii-m365-plugin.zip`
5. After installing, configure your Azure AD credentials in the MCP settings
6. Restart Claude Desktop

This installs the MCP server, all 6 skills, and configuration automatically.

</details>

<details>
<summary><b>Option B: Claude Code CLI</b></summary>

If you have the Claude CLI installed:

```bash
claude plugin install --from github:CelaviiHQ/celavii-m365
```

Then set your Azure AD credentials in your project's `.mcp.json` and restart Claude Code.

</details>

<details>
<summary><b>Option C: Cross-IDE Installer Script</b></summary>

Clone the repo and run the installer:

```bash
git clone https://github.com/CelaviiHQ/celavii-m365.git
cd celavii-m365

# Install for all IDEs (Claude Code, Windsurf, Cursor)
./install.sh all --project-dir /path/to/your/project

# Or install for a specific IDE
./install.sh claude --project-dir /path/to/your/project
./install.sh windsurf --project-dir /path/to/your/project
./install.sh cursor --project-dir /path/to/your/project
```

Then set your Azure AD credentials in the generated `.mcp.json`.

</details>

<details>
<summary><b>Option D: Manual MCP Configuration</b></summary>

Add to your IDE's MCP config (`.mcp.json`, `settings.json`, or Claude Desktop config):

```json
{
  "mcpServers": {
    "celavii-m365": {
      "command": "npx",
      "args": ["-y", "celavii-m365"],
      "env": {
        "M365_CLIENT_ID": "your-client-id",
        "M365_CLIENT_SECRET": "your-client-secret-value",
        "M365_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

For skills (optional but recommended), copy the `skills/` directory from this repo into your project:
- **Claude Code**: Copy to project root as `skills/`
- **Windsurf**: Copy to `.windsurf/skills/`
- **Cursor**: Copy to `.cursor/skills/`

</details>

### 3. Authenticate

On first use, the MCP server will prompt you to authenticate. You have two options:

**Option A: Use the authenticate tool** — Ask your AI assistant to authenticate, and it will give you a URL to visit.

**Option B: Run the auth server** — In a separate terminal:

```bash
M365_CLIENT_ID=xxx M365_CLIENT_SECRET=xxx npx celavii-m365-auth
```

Then visit `http://localhost:3333/auth` in your browser.

## What Gets Installed

| Component | Description | Location |
|-----------|-------------|----------|
| **MCP Server** | 35 Microsoft 365 tools | Runs via `npx celavii-m365` |
| **Skills** | 6 domain-knowledge guides | `skills/celavii-m365-*` |
| **Plugin Manifest** | Claude Code plugin metadata | `.claude-plugin/plugin.json` |
| **MCP Config** | Server connection settings | `.mcp.json` |

### Skills

Skills provide domain knowledge so your AI assistant knows how to use the M365 tools effectively:

| Skill | Description |
|-------|-------------|
| `celavii-m365-setup` | Authentication flow, Azure AD setup, troubleshooting |
| `celavii-m365-email` | Email operations — read, search, send, draft, manage |
| `celavii-m365-calendar` | Calendar management — events, invitations, timezones |
| `celavii-m365-onedrive` | OneDrive — browse, upload, download, share files |
| `celavii-m365-organize` | Mail organization — folders, rules, batch moves |
| `celavii-m365-flows` | Power Automate — environments, flows, runs, triggers |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `M365_CLIENT_ID` | Yes | Azure AD application (client) ID |
| `M365_CLIENT_SECRET` | Yes | Azure AD client secret **value** (not the secret ID!) |
| `M365_TENANT_ID` | No | Azure AD tenant ID. Defaults to `common` (multi-tenant) |
| `M365_REDIRECT_URI` | No | OAuth callback URL. Defaults to `http://localhost:3333/auth/callback` |
| `M365_TOKEN_PATH` | No | Custom path for token storage. Defaults to `~/.celavii-m365-tokens.json` |
| `M365_AUTH_PORT` | No | Auth server port. Defaults to `3333` |

## Available Tools

### Email
- **list_emails** — List emails with folder, count, skip, unread filters
- **search_emails** — Search by query, sender, subject, attachments, read status
- **read_email** — Read full email content (HTML auto-sanitized for security)
- **send_email** — Send with To/CC/BCC, HTML auto-detection, importance levels
- **draft_email** — Create draft without sending
- **mark_as_read** — Mark one or more emails as read/unread

### Calendar
- **list_events** — List events in a date range (default: next 30 days)
- **create_event** — Create with attendees, location, all-day, timezone
- **accept_event** — Accept invitation with optional comment
- **decline_event** — Decline invitation with optional comment
- **cancel_event** — Cancel your event, notify attendees
- **delete_event** — Permanently delete an event

### OneDrive
- **onedrive_list** — Browse files and folders by path
- **onedrive_search** — Search files by name or content
- **onedrive_download** — Get temporary download URL
- **onedrive_upload** — Upload files (text or base64)
- **onedrive_share** — Create sharing links (view/edit/embed)
- **onedrive_create_folder** — Create folders
- **onedrive_delete** — Delete files or folders

### Mail Folders
- **list_folders** — List folders with item/unread counts
- **create_folder** — Create folder (supports nesting)
- **move_emails** — Move emails between folders

### Inbox Rules
- **list_rules** — List rules with conditions and actions
- **create_rule** — Create rules (from, subject, attachments triggers)
- **update_rule_sequence** — Change rule execution order
- **delete_rule** — Delete a rule

### Power Automate
- **flow_list_environments** — List Power Platform environments
- **flow_list** — List flows in an environment
- **flow_run** — Trigger a manual flow
- **flow_list_runs** — View flow execution history
- **flow_toggle** — Enable or disable a flow

### Auth
- **authenticate** — Start OAuth flow
- **check_auth_status** — Verify token validity
- **logout** — Clear stored tokens
- **about** — Server info and capabilities

## Security

- **Token storage**: Tokens are stored at `~/.celavii-m365-tokens.json` with `0600` permissions (owner read/write only)
- **HTML sanitization**: Email bodies are sanitized by default to prevent prompt injection attacks
- **OData escaping**: All user input in filters is properly escaped to prevent injection
- **CSRF protection**: OAuth callback validates state parameters with 10-minute expiry
- **No secrets in URLs**: Access tokens are only sent in Authorization headers

## Development

```bash
cd mcp
npm install
npm run build
npm run typecheck

# Run locally
M365_CLIENT_ID=xxx M365_CLIENT_SECRET=xxx node dist/index.js

# Watch mode
npm run dev
```

## Architecture

Built following the [celavii-toolkit](https://github.com/CelaviiHQ/celavii-toolkit) patterns:

- **TypeScript** with strict mode, ES2022 target
- **Zod** schemas for all tool input validation
- **Modular tool registration** — each module has a `registerXxxTools(server, client)` function
- **Shared GraphClient** — thin wrapper around `fetch` with automatic token refresh
- **ESM-only** build via tsup with Node 18+ support
- **npm publishable** — `npx celavii-m365` just works

```
celavii-m365/
  .claude-plugin/       Plugin manifest
  .mcp.json             MCP server config
  skills/               Agent Skills (6 domain guides)
  install.sh            Cross-IDE installer
  mcp/                  TypeScript MCP server
    src/
      index.ts          Entry point (stdio transport)
      server.ts         Server factory + tool registration
      client.ts         GraphClient (Graph API + Flow API)
      types.ts          Shared types and constants
      auth-server.ts    OAuth callback server (separate process)
      auth/
        token-store.ts  Token persistence + refresh logic
      tools/
        auth.ts         4 auth tools
        email.ts        6 email tools
        calendar.ts     6 calendar tools
        folders.ts      3 folder tools
        onedrive.ts     7 OneDrive tools
        rules.ts        4 inbox rule tools
        power-automate.ts  5 Power Automate tools
      utils/
        folders.ts      Well-known folder name resolution
        formatting.ts   Display formatters + MCP response helpers
```

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT -- see [LICENSE](LICENSE).
