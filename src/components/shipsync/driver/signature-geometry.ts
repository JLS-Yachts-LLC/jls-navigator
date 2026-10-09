/**
 * Where on the signature canvas a finger touched.
 *
 * The canvas has a fixed drawing size (520 × 180) but is stretched by CSS to the width of the screen, so a
 * touch's position on screen has to be scaled to the canvas's own coordinates — otherwise, on a 340px-wide
 * phone, the ink lands about a third of the way short of the finger and the right-hand part of the pad
 * can't be reached at all.
 */
export function toCanvasPoint(
  clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  canvas: { width: number; height: number },
): { x: number; y: number } {
  const sx = rect.width > 0 ? canvas.width / rect.width : 1;
  const sy = rect.height > 0 ? canvas.height / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}

/** A tap (or a tiny wobble) is not a signature: the pen has to travel at least this far, in canvas pixels. */
export const MIN_SIGNATURE_TRAVEL = 12;
