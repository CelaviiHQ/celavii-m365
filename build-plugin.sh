#!/bin/bash
set -euo pipefail

# ================================================================
# Build celavii-m365 plugin ZIP for Claude Desktop upload
# ================================================================
# Creates a ready-to-upload ZIP containing:
#   - .claude-plugin/plugin.json  (plugin manifest)
#   - .mcp.json                   (MCP server config)
#   - skills/                     (6 Agent Skills)
# ================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="${1:-celavii-m365-plugin.zip}"

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

# Remove old ZIP if it exists
rm -f "$OUTPUT"

# Build ZIP
zip -r "$OUTPUT" \
  .claude-plugin/ \
  .mcp.json \
  skills/ \
  -x "*.DS_Store" \
  -x "*/.DS_Store"

echo ""
echo "✅ Plugin ZIP created: $OUTPUT"
echo "   Skills: $SKILL_COUNT"
echo ""
echo "To install:"
echo "  1. Open Claude Desktop → Plugins (+ button) → Add plugin"
echo "  2. Click 'Browse files' and select this ZIP"
echo "  3. After installing, set your Azure AD credentials in the MCP config"
