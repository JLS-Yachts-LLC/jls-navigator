/**
 * Labels → ZPL, the language Zebra printers speak.
 *
 * A print job in the queue holds only label contents (code, title, lines). This turns
 * them into ZPL for one printer's label size and resolution, when the connector
 * collects the job. Keeping the commands on our side is a safety line: staff can queue
 * labels, but nothing they type can become a printer command — every piece of text is
 * hex-escaped (^FH), so a "^" or "~" in a description is printed, not obeyed.
 *
 * The connector (tools/print-connector) checks every command in what it is sent against
 * ZPL_COMMANDS below and refuses anything else, so the two must stay in step.
 *
 * Layout matches the browser label: QR on the left, reference / title / lines on the right.
 */

export type Label = {
  /** Encoded in the QR and printed beside it. */
  code: string;
  title: string;
  lines: string[];
};

export type LabelMedia = { widthMm: number; heightMm: number; dpi: number };

/** Every command renderZpl can emit. The connector refuses a job containing any other. */
export const ZPL_COMMANDS = ["XA", "XZ", "CI", "PW", "LL", "LH", "FO", "BQ", "FD", "FS", "A0", "FB", "FH", "PQ"] as const;

const dotsPerMm = (dpi: number) => (dpi >= 600 ? 24 : dpi >= 300 ? 12 : 8);

/**
 * Field data for ^FH: printable ASCII as-is, everything else (and the three characters
 * ZPL treats specially: ^ ~ and the _ escape itself) as _XX hex of its UTF-8 bytes.
 */
export function zplText(s: string): string {
  let out = "";
  for (const b of new TextEncoder().encode(s.replace(/[\r\n\t]+/g, " "))) {
    if (b >= 0x20 && b <= 0x7e && b !== 0x5e && b !== 0x7e && b !== 0x5f) out += String.fromCharCode(b);
    else out += "_" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

/** QR modules per side for byte-mode data at error correction M (versions 1–10). */
function qrModules(bytes: number): number {
  const cap = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
  const v = cap.findIndex((c) => bytes <= c);
  return 17 + 4 * (v === -1 ? 10 : v + 1);
}

/** Rough count of wrapped lines, for stacking text blocks. Font 0 averages ~0.55 × height per character. */
const wrapped = (text: string, fontDots: number, widthDots: number, max: number) =>
  Math.max(1, Math.min(max, Math.ceil((text.length * fontDots * 0.55) / Math.max(widthDots, 1))));

export function renderLabel(label: Label, media: LabelMedia, copies = 1): string {
  const d = dotsPerMm(media.dpi);
  const W = Math.round(media.widthMm * d);
  const H = Math.round(media.heightMm * d);
  const m = Math.round(2 * d); // 2 mm margin
  const code = label.code.trim();

  const target = Math.min(H - 2 * m, Math.round(W * 0.45));
  const modules = qrModules(new TextEncoder().encode(code).length);
  const mag = Math.max(1, Math.min(10, Math.floor(target / modules)));
  const qr = modules * mag;

  const x = m + qr + Math.round(2.5 * d);
  const tw = Math.max(W - x - m, d * 10);
  const unit = H / 10;
  const font = { code: Math.max(18, Math.round(unit)), title: Math.max(16, Math.round(unit * 0.9)), line: Math.max(14, Math.round(unit * 0.7)) };

  const out: string[] = ["^XA", "^CI28", `^PW${W}`, `^LL${H}`, "^LH0,0"];
  out.push(`^FO${m},${Math.max(m, Math.round((H - qr) / 2))}^BQN,2,${mag}^FH^FDMA,${zplText(code)}^FS`);

  let y = m;
  const block = (text: string, f: number, maxLines: number) => {
    if (!text.trim()) return;
    const n = wrapped(text, f, tw, maxLines);
    if (y + f > H - m) return; // out of room: drop the rest rather than print over the edge
    out.push(`^FO${x},${y}^A0N,${f},${f}^FB${tw},${n},0,L,0^FH^FD${zplText(text.trim())}^FS`);
    y += Math.round(n * f * 1.15) + Math.round(d * 0.8);
  };
  block(code, font.code, 2);
  block(label.title, font.title, 2);
  for (const l of label.lines) block(l, font.line, 2);

  out.push(`^PQ${Math.max(1, Math.min(20, Math.floor(copies)))}`, "^XZ");
  return out.join("\n");
}

export function renderLabels(labels: Label[], media: LabelMedia, copies = 1): string {
  return labels.map((l) => renderLabel(l, media, copies)).join("\n");
}

/** Shape-check labels arriving from the queue (jsonb written by a browser). */
export function parseLabels(raw: unknown): Label[] {
  if (!Array.isArray(raw)) throw new Error("labels must be a list");
  return raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code.slice(0, 200) : "";
    if (!code.trim()) throw new Error(`label ${i + 1} has no code`);
    return {
      code,
      title: typeof o.title === "string" ? o.title.slice(0, 200) : "",
      lines: Array.isArray(o.lines) ? o.lines.filter((x): x is string => typeof x === "string").slice(0, 6).map((x) => x.slice(0, 200)) : [],
    };
  });
}
