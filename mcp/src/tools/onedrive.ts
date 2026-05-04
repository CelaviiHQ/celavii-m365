import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { DriveItem, SharingLink } from '../types.js'
import { ONEDRIVE_SELECT_FIELDS, UPLOAD_THRESHOLD } from '../types.js'
import { formatDriveItem, formatFileSize, textResponse, paginatedResponse, actionResponse } from '../utils/formatting.js'

const accountIdField = z
  .string()
  .optional()
  .describe('Email/UPN of the M365 account to target. Defaults to the configured default account.')

export function registerOneDriveTools(server: McpServer, client: GraphClient) {
  // ─── List Files ──────────────────────────────────────────────────────

  server.registerTool(
    'm365_onedrive_list',
    {
      title: 'List OneDrive Files',
      description:
        'List files and folders in Microsoft 365 OneDrive at a given path. Returns name, size, type, modification date, and item ID. Defaults to root directory.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Folder path (e.g., "/Documents/Reports"). Defaults to root.'),
        count: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Max items to return (1-100). Defaults to 25.'),
        response_format: z
          .enum(['text', 'json'])
          .optional()
          .describe("Output format: 'text' for human-readable (default), 'json' for structured data."),
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
      const count = args.count || 25
      const drivePath = args.path
        ? `/me/drive/root:${args.path}:/children`
        : '/me/drive/root/children'

      const items = (await client.graphGetPaginated(
        drivePath,
        {
          $top: String(count),
          $select: ONEDRIVE_SELECT_FIELDS,
          $orderby: 'name asc',
        },
        count,
        args.account_id,
      )) as DriveItem[]

      if (items.length === 0) {
        return textResponse('No files or folders found at this location.')
      }

      return paginatedResponse(items, items.length, 0, formatDriveItem, 'item(s)', args.response_format)
    },
  )

  // ─── Search Files ────────────────────────────────────────────────────

  server.registerTool(
    'm365_onedrive_search',
    {
      title: 'Search OneDrive',
      description: 'Search for files and folders by name or content in Microsoft 365 OneDrive. Returns matching items with metadata.',
      inputSchema: z.object({
        query: z.string().describe('Search query (searches file names and content).'),
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Max results (1-50). Defaults to 25.'),
        response_format: z
          .enum(['text', 'json'])
          .optional()
          .describe("Output format: 'text' for human-readable (default), 'json' for structured data."),
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
      const count = args.count || 25

      const result = (await client.graphGet(
        `/me/drive/root/search(q='${encodeURIComponent(args.query)}')`,
        {
          $top: String(count),
          $select: ONEDRIVE_SELECT_FIELDS,
        },
        args.account_id,
      )) as { value: DriveItem[] }

      const items = result.value || []

      if (items.length === 0) {
        return textResponse(`No results found for "${args.query}".`)
      }

      return paginatedResponse(items, items.length, 0, formatDriveItem, 'result(s)', args.response_format)
    },
  )

  // ─── Download File ───────────────────────────────────────────────────

  server.registerTool(
    'm365_onedrive_download',
    {
      title: 'Get OneDrive Download URL',
      description:
        'Get a pre-authenticated temporary download URL for a OneDrive file. The URL expires after a short time. Use the item ID from m365_onedrive_list or m365_onedrive_search.',
      inputSchema: z.object({
        id: z.string().describe('The file item ID (from m365_onedrive_list or m365_onedrive_search).'),
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
      const url = await client.graphGetDownloadUrl(
        `/me/drive/items/${encodeURIComponent(args.id)}/content`,
        args.account_id,
      )

      if (!url) {
        return textResponse('Could not generate a download URL for this item.')
      }

      return actionResponse(`Download URL (temporary):\n${url}`, { url })
    },
  )

  // ─── Upload File ─────────────────────────────────────────────────────

  server.registerTool(
    'm365_onedrive_upload',
    {
      title: 'Upload to OneDrive',
      description: `Upload a file to Microsoft 365 OneDrive. For files under ${formatFileSize(UPLOAD_THRESHOLD)}, uses simple upload. Content should be base64-encoded for binary files or plain text for text files.`,
      inputSchema: z.object({
        path: z
          .string()
          .describe('Destination path including filename (e.g., "/Documents/report.pdf").'),
        content: z
          .string()
          .describe('File content as text or base64-encoded string.'),
        content_type: z
          .string()
          .optional()
          .describe('MIME type of the file (e.g., "application/pdf"). Auto-detected if omitted.'),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = await (client as any).tokenStore.getGraphToken(args.account_id)
      const url = `https://graph.microsoft.com/v1.0/me/drive/root:${args.path}:/content`

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': args.content_type || 'application/octet-stream',
        },
        body: args.content,
      })

      if (!res.ok) {
        const error = await res.text()
        return textResponse(`Upload failed (${res.status}): ${error}`)
      }

      const result = (await res.json()) as DriveItem
      return actionResponse(
        `File uploaded successfully.\nName: ${result.name}\nSize: ${formatFileSize(result.size)}\nURL: ${result.webUrl}\nID: ${result.id}`,
        { uploaded: true, id: result.id, name: result.name, url: result.webUrl },
      )
    },
  )

  // ─── Create Sharing Link ─────────────────────────────────────────────

  server.registerTool(
    'm365_onedrive_share',
    {
      title: 'Create OneDrive Sharing Link',
      description: 'Create a sharing link for a OneDrive file or folder. Supports view (read-only), edit, or embed link types.',
      inputSchema: z.object({
        id: z.string().describe('The item ID to share.'),
        type: z
          .enum(['view', 'edit', 'embed'])
          .optional()
          .describe('Link type: view (read-only), edit, or embed. Defaults to view.'),
        scope: z
          .enum(['anonymous', 'organization'])
          .optional()
          .describe('Link scope: anonymous (anyone with the link) or organization. Defaults to anonymous.'),
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
      const result = (await client.graphPost(
        `/me/drive/items/${encodeURIComponent(args.id)}/createLink`,
        {
          type: args.type || 'view',
          scope: args.scope || 'anonymous',
        },
        args.account_id,
      )) as SharingLink

      return actionResponse(
        `Sharing link created:\n${result.link.webUrl}\nType: ${result.link.type}\nScope: ${result.link.scope}`,
        { url: result.link.webUrl, type: result.link.type, scope: result.link.scope },
      )
    },
  )

  // ─── Create Folder ───────────────────────────────────────────────────

  server.registerTool(
    'm365_onedrive_create_folder',
    {
      title: 'Create OneDrive Folder',
      description: 'Create a new folder in Microsoft 365 OneDrive. If a folder with the same name exists, it will be renamed automatically.',
      inputSchema: z.object({
        name: z.string().describe('Name for the new folder.'),
        parent_path: z
          .string()
          .optional()
          .describe('Parent folder path (e.g., "/Documents"). Defaults to root.'),
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
      const parentPath = args.parent_path
        ? `/me/drive/root:${args.parent_path}:/children`
        : '/me/drive/root/children'

      const result = (await client.graphPost(
        parentPath,
        {
          name: args.name,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        },
        args.account_id,
      )) as DriveItem

      return actionResponse(
        `Folder "${result.name}" created.\nURL: ${result.webUrl}\nID: ${result.id}`,
        { created: true, id: result.id, name: result.name, url: result.webUrl },
      )
    },
  )

  // ─── Delete Item ─────────────────────────────────────────────────────

  server.registerTool(
    'm365_onedrive_delete',
    {
      title: 'Delete OneDrive Item',
      description: 'Permanently delete a file or folder from Microsoft 365 OneDrive. This action cannot be undone. Use the item ID from m365_onedrive_list.',
      inputSchema: z.object({
        id: z.string().describe('The item ID to delete.'),
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
      await client.graphDelete(`/me/drive/items/${encodeURIComponent(args.id)}`, args.account_id)
      return actionResponse('Item deleted successfully.', { deleted: true, id: args.id })
    },
  )
}
