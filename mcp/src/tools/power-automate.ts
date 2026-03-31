import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { FlowEnvironment, Flow, FlowRun } from '../types.js'
import { textResponse, jsonResponse } from '../utils/formatting.js'

export function registerPowerAutomateTools(server: McpServer, client: GraphClient) {
  // ─── List Environments ───────────────────────────────────────────────

  server.registerTool(
    'flow_list_environments',
    {
      title: 'List Power Automate Environments',
      description: 'List available Power Platform environments.',
      inputSchema: z.object({}),
    },
    async () => {
      const result = (await client.flowGet(
        '/providers/Microsoft.ProcessSimple/environments?api-version=2016-11-01',
      )) as { value: FlowEnvironment[] }

      const envs = result.value || []

      if (envs.length === 0) {
        return textResponse('No environments found.')
      }

      const formatted = envs
        .map(
          (env, i) =>
            `${i + 1}. ${env.properties.displayName}${env.properties.isDefault ? ' [DEFAULT]' : ''}\n` +
            `   ID: ${env.name}`,
        )
        .join('\n\n')

      return textResponse(`Found ${envs.length} environment(s):\n\n${formatted}`)
    },
  )

  // ─── List Flows ──────────────────────────────────────────────────────

  server.registerTool(
    'flow_list',
    {
      title: 'List Power Automate Flows',
      description: 'List flows in a specific environment.',
      inputSchema: z.object({
        environment_id: z.string().describe('The environment ID to list flows from.'),
      }),
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

      const formatted = flows
        .map(
          (f, i) =>
            `${i + 1}. ${f.properties.displayName}\n` +
            `   State: ${f.properties.state}\n` +
            `   Modified: ${new Date(f.properties.lastModifiedTime).toLocaleString()}\n` +
            `   ID: ${f.name}`,
        )
        .join('\n\n')

      return textResponse(`Found ${flows.length} flow(s):\n\n${formatted}`)
    },
  )

  // ─── Run Flow ────────────────────────────────────────────────────────

  server.registerTool(
    'flow_run',
    {
      title: 'Trigger Power Automate Flow',
      description: 'Manually trigger a flow. Only works with flows that have a manual trigger.',
      inputSchema: z.object({
        environment_id: z.string().describe('The environment ID.'),
        flow_id: z.string().describe('The flow ID to trigger.'),
        inputs: z
          .record(z.unknown())
          .optional()
          .describe('Optional input parameters for the flow trigger.'),
      }),
    },
    async (args) => {
      const envId = encodeURIComponent(args.environment_id)
      const flowId = encodeURIComponent(args.flow_id)

      await client.flowPost(
        `/providers/Microsoft.ProcessSimple/environments/${envId}/flows/${flowId}/triggers/manual/run?api-version=2016-11-01`,
        args.inputs || {},
      )

      return textResponse('Flow triggered successfully.')
    },
  )

  // ─── List Runs ───────────────────────────────────────────────────────

  server.registerTool(
    'flow_list_runs',
    {
      title: 'List Flow Runs',
      description: 'Get execution history for a specific flow.',
      inputSchema: z.object({
        environment_id: z.string().describe('The environment ID.'),
        flow_id: z.string().describe('The flow ID.'),
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Max results. Defaults to 10.'),
      }),
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

      return textResponse(`Found ${runs.length} run(s):\n\n${formatted}`)
    },
  )

  // ─── Toggle Flow ─────────────────────────────────────────────────────

  server.registerTool(
    'flow_toggle',
    {
      title: 'Enable/Disable Flow',
      description: 'Enable or disable a Power Automate flow.',
      inputSchema: z.object({
        environment_id: z.string().describe('The environment ID.'),
        flow_id: z.string().describe('The flow ID.'),
        enabled: z
          .boolean()
          .describe('Set to true to enable, false to disable.'),
      }),
    },
    async (args) => {
      const envId = encodeURIComponent(args.environment_id)
      const flowId = encodeURIComponent(args.flow_id)
      const action = args.enabled ? 'start' : 'stop'

      await client.flowPost(
        `/providers/Microsoft.ProcessSimple/environments/${envId}/flows/${flowId}/${action}?api-version=2016-11-01`,
      )

      return textResponse(`Flow ${args.enabled ? 'enabled' : 'disabled'} successfully.`)
    },
  )
}
