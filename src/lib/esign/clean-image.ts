// Browser-only: turn a photo/scan of a signature or a vessel stamp into a
// transparent PNG — light pixels (the paper) become see-through, the image is
// trimmed to the ink, then fitted to the requested box. Ink colour is kept, so
// a blue or red stamp stays blue or red.

export const MAX_IMAGE_UPLOAD = 8 * 1024 * 1024;
export const IMAGE_UPLOAD_TYPES = /^image\/(png|jpe?g|webp)$/i;

/**
 * `fixed: true` returns exactly w×h with the ink centred (signatures — every
 * mode yields the same box). `fixed: false` returns the trimmed ink scaled to
 * fit within w×h, keeping its own shape (stamps can be round or wide).
 */
export async function cleanInkImage(file: File, box: { w: number; h: number; fixed: boolean }): Promise<string> {
  if (!IMAGE_UPLOAD_TYPES.test(file.type)) throw new Error("Please choose a PNG or JPEG image");
  if (file.size > MAX_IMAGE_UPLOAD) throw new Error("That image is over 8 MB — please choose a smaller one");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file couldn't be read as an image"));
      i.src = url;
    });
    // Work at a capped size — phone photos are huge.
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const work = document.createElement("canvas");
    work.width = w; work.height = h;
    const wctx = work.getContext("2d", { willReadFrequently: true })!;
    wctx.drawImage(img, 0, 0, w, h);
    const px = wctx.getImageData(0, 0, w, h);
    const d = px.data;

    // Light pixels are paper → transparent; find the ink's bounding box.
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        const lum = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
        if (d[k + 3] < 20 || lum > 200) { d[k + 3] = 0; continue; }
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) throw new Error("Nothing found in that image — try a clearer photo on a plain light background");
    wctx.putImageData(px, 0, 0);

    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const pad = box.fixed ? 12 : 0;
    const fit = Math.min((box.w - 2 * pad) / bw, (box.h - 2 * pad) / bh, box.fixed ? Infinity : 1);
    const dw = Math.max(1, Math.round(bw * fit)), dh = Math.max(1, Math.round(bh * fit));
    const out = document.createElement("canvas");
    out.width = box.fixed ? box.w : dw;
    out.height = box.fixed ? box.h : dh;
    out.getContext("2d")!.drawImage(work, minX, minY, bw, bh, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh);
    return out.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
