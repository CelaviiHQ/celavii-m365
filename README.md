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

## Installation Guide

### Prerequisites

- [Claude Desktop](https://claude.ai/download) installed
- A Microsoft 365 account (work or school)
- An Azure AD app registration (your admin may need to set this up — see [Azure Setup](#azure-ad-setup) below)

### Step 1: Download the Plugin

**Option A** — Download the generic ZIP from the [Releases page](https://github.com/CelaviiHQ/celavii-m365/releases) (you'll configure credentials after installing).

**Option B** — Build a ZIP with your credentials pre-filled:

```bash
git clone https://github.com/CelaviiHQ/celavii-m365.git
cd celavii-m365
./build-plugin.sh --client-id YOUR_CLIENT_ID --secret YOUR_SECRET --tenant-id YOUR_TENANT_ID
```

**Option C** — Build with HTTP transport (recommended for Cowork/Chat):

```bash
git clone https://github.com/CelaviiHQ/celavii-m365.git
cd celavii-m365
./build-plugin.sh --http
```

This creates a plugin ZIP that connects via HTTP instead of launching a process. See [HTTP Transport](#http-transport-recommended-for-coworkchat) below.

### Step 2: Install in Claude Desktop

1. Open **Claude Desktop**
2. Click the **Customize** button (bottom-left settings icon)
3. Under **Personal plugins**, click the **+** button
4. Select **Upload local plugin**
5. Click **Browse files** and select the `celavii-m365-plugin.zip` you downloaded
6. Click **Upload**

The plugin will appear under "Personal plugins" with 6 skills:
- `/celavii-m365-email` — Email management
- `/celavii-m365-calendar` — Calendar management
- `/celavii-m365-onedrive` — OneDrive file management
- `/celavii-m365-organize` — Folders and inbox rules
- `/celavii-m365-flows` — Power Automate flows
- `/celavii-m365-setup` — Setup and troubleshooting

### Step 3: Authenticate with Microsoft 365

The same flow works across all Claude Desktop tabs (Code, Cowork, Chat):

1. Start a new chat and ask: *"Authenticate with Microsoft 365"*
2. Claude will return a link to **http://localhost:3333/auth** — open it in your browser
3. Sign in with your Microsoft account
4. You'll see a success page — return to Claude Desktop and retry your request

The auth server runs embedded inside the MCP server (same process), so there are no CSRF issues.

**Note (Code tab):** If credentials are empty, go to **Customize** → **Celavii M365** → **Connectors** and fill in your `M365_CLIENT_ID`, `M365_CLIENT_SECRET`, and `M365_TENANT_ID`.

**Note (Cowork/Chat):** Connector settings are read-only. Build the plugin ZIP with credentials: `./build-plugin.sh --client-id YOUR_ID --secret YOUR_SECRET --tenant-id YOUR_TENANT`

### Step 4: Start Using It

Try asking Claude:

- *"Show me my latest emails"*
- *"What meetings do I have this week?"*
- *"Search my OneDrive for the Q4 report"*
- *"Draft an email to john@example.com about the project update"*
- *"Create a calendar event for tomorrow at 2pm"*

---

## Azure AD Setup

> **Note:** If you're not an IT admin, ask your Microsoft 365 administrator to do this step and share the Client ID, Client Secret, and Tenant ID with you.

1. Go to [Azure Portal > App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
3. Set a name (e.g., "Celavii M365")
4. Set **Redirect URI** to `http://localhost:3333/auth/callback` (Web platform)
5. Under **Certificates & secrets**, create a new client secret — copy the **value** (not the secret ID!)
6. Under **API permissions**, add these Microsoft Graph permissions:
   - `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`
   - `User.Read`
   - `Calendars.Read`, `Calendars.ReadWrite`
   - `Files.Read`, `Files.ReadWrite`
7. Click **Grant admin consent** (or have an admin do it)
8. Copy these three values to give to anyone installing the plugin:
   - **Application (client) ID** → this is your `M365_CLIENT_ID`
   - **Client secret value** → this is your `M365_CLIENT_SECRET`
   - **Directory (tenant) ID** → this is your `M365_TENANT_ID`

---

## HTTP Transport (Recommended for Cowork/Chat)

The HTTP server runs both the MCP protocol and OAuth authentication in a single process on your machine. This is the recommended approach for Cowork and Chat tabs, and works with Code too.

### Quick Start

```bash
# Start the HTTP server (runs on port 3333)
M365_CLIENT_ID=your-id M365_CLIENT_SECRET=your-secret npx celavii-m365-http
```

Then:
1. Open **http://localhost:3333/auth** to authenticate
2. In Claude Desktop, the plugin connects to `http://localhost:3333/mcp`

### Why HTTP instead of stdio?

| | Stdio (default) | HTTP |
|---|---|---|
| **How it works** | Claude launches `npx celavii-m365` as a subprocess | You start the server, Claude connects via HTTP |
| **Code tab** | Works | Works |
| **Cowork tab** | Auth issues (CSRF mismatch) | Works |
| **Chat tab** | Auth issues (CSRF mismatch) | Works |
| **Setup** | Automatic (Claude starts it) | Manual (you start the server) |

### HTTP .mcp.json Configuration

```json
{
  "mcpServers": {
    "celavii-m365": {
      "url": "http://localhost:3333/mcp"
    }
  }
}
```

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /mcp` | MCP Streamable HTTP (tool calls) |
| `GET /mcp` | MCP SSE stream (reconnection) |
| `DELETE /mcp` | MCP session termination |
| `GET /auth` | Start Microsoft OAuth flow |
| `GET /auth/callback` | OAuth redirect handler |
| `GET /health` | Health check (JSON) |

---

## Alternative Installation Methods

<details>
<summary><b>Claude Code CLI</b></summary>

```bash
claude plugin install --from github:CelaviiHQ/celavii-m365
```

Then set your Azure AD credentials in your project's `.mcp.json` and restart Claude Code.

</details>

<details>
<summary><b>Cross-IDE Installer Script (Claude Code, Windsurf, Cursor)</b></summary>

```bash
git clone https://github.com/CelaviiHQ/celavii-m365.git
cd celavii-m365

# Install for all IDEs
./install.sh all --project-dir /path/to/your/project

# Or a specific IDE
./install.sh claude --project-dir /path/to/your/project
./install.sh windsurf --project-dir /path/to/your/project
./install.sh cursor --project-dir /path/to/your/project
```

Then set your Azure AD credentials in the generated `.mcp.json`.

</details>

<details>
<summary><b>Manual MCP Configuration</b></summary>

Add to your IDE's MCP config (`.mcp.json` or Claude Desktop config):

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

</details>

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `M365_CLIENT_ID` | Yes | Azure AD application (client) ID |
| `M365_CLIENT_SECRET` | Yes | Azure AD client secret **value** (not the secret ID!) |
| `M365_TENANT_ID` | No | Azure AD tenant ID. Defaults to `common` (multi-tenant) |
| `M365_REDIRECT_URI` | No | OAuth callback URL. Defaults to `http://localhost:3333/auth/callback` |
| `M365_TOKEN_PATH` | No | Custom path for token storage. Defaults to `~/.celavii-m365-tokens.json` |
| `M365_AUTH_PORT` | No | Auth server port. Defaults to `3333` |

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

## Security

- **Token storage**: Tokens stored with `0600` permissions (owner read/write only)
- **HTML sanitization**: Email bodies sanitized to prevent prompt injection
- **OData escaping**: User input in filters properly escaped to prevent injection
- **CSRF protection**: OAuth state parameters validated with 10-minute expiry
- **No secrets in URLs**: Access tokens only sent in Authorization headers

## Troubleshooting

<details>
<summary><b>"Invalid state parameter" / CSRF error on sign-in</b></summary>

This happens when you click an OAuth URL from the chat but the auth callback server has a different state token. **Fix:** Don't use the URL from the chat. Instead:

1. Run `npx celavii-m365-auth` in a terminal (with your env vars)
2. Open **http://localhost:3333/auth** in your browser
3. This generates a matching state token and handles the callback correctly

</details>

<details>
<summary><b>"Plugin validation failed" when uploading ZIP</b></summary>

The Cowork and Chat tabs have stricter YAML validation than the Code tab. Make sure your SKILL.md frontmatter only has `name` and `description` — no `metadata`, `user-invocable`, or other custom fields.

</details>

<details>
<summary><b>Connector credentials are read-only (Cowork/Chat)</b></summary>

Unlike the Code tab, Cowork and Chat don't let you edit connector environment variables after installing. You must bake credentials into the ZIP:

```bash
./build-plugin.sh --client-id YOUR_ID --secret YOUR_SECRET --tenant-id YOUR_TENANT
```

Then re-upload the ZIP.

</details>

<details>
<summary><b>MCP server not connecting</b></summary>

- Make sure **Node.js 18+** is installed: `node --version`
- Check that `npx celavii-m365` works in your terminal
- Restart Claude Desktop after installing or updating the plugin
- Check **Customize** → **Connectors** to see if celavii-m365 shows a connection error

</details>

<details>
<summary><b>Token expired or auth lost</b></summary>

Tokens auto-refresh, but if they expire completely:

1. Ask Claude: *"Logout from Microsoft 365"*
2. Re-authenticate using the steps for your tab (see Step 3 above)

Or delete the token file manually: `rm ~/.celavii-m365-tokens.json`

</details>

---

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

Built with TypeScript (strict mode, ES2022), Zod validation, modular tool registration, and ESM-only build via tsup.

```
celavii-m365/
  .claude-plugin/       Plugin manifest
  .mcp.json             MCP server config
  skills/               Agent Skills (6 domain guides)
  install.sh            Cross-IDE installer
  build-plugin.sh       Generates plugin ZIP
  mcp/                  TypeScript MCP server
    src/
      index.ts          Entry point (stdio transport)
      server.ts         Server factory + tool registration
      client.ts         GraphClient (Graph API + Flow API)
      types.ts          Shared types and constants
      auth-server.ts    OAuth callback server
      auth/token-store.ts  Token persistence + refresh
      tools/            35 MCP tools across 7 modules
      utils/            Folder resolution + formatters
```

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT — see [LICENSE](LICENSE).
