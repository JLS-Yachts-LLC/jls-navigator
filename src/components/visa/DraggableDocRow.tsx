/**
 * DraggableDocRow — a crew document that can be dragged into an external
 * browser portal, opened in a new tab, or downloaded locally.
 *
 * Native drag-out to another tab's file input needs a real File on
 * dataTransfer.items, but dragstart is synchronous — so we pre-fetch the File
 * on hover/focus and cache it. dragstart also sets a DownloadURL fallback for
 * OS-level drops. If the drop is rejected, a toast offers the download path.
 * Keyboard: focus the row and press Enter to download.
 */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { COLORS, FONTS } from '@/lib/tokens'
import { SignedAnchor } from '@/components/ui/signed-file'
import { resolveSignedUrl } from '@/lib/signed-url'
import { fetchDocumentFile, downloadDocument, filenameFor, type ExportableDoc } from '@/lib/visa/documentExport'

interface Props {
  label: string
  stored: string
  /** Passport expiry ISO date — shows a freshness badge when < 180 days. */
  expiryDate?: string | null
  /** Leading icon glyph (defaults to a document). */
  icon?: string
}

function expiryBadge(expiryDate?: string | null): { text: string; color: string } | null {
  if (!expiryDate) return null
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86_400_000)
  if (days >= 180) return null
  const color = days <= 0 ? '#E0524F' : days <= 30 ? '#E0524F' : days <= 90 ? COLORS.warn : COLORS.leoAmber
  const text = days <= 0 ? 'Expired' : `${days} day${days === 1 ? '' : 's'}`
  return { text, color }
}

export function DraggableDocRow({ label, stored, expiryDate, icon = '📄' }: Props) {
  const fileRef = useRef<File | null>(null)
  const urlRef = useRef<string | null>(null)
  const mimeRef = useRef<string>('application/octet-stream')
  const [hover, setHover] = useState(false)
  const [busy, setBusy] = useState(false)
  const badge = expiryBadge(expiryDate)
  const doc: ExportableDoc = { label, stored }

  // Pre-fetch the File AND resolve the signed URL on hover so BOTH are available
  // synchronously at dragstart — dataTransfer is frozen once dragstart returns,
  // so anything set after an await (as before) is silently dropped, leaving only
  // the filename text. That was why Outlook pasted the name instead of the file.
  function prefetch() {
    if (!fileRef.current) {
      void fetchDocumentFile(doc).then((f) => { fileRef.current = f; if (f.type) mimeRef.current = f.type }).catch(() => { /* fall back to DownloadURL */ })
    }
    if (!urlRef.current) {
      void resolveSignedUrl(stored).then((u) => { urlRef.current = u }).catch(() => { /* ignore */ })
    }
  }

  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = 'copy'
    const file = fileRef.current
    const url = urlRef.current
    const name = filenameFor(doc)
    const mime = file?.type || mimeRef.current

    // Real file for web upload fields / apps that read dataTransfer.files.
    if (file) {
      try { e.dataTransfer.items.add(file) } catch { /* older browsers */ }
    }
    // OS / Chromium virtual-file drop (Explorer, Outlook attach zone, etc.) — MUST
    // be set synchronously here. Format: mime:filename:absolute-url
    if (url && /^https?:\/\//i.test(url)) {
      e.dataTransfer.setData('DownloadURL', `${mime}:${name}:${url}`)
      e.dataTransfer.setData('text/uri-list', url)
      // Worst-case fallback is a usable link, NOT the bare filename.
      e.dataTransfer.setData('text/plain', url)
    }
  }

  function onDragEnd(e: React.DragEvent) {
    if (e.dataTransfer.dropEffect === 'none') {
      toast("Portal didn't accept the drop.", {
        description: "Use 'Open' to copy-paste, or 'Download' to save the file and upload it manually.",
      })
    }
  }

  async function handleDownload() {
    setBusy(true)
    try {
      await downloadDocument(doc)
    } catch {
      toast.error(`Could not download ${label}. Please try again.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => { setHover(true); prefetch() }}
      onMouseLeave={() => setHover(false)}
      onFocus={() => { setHover(true); prefetch() }}
      onBlur={() => setHover(false)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleDownload() } }}
      tabIndex={0}
      role="button"
      aria-label={`${label}. Drag to attach, or press Enter to download.`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        background: COLORS.void, border: `1px solid ${hover ? COLORS.signal : COLORS.deep}`,
        borderRadius: 7, cursor: 'grab', outline: 'none',
        transition: 'border-color 0.12s',
      }}
    >
      <span aria-hidden="true" title="Drag to attach" style={{ color: hover ? COLORS.signal : COLORS.steel, fontSize: 13, cursor: 'grab', userSelect: 'none' }}>⠿</span>
      <span aria-hidden="true" style={{ fontSize: 14 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.frost, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </div>
        {badge && (
          <div style={{ fontFamily: FONTS.display, fontSize: 10, color: badge.color, marginTop: 2 }}>
            Expires in {badge.text}
          </div>
        )}
      </div>

      {/* Open in new tab (manual copy/paste) */}
      <SignedAnchor
        stored={stored}
        title="Open in new tab"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.signal, textDecoration: 'none', padding: '2px 6px', flexShrink: 0 }}
      >
        ↗ Open
      </SignedAnchor>

      {/* Download locally */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); void handleDownload() }}
        disabled={busy}
        title="Download"
        style={{
          fontFamily: FONTS.display, fontSize: 11, color: busy ? COLORS.muted : COLORS.signal,
          background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer', padding: '2px 6px', flexShrink: 0,
        }}
      >
        ⬇ Download
      </button>
    </div>
  )
}
