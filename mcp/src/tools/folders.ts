import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { MailFolder } from '../types.js'
import { textResponse, actionResponse, batchResponse } from '../utils/formatting.js'
import { resolveMailFolder } from '../utils/folders.js'

export function registerFolderTools(server: McpServer, client: GraphClient) {
  // ─── List Folders ────────────────────────────────────────────────────

  server.registerTool(
    'm365_list_folders',
    {
      title: 'List Mail Folders',
      description:
        'List all mail folders in Microsoft 365 with their total item counts, unread counts, and sub-folder counts. Optionally list child folders of a specific parent.',
      inputSchema: z.object({
        parent_folder: z
          .string()
          .optional()
          .describe('Parent folder name (inbox, sent, drafts, etc.) or folder ID to list child folders of. Defaults to top-level folders.'),
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
      const path = args.parent_folder
        ? `${resolveMailFolder(args.parent_folder)}/childFolders`
        : '/me/mailFolders'

      const folders = (await client.graphGetPaginated(path, {
        $top: '100',
      })) as MailFolder[]

      if (folders.length === 0) {
        return textResponse('No folders found.')
      }

      if (args.response_format === 'json') {
        const structured = {
          total: folders.length,
          count: folders.length,
          folders: folders.map((f) => ({
            id: f.id,
            name: f.displayName,
            totalItems: f.totalItemCount,
            unreadItems: f.unreadItemCount,
            childFolders: f.childFolderCount,
          })),
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        }
      }

      const formatted = folders
        .map(
          (f, i) =>
            `${i + 1}. ${f.displayName}\n` +
            `   Total: ${f.totalItemCount} | Unread: ${f.unreadItemCount} | Sub-folders: ${f.childFolderCount}\n` +
            `   ID: ${f.id}`,
        )
        .join('\n\n')

      return {
        content: [{ type: 'text' as const, text: `Found ${folders.length} folder(s):\n\n${formatted}` }],
        structuredContent: { total: folders.length, count: folders.length },
      }
    },
  )

  // ─── Create Folder ───────────────────────────────────────────────────

  server.registerTool(
    'm365_create_folder',
    {
      title: 'Create Mail Folder',
      description: 'Create a new mail folder in Microsoft 365, optionally inside a parent folder. Use for organizing your inbox.',
      inputSchema: z.object({
        name: z.string().describe('Name for the new folder.'),
        parent_folder: z
          .string()
          .optional()
          .describe('Parent folder name or ID. Defaults to top-level.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const path = args.parent_folder
        ? `${resolveMailFolder(args.parent_folder)}/childFolders`
        : '/me/mailFolders'

      const result = (await client.graphPost(path, {
        displayName: args.name,
      })) as MailFolder

      return actionResponse(
        `Folder "${result.displayName}" created successfully.\nID: ${result.id}`,
        { created: true, id: result.id, name: result.displayName },
      )
    },
  )

  // ─── Move Emails ─────────────────────────────────────────────────────

  server.registerTool(
    'm365_move_emails',
    {
      title: 'Move Emails to Folder',
      description: 'Move one or more emails to a specified folder in Microsoft 365. Reports which message IDs failed if any.',
      inputSchema: z.object({
        ids: z
          .array(z.string())
          .describe('Array of email message IDs to move.'),
        destination_folder: z
          .string()
          .describe('Destination folder name (inbox, sent, drafts, deleted, junk, archive) or folder ID.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      let destinationId = args.destination_folder

      const wellKnown = ['inbox', 'drafts', 'sentitems', 'sent', 'deleteditems', 'deleted', 'trash', 'junkemail', 'junk', 'spam', 'archive', 'outbox']
      if (wellKnown.includes(args.destination_folder.toLowerCase())) {
        const folder = (await client.graphGet(
          resolveMailFolder(args.destination_folder),
        )) as MailFolder
        destinationId = folder.id
      }

      const results = await Promise.allSettled(
        args.ids.map((id) =>
          client.graphPost(`/me/messages/${encodeURIComponent(id)}/move`, {
            destinationId,
          }),
        ),
      )

      return batchResponse(results, args.ids, `Moved to ${args.destination_folder}`)
    },
  )
}
