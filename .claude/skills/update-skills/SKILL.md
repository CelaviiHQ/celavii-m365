---
name: update-skills
description: "Update SKILL.md files for the celavii-m365 plugin. Handles tool name references, rebuilds the plugin ZIP, and reminds to re-upload to Cowork."
---

# Update Skills Workflow

Use this when modifying the celavii-m365 skills (SKILL.md files).

## Skill Files

All skills live under `skills/` in the repo root:

```
skills/
├── celavii-m365-setup/SKILL.md      — Auth, Azure AD setup, troubleshooting
├── celavii-m365-email/SKILL.md      — Email operations
├── celavii-m365-calendar/SKILL.md   — Calendar management
├── celavii-m365-onedrive/SKILL.md   — OneDrive file management
├── celavii-m365-organize/SKILL.md   — Folders, rules, mail organization
└── celavii-m365-flows/SKILL.md      — Power Automate flows
```

## Rules

1. **All tool names use the `m365_` prefix** — e.g., `m365_list_emails`, not `list_emails`
2. **Keep descriptions actionable** — tell the agent what to ask the user, not just what the tool does
3. **Cross-reference related tools** — e.g., "Use `m365_list_folders` to get folder IDs for `move_to_folder`"
4. **Include common workflows** — step-by-step guides for multi-tool tasks

## Steps After Editing Skills

1. **Rebuild the plugin ZIP:**
   ```bash
   ./build-plugin.sh --skills-only
   ```

2. **Re-upload to Cowork** (if using Cowork):
   - Claude Desktop → Customize → find celavii-m365 plugin → Remove
   - Customize → + → Upload local plugin → select `celavii-m365-plugin.zip`

3. **Start a new chat** — old sessions won't pick up skill changes

4. **Commit:**
   ```bash
   git add skills/
   git commit -m "Update skills: <describe changes>"
   ```

## Testing Skills

After uploading the new plugin, test in a new Cowork chat by asking Claude to perform the workflow you updated. Check that:
- Claude finds the right tools
- Claude asks the right questions (e.g., Teams link for meetings)
- Descriptions guide Claude to the correct sequence of tool calls
