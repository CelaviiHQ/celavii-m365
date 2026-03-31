#!/bin/bash
set -euo pipefail

# ================================================================
# Celavii M365 — Cowork Setup
# ================================================================
# One-command setup for Claude Desktop Cowork/Chat integration.
#
#   1. Builds a skills-only plugin ZIP (no MCP server bundled)
#   2. Starts the HTTP MCP server locally
#   3. Creates a Cloudflare tunnel for HTTPS
#   4. Handles OAuth authentication
#   5. Prints instructions to connect everything
#
# Usage:
#   ./setup-cowork.sh                          # interactive prompts
#   ./setup-cowork.sh --client-id XXX --secret YYY --tenant-id ZZZ
# ================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIENT_ID=""
CLIENT_SECRET=""
TENANT_ID=""
PORT="${M365_AUTH_PORT:-3333}"

# Parse arguments
while [ "$#" -gt 0 ]; do
  case "$1" in
    --client-id)   CLIENT_ID="$2"; shift 2 ;;
    --secret)      CLIENT_SECRET="$2"; shift 2 ;;
    --tenant-id)   TENANT_ID="$2"; shift 2 ;;
    --port)        PORT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: ./setup-cowork.sh [options]"
      echo ""
      echo "  Run without options for interactive mode."
      echo ""
      echo "Options:"
      echo "  --client-id <id>      Azure AD Application (client) ID"
      echo "  --secret <secret>     Azure AD client secret value"
      echo "  --tenant-id <id>      Azure AD tenant ID"
      echo "  --port <port>         HTTP port (default: 3333)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Interactive mode ─────────────────────────────────────────────
if [ -z "$CLIENT_ID" ] && [ -t 0 ]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║       Celavii M365 — Cowork Setup                    ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  echo "Enter your Azure AD credentials (from Azure Portal > App registrations)."
  echo ""

  read -rp "  Client ID:     " CLIENT_ID
  echo ""
  read -rp "  Client Secret: " CLIENT_SECRET
  echo ""
  read -rp "  Tenant ID:     " TENANT_ID
  echo ""

  if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
    echo "Error: Client ID and Client Secret are required."
    exit 1
  fi
fi

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "Error: --client-id and --secret are required."
  echo "Run with --help for usage."
  exit 1
fi

TENANT_ID="${TENANT_ID:-common}"

# ─── Check dependencies ──────────────────────────────────────────
echo ""
echo "Checking dependencies..."

if ! command -v node &>/dev/null; then
  echo "  ✗ Node.js is required. Install from https://nodejs.org"
  exit 1
fi
echo "  ✓ Node.js"

if ! command -v cloudflared &>/dev/null; then
  echo "  ✗ cloudflared not found. Installing..."
  if command -v brew &>/dev/null; then
    brew install cloudflared
  else
    echo "  Please install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
  fi
fi
echo "  ✓ cloudflared"

# ─── Build MCP server if needed ──────────────────────────────────
if [ ! -f "$SCRIPT_DIR/mcp/dist/remote/index.js" ]; then
  echo ""
  echo "Building MCP server..."
  cd "$SCRIPT_DIR/mcp"
  npm install --silent
  npm run build --silent
  cd "$SCRIPT_DIR"
  echo "  ✓ Build complete"
fi

# ─── Build skills-only plugin ────────────────────────────────────
echo ""
echo "Building skills-only plugin..."
"$SCRIPT_DIR/build-plugin.sh" --skills-only -o "$SCRIPT_DIR/celavii-m365-plugin.zip"
PLUGIN_ZIP="$SCRIPT_DIR/celavii-m365-plugin.zip"

# ─── Kill existing processes on our port ──────────────────────────
PID=$(lsof -ti :"$PORT" 2>/dev/null || true)
if [ -n "$PID" ]; then
  echo "Stopping existing process on port $PORT..."
  kill "$PID" 2>/dev/null || true
  sleep 1
fi

# ─── Start the MCP HTTP server ────────────────────────────────────
echo ""
echo "Starting MCP server..."

M365_CLIENT_ID="$CLIENT_ID" \
M365_CLIENT_SECRET="$CLIENT_SECRET" \
M365_TENANT_ID="$TENANT_ID" \
M365_AUTH_PORT="$PORT" \
node "$SCRIPT_DIR/mcp/dist/remote/index.js" &
HTTP_PID=$!

# Wait for server to be ready
for i in $(seq 1 15); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$HTTP_PID" 2>/dev/null; then
    echo "  ✗ MCP server failed to start."
    exit 1
  fi
  sleep 1
done

if ! curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
  echo "  ✗ MCP server did not become ready."
  kill "$HTTP_PID" 2>/dev/null || true
  exit 1
fi
echo "  ✓ MCP server running on port $PORT"

# ─── Start Cloudflare tunnel ─────────────────────────────────────
echo ""
echo "Starting HTTPS tunnel..."

TUNNEL_LOG=$(mktemp)
cloudflared tunnel --url "http://localhost:$PORT" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel URL
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "  ✗ Failed to create tunnel. Check cloudflared output:"
  cat "$TUNNEL_LOG"
  kill "$HTTP_PID" 2>/dev/null || true
  kill "$TUNNEL_PID" 2>/dev/null || true
  exit 1
fi
echo "  ✓ Tunnel: $TUNNEL_URL"

# ─── Handle authentication ───────────────────────────────────────
AUTH_STATUS=$(curl -sf "http://localhost:$PORT/health" 2>/dev/null \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).authenticated)}catch{console.log('false')}})" 2>/dev/null)

if [ "$AUTH_STATUS" != "true" ]; then
  echo ""
  echo "Opening browser for Microsoft 365 sign-in..."
  open "http://localhost:$PORT/auth" 2>/dev/null || echo "  Please visit: http://localhost:$PORT/auth"
  echo "  Waiting for authentication..."

  for i in $(seq 1 120); do
    AUTH_CHECK=$(curl -sf "http://localhost:$PORT/health" 2>/dev/null \
      | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).authenticated)}catch{console.log('false')}})" 2>/dev/null)
    if [ "$AUTH_CHECK" = "true" ]; then
      echo "  ✓ Authenticated!"
      break
    fi
    sleep 2
  done
else
  echo "  ✓ Already authenticated"
fi

# ─── Print instructions ──────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║          Celavii M365 — Ready for Cowork!            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Two steps to complete setup in Claude Desktop:"
echo ""
echo "  Step 1: Install the skills plugin"
echo "    → Customize → + → Upload local plugin"
echo "    → Select: $PLUGIN_ZIP"
echo ""
echo "  Step 2: Add the MCP connector"
echo "    → Customize → Connectors → + (Add custom connector)"
echo "    → Name:  celavii-m365"
echo "    → URL:   ${TUNNEL_URL}/mcp"
echo ""
echo "  Then open a Cowork chat and try:"
echo "    \"Check my latest emails\""
echo ""
echo "  ─────────────────────────────────────────────────────"
echo "  Server:  http://localhost:$PORT"
echo "  Tunnel:  $TUNNEL_URL"
echo "  Health:  $TUNNEL_URL/health"
echo "  ─────────────────────────────────────────────────────"
echo ""
echo "  Keep this terminal open. Press Ctrl+C to stop."
echo ""

# ─── Cleanup on exit ──────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$HTTP_PID" 2>/dev/null || true
  kill "$TUNNEL_PID" 2>/dev/null || true
  rm -f "$TUNNEL_LOG"
  exit 0
}

trap cleanup INT TERM

# Keep running
wait
