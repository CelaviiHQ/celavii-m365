#!/bin/bash
set -euo pipefail

# ================================================================
# Celavii M365 Plugin — Cross-IDE Installer
# ================================================================
# Installs skills and MCP config for:
#   - Claude Code (plugin + skills + .mcp.json)
#   - Windsurf (skills + .mcp.json)
#   - Cursor (skills + .mcp.json)
# ================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_SRC="$SCRIPT_DIR/skills"

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║   Celavii M365 Plugin — Cross-IDE Installer   ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# ---------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  echo "Usage: ./install.sh [claude|windsurf|cursor|all] [--project-dir <path>]"
  echo ""
  echo "Options:"
  echo "  claude     Install Claude Code plugin (default)"
  echo "  windsurf   Install Windsurf skills"
  echo "  cursor     Install Cursor skills"
  echo "  all        Install for all IDEs"
  echo ""
  echo "  --project-dir <path>   Target project directory (default: current dir)"
  echo ""
  echo "Prerequisites:"
  echo "  1. Azure AD app registration with Graph API permissions"
  echo "  2. M365_CLIENT_ID and M365_CLIENT_SECRET from your app registration"
  echo "  3. Node.js 18+ installed"
  exit 0
fi

IDE="${1:-all}"
shift || true

PROJECT_DIR="$(pwd)"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

INSTALLED=0

# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

copy_skills() {
  local dst="$1"
  if [ -d "$SKILLS_SRC" ]; then
    mkdir -p "$dst"
    for skill_dir in "$SKILLS_SRC"/celavii-m365-*/; do
      [ -d "$skill_dir" ] || continue
      local name
      name=$(basename "$skill_dir")
      cp -r "$skill_dir" "$dst/$name"
    done
  fi
}

count_skills() {
  local dst="$1"
  find "$dst" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' '
}

copy_mcp_json() {
  local dst="$1"
  if [ -f "$SCRIPT_DIR/.mcp.json" ]; then
    if [ -f "$dst/.mcp.json" ]; then
      echo "  ℹ️  .mcp.json already exists — merging celavii-m365 server entry"
      # Simple merge: add our server to existing config
      python3 -c "
import json, sys
with open('$dst/.mcp.json') as f:
    existing = json.load(f)
with open('$SCRIPT_DIR/.mcp.json') as f:
    ours = json.load(f)
existing.setdefault('mcpServers', {}).update(ours.get('mcpServers', {}))
with open('$dst/.mcp.json', 'w') as f:
    json.dump(existing, f, indent=2)
    f.write('\n')
" 2>/dev/null || cp "$SCRIPT_DIR/.mcp.json" "$dst/.mcp.json"
    else
      cp "$SCRIPT_DIR/.mcp.json" "$dst/.mcp.json"
    fi
  fi
}

# ---------------------------------------------------------------
# Claude Code
# ---------------------------------------------------------------

install_claude() {
  echo "▸ Installing for Claude Code..."

  local dst="$PROJECT_DIR/.claude-plugin"
  mkdir -p "$dst"

  # plugin.json
  cp "$SCRIPT_DIR/.claude-plugin/plugin.json" "$dst/plugin.json"

  # .mcp.json
  copy_mcp_json "$PROJECT_DIR"

  # Skills
  local skill_dst="$PROJECT_DIR/skills"
  copy_skills "$skill_dst"

  local skill_count
  skill_count=$(count_skills "$skill_dst")

  echo "  ✅ Claude Code: $skill_count skills, plugin.json, .mcp.json"
  INSTALLED=$((INSTALLED + 1))
}

# ---------------------------------------------------------------
# Windsurf
# ---------------------------------------------------------------

install_windsurf() {
  echo "▸ Installing for Windsurf..."

  local ws_dir="$PROJECT_DIR/.windsurf"

  # Skills
  local skill_dst="$ws_dir/skills"
  copy_skills "$skill_dst"

  # .mcp.json (Windsurf uses same format)
  copy_mcp_json "$PROJECT_DIR"

  local skill_count
  skill_count=$(count_skills "$skill_dst")

  echo "  ✅ Windsurf: $skill_count skills, .mcp.json"
  INSTALLED=$((INSTALLED + 1))
}

# ---------------------------------------------------------------
# Cursor
# ---------------------------------------------------------------

install_cursor() {
  echo "▸ Installing for Cursor..."

  local cursor_dir="$PROJECT_DIR/.cursor"

  # Skills
  local skill_dst="$cursor_dir/skills"
  copy_skills "$skill_dst"

  # .mcp.json (Cursor uses same format)
  copy_mcp_json "$PROJECT_DIR"

  local skill_count
  skill_count=$(count_skills "$skill_dst")

  echo "  ✅ Cursor: $skill_count skills, .mcp.json"
  INSTALLED=$((INSTALLED + 1))
}

# ---------------------------------------------------------------
# Execute
# ---------------------------------------------------------------

case "$IDE" in
  claude)   install_claude ;;
  windsurf) install_windsurf ;;
  cursor)   install_cursor ;;
  all)
    install_claude
    install_windsurf
    install_cursor
    ;;
  *)
    echo "Unknown IDE: $IDE"
    echo "Usage: ./install.sh [claude|windsurf|cursor|all]"
    exit 1
    ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Installed for $INSTALLED IDE(s) → $PROJECT_DIR"
echo ""
echo "Next steps:"
echo "  1. Set M365_CLIENT_ID and M365_CLIENT_SECRET in .mcp.json"
echo "     (Get these from your Azure AD app registration)"
echo "  2. Restart your IDE to load the MCP server"
echo "  3. Use the authenticate tool to complete OAuth sign-in"
echo ""
echo "Setup guide: https://github.com/CelaviiHQ/celavii-m365#quick-start"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
