/**
 * Server side of a feedback report's file: fetch it so the emails can carry the
 * file itself rather than a storage path nobody outside Polaris can open.
 *
 * Before this, the support email linked to the raw "permit-documents/feedback/…"
 * reference and the New Horizon mirror printed it as text — neither opened, and a
 * Word form a JLS user sent (SD-0064) could not be found on either desk.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { parseStorageRef } from '@/lib/signed-url'
import { EMAIL_LINK_TTL, resolveSignedUrlAdmin } from '@/lib/signed-url.server'
import { attachmentContentType, attachmentFileName, attachmentLabel } from '@/lib/feedback-attachment'

/**
 * Largest file sent as a real attachment. The ticket emails go out through Graph
 * `sendMail`, whose whole request is capped at 4 MB — and base64 adds a third — so
 * 2.5 MB leaves room for the body. Anything bigger travels as a link instead.
 */
export const MAX_EMAIL_ATTACHMENT_BYTES = 2_500_000

export interface FeedbackAttachment {
  /** Screenshot / Screen recording / PDF / Document / … */
  label: string
  filename: string
  contentType: string
  /** The file, when it is small enough to attach. */
  contentBase64: string | null
  /** A signed link that works from an email (30 days), for when it is not. */
  link: string | null
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/**
 * Load a feedback report's file for an email. Never throws — an email without
 * the file (but with a link, or failing that a note) beats no email at all.
 * Returns null when there is no file.
 */
export async function loadFeedbackAttachment(
  stored: string | null | undefined,
  createdAt?: string | null,
): Promise<FeedbackAttachment | null> {
  if (!stored) return null
  const out: FeedbackAttachment = {
    label: attachmentLabel(stored),
    filename: attachmentFileName(stored, createdAt),
    contentType: attachmentContentType(stored),
    contentBase64: null,
    link: null,
  }
  try {
    const ref = parseStorageRef(stored)
    if (!ref) return { ...out, link: stored }
    const bucket = (supabaseAdmin as any).storage.from(ref.bucket)

    // Ask for the size first, so a 25 MB screen recording is never pulled into
    // the Worker only to be dropped.
    const slash = ref.path.lastIndexOf('/')
    const dir = slash >= 0 ? ref.path.slice(0, slash) : ''
    const name = ref.path.slice(slash + 1)
    const { data: listed } = await bucket.list(dir, { search: name, limit: 5 })
    const meta = (listed ?? []).find((o: any) => o.name === name)?.metadata
    const size = Number(meta?.size ?? NaN)
    if (meta?.mimetype) out.contentType = String(meta.mimetype)

    if (Number.isFinite(size) && size <= MAX_EMAIL_ATTACHMENT_BYTES) {
      const { data: blob } = await bucket.download(ref.path)
      if (blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        if (bytes.length <= MAX_EMAIL_ATTACHMENT_BYTES) out.contentBase64 = toBase64(bytes)
      }
    }
    if (!out.contentBase64) {
      const link = await resolveSignedUrlAdmin(stored, EMAIL_LINK_TTL)
      // resolveSignedUrlAdmin hands the stored value back when it cannot sign —
      // that is the broken raw path, so leave the link empty rather than use it.
      out.link = link !== stored ? link : null
    }
  } catch (e) {
    console.error('[feedback-attachment] could not load', stored, e)
  }
  return out
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The email line naming the reporter's file: "attached" when it rides with the
 * email, a working link when it was too big to.
 */
export function attachmentNote(a: FeedbackAttachment | null | undefined): string {
  if (!a) return ''
  if (a.contentBase64) {
    return `<p style="margin:14px 0 0;font-size:13px;">📎 <strong>${esc(a.label)} attached:</strong> ${esc(a.filename)}</p>`
  }
  if (a.link) {
    return `<p style="margin:14px 0 0;font-size:13px;">📎 <a href="${esc(a.link)}">Open the ${esc(a.label.toLowerCase())}</a>` +
      ` <span style="color:#64748b;font-size:12px;">(too large to attach — link valid for 30 days)</span></p>`
  }
  return `<p style="margin:14px 0 0;font-size:13px;color:#b91c1c;">📎 The reporter attached a ${esc(a.label.toLowerCase())}, but it could not be added here — open it from the Polaris ticket.</p>`
}

/** The attachment shape the Graph mail helpers take, when the file fits. */
export function asMailAttachment(a: FeedbackAttachment | null) {
  return a?.contentBase64
    ? [{ filename: a.filename, contentBase64: a.contentBase64, contentType: a.contentType }]
    : []
}
