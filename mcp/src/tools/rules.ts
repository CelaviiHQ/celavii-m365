import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { InboxRule } from '../types.js'
import { textResponse, jsonResponse } from '../utils/formatting.js'

export function registerRuleTools(server: McpServer, client: GraphClient) {
  // ─── List Rules ──────────────────────────────────────────────────────

  server.registerTool(
    'list_rules',
    {
      title: 'List Inbox Rules',
      description: 'List all inbox rules with their conditions and actions.',
      inputSchema: z.object({
        detailed: z
          .boolean()
          .optional()
          .describe('If true, include full conditions and actions for each rule.'),
      }),
    },
    async (args) => {
      const rules = (await client.graphGetPaginated('/me/mailFolders/inbox/messageRules')) as InboxRule[]

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

      return textResponse(`Found ${rules.length} rule(s):\n\n${formatted}`)
    },
  )

  // ─── Create Rule ─────────────────────────────────────────────────────

  server.registerTool(
    'create_rule',
    {
      title: 'Create Inbox Rule',
      description:
        'Create a new inbox rule with conditions (from, subject, attachments) and actions (move, mark read, etc.).',
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
          .describe('Folder ID to move matching emails to.'),
        mark_as_read: z
          .boolean()
          .optional()
          .describe('Mark matching emails as read.'),
        stop_processing: z
          .boolean()
          .optional()
          .describe('Stop processing more rules. Defaults to false.'),
      }),
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

      // Build conditions
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

      // Build actions
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
      )) as InboxRule

      return textResponse(
        `Rule "${result.displayName}" created.\nSequence: ${result.sequence}\nID: ${result.id}`,
      )
    },
  )

  // ─── Update Rule Sequence ────────────────────────────────────────────

  server.registerTool(
    'update_rule_sequence',
    {
      title: 'Update Rule Sequence',
      description: 'Change the execution order of an inbox rule.',
      inputSchema: z.object({
        id: z.string().describe('The rule ID to update.'),
        sequence: z
          .number()
          .int()
          .min(1)
          .describe('New sequence number (lower = runs first).'),
      }),
    },
    async (args) => {
      await client.graphPatch(
        `/me/mailFolders/inbox/messageRules/${encodeURIComponent(args.id)}`,
        { sequence: args.sequence },
      )
      return textResponse(`Rule sequence updated to ${args.sequence}.`)
    },
  )

  // ─── Delete Rule ─────────────────────────────────────────────────────

  server.registerTool(
    'delete_rule',
    {
      title: 'Delete Inbox Rule',
      description: 'Delete an inbox rule.',
      inputSchema: z.object({
        id: z.string().describe('The rule ID to delete.'),
      }),
    },
    async (args) => {
      await client.graphDelete(
        `/me/mailFolders/inbox/messageRules/${encodeURIComponent(args.id)}`,
      )
      return textResponse('Rule deleted.')
    },
  )
}
