/**
 * Crew document export helpers — drag-out + immigration ZIP package.
 *
 * Documents live in Supabase Storage; stored values are full public URLs or
 * "<bucket>/<path>" refs. We resolve a short-lived signed URL, fetch the blob,
 * and construct an in-memory File so it can be dragged into external portals or
 * bundled into a ZIP for manual upload.
 */

import JSZip from 'jszip'
import { resolveSignedUrl, parseStorageRef } from '@/lib/signed-url'

export interface ExportableDoc {
  /** Stored storage reference (full URL or "<bucket>/<path>"). */
  stored: string
  /** Human label, e.g. "Passport — inside pages". */
  label: string
}

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

/** Slugify a label into a safe filename stem. */
function slug(label: string): string {
  return label.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'document'
}

/** Best-effort extension from the stored path, falling back to the blob mime. */
function extFor(stored: string, mime: string): string {
  const ref = parseStorageRef(stored)
  const fromPath = ref?.path.match(/\.([a-z0-9]{2,5})(?:$|\?)/i)?.[1]
  return (fromPath || EXT_BY_MIME[mime] || 'bin').toLowerCase()
}

/** Derive a download filename for a document. */
export function filenameFor(doc: ExportableDoc, mime = ''): string {
  return `${slug(doc.label)}.${extFor(doc.stored, mime)}`
}

/** Resolve + fetch a document as an in-memory File. Throws on failure. */
export async function fetchDocumentFile(doc: ExportableDoc): Promise<File> {
  const url = await resolveSignedUrl(doc.stored)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${doc.label} (${res.status})`)
  const blob = await res.blob()
  return new File([blob], filenameFor(doc, blob.type), { type: blob.type || 'application/octet-stream' })
}

/** Trigger a browser download of a blob. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Download a single document locally (used by the row's Download action). */
export async function downloadDocument(doc: ExportableDoc): Promise<void> {
  const file = await fetchDocumentFile(doc)
  triggerBlobDownload(file, file.name)
}

/**
 * Build and download a ZIP of the supplied documents.
 * Returns the number of files successfully included.
 */
export async function downloadImmigrationPackage(docs: ExportableDoc[], zipName: string): Promise<number> {
  const zip = new JSZip()
  const used = new Set<string>()
  let count = 0

  for (const doc of docs) {
    try {
      const file = await fetchDocumentFile(doc)
      // Avoid duplicate names inside the archive.
      let name = file.name
      let n = 1
      while (used.has(name)) {
        const dot = file.name.lastIndexOf('.')
        name = dot > 0 ? `${file.name.slice(0, dot)}_${n}${file.name.slice(dot)}` : `${file.name}_${n}`
        n++
      }
      used.add(name)
      zip.file(name, await file.arrayBuffer())
      count++
    } catch {
      // Skip a doc that can't be fetched; the caller reports the final count.
    }
  }

  if (count === 0) return 0
  const content = await zip.generateAsync({ type: 'blob' })
  triggerBlobDownload(content, zipName)
  return count
}

/** Build the immigration-pack ZIP filename per spec. */
export function immigrationPackName(lastName: string, passportNo: string | null | undefined): string {
  const date = new Date().toISOString().split('T')[0]
  const safe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '') || 'NA'
  return `CREW_${safe(lastName || 'NA')}_${safe(passportNo || 'NA')}_ImmigrationPack_${date}.zip`
}
