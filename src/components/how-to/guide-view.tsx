/**
 * How-to Guides — shared rendering: rich text, screenshots with highlight boxes
 * (click to enlarge), the numbered step list and the "Download PDF" button.
 * Used by the top-bar help panel and the /how-to pages.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { TIcon } from "@/components/polaris-ui/primitives";
import { SHOT_H, SHOT_W, type GuideImage, type GuideStep, type HowToGuide } from "@/lib/how-to/guides";

/** "**bold** plain" → JSX. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} style={{ color: "var(--pds-text)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Shot({ image, onClick, big }: { image: GuideImage; onClick?: () => void; big?: boolean }) {
  const H = image.h ?? SHOT_H;
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      title={onClick ? "Click to enlarge" : undefined}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${SHOT_W} / ${H}`,
        borderRadius: big ? 6 : "var(--pds-radius-md)",
        overflow: "hidden",
        border: "1px solid var(--pds-border-gold)",
        cursor: onClick ? "zoom-in" : undefined,
        background: "var(--pds-navy-deep)",
      }}
    >
      <img src={image.src} alt={image.alt} loading="lazy" style={{ width: "100%", height: "100%", display: "block" }} />
      {(image.highlights ?? []).map((h, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="pds-howto-hl"
          style={{
            position: "absolute",
            left: `calc(${(h.x / SHOT_W) * 100}% - 3px)`,
            top: `calc(${(h.y / H) * 100}% - 3px)`,
            width: `calc(${(h.w / SHOT_W) * 100}% + 6px)`,
            height: `calc(${(h.h / H) * 100}% + 6px)`,
            border: "2px solid var(--pds-gold-light)",
            borderRadius: 6,
            boxShadow: "0 0 0 2px rgba(7,17,42,0.55), 0 0 14px rgba(233,204,114,0.55)",
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}

/** Screenshot with its highlights; click opens it full-size. */
export function GuideScreenshot({ image }: { image: GuideImage }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <Shot image={image} onClick={() => setOpen(true)} />
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1500, background: "rgba(4,10,26,0.88)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out",
          }}
        >
          <div style={{ width: "min(1568px, 100%)" }}>
            <Shot image={image} big />
            <div style={{ marginTop: 10, textAlign: "center", fontSize: 14, color: "var(--pds-text-secondary)" }}>{image.alt}</div>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ step, n, compact }: { step: GuideStep; n: number; compact?: boolean }) {
  return (
    <li style={{ display: "flex", gap: 14, listStyle: "none" }}>
      <span
        style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: "var(--pds-gold)", color: "var(--pds-navy)",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, marginTop: 1,
        }}
      >
        {n}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: compact ? 15 : 17, fontWeight: 600, color: "var(--pds-gold-light)", lineHeight: 1.3 }}>{step.title}</h3>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: "var(--pds-text-secondary)" }}><RichText text={step.text} /></p>
        {step.bullets && (
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {step.bullets.map((b, i) => (
              <li key={i} style={{ fontSize: 14, lineHeight: 1.6, color: "var(--pds-text-secondary)" }}><RichText text={b} /></li>
            ))}
          </ul>
        )}
        {step.image && <GuideScreenshot image={step.image} />}
        {step.tip && (
          <div
            style={{
              display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--pds-radius-md)",
              background: "var(--pds-gold-muted)", borderLeft: "3px solid var(--pds-gold)", fontSize: 14, lineHeight: 1.55, color: "var(--pds-text)",
            }}
          >
            <TIcon name="bulb" size={16} color="var(--pds-gold-light)" style={{ marginTop: 2 }} />
            <span>{step.tip}</span>
          </div>
        )}
      </div>
    </li>
  );
}

export function GuideSteps({ guide, compact }: { guide: HowToGuide; compact?: boolean }) {
  return (
    <ol style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: compact ? 22 : 30 }}>
      {guide.steps.map((s, i) => <Step key={i} step={s} n={i + 1} compact={compact} />)}
    </ol>
  );
}

export const howToButton: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px",
  borderRadius: "var(--pds-radius-md)", border: "1px solid var(--pds-border-gold)", background: "var(--pds-surface-2)",
  color: "var(--pds-text)", fontSize: 14, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
};

/** Builds the PDF on demand (pdf-lib is loaded only when clicked). */
export function PdfButton({ guides, filename, title, label = "Download PDF", primary }: {
  guides: HowToGuide[];
  filename: string;
  title?: string;
  label?: ReactNode;
  primary?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const { downloadGuidesPdf } = await import("@/lib/how-to/guide-pdf");
      await downloadGuidesPdf(guides, filename, title);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      style={{
        ...howToButton,
        ...(primary ? { background: "var(--pds-gold)", color: "var(--pds-navy)", border: "1px solid var(--pds-gold)", fontWeight: 600 } : {}),
        opacity: busy ? 0.7 : 1,
      }}
    >
      <span className={busy ? "animate-spin" : undefined} style={{ display: "inline-flex" }}>
        <TIcon name={busy ? "loader-2" : "file-download"} size={16} />
      </span>
      {busy ? "Preparing…" : label}
    </button>
  );
}
