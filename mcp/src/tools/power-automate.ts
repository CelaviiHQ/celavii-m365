import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { FlowEnvironment, Flow, FlowRun } from '../types.js'
import { textResponse, actionResponse } from '../utils/formatting.js'

export function registerPowerAutomateTools(server: McpServer, client: GraphClient) {
  // ─── List Environments ───────────────────────────────────────────────

  server.registerTool(
    'm365_flow_list_environments',
    {
      title: 'List Power Automate Environments',
      description: 'List available Power Platform environments for Microsoft 365. Returns environment name, ID, and default status. Use the environment ID with other flow tools.',
      inputSchema: z.object({
        response_format: z
          .enum(['text', 'json'])
          .optional()
          .describe("Output format: 'text' for human-readable (default), 'json' for structured data."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = (await client.flowGet(
        '/providers/Microsoft.ProcessSimple/environments?api-version=2016-11-01',
      )) as { value: FlowEnvironment[] }

      const envs = result.value || []

      if (envs.length === 0) {
        return textResponse('No environments found.')
      }

      if (args.response_format === 'json') {
        const structured = {
          total: envs.length,
          environments: envs.map((env) => ({
            id: env.name,
            name: env.properties.displayName,
            isDefault: env.properties.isDefault,
          })),
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        }
      }

      const formatted = envs
        .map(
          (env, i) =>
            `${i + 1}. ${env.properties.displayName}${env.properties.isDefault ? ' [DEFAULT]' : ''}\n` +
            `   ID: ${env.name}`,
        )
        .join('\n\n')

      return {
        content: [{ type: 'text' as const, text: `Found ${envs.length} environment(s):\n\n${formatted}` }],
        structuredContent: { total: envs.length },
      }
    },
  )

  // ─── List Flows ──────────────────────────────────────────────────────

  server.registerTool(
    'm365_flow_list',
    {
      title: 'List Power Automate Flows',
      description: 'List flows in a specific Power Platform environment. Returns flow name, state, last modified date, and flow ID. Use m365_flow_list_environments first to get the environment ID.',
      inputSchema: z.object({
        environment_id: z.string().describe('The environment ID (from m365_flow_list_environments).'),
        response_format: z
          .enum(['text', 'json'])
          .optional()
          .describe("Output format: 'text' for human-readable (default), 'json' for structured data."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const envId = encodeURIComponent(args.environment_id)
      const result = (await client.flowGet(
        `/providers/Microsoft.ProcessSimple/environments/${envId}/flows?api-version=2016-11-01`,
      )) as { value: Flow[] }

      const flows = result.value || []

      if (flows.length === 0) {
        return textResponse('No flows found in this environment.')
      }

      if (args.response_format === 'json') {
        const structured = {
          total: flows.length,
          flows: flows.map((f) => ({
            id: f.name,
            name: f.properties.displayName,
            state: f.properties.state,
            lastModified: f.properties.lastModifiedTime,
          })),
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        }
      }

      const formatted = flows
        .map(
          (f, i) =>
            `${i + 1}. ${f.properties.displayName}\n` +
            `   State: ${f.properties.state}\n` +
            `   Modified: ${new Date(f.properties.lastModifiedTime).toLocaleString()}\n` +
            `   ID: ${f.name}`,
        )
        .join('\n\n')

      return {
        content: [{ type: 'text' as const, text: `Found ${flows.length} flow(s):\n\n${formatted}` }],
        structuredContent: { total: flows.length },
      }
    },
  )

  // ─── Run Flow ────────────────────────────────────────────────────────

  server.registerTool(
    'm365_flow_run',
    {
      title: 'Trigger Power Automate Flow',
      description: 'Manually trigger a Power Automate flow. Only works with flows that have a manual trigger. Use m365_flow_list to find the flow ID.',
      inputSchema: z.object({
        environment_id: z.string().describe('The environment ID.'),
        flow_id: z.string().describe('The flow ID to trigger.'),
        inputs: z
          .record(z.unknown())
          .optional()
          .describe('Optional input parameters for the flow trigger (key-value pairs).'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const envId = encodeURIComponent(args.environment_id)
      const flowId = encodeURIComponent(args.flow_id)

      await client.flowPost(
        `/providers/Microsoft.ProcessSimple/environments/${envId}/flows/${flowId}/triggers/manual/run?api-version=2016-11-01`,
        args.inputs || {},
      )

      return actionResponse('Flow triggered successfully.', { triggered: true, flowId: args.flow_id })
    },
  )

  // ─── List Runs ───────────────────────────────────────────────────────

  server.registerTool(
    'm365_flow_list_runs',
    {
      title: 'List Flow Runs',
      description: 'Get execution history for a specific Power Automate flow. Returns run status, start/end times, and trigger info.',
      inputSchema: z.object({
        environment_id: z.string().describe('The environment ID.'),
        flow_id: z.string().describe('The flow ID.'),
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Max results (1-50). Defaults to 10.'),
        response_format: z
          .enum(['text', 'json'])
          .optional()
          .describe("Output format: 'text' for human-readable (default), 'json' for structured data."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const envId = encodeURIComponent(args.environment_id)
      const flowId = encodeURIComponent(args.flow_id)
      const top = args.count || 10

      const result = (await client.flowGet(
        `/providers/Microsoft.ProcessSimple/environments/${envId}/flows/${flowId}/runs?api-version=2016-11-01&$top=${top}`,
      )) as { value: FlowRun[] }

      const runs = result.value || []

      if (runs.length === 0) {
        return textResponse('No run history found for this flow.')
      }

      if (args.response_format === 'json') {
        const structured = {
          total: runs.length,
          runs: runs.map((r) => ({
            id: r.name,
            status: r.properties.status,
            startTime: r.properties.startTime,
            endTime: r.properties.endTime,
            trigger: r.properties.trigger.name,
          })),
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        }
      }

      const formatted = runs
        .map(
          (r, i) =>
            `${i + 1}. ${r.properties.status}\n` +
            `   Started: ${new Date(r.properties.startTime).toLocaleString()}\n` +
            (r.properties.endTime
              ? `   Ended: ${new Date(r.properties.endTime).toLocaleString()}\n`
              : '') +
            `   Trigger: ${r.properties.trigger.name}\n` +
            `   Run ID: ${r.name}`,
        )
        .join('\n\n')

      return {
        content: [{ type: 'text' as const, text: `Found ${runs.length} run(s):\n\n${formatted}` }],
        structuredContent: { total: runs.length },
      }
    },
  )

  // ─── Toggle Flow ─────────────────────────────────────────────────────

  server.registerTool(
    'm365_flow_toggle',
    {
      title: 'Enable/Disable Flow',
      description: 'Enable or disable a Power Automate flow. Disabled flows will not run until re-enabled.',
      inputSchema: z.object({
        environment_id: z.string().describe('The environment ID.'),
        flow_id: z.string().describe('The flow ID.'),
        enabled: z
          .boolean()
          .describe('Set to true to enable, false to disable the flow.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const envId = encodeURIComponent(args.environment_id)
      const flowId = encodeURIComponent(args.flow_id)
      const action = args.enabled ? 'start' : 'stop'

      await client.flowPost(
        `/providers/Microsoft.ProcessSimple/environments/${envId}/flows/${flowId}/${action}?api-version=2016-11-01`,
      )

      return actionResponse(
        `Flow ${args.enabled ? 'enabled' : 'disabled'} successfully.`,
        { toggled: true, flowId: args.flow_id, enabled: args.enabled },
      )
    },
  )
}
