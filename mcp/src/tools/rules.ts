import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { InboxRule } from '../types.js'
import { textResponse, jsonResponse, actionResponse } from '../utils/formatting.js'

const accountIdField = z
  .string()
  .optional()
  .describe('Email/UPN of the M365 account to target. Defaults to the configured default account.')

export function registerRuleTools(server: McpServer, client: GraphClient) {
  // ─── List Rules ──────────────────────────────────────────────────────

  server.registerTool(
    'm365_list_rules',
    {
      title: 'List Inbox Rules',
      description: 'List all inbox rules in Microsoft 365 with their conditions, actions, and execution order. Use detailed=true to see full rule configuration as JSON.',
      inputSchema: z.object({
        detailed: z
          .boolean()
          .optional()
          .describe('If true, return full conditions and actions for each rule as JSON.'),
        account_id: accountIdField,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const rules = (await client.graphGetPaginated(
        '/me/mailFolders/inbox/messageRules',
        undefined,
        50,
        args.account_id,
      )) as InboxRule[]

      if (rules.length === 0) {
        return textResponse('No inbox rules found.')
      }

      if (args.detailed) {
        return jsonResponse(rules)
      }

      const formatted = rules
        .sort((a, b) => a.sequence - b.sequence)
        .map(
          (r, i) =>
            `${i + 1}. ${r.displayName}\n` +
            `   Sequence: ${r.sequence} | Enabled: ${r.isEnabled}\n` +
            `   ID: ${r.id}`,
        )
        .join('\n\n')

      return {
        content: [{ type: 'text' as const, text: `Found ${rules.length} rule(s):\n\n${formatted}` }],
        structuredContent: { total: rules.length, count: rules.length },
      }
    },
  )

  // ─── Create Rule ─────────────────────────────────────────────────────

  server.registerTool(
    'm365_create_rule',
    {
      title: 'Create Inbox Rule',
      description:
        'Create a new inbox rule in Microsoft 365 with conditions (from address, subject keywords, attachments) and actions (move to folder, mark as read). Use m365_list_folders to get folder IDs for move_to_folder.',
      inputSchema: z.object({
        name: z.string().describe('Display name for the rule.'),
        enabled: z
          .boolean()
          .optional()
          .describe('Whether the rule is enabled. Defaults to true.'),
        from_addresses: z
          .array(z.string())
          .optional()
          .describe('Trigger when email is from these addresses.'),
        subject_contains: z
          .array(z.string())
          .optional()
          .describe('Trigger when subject contains these strings.'),
        has_attachments: z
          .boolean()
          .optional()
          .describe('Trigger when email has attachments.'),
        move_to_folder: z
          .string()
          .optional()
          .describe('Folder ID to move matching emails to. Use m365_list_folders to find folder IDs.'),
        mark_as_read: z
          .boolean()
          .optional()
          .describe('Mark matching emails as read.'),
        stop_processing: z
          .boolean()
          .optional()
          .describe('Stop processing more rules after this one matches. Defaults to false.'),
        account_id: accountIdField,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const rule: Record<string, unknown> = {
        displayName: args.name,
        isEnabled: args.enabled !== false,
        sequence: 10,
        stopProcessingRules: args.stop_processing || false,
        conditions: {},
        actions: {},
      }

      const conditions: Record<string, unknown> = {}
      if (args.from_addresses?.length) {
        conditions.senderContains = args.from_addresses
      }
      if (args.subject_contains?.length) {
        conditions.subjectContains = args.subject_contains
      }
      if (args.has_attachments !== undefined) {
        conditions.hasAttachments = args.has_attachments
      }
      rule.conditions = conditions

      const actions: Record<string, unknown> = {}
      if (args.move_to_folder) {
        actions.moveToFolder = args.move_to_folder
      }
      if (args.mark_as_read) {
        actions.markAsRead = true
      }
      rule.actions = actions

      const result = (await client.graphPost(
        '/me/mailFolders/inbox/messageRules',
        rule,
        args.account_id,
      )) as InboxRule

      return actionResponse(
        `Rule "${result.displayName}" created.\nSequence: ${result.sequence}\nID: ${result.id}`,
        { created: true, id: result.id, name: result.displayName, sequence: result.sequence },
      )
    },
  )

  // ─── Update Rule Sequence ────────────────────────────────────────────

  server.registerTool(
    'm365_update_rule_sequence',
    {
      title: 'Update Rule Sequence',
      description: 'Change the execution order of an inbox rule in Microsoft 365. Lower sequence numbers run first.',
      inputSchema: z.object({
        id: z.string().describe('The rule ID to update.'),
        sequence: z
          .number()
          .int()
          .min(1)
          .describe('New sequence number (lower = runs first).'),
        account_id: accountIdField,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      await client.graphPatch(
        `/me/mailFolders/inbox/messageRules/${encodeURIComponent(args.id)}`,
        { sequence: args.sequence },
        args.account_id,
      )
      return actionResponse(
        `Rule sequence updated to ${args.sequence}.`,
        { updated: true, id: args.id, sequence: args.sequence },
      )
    },
  )

  // ─── Delete Rule ─────────────────────────────────────────────────────

  server.registerTool(
    'm365_delete_rule',
    {
      title: 'Delete Inbox Rule',
      description: 'Permanently delete an inbox rule from Microsoft 365. This action cannot be undone.',
      inputSchema: z.object({
        id: z.string().describe('The rule ID to delete.'),
        account_id: accountIdField,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      await client.graphDelete(
        `/me/mailFolders/inbox/messageRules/${encodeURIComponent(args.id)}`,
        args.account_id,
      )
      return actionResponse('Rule deleted.', { deleted: true, id: args.id })
    },
  )
}
