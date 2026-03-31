import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GraphClient } from '../client.js'
import type { DriveItem, SharingLink } from '../types.js'
import { ONEDRIVE_SELECT_FIELDS, UPLOAD_THRESHOLD } from '../types.js'
import { formatDriveItem, formatFileSize, textResponse } from '../utils/formatting.js'

export function registerOneDriveTools(server: McpServer, client: GraphClient) {
  // ─── List Files ──────────────────────────────────────────────────────

  server.registerTool(
    'onedrive_list',
    {
      title: 'List OneDrive Files',
      description:
        'List files and folders in OneDrive at a given path. Defaults to root.',
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
          .describe('Max items to return. Defaults to 25.'),
      }),
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
      )) as DriveItem[]

      if (items.length === 0) {
        return textResponse('No files or folders found at this location.')
      }

      const formatted = items.map((item, i) => formatDriveItem(item, i)).join('\n\n')
      return textResponse(`Found ${items.length} item(s):\n\n${formatted}`)
    },
  )

  // ─── Search Files ────────────────────────────────────────────────────

  server.registerTool(
    'onedrive_search',
    {
      title: 'Search OneDrive',
      description: 'Search for files and folders by name or content in OneDrive.',
      inputSchema: z.object({
        query: z.string().describe('Search query (searches file names and content).'),
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Max results. Defaults to 25.'),
      }),
    },
    async (args) => {
      const count = args.count || 25

      const result = (await client.graphGet(
        `/me/drive/root/search(q='${encodeURIComponent(args.query)}')`,
        {
          $top: String(count),
          $select: ONEDRIVE_SELECT_FIELDS,
        },
      )) as { value: DriveItem[] }

      const items = result.value || []

      if (items.length === 0) {
        return textResponse(`No results found for "${args.query}".`)
      }

      const formatted = items.map((item, i) => formatDriveItem(item, i)).join('\n\n')
      return textResponse(`Found ${items.length} result(s) for "${args.query}":\n\n${formatted}`)
    },
  )

  // ─── Download File ───────────────────────────────────────────────────

  server.registerTool(
    'onedrive_download',
    {
      title: 'Get OneDrive Download URL',
      description:
        'Get a pre-authenticated download URL for a file. The URL is temporary and expires.',
      inputSchema: z.object({
        id: z.string().describe('The file item ID.'),
      }),
    },
    async (args) => {
      const url = await client.graphGetDownloadUrl(
        `/me/drive/items/${encodeURIComponent(args.id)}/content`,
      )

      if (!url) {
        return textResponse('Could not generate a download URL for this item.')
      }

      return textResponse(`Download URL (temporary):\n${url}`)
    },
  )

  // ─── Upload File ─────────────────────────────────────────────────────

  server.registerTool(
    'onedrive_upload',
    {
      title: 'Upload to OneDrive',
      description: `Upload a file to OneDrive. For files under ${formatFileSize(UPLOAD_THRESHOLD)}, uses simple upload. Content should be base64-encoded for binary files or plain text.`,
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
      }),
    },
    async (args) => {
      // Use simple upload (PUT) for small files
      const token = await client['tokenStore'].getGraphToken()
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
      return textResponse(
        `File uploaded successfully.\nName: ${result.name}\nSize: ${formatFileSize(result.size)}\nURL: ${result.webUrl}\nID: ${result.id}`,
      )
    },
  )

  // ─── Create Sharing Link ─────────────────────────────────────────────

  server.registerTool(
    'onedrive_share',
    {
      title: 'Create OneDrive Sharing Link',
      description: 'Create a sharing link for a OneDrive file or folder.',
      inputSchema: z.object({
        id: z.string().describe('The item ID to share.'),
        type: z
          .enum(['view', 'edit', 'embed'])
          .optional()
          .describe('Link type: view (read-only), edit, or embed. Defaults to view.'),
        scope: z
          .enum(['anonymous', 'organization'])
          .optional()
          .describe('Link scope: anonymous (anyone) or organization. Defaults to anonymous.'),
      }),
    },
    async (args) => {
      const result = (await client.graphPost(
        `/me/drive/items/${encodeURIComponent(args.id)}/createLink`,
        {
          type: args.type || 'view',
          scope: args.scope || 'anonymous',
        },
      )) as SharingLink

      return textResponse(
        `Sharing link created:\n${result.link.webUrl}\nType: ${result.link.type}\nScope: ${result.link.scope}`,
      )
    },
  )

  // ─── Create Folder ───────────────────────────────────────────────────

  server.registerTool(
    'onedrive_create_folder',
    {
      title: 'Create OneDrive Folder',
      description: 'Create a new folder in OneDrive.',
      inputSchema: z.object({
        name: z.string().describe('Name for the new folder.'),
        parent_path: z
          .string()
          .optional()
          .describe('Parent folder path (e.g., "/Documents"). Defaults to root.'),
      }),
    },
    async (args) => {
      const parentPath = args.parent_path
        ? `/me/drive/root:${args.parent_path}:/children`
        : '/me/drive/root/children'

      const result = (await client.graphPost(parentPath, {
        name: args.name,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      })) as DriveItem

      return textResponse(
        `Folder "${result.name}" created.\nURL: ${result.webUrl}\nID: ${result.id}`,
      )
    },
  )

  // ─── Delete Item ─────────────────────────────────────────────────────

  server.registerTool(
    'onedrive_delete',
    {
      title: 'Delete OneDrive Item',
      description: 'Delete a file or folder from OneDrive. This action is permanent.',
      inputSchema: z.object({
        id: z.string().describe('The item ID to delete.'),
      }),
    },
    async (args) => {
      await client.graphDelete(`/me/drive/items/${encodeURIComponent(args.id)}`)
      return textResponse('Item deleted successfully.')
    },
  )
}
