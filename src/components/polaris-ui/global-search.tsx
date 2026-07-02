/**
 * Global search (Ctrl/⌘+K) — top-bar palette searching across the whole app:
 * yachts, crew, visa applications, permits and e-sign documents. Selecting a
 * result deep-links to the matching detail page / hub tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PERMIT_META, type PermitType } from "@/lib/permit-types";
import { TIcon } from "./primitives";

type Result = {
  key: string;
  group: string;
  icon: string;
  title: string;
  subtitle: string;
  to: string;
};

const MIN_CHARS = 2;
const PER_ENTITY = 5;

async function runSearch(q: string): Promise<Result[]> {
  // Strip PostgREST or()-syntax delimiters and LIKE wildcards from the term.
  const like = `%${q.replace(/[,()"\\]/g, " ").replace(/[%_]/g, "\\$&").trim()}%`;
  const db = supabase as any;

  const [yachts, crew, visas, permits, docs] = await Promise.all([
    db.from("yachts")
      .select("id, vessel_name, flag, status")
      .or(`vessel_name.ilike.${like},imo_no.ilike.${like},mmsi.ilike.${like},radio_call_sign.ilike.${like}`)
      .limit(PER_ENTITY),
    db.from("crew_members")
      .select("id, full_name, first_name, last_name, rank, passport_number")
      .or(`full_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},passport_number.ilike.${like}`)
      .limit(PER_ENTITY),
    db.from("visa_applications")
      .select("id, given_name, surname, passport_number, vessel_name, status, jls_reference")
      .or(`given_name.ilike.${like},surname.ilike.${like},passport_number.ilike.${like},jls_reference.ilike.${like},visa_number.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY),
    db.from("permits")
      .select("id, permit_number, holder_name, permit_type, status")
      .or(`permit_number.ilike.${like},holder_name.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY),
    db.from("esign_documents")
      .select("id, reference, title, status")
      .or(`reference.ilike.${like},title.ilike.${like},signer_name.ilike.${like}`)
      .limit(PER_ENTITY),
  ]);

  const out: Result[] = [];
  for (const y of yachts.data ?? []) {
    out.push({
      key: `yacht-${y.id}`, group: "Yachts", icon: "sailboat",
      title: y.vessel_name ?? "—",
      subtitle: [y.flag, y.status].filter(Boolean).join(" · "),
      to: `/yachts/${y.id}`,
    });
  }
  for (const c of crew.data ?? []) {
    out.push({
      key: `crew-${c.id}`, group: "Crew", icon: "users",
      title: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—",
      subtitle: [c.rank, c.passport_number ? `Passport ${c.passport_number}` : null].filter(Boolean).join(" · "),
      to: `/crew-immigration/crew/${c.id}`,
    });
  }
  for (const v of visas.data ?? []) {
    out.push({
      key: `visa-${v.id}`, group: "Visa applications", icon: "passport",
      title: [v.given_name, v.surname].filter(Boolean).join(" ") || v.jls_reference || "—",
      subtitle: [v.vessel_name, v.status, v.passport_number].filter(Boolean).join(" · "),
      to: `/crew-immigration/visas/${v.id}`,
    });
  }
  for (const p of permits.data ?? []) {
    const meta = PERMIT_META[p.permit_type as PermitType];
    out.push({
      key: `permit-${p.id}`, group: "Permits", icon: "license",
      title: p.permit_number || p.holder_name || "—",
      subtitle: [meta?.label ?? p.permit_type, p.holder_name, p.status].filter(Boolean).join(" · "),
      to: (meta?.route as string) ?? "/permits/command-centre",
    });
  }
  for (const d of docs.data ?? []) {
    out.push({
      key: `doc-${d.id}`, group: "Documents & e-Sign", icon: "signature",
      title: d.title || d.reference || "—",
      subtitle: [d.reference, d.status].filter(Boolean).join(" · "),
      to: `/esign/${d.id}`,
    });
  }
  return out;
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // Ctrl/⌘+K opens, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQ(""); setResults([]); setActive(0); }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (q.trim().length < MIN_CHARS) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await runSearch(q.trim());
        if (seq.current === mySeq) { setResults(r); setActive(0); }
      } finally {
        if (seq.current === mySeq) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pick = useCallback((r: Result) => {
    setOpen(false);
    navigate({ to: r.to as any });
  }, [navigate]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active]); }
  };

  // Group rows for rendering while keeping the flat index for keyboard nav.
  let lastGroup = "";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Search everything (Ctrl+K)"
        style={{
          background: "var(--pds-surface-3)",
          border: "1px solid var(--pds-border)",
          color: "var(--pds-text-secondary)",
          fontSize: "var(--pds-fs-label)",
          padding: "5px 12px",
          minHeight: 32,
          borderRadius: "var(--pds-radius-full)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
        }}
      >
        <TIcon name="search" size={14} />
        <span>Search</span>
        <span
          style={{
            fontSize: 10,
            border: "1px solid var(--pds-border)",
            borderRadius: 4,
            padding: "1px 5px",
            color: "var(--pds-text-secondary)",
            opacity: 0.8,
          }}
        >
          Ctrl K
        </span>
      </button>

      {open && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(2,10,18,0.6)", backdropFilter: "blur(2px)",
            display: "flex", justifyContent: "center", alignItems: "flex-start",
            paddingTop: "12vh",
          }}
        >
          <div
            style={{
              width: "min(640px, calc(100vw - 32px))",
              background: "var(--pds-navy, #0a2438)",
              border: "1px solid var(--pds-border)",
              borderRadius: "var(--pds-radius-lg)",
              boxShadow: "0 24px 60px -12px rgba(0,0,0,0.6)",
              overflow: "hidden",
              fontFamily: "var(--pds-font-body)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--pds-border)" }}>
              <TIcon name="search" size={16} color="var(--pds-text-secondary)" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search yachts, crew, visas, permits, documents…"
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "var(--pds-text)", fontSize: 15, fontFamily: "var(--pds-font-body)",
                }}
              />
              {loading && <TIcon name="loader-2" size={15} color="var(--pds-text-secondary)" style={{ animation: "pds-shimmer 1s ease-in-out infinite" }} />}
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pds-text-secondary)", padding: 2, display: "flex" }}
                aria-label="Close search"
              >
                <TIcon name="x" size={16} />
              </button>
            </div>

            <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
              {q.trim().length < MIN_CHARS ? (
                <div style={{ padding: "22px 16px", fontSize: 13, color: "var(--pds-text-secondary)" }}>
                  Type at least {MIN_CHARS} characters — searches vessel names, crew names, passport numbers, permit numbers, references…
                </div>
              ) : !loading && results.length === 0 ? (
                <div style={{ padding: "22px 16px", fontSize: 13, color: "var(--pds-text-secondary)" }}>
                  No matches for “{q.trim()}”.
                </div>
              ) : (
                results.map((r, i) => {
                  const showHeader = r.group !== lastGroup;
                  lastGroup = r.group;
                  return (
                    <div key={r.key}>
                      {showHeader && (
                        <div style={{
                          padding: "10px 16px 4px", fontSize: 10, fontWeight: 600,
                          letterSpacing: "0.14em", textTransform: "uppercase",
                          color: "var(--pds-gold, #c8a559)",
                        }}>
                          {r.group}
                        </div>
                      )}
                      <button
                        onClick={() => pick(r)}
                        onMouseEnter={() => setActive(i)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, width: "100%",
                          padding: "9px 16px", cursor: "pointer", textAlign: "left",
                          background: i === active ? "var(--pds-surface-3)" : "transparent",
                          border: "none",
                        }}
                      >
                        <TIcon name={r.icon} size={16} color="var(--pds-text-secondary)" />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14, color: "var(--pds-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r.title}
                          </span>
                          {r.subtitle && (
                            <span style={{ display: "block", fontSize: 11.5, color: "var(--pds-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {r.subtitle}
                            </span>
                          )}
                        </span>
                        <TIcon name="arrow-right" size={13} color="var(--pds-text-secondary)" style={{ opacity: i === active ? 1 : 0.35 }} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
