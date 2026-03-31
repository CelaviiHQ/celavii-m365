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
#   ./build-plugin.sh                                    # generic (empty credentials)
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
      echo "Options:"
      echo "  -o, --output <file>     Output ZIP path (default: celavii-m365-plugin.zip)"
      echo "  --client-id <id>        Azure AD Application (client) ID"
      echo "  --secret <secret>       Azure AD client secret value"
      echo "  --tenant-id <id>        Azure AD tenant ID (optional)"
      echo "  --token-path <path>     Absolute path to token file (recommended for Cowork/Chat)"
      echo "  --http                  Use HTTP transport (recommended for Cowork/Chat)"
      echo ""
      echo "Examples:"
      echo "  ./build-plugin.sh"
      echo "  ./build-plugin.sh --client-id abc123 --secret xyz789"
      echo "  ./build-plugin.sh --client-id abc123 --secret xyz789 --token-path \$HOME/.celavii-m365-tokens.json"
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
  cat > "$TMPDIR/.mcp.json" << EOF
{
  "mcpServers": {
    "celavii-m365": {
      "command": "npx",
      "args": ["-y", "celavii-m365"],
      "env": {
        "M365_CLIENT_ID": "${CLIENT_ID}",
        "M365_CLIENT_SECRET": "${CLIENT_SECRET}",
        "M365_TENANT_ID": "${TENANT_ID}",
        "M365_TOKEN_PATH": "${TOKEN_PATH}"
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
echo "To install:"
echo "  1. Open Claude Desktop → Customize → + (Add plugin)"
echo "  2. Click 'Browse files' and select this ZIP"

if [ -n "$HTTP_MODE" ]; then
  echo "  3. Start the HTTP server: npx celavii-m365-http"
  echo "  4. Open http://localhost:3333/auth in your browser to authenticate"
  echo "  5. Start a new chat — all tools are ready"
else
  echo "  3. Start a new chat and ask Claude to authenticate with Microsoft 365"
fi
