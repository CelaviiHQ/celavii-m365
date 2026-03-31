import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { MailFolder } from '../types.js'
import { textResponse } from '../utils/formatting.js'
import { resolveMailFolder } from '../utils/folders.js'

export function registerFolderTools(server: McpServer, client: GraphClient) {
  // ─── List Folders ────────────────────────────────────────────────────

  server.registerTool(
    'list_folders',
    {
      title: 'List Mail Folders',
      description:
        'List all mail folders with their item counts and unread counts.',
      inputSchema: z.object({
        parent_folder: z
          .string()
          .optional()
          .describe('Parent folder name or ID to list child folders of. Defaults to top-level folders.'),
      }),
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

      const formatted = folders
        .map(
          (f, i) =>
            `${i + 1}. ${f.displayName}\n` +
            `   Total: ${f.totalItemCount} | Unread: ${f.unreadItemCount} | Sub-folders: ${f.childFolderCount}\n` +
            `   ID: ${f.id}`,
        )
        .join('\n\n')

      return textResponse(`Found ${folders.length} folder(s):\n\n${formatted}`)
    },
  )

  // ─── Create Folder ───────────────────────────────────────────────────

  server.registerTool(
    'create_folder',
    {
      title: 'Create Mail Folder',
      description: 'Create a new mail folder, optionally inside a parent folder.',
      inputSchema: z.object({
        name: z.string().describe('Name for the new folder.'),
        parent_folder: z
          .string()
          .optional()
          .describe('Parent folder name or ID. Defaults to top-level.'),
      }),
    },
    async (args) => {
      const path = args.parent_folder
        ? `${resolveMailFolder(args.parent_folder)}/childFolders`
        : '/me/mailFolders'

      const result = (await client.graphPost(path, {
        displayName: args.name,
      })) as MailFolder

      return textResponse(
        `Folder "${result.displayName}" created successfully.\nID: ${result.id}`,
      )
    },
  )

  // ─── Move Emails ─────────────────────────────────────────────────────

  server.registerTool(
    'move_emails',
    {
      title: 'Move Emails to Folder',
      description: 'Move one or more emails to a specified folder.',
      inputSchema: z.object({
        ids: z
          .array(z.string())
          .describe('Array of email message IDs to move.'),
        destination_folder: z
          .string()
          .describe('Destination folder name (inbox, sent, drafts, deleted, junk, archive) or folder ID.'),
      }),
    },
    async (args) => {
      // Resolve the destination folder ID
      let destinationId = args.destination_folder

      // If it's a well-known name, we need to get the actual ID
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

      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      if (failed === 0) {
        return textResponse(`Moved ${succeeded} email(s) successfully.`)
      }
      return textResponse(
        `Moved ${succeeded} email(s). ${failed} failed.`,
      )
    },
  )
}
