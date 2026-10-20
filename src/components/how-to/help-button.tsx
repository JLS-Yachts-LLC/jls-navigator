/**
 * Top-bar "?" button — opens a side panel with the How-to Guides for the page
 * you're on (matched by nav screen, or by path for detail / add pages). Read a
 * guide right there, download it as a PDF, or browse every guide at /how-to.
 * Shortcut: press "?" anywhere outside a text field.
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { TIcon } from "@/components/polaris-ui/primitives";
import { guideById, guidePdfName, guidesForScreen, helpScreenFor, type HowToGuide } from "@/lib/how-to/guides";
import { GuideSteps, PdfButton, howToButton } from "./guide-view";

export function HelpButton({ activeScreen, pageLabel }: { activeScreen: string; pageLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [guideId, setGuideId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const screen = helpScreenFor(activeScreen, location.pathname);
  const guides = guidesForScreen(screen);
  const guide = guideId ? guideById(guideId) : undefined;

  // A different page → back to that page's list.
  useEffect(() => { setGuideId(null); }, [screen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) { setOpen(false); return; }
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === "?" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function browseAll() {
    setOpen(false);
    navigate({ to: "/how-to" });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="How-to guides for this page (?)"
        aria-label="How-to guides for this page"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition"
        style={open ? { color: "var(--pds-gold-light)", background: "var(--pds-gold-muted)" } : undefined}
      >
        <TIcon name="help" size={19} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1240, background: "rgba(4,10,26,0.45)" }} />
          <aside
            role="dialog"
            aria-label="How-to guides"
            className="pds-fade"
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 1250, width: "min(480px, 100vw)",
              background: "var(--pds-navy)", borderLeft: "1px solid var(--pds-border-gold)",
              boxShadow: "-12px 0 36px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column",
              color: "var(--pds-text)", fontFamily: "var(--pds-font-body)",
            }}
          >
            <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--pds-border-gold)" }}>
              {guide ? (
                <button type="button" onClick={() => setGuideId(null)} aria-label="Back to the list" style={iconBtn}>
                  <TIcon name="arrow-left" size={18} />
                </button>
              ) : (
                <TIcon name="help" size={20} color="var(--pds-gold)" />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--pds-text-hint)" }}>
                  How-to guides
                </div>
                <div style={{ fontFamily: "var(--pds-font-display)", fontSize: 20, fontWeight: 600, color: "var(--pds-gold-light)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {guide ? guide.title : pageLabel ?? "This page"}
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={iconBtn}>
                <TIcon name="x" size={18} />
              </button>
            </header>

            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {guide ? (
                <GuideBody guide={guide} onOpenFull={() => { setOpen(false); navigate({ to: "/how-to/$guideId", params: { guideId: guide.id } }); }} />
              ) : guides.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--pds-text-secondary)", lineHeight: 1.55 }}>
                    Step-by-step guides with screenshots for this page.
                  </p>
                  {guides.map((g) => (
                    <GuideCard key={g.id} guide={g} onClick={() => setGuideId(g.id)} />
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "36px 12px", color: "var(--pds-text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
                  <TIcon name="book-2" size={30} color="var(--pds-text-hint)" />
                  <p style={{ margin: "10px 0 0" }}>There are no how-to guides for this page yet.</p>
                </div>
              )}
            </div>

            <footer style={{ padding: 12, borderTop: "1px solid var(--pds-border)" }}>
              <button type="button" onClick={browseAll} style={{ ...howToButton, width: "100%", justifyContent: "center" }}>
                <TIcon name="books" size={16} /> Browse all how-to guides
              </button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

function GuideBody({ guide, onOpenFull }: { guide: HowToGuide; onOpenFull: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--pds-text-secondary)" }}>{guide.summary}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <PdfButton guides={[guide]} filename={guidePdfName(guide)} primary />
        <button type="button" onClick={onOpenFull} style={howToButton}>
          <TIcon name="arrows-maximize" size={16} /> Full page
        </button>
      </div>
      <GuideSteps guide={guide} compact />
    </div>
  );
}

export function GuideCard({ guide, onClick }: { guide: HowToGuide; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pds-howto-card"
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "12px 14px",
        borderRadius: "var(--pds-radius-lg)", border: "1px solid var(--pds-border)", background: "var(--pds-surface-2)",
        color: "var(--pds-text)", cursor: "pointer",
      }}
    >
      <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: "var(--pds-gold-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <TIcon name="list-numbers" size={18} color="var(--pds-gold-light)" />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{guide.title}</span>
        <span style={{ display: "block", fontSize: 14, color: "var(--pds-text-secondary)", lineHeight: 1.45, marginTop: 2 }}>{guide.summary}</span>
        <span style={{ display: "block", fontSize: 13, color: "var(--pds-text-hint)", marginTop: 4 }}>
          {guide.steps.length} steps · about {guide.minutes} min
        </span>
      </span>
      <TIcon name="chevron-right" size={16} color="var(--pds-text-hint)" />
    </button>
  );
}

const iconBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "var(--pds-radius-md)",
  border: "none", background: "transparent", color: "var(--pds-text-secondary)", cursor: "pointer",
} as const;
