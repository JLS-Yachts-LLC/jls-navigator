// Client-side image compression. Used for passport scans so uploads stay small
// (target < 1000 KB) and OCR payloads are reasonable. Re-encodes to JPEG and
// steps quality/scale down until under the cap. Non-images (e.g. PDF) pass through.

export type CompressResult = {
  file: File          // the (possibly) re-encoded file to upload
  sizeKB: number      // final size in KB
  base64: string      // raw base64 (no data: prefix) — for OCR
  mediaType: string   // e.g. image/jpeg
  wasCompressed: boolean
  isImage: boolean
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality),
  )
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

function render(img: HTMLImageElement, scale: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvasToBlob(canvas, quality)
}

export async function compressImageToMaxKB(file: File, maxKB = 1000): Promise<CompressResult> {
  const isImage = file.type.startsWith('image/')
  if (!isImage) {
    const base64 = await blobToBase64(file)
    return { file, sizeKB: Math.round(file.size / 1024), base64, mediaType: file.type || 'application/octet-stream', wasCompressed: false, isImage: false }
  }

  const img = await loadImage(file)
  const longest = Math.max(img.width, img.height)
  let scale = longest > 2400 ? 2400 / longest : 1   // cap longest side at 2400px
  let quality = 0.92
  let blob = await render(img, scale, quality)

  while (blob.size / 1024 > maxKB) {
    if (quality > 0.45) quality -= 0.1
    else { scale *= 0.85; quality = 0.85 }
    if (scale < 0.2) break
    blob = await render(img, scale, quality)
  }

  const base64 = await blobToBase64(blob)
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  const outFile = new File([blob], name, { type: 'image/jpeg' })
  return {
    file: outFile,
    sizeKB: Math.round(blob.size / 1024),
    base64,
    mediaType: 'image/jpeg',
    wasCompressed: outFile.size < file.size || file.type !== 'image/jpeg',
    isImage: true,
  }
}
