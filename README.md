# Celavii M365

Connect Microsoft 365 to Claude — read emails, manage your calendar, browse OneDrive files, organize your inbox, and control Power Automate flows, all from inside Claude Desktop.

**35 tools** across 7 modules, fully typed with Zod validation.

| Module | What you can do |
|--------|----------------|
| **Email** | Read, search, send, draft, mark read, organize |
| **Calendar** | List, create, accept, decline, cancel, delete events |
| **OneDrive** | Browse, search, upload, download, share files |
| **Folders** | List, create mail folders, move emails |
| **Rules** | List, create, reorder, delete inbox rules |
| **Power Automate** | List environments, list/run/toggle flows, view run history |
| **Auth** | Authenticate, check status, logout, about |

---

## Quick Start

### Prerequisites

- [Claude Desktop](https://claude.ai/download) installed
- A Microsoft 365 account (work or school)
- An Azure AD app registration ([setup guide](#azure-ad-setup))
- Node.js 18+

### Option A: Cowork / Chat (recommended)

The Cowork and Chat tabs run MCP servers in a sandbox that can't access local files. This setup runs a persistent HTTP server on your machine and connects via a Cloudflare HTTPS tunnel.

```bash
git clone https://github.com/CelaviiHQ/celavii-m365.git
cd celavii-m365
./setup-cowork.sh
```

The script will:
1. Prompt for your Azure AD credentials
2. Build the MCP server and skills plugin
3. Start an HTTP server + HTTPS tunnel
4. Open your browser for Microsoft sign-in
5. Print two setup steps for Claude Desktop

**Requirements:** `node`, `cloudflared` (auto-installed via Homebrew if missing)

### Option B: Code tab (plugin)

The Code tab runs MCP servers locally with full filesystem access. A single plugin ZIP handles everything.

```bash
git clone https://github.com/CelaviiHQ/celavii-m365.git
cd celavii-m365
./build-plugin.sh --client-id YOUR_CLIENT_ID --secret YOUR_SECRET --tenant-id YOUR_TENANT_ID
```

Then in Claude Desktop:
1. **Customize** → **+** → **Upload local plugin**
2. Select `celavii-m365-plugin.zip`
3. Start a chat and say: *"Authenticate with Microsoft 365"*
4. Click the auth link, sign in, and you're set

### Option C: Claude Code CLI

```bash
claude mcp add --transport stdio --scope user \
  --env M365_CLIENT_ID=YOUR_ID \
  --env M365_CLIENT_SECRET=YOUR_SECRET \
  --env M365_TENANT_ID=YOUR_TENANT \
  celavii-m365 -- npx -y celavii-m365@latest
```

---

## Azure AD Setup

> **Note:** If you're not an IT admin, ask your Microsoft 365 administrator to do this step and share the Client ID, Client Secret, and Tenant ID with you.

1. Go to [Azure Portal > App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
3. Set a name (e.g., "Celavii M365 MCP")
4. Set **Redirect URI** to `http://localhost:3333/auth/callback` (Web platform)
5. Under **Certificates & secrets**, create a new client secret — copy the **value** (not the secret ID!)
6. Under **API permissions**, add these Microsoft Graph permissions:
   - `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`
   - `User.Read`
   - `Calendars.Read`, `Calendars.ReadWrite`
   - `Files.Read`, `Files.ReadWrite`
7. Click **Grant admin consent** (or have an admin do it)
8. Copy these three values:
   - **Application (client) ID** → `M365_CLIENT_ID`
   - **Client secret value** → `M365_CLIENT_SECRET`
   - **Directory (tenant) ID** → `M365_TENANT_ID`

---

## How It Works

### Architecture

The MCP server supports two transport modes:

| | Stdio | HTTP Streamable |
|---|---|---|
| **How it runs** | Claude launches `npx celavii-m365` as a subprocess | You start the server, Claude connects via HTTPS |
| **Code tab** | Works | Works |
| **Cowork / Chat** | Sandbox blocks filesystem access | Works (via Cloudflare tunnel) |
| **Auth server** | Embedded, dies between calls | Persistent, always available |
| **Setup** | `build-plugin.sh` | `setup-cowork.sh` |

### Cowork Setup Flow

```
./setup-cowork.sh
       │
       ├── npm install && npm run build (if needed)
       ├── build-plugin.sh --skills-only → plugin ZIP (skills only, no MCP)
       ├── Start HTTP MCP server (port 3333)
       ├── cloudflared tunnel → https://xxx.trycloudflare.com
       ├── Open browser for OAuth sign-in
       │
       └── Output:
             1. Upload plugin ZIP for skills
             2. Add custom connector: https://xxx.trycloudflare.com/mcp
```

### HTTP Server Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /mcp` | MCP Streamable HTTP (tool calls) |
| `GET /mcp` | MCP SSE stream (reconnection) |
| `DELETE /mcp` | MCP session termination |
| `GET /auth` | Start Microsoft OAuth flow |
| `GET /auth/callback` | OAuth redirect handler |
| `GET /health` | Health check (JSON) |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `M365_CLIENT_ID` | Yes | Azure AD application (client) ID |
| `M365_CLIENT_SECRET` | Yes | Azure AD client secret **value** (not the secret ID!) |
| `M365_TENANT_ID` | No | Azure AD tenant ID. Defaults to `common` (multi-tenant) |
| `M365_REDIRECT_URI` | No | OAuth callback URL. Defaults to `http://localhost:3333/auth/callback` |
| `M365_TOKEN_PATH` | No | Custom path for token storage. Defaults to `~/.celavii-m365-tokens.json` |
| `M365_AUTH_PORT` | No | HTTP server port. Defaults to `3333` |

## All 35 Tools

<details>
<summary><b>Click to expand full tool list</b></summary>

### Email (6 tools)
- **list_emails** — List emails with folder, count, skip, unread filters
- **search_emails** — Search by query, sender, subject, attachments, read status
- **read_email** — Read full email content (HTML auto-sanitized for security)
- **send_email** — Send with To/CC/BCC, HTML auto-detection, importance levels
- **draft_email** — Create draft without sending
- **mark_as_read** — Mark one or more emails as read/unread

### Calendar (6 tools)
- **list_events** — List events in a date range (default: next 30 days)
- **create_event** — Create with attendees, location, all-day, timezone
- **accept_event** — Accept invitation with optional comment
- **decline_event** — Decline invitation with optional comment
- **cancel_event** — Cancel your event, notify attendees
- **delete_event** — Permanently delete an event

### OneDrive (7 tools)
- **onedrive_list** — Browse files and folders by path
- **onedrive_search** — Search files by name or content
- **onedrive_download** — Get temporary download URL
- **onedrive_upload** — Upload files (text or base64)
- **onedrive_share** — Create sharing links (view/edit/embed)
- **onedrive_create_folder** — Create folders
- **onedrive_delete** — Delete files or folders

### Mail Folders (3 tools)
- **list_folders** — List folders with item/unread counts
- **create_folder** — Create folder (supports nesting)
- **move_emails** — Move emails between folders

### Inbox Rules (4 tools)
- **list_rules** — List rules with conditions and actions
- **create_rule** — Create rules (from, subject, attachments triggers)
- **update_rule_sequence** — Change rule execution order
- **delete_rule** — Delete a rule

### Power Automate (5 tools)
- **flow_list_environments** — List Power Platform environments
- **flow_list** — List flows in an environment
- **flow_run** — Trigger a manual flow
- **flow_list_runs** — View flow execution history
- **flow_toggle** — Enable or disable a flow

### Auth (4 tools)
- **authenticate** — Start OAuth flow
- **check_auth_status** — Verify token validity
- **logout** — Clear stored tokens
- **about** — Server info and capabilities

</details>

## Scripts

| Script | Purpose |
|--------|---------|
| `setup-cowork.sh` | One-command Cowork/Chat setup (server + tunnel + plugin + auth) |
| `build-plugin.sh` | Build plugin ZIP (supports `--skills-only`, `--http`, stdio modes) |
| `install.sh` | Cross-IDE installer (Claude Code, Windsurf, Cursor) |

## Security

- **Token storage**: Tokens stored with `0600` permissions (owner read/write only)
- **HTML sanitization**: Email bodies sanitized to prevent prompt injection
- **OData escaping**: User input in filters properly escaped to prevent injection
- **CSRF protection**: OAuth state parameters validated with 10-minute expiry
- **No secrets in URLs**: Access tokens only sent in Authorization headers

## Troubleshooting

<details>
<summary><b>Cowork says "Not authenticated" after signing in</b></summary>

Cowork runs MCP servers in a sandbox without filesystem access. The stdio plugin can't read the token file. Use `setup-cowork.sh` instead, which runs a persistent HTTP server outside the sandbox and connects via a Cloudflare tunnel.

</details>

<details>
<summary><b>"Failed to add connector" (HTTPS required)</b></summary>

Claude Desktop custom connectors require HTTPS URLs. The `setup-cowork.sh` script handles this automatically using a Cloudflare tunnel. If you're running the HTTP server manually, you need to set up your own HTTPS proxy or tunnel.

</details>

<details>
<summary><b>Auth server port already in use</b></summary>

Another process is using port 3333. Check with `lsof -i :3333` and kill it, or set a different port: `M365_AUTH_PORT=3334 ./setup-cowork.sh ...`

</details>

<details>
<summary><b>Token expired or auth lost</b></summary>

Tokens auto-refresh, but if they expire completely:

1. Ask Claude: *"Logout from Microsoft 365"*
2. Re-authenticate (visit `http://localhost:3333/auth` if using HTTP mode)

Or delete the token file manually: `rm ~/.celavii-m365-tokens.json`

</details>

<details>
<summary><b>MCP server not connecting</b></summary>

- Make sure **Node.js 18+** is installed: `node --version`
- Check that `npx celavii-m365` works in your terminal
- Restart Claude Desktop after installing or updating the plugin
- Check **Customize** → **Connectors** to see if celavii-m365 shows a connection error

</details>

---

## Development

```bash
cd mcp
npm install
npm run build        # Build with tsup
npm run typecheck    # Type check
npm run dev          # Watch mode
```

## Project Structure

```
celavii-m365/
  .claude-plugin/       Plugin manifest
  .mcp.json             MCP server config (template)
  skills/               6 Agent Skills (domain guides)
  setup-cowork.sh       Cowork/Chat one-command setup
  build-plugin.sh       Plugin ZIP builder
  install.sh            Cross-IDE installer
  mcp/                  TypeScript MCP server
    src/
      index.ts          Stdio entry point + embedded auth server
      remote/index.ts   HTTP Streamable entry point
      server.ts         Server factory + tool registration
      client.ts         GraphClient (Graph API + Flow API)
      types.ts          Shared types and constants
      auth-server.ts    Standalone OAuth server
      auth/token-store.ts  Token persistence + refresh
      tools/            35 MCP tools across 7 modules
      utils/            Folder resolution + formatters
```

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT — see [LICENSE](LICENSE).
