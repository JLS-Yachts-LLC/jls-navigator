/**
 * Shrink a captured image before it leaves the phone.
 *
 * A driver photographing twenty packages on 4G was uploading the camera's raw
 * output — 5-10 MB a shot as PNG. Re-encoded at review size that is around
 * 100 KB, which matters three times over: the driver's data, the offline queue
 * (photos wait in IndexedDB until there's signal), and the package list, which
 * renders a dozen of these at once.
 *
 * Signatures are the exception. They are line art drawn on a transparent canvas,
 * and JPEG has no transparency — re-encoding one puts black behind the ink. So a
 * signature is only ever downscaled, and stays PNG.
 */

/** Long edge for a package photo. Plenty for reviewing damage or a label. */
const PHOTO_MAX_EDGE = 1400
/** Signatures are wide and thin; this keeps the strokes legible. */
const SIGNATURE_MAX_EDGE = 1000

export type ImageKind = 'photo' | 'signature'

/**
 * Returns a smaller blob, or the original if it can't be processed — never
 * throws, because failing to shrink must not cost a driver their proof of
 * delivery.
 */
export async function shrinkImage(blob: Blob, kind: ImageKind = 'photo'): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return blob
    const maxEdge = kind === 'signature' ? SIGNATURE_MAX_EDGE : PHOTO_MAX_EDGE

    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    // Already small and already the right format: leave it alone.
    if (scale === 1 && kind === 'signature') { bitmap.close?.(); return blob }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return blob }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const type = kind === 'signature' ? 'image/png' : 'image/jpeg'
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), type, kind === 'signature' ? undefined : 0.82),
    )
    // Keep whichever is smaller: a small PNG screenshot can beat its JPEG.
    return out && out.size < blob.size ? out : blob
  } catch {
    return blob
  }
}

/** What a stored image's file extension should be, from what it actually is. */
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif',
}
const TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
}

/** The path with its extension corrected to the blob's real type (a HEIC we couldn't re-encode must not be stored as ".jpg"). */
export function pathWithExt(path: string, blob: Blob): string {
  const ext = EXT_BY_TYPE[blob.type]
  return ext ? path.replace(/\.[A-Za-z0-9]+$/, '') + '.' + ext : path
}

/**
 * The blob, with a content type. A gallery photo can arrive with no type at all, and
 * storage saves an untyped upload as a generic file — which a browser will not show as
 * an image. (The upload call's own contentType option is ignored for blobs; the type has
 * to be on the blob.) The type comes from the file name when the blob has none.
 */
export function withType(blob: Blob, path: string): Blob {
  if (blob.type) return blob
  const guess = TYPE_BY_EXT[path.split('.').pop()?.toLowerCase() ?? '']
  return guess ? new Blob([blob], { type: guess }) : blob
}

/** The extension the shrunk blob should be stored under. */
export const extFor = (blob: Blob, kind: ImageKind = 'photo') =>
  kind === 'signature' || blob.type === 'image/png' ? 'png' : 'jpg'
