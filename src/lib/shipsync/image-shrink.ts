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

/** The extension the shrunk blob should be stored under. */
export const extFor = (blob: Blob, kind: ImageKind = 'photo') =>
  kind === 'signature' || blob.type === 'image/png' ? 'png' : 'jpg'
