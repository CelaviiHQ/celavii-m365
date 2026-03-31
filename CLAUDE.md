# Celavii M365

Open-source MCP server for Microsoft 365 (Outlook, Calendar, OneDrive, Power Automate).

## Project Structure

- `mcp/` — TypeScript MCP server (npm package: `celavii-m365`)
- `plugin/` — IDE plugin configs and skill distribution
- `skills/` — Agent Skills (source of truth)

## Development

```bash
cd mcp
npm install
npm run build        # Build with tsup
npm run typecheck    # Type check
npm run dev          # Watch mode
npm run auth         # Run OAuth auth server
```

## Skills

Skills provide domain knowledge for AI assistants using the M365 MCP tools:

- `celavii-m365-setup` — Authentication, Azure AD setup, troubleshooting
- `celavii-m365-email` — Email operations (read, search, send, draft, organize)
- `celavii-m365-calendar` — Calendar management (events, invitations)
- `celavii-m365-onedrive` — File management (browse, upload, download, share)
- `celavii-m365-organize` — Mail organization (folders, rules, moves)
- `celavii-m365-flows` — Power Automate flow management
