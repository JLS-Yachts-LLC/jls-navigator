/**
 * Who may act on a bunkering enquiry from the Client Portal, and what a signed declaration upload must look like — decided in one
 * place so the screen and the server can't disagree.
 */

export type BunkeringRole = 'Captain' | 'Chief Engineer'

/**
 * The role a portal login can confirm and approve as, from its position. The Captain (a blank position counts as the Captain),
 * Relief Captain and Chief Engineer can; nobody else on board can commit the vessel to a fuel order.
 */
export function bunkeringActorRoles(position: string | null | undefined): BunkeringRole[] {
  switch ((position ?? '').trim().toLowerCase()) {
    case '': case 'captain': case 'relief_captain': return ['Captain']
    case 'chief_engineer': return ['Chief Engineer']
    default: return []
  }
}
export const canActOnBunkering = (position: string | null | undefined) => bunkeringActorRoles(position).length > 0

/** Prices are shown to positions that see the vessel's finance — and to the people who have to approve them. */
export const canSeeBunkeringPrices = (position: string | null | undefined, canSeeFinance: boolean) => canSeeFinance || canActOnBunkering(position)

export const MAX_DECLARATION_BYTES = 10 * 1024 * 1024
const DECLARATION_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const EXT_TYPE: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' }

/** The content type to store a declaration as: what the browser said, or the extension's, or null if it isn't a PDF or a photo. */
export function declarationContentType(name: string, reported: string): string | null {
  const t = (reported || '').split(';')[0].trim().toLowerCase()
  if (DECLARATION_TYPES.has(t)) return t
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return (!t || t === 'application/octet-stream') ? (EXT_TYPE[ext] ?? null) : null
}

/** Why this file can't be taken as the signed declaration, in words the vessel can act on — or null when it is fine. */
export function declarationUploadProblem(f: { name: string; type: string; size: number }): string | null {
  if (!f.size) return 'That file is empty.'
  if (f.size > MAX_DECLARATION_BYTES) return 'That file is larger than 10 MB. Please send a smaller scan or photo.'
  if (!declarationContentType(f.name, f.type)) return 'Please upload the signed declaration as a PDF or a photo (JPG, PNG, HEIC).'
  return null
}
