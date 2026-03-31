---
name: celavii-m365-flows
description: "Manage Power Automate flows via the Flow API. List environments and flows, manually trigger flows, view execution history, and enable/disable flows."
---

# Celavii M365 Flows Skill

Manage Power Automate flows via the celavii-m365 MCP server.

**Prerequisite**: User must be authenticated with Flow scope. The standard OAuth flow includes Graph API permissions; Power Automate uses a separate token scope (`https://service.flow.microsoft.com/.default`). If Flow tools return auth errors, the user may need to authenticate with Flow-specific scope.

## Understanding the Hierarchy

Power Automate has a strict hierarchy:

```
Organization
  └── Environment (e.g., "Default-abc123")
        └── Flow (e.g., "Send daily digest")
              └── Run (execution instance)
```

**You always need an environment ID before you can list or manage flows.**

## Tools

### m365_flow_list_environments

List available Power Platform environments. This is always the **first step**.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | | | |

**Returns per environment**: Display name, default flag, and environment ID.

Most organizations have a "Default" environment. The environment ID (in the `name` field) looks like: `Default-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### m365_flow_list

List flows in a specific environment.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `environment_id` | string | Yes | The environment ID from `m365_flow_list_environments`. |

**Returns per flow**: Display name, state (Started/Stopped), last modified date, and flow ID.

### m365_flow_run

Manually trigger a flow.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `environment_id` | string | Yes | The environment ID. |
| `flow_id` | string | Yes | The flow ID to trigger. |
| `inputs` | object | No | Optional input parameters for the flow trigger. |

**Important**: Only works with flows that have a **manual trigger** (Button trigger, HTTP trigger, etc.). Automated triggers (schedule, email arrival, etc.) cannot be manually triggered.

**Inputs**: If the flow's manual trigger accepts input parameters, pass them as a JSON object. The structure depends on how the flow was designed.

### m365_flow_list_runs

Get execution history for a flow.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `environment_id` | string | Yes | The environment ID. |
| `flow_id` | string | Yes | The flow ID. |
| `count` | integer | No | Max results (1-50). Defaults to 10. |

**Returns per run**: Status (Succeeded/Failed/Running/Cancelled), start time, end time, trigger name, and run ID.

Use this to check if a flow ran successfully after triggering it, or to debug failed flows.

### m365_flow_toggle

Enable or disable a flow.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `environment_id` | string | Yes | The environment ID. |
| `flow_id` | string | Yes | The flow ID. |
| `enabled` | boolean | Yes | `true` to enable (start), `false` to disable (stop). |

**Use cases**:
- Temporarily disable a flow during maintenance
- Re-enable a flow after fixing issues
- Emergency stop for a misbehaving flow

## Common Workflows

### Check flow status
1. `m365_flow_list_environments` → get the default environment ID
2. `m365_flow_list` → see all flows and their states
3. `m365_flow_list_runs` for a specific flow → check recent execution history

### Trigger a flow manually
1. `m365_flow_list_environments` → get environment ID
2. `m365_flow_list` → find the flow and get its ID
3. `m365_flow_run` → trigger the flow (with optional inputs)
4. Wait a moment, then `m365_flow_list_runs` → verify it succeeded

### Troubleshoot a failing flow
1. `m365_flow_list_environments` → get environment ID
2. `m365_flow_list_runs` for the problematic flow
3. Look for `Failed` status entries and their timestamps
4. Check the trigger name and timing patterns

### Emergency disable
1. `m365_flow_list_environments` → get environment ID
2. `m365_flow_toggle` with `enabled: false` → immediately stops the flow
3. After fixing the issue, `m365_flow_toggle` with `enabled: true` to re-enable

## API Details

Power Automate uses a **separate API** from Microsoft Graph:
- **Base URL**: `https://api.flow.microsoft.com`
- **API Version**: `2016-11-01` (appended as query parameter)
- **Auth**: Bearer token with scope `https://service.flow.microsoft.com/.default`

This means Flow tokens are separate from Graph API tokens. Both are stored in the same token file but managed independently.

## Notes

- Always start with `m365_flow_list_environments` to get the environment ID — you can't skip this step
- Environment IDs look like GUIDs: `Default-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Flow IDs are also GUIDs: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Only manually-triggered flows can be run via `m365_flow_run`
- Flow execution is asynchronous — `m365_flow_run` returns immediately, use `m365_flow_list_runs` to check status
- Run history shows most recent runs first
- `Succeeded`, `Failed`, `Running`, and `Cancelled` are the possible run statuses
- Power Automate may not be available in all Microsoft 365 plans
- If Flow tools return authentication errors, the user's token may not include Flow scope
