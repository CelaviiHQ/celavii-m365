#!/bin/bash
set -euo pipefail

# ================================================================
# Build celavii-m365 plugin ZIP for Claude Desktop upload
# ================================================================
# Creates a ready-to-upload ZIP containing:
#   - .claude-plugin/plugin.json  (plugin manifest)
#   - .mcp.json                   (MCP server config)
#   - skills/                     (6 Agent Skills)
#
# Usage:
#   ./build-plugin.sh                                    # interactive prompts
#   ./build-plugin.sh --client-id XXX --secret YYY       # with credentials baked in
#   ./build-plugin.sh -o my-plugin.zip --client-id XXX   # custom output path
# ================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT=""
CLIENT_ID=""
CLIENT_SECRET=""
TENANT_ID=""
TOKEN_PATH=""
HTTP_MODE=""

# Parse arguments
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o|--output)       OUTPUT="$2"; shift 2 ;;
    --client-id)       CLIENT_ID="$2"; shift 2 ;;
    --secret)          CLIENT_SECRET="$2"; shift 2 ;;
    --tenant-id)       TENANT_ID="$2"; shift 2 ;;
    --token-path)      TOKEN_PATH="$2"; shift 2 ;;
    --http)            HTTP_MODE="1"; shift ;;
    -h|--help)
      echo "Usage: ./build-plugin.sh [options]"
      echo ""
      echo "  Run without options for interactive mode (prompts for credentials)."
      echo ""
      echo "Options:"
      echo "  -o, --output <file>     Output ZIP path (default: celavii-m365-plugin.zip)"
      echo "  --client-id <id>        Azure AD Application (client) ID"
      echo "  --secret <secret>       Azure AD client secret value"
      echo "  --tenant-id <id>        Azure AD tenant ID (optional, defaults to multi-tenant)"
      echo "  --token-path <path>     Custom token storage path"
      echo "  --http                  Use HTTP transport instead of stdio"
      echo ""
      echo "Examples:"
      echo "  ./build-plugin.sh                                          # interactive"
      echo "  ./build-plugin.sh --client-id abc123 --secret xyz789       # non-interactive"
      exit 0
      ;;
    *)
      # Legacy: first positional arg is output path
      if [ -z "$OUTPUT" ]; then
        OUTPUT="$1"; shift
      else
        echo "Unknown option: $1"; exit 1
      fi
      ;;
  esac
done

# ─── Interactive mode ─────────────────────────────────────────────
# If no credentials provided and running in a terminal, prompt for them

if [ -z "$CLIENT_ID" ] && [ -z "$HTTP_MODE" ] && [ -t 0 ]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║       Celavii M365 — Plugin Builder                  ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  echo "Enter your Azure AD credentials (from Azure Portal > App registrations)."
  echo "These will be embedded in the plugin ZIP for Claude Desktop."
  echo ""

  read -rp "  Client ID:     " CLIENT_ID
  echo ""
  read -rp "  Client Secret: " CLIENT_SECRET
  echo ""
  read -rp "  Tenant ID (press Enter for multi-tenant): " TENANT_ID
  echo ""

  if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
    echo "⚠️  No credentials entered — building plugin with empty credentials."
    echo "   You can fill them in later via Claude Desktop → Customize → Connectors."
    echo ""
  fi
fi

OUTPUT="${OUTPUT:-celavii-m365-plugin.zip}"

# Resolve to absolute path if relative
case "$OUTPUT" in
  /*) ;;
  *) OUTPUT="$(pwd)/$OUTPUT" ;;
esac

cd "$SCRIPT_DIR"

# Validate plugin structure
if [ ! -f ".claude-plugin/plugin.json" ]; then
  echo "❌ Missing .claude-plugin/plugin.json"
  exit 1
fi

if [ ! -f ".mcp.json" ]; then
  echo "❌ Missing .mcp.json"
  exit 1
fi

SKILL_COUNT=$(find skills -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
if [ "$SKILL_COUNT" -eq 0 ]; then
  echo "❌ No skills found in skills/"
  exit 1
fi

# Build in a temp directory so we can inject credentials
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

cp -r .claude-plugin skills "$TMPDIR/"

# Generate .mcp.json with credentials (or empty defaults)
if [ -n "$HTTP_MODE" ]; then
  # HTTP transport — connect to running HTTP server
  cat > "$TMPDIR/.mcp.json" << EOF
{
  "mcpServers": {
    "celavii-m365": {
      "url": "http://localhost:3333/mcp"
    }
  }
}
EOF
else
  # Stdio transport — launch process directly
  # Build env block — only include TOKEN_PATH if explicitly set
  TOKEN_PATH_LINE=""
  if [ -n "$TOKEN_PATH" ]; then
    TOKEN_PATH_LINE=",
        \"M365_TOKEN_PATH\": \"${TOKEN_PATH}\""
  fi

  cat > "$TMPDIR/.mcp.json" << EOF
{
  "mcpServers": {
    "celavii-m365": {
      "command": "npx",
      "args": ["-y", "celavii-m365@latest"],
      "env": {
        "M365_CLIENT_ID": "${CLIENT_ID}",
        "M365_CLIENT_SECRET": "${CLIENT_SECRET}",
        "M365_TENANT_ID": "${TENANT_ID}"${TOKEN_PATH_LINE}
      }
    }
  }
}
EOF
fi

# Remove old ZIP if it exists
rm -f "$OUTPUT"

# Build ZIP
cd "$TMPDIR"
zip -r "$OUTPUT" \
  .claude-plugin/ \
  .mcp.json \
  skills/ \
  -x "*.DS_Store" \
  -x "*/.DS_Store"

echo ""
echo "✅ Plugin ZIP created: $OUTPUT"
echo "   Skills: $SKILL_COUNT"

if [ -n "$HTTP_MODE" ]; then
  echo "   Transport: HTTP (url: http://localhost:3333/mcp)"
else
  echo "   Transport: stdio (npx celavii-m365)"
fi

if [ -n "$CLIENT_ID" ]; then
  echo "   Credentials: included"
else
  echo "   Credentials: empty (fill in after installing)"
fi

echo ""
echo "Next steps:"
echo "  1. Open Claude Desktop"
echo "  2. Click Customize (bottom-left) → + → Upload local plugin"
echo "  3. Select this ZIP: $OUTPUT"

if [ -n "$HTTP_MODE" ]; then
  echo "  4. Start the HTTP server: npx celavii-m365-http"
  echo "  5. Open http://localhost:3333/auth in your browser to sign in"
else
  echo "  4. Start a new chat and say: \"Authenticate with Microsoft 365\""
  echo "  5. Click the auth link and sign in with your Microsoft account"
fi

echo ""
echo "  That's it! Ask Claude to read your emails, check your calendar, etc."
