# Celavii M365

Open-source MCP server for Microsoft 365 (Outlook, Calendar, OneDrive, Power Automate).

## Project Structure

- `mcp/` — TypeScript MCP server (npm package: `celavii-m365`)
- `skills/` — Agent Skills (source of truth, shared across all IDEs)
- `.claude-plugin/` — Claude Code plugin manifest
- `.mcp.json` — MCP server config (template for stdio mode)
- `setup-cowork.sh` — One-command Cowork/Chat setup (server + tunnel + plugin + auth)
- `build-plugin.sh` — Generates plugin ZIP (`--skills-only`, `--http`, stdio modes)
- `install.sh` — Cross-IDE installer (Claude Code, Windsurf, Cursor)

## Development

```bash
cd mcp
npm install
npm run build        # Build with tsup
npm run typecheck    # Type check
npm run dev          # Watch mode
npm run auth         # Run OAuth auth server
npm run http         # Run HTTP server
```

## Transport Modes

- **Stdio** (`index.ts`): Claude launches via `npx celavii-m365`. Works in Code tab.
- **HTTP Streamable** (`remote/index.ts`): Persistent server on port 3333. Works in all tabs via tunnel.
- **Standalone Auth** (`auth-server.ts`): Separate OAuth server for multi-process setups.

## Skills

Skills provide domain knowledge for AI assistants using the M365 MCP tools:

- `celavii-m365-setup` — Authentication, Azure AD setup, troubleshooting
- `celavii-m365-email` — Email operations (read, search, send, draft, organize)
- `celavii-m365-calendar` — Calendar management (events, invitations)
- `celavii-m365-onedrive` — File management (browse, upload, download, share)
- `celavii-m365-organize` — Mail organization (folders, rules, moves)
- `celavii-m365-flows` — Power Automate flow management

## Cowork Architecture

Cowork runs MCP servers in a sandboxed VM without filesystem access. The `setup-cowork.sh` script works around this by:
1. Building a skills-only plugin (no MCP server bundled)
2. Running the HTTP MCP server on the host machine
3. Creating a Cloudflare HTTPS tunnel
4. Skills come from the plugin, tools come from the custom connector
