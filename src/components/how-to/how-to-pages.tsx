/**
 * How-to Guides section (/how-to and /how-to/$guideId) — every guide, grouped by
 * sidebar section, searchable, each downloadable as a PDF (singly or per section).
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { TIcon } from "@/components/polaris-ui/primitives";
import { guideById, guidePdfName, guidesBySection, HOW_TO_GUIDES, type HowToGuide } from "@/lib/how-to/guides";
import { GuideSteps, PdfButton } from "./guide-view";
import { GuideCard } from "./help-button";

const page = { maxWidth: 1040, margin: "0 auto", padding: "8px 8px 48px", color: "var(--pds-text)" } as const;
const eyebrow = { fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--pds-text-hint)" } as const;
const h1 = { margin: "4px 0 0", fontFamily: "var(--pds-font-display)", fontSize: 30, fontWeight: 600, color: "var(--pds-gold-light)", lineHeight: 1.2 } as const;

function matches(g: HowToGuide, q: string): boolean {
  const hay = [g.title, g.summary, ...g.steps.flatMap((s) => [s.title, s.text, ...(s.bullets ?? [])])].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export function HowToIndexPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const sections = useMemo(
    () => guidesBySection().map((s) => ({ ...s, guides: q ? s.guides.filter((g) => matches(g, q)) : s.guides })).filter((s) => s.guides.length > 0),
    [q],
  );

  return (
    <div style={page}>
      <div style={eyebrow}>Resources</div>
      <h1 style={h1}>How-to Guides</h1>
      <p style={{ margin: "8px 0 20px", maxWidth: 680, fontSize: 15, lineHeight: 1.6, color: "var(--pds-text-secondary)" }}>
        Step-by-step instructions with screenshots for everyday tasks in Polaris. On any page, click the{" "}
        <TIcon name="help" size={15} color="var(--pds-gold-light)" /> button in the top bar (or press <kbd style={kbd}>?</kbd>) to see the guides for that page.
      </p>

      <div style={{ position: "relative", maxWidth: 420, marginBottom: 24 }}>
        <TIcon name="search" size={16} color="var(--pds-text-hint)" style={{ position: "absolute", left: 12, top: 11 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the guides…"
          aria-label="Search the guides"
          style={{
            width: "100%", height: 38, padding: "0 12px 0 36px", borderRadius: "var(--pds-radius-md)", fontSize: 15,
            border: "1px solid var(--pds-border-gold)", background: "var(--pds-surface-2)", color: "var(--pds-text)", outline: "none",
          }}
        />
      </div>

      {sections.length === 0 && (
        <p style={{ fontSize: 15, color: "var(--pds-text-secondary)" }}>No guides match “{q}”.</p>
      )}

      {sections.map((s) => (
        <section key={s.section} style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--pds-font-display)", fontSize: 24, fontWeight: 600, color: "var(--pds-text)" }}>{s.section}</h2>
            <span style={{ fontSize: 14, color: "var(--pds-text-hint)" }}>{s.guides.length} guides</span>
            <span style={{ flex: 1 }} />
            <PdfButton
              guides={guidesBySection().find((x) => x.section === s.section)!.guides}
              filename={`Polaris - ${s.section} How-to Guides.pdf`}
              title={`${s.section} How-to Guides`}
              label={`Download all ${s.section} guides (PDF)`}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 10 }}>
            {s.guides.map((g) => (
              <GuideCard key={g.id} guide={g} onClick={() => navigate({ to: "/how-to/$guideId", params: { guideId: g.id } })} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function HowToGuidePage({ guideId }: { guideId: string }) {
  const navigate = useNavigate();
  const guide = guideById(guideId);
  // Opening another guide (Related guides) starts at the top, not mid-page.
  useEffect(() => { document.querySelector("main")?.scrollTo(0, 0); }, [guideId]);
  if (!guide) {
    return (
      <div style={page}>
        <BackLink />
        <p style={{ fontSize: 15, color: "var(--pds-text-secondary)" }}>That guide doesn't exist — it may have been renamed.</p>
      </div>
    );
  }
  const related = HOW_TO_GUIDES.filter((g) => g.id !== guide.id && g.screens.some((s) => guide.screens.includes(s)));

  return (
    <div style={{ ...page, maxWidth: 900 }}>
      <BackLink />
      <div style={{ ...eyebrow, marginTop: 14 }}>{guide.section}</div>
      <h1 style={h1}>{guide.title}</h1>
      <p style={{ margin: "8px 0 4px", fontSize: 15, lineHeight: 1.6, color: "var(--pds-text-secondary)" }}>{guide.summary}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", margin: "12px 0 28px" }}>
        <span style={{ fontSize: 14, color: "var(--pds-text-hint)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <TIcon name="clock" size={15} /> {guide.steps.length} steps · about {guide.minutes} min
        </span>
        <PdfButton guides={[guide]} filename={guidePdfName(guide)} primary />
      </div>

      <GuideSteps guide={guide} />

      {related.length > 0 && (
        <section style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--pds-border)" }}>
          <h2 style={{ margin: "0 0 12px", fontFamily: "var(--pds-font-display)", fontSize: 22, fontWeight: 600 }}>Related guides</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 10 }}>
            {related.map((g) => (
              <GuideCard key={g.id} guide={g} onClick={() => navigate({ to: "/how-to/$guideId", params: { guideId: g.id } })} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/how-to" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--pds-text-secondary)", textDecoration: "none" }}>
      <TIcon name="arrow-left" size={15} /> All how-to guides
    </Link>
  );
}

const kbd = {
  display: "inline-block", minWidth: 20, padding: "0 6px", borderRadius: 4, fontSize: 13, lineHeight: "20px", textAlign: "center",
  border: "1px solid var(--pds-border-gold)", background: "var(--pds-surface-2)", color: "var(--pds-text)",
} as const;
