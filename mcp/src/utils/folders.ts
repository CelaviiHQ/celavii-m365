/** Well-known Outlook folder names mapped to Graph API paths. */
const WELL_KNOWN_FOLDERS: Record<string, string> = {
  inbox: 'inbox',
  drafts: 'drafts',
  sentitems: 'sentitems',
  sent: 'sentitems',
  deleteditems: 'deleteditems',
  deleted: 'deleteditems',
  trash: 'deleteditems',
  junkemail: 'junkemail',
  junk: 'junkemail',
  spam: 'junkemail',
  archive: 'archive',
  outbox: 'outbox',
}

/**
 * Resolve a folder name or ID to the Graph API messages endpoint.
 * Supports well-known folder names (inbox, sent, drafts, etc.) and folder IDs.
 */
export function resolveMailFolderPath(folder?: string): string {
  if (!folder) return '/me/messages'

  const normalized = folder.toLowerCase().trim()
  const wellKnown = WELL_KNOWN_FOLDERS[normalized]

  if (wellKnown) {
    return `/me/mailFolders/${wellKnown}/messages`
  }

  // Assume it's a folder ID
  return `/me/mailFolders/${encodeURIComponent(folder)}/messages`
}

/**
 * Resolve a folder name or ID to the Graph API folder endpoint (no /messages).
 */
export function resolveMailFolder(folder: string): string {
  const normalized = folder.toLowerCase().trim()
  const wellKnown = WELL_KNOWN_FOLDERS[normalized]

  if (wellKnown) {
    return `/me/mailFolders/${wellKnown}`
  }

  return `/me/mailFolders/${encodeURIComponent(folder)}`
}
