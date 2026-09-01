/**
 * Global search (Ctrl/⌘+K) — top-bar palette searching across the whole app:
 * yachts, crew, visa applications, permits, e-sign documents, ORBIT (small
 * boats, projects, service requests, defects) and ShipSync (packages, delivery
 * notes). Selecting a result deep-links to the matching detail page / hub tab.
 *
 * Areas are declared in SOURCES below, and each one is isolated: if a lookup
 * fails the others still return, and the palette names the area it could not
 * reach instead of quietly showing fewer results.
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

/**
 * One searchable area: how to look it up, and how to render a hit. Kept as a list
 * so adding an area is one entry rather than another hand-rolled block — and so a
 * single area failing can be reported without taking the rest of the search down.
 */
type Source = {
  group: string;
  icon: string;
  run: (db: any, like: string) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>;
  map: (row: any) => { key: string; title: string; subtitle: string; to: string };
};

const MIN_CHARS = 2;
const PER_ENTITY = 5;

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

const SOURCES: Source[] = [
  {
    group: "Yachts", icon: "sailboat",
    run: (db, like) => db.from("yachts")
      .select("id, vessel_name, flag, status")
      .or(`vessel_name.ilike.${like},imo_no.ilike.${like},mmsi.ilike.${like},radio_call_sign.ilike.${like}`)
      .limit(PER_ENTITY),
    map: (y) => ({
      key: `yacht-${y.id}`,
      title: y.vessel_name ?? "—",
      subtitle: join(y.flag, y.status),
      to: `/yachts/${y.id}`,
    }),
  },
  {
    group: "Crew", icon: "users",
    run: (db, like) => db.from("crew_members")
      .select("id, full_name, first_name, last_name, rank, passport_number")
      .or(`full_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},passport_number.ilike.${like}`)
      .limit(PER_ENTITY),
    map: (c) => ({
      key: `crew-${c.id}`,
      title: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—",
      subtitle: join(c.rank, c.passport_number && `Passport ${c.passport_number}`),
      to: `/crew-immigration/crew/${c.id}`,
    }),
  },
  {
    group: "Visa applications", icon: "passport",
    run: (db, like) => db.from("visa_applications")
      .select("id, given_name, surname, passport_number, vessel_name, status, jls_reference")
      .or(`given_name.ilike.${like},surname.ilike.${like},passport_number.ilike.${like},jls_reference.ilike.${like},visa_number.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY),
    map: (v) => ({
      key: `visa-${v.id}`,
      title: [v.given_name, v.surname].filter(Boolean).join(" ") || v.jls_reference || "—",
      subtitle: join(v.vessel_name, v.status, v.passport_number),
      to: `/crew-immigration/visas/${v.id}`,
    }),
  },
  {
    group: "Permits", icon: "license",
    run: (db, like) => db.from("permits")
      .select("id, permit_number, holder_name, permit_type, status")
      .or(`permit_number.ilike.${like},holder_name.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY),
    map: (p) => {
      const meta = PERMIT_META[p.permit_type as PermitType];
      return {
        key: `permit-${p.id}`,
        title: p.permit_number || p.holder_name || "—",
        subtitle: join(meta?.label ?? p.permit_type, p.holder_name, p.status),
        to: (meta?.route as string) ?? "/permits/command-centre",
      };
    },
  },
  {
    group: "Documents & e-Sign", icon: "signature",
    run: (db, like) => db.from("esign_documents")
      .select("id, reference, title, status")
      .or(`reference.ilike.${like},title.ilike.${like},signer_name.ilike.${like}`)
      .limit(PER_ENTITY),
    map: (d) => ({
      key: `doc-${d.id}`,
      title: d.title || d.reference || "—",
      subtitle: join(d.reference, d.status),
      to: `/esign/${d.id}`,
    }),
  },
  // ── ORBIT ──────────────────────────────────────────────────────────────────
  // Everything on the ORBIT screens used to be invisible here: searching a boat
  // you were looking at returned nothing, which read as the search being broken.
  {
    group: "Small boats", icon: "sailboat",
    run: (db, like) => db.from("orbit_boats")
      .select("id, name, boat_type, manufacturer, model, registration")
      .or(`name.ilike.${like},registration.ilike.${like},manufacturer.ilike.${like},model.ilike.${like}`)
      .limit(PER_ENTITY),
    map: (b) => ({
      key: `orbit-boat-${b.id}`,
      title: b.name ?? "—",
      subtitle: join(b.boat_type, [b.manufacturer, b.model].filter(Boolean).join(" "), b.registration),
      // The boats hub keeps the selected boat in page state, so there is no
      // per-boat URL to deep-link to — land on the hub.
      to: "/orbit/boats",
    }),
  },
  {
    group: "Orbit projects", icon: "layout-kanban",
    run: (db, like) => db.from("orbit_projects")
      .select("id, name, status, priority")
      .or(`name.ilike.${like},description.ilike.${like}`)
      .limit(PER_ENTITY),
    map: (p) => ({
      key: `orbit-project-${p.id}`,
      title: p.name ?? "—",
      subtitle: join(p.status, p.priority),
      to: `/orbit/${p.id}`,
    }),
  },
  {
    group: "Service requests", icon: "clipboard-list",
    run: (db, like) => db.from("orbit_service_requests")
      .select("id, title, status")
      .or(`title.ilike.${like},description.ilike.${like}`)
      .limit(PER_ENTITY),
    map: (r) => ({
      key: `orbit-request-${r.id}`,
      title: r.title ?? "—",
      subtitle: join(r.status),
      to: `/orbit/requests/${r.id}`,
    }),
  },
  {
    group: "Defects & repairs", icon: "tools",
    run: (db, like) => db.from("orbit_defects")
      .select("id, title, severity, status")
      .or(`title.ilike.${like},description.ilike.${like}`)
      .limit(PER_ENTITY),
    map: (d) => ({
      key: `orbit-defect-${d.id}`,
      title: d.title ?? "—",
      subtitle: join(d.severity, d.status),
      to: "/orbit/defects",
    }),
  },
  // ── ShipSync ───────────────────────────────────────────────────────────────
  {
    group: "Packages", icon: "package",
    run: (db, like) => db.from("shipsync_packages")
      .select("id, barcode, boat_name, package_owner, courier, status")
      .or(`barcode.ilike.${like},boat_name.ilike.${like},package_owner.ilike.${like},delivery_note_no.ilike.${like}`)
      .limit(PER_ENTITY),
    map: (p) => ({
      key: `package-${p.id}`,
      title: p.barcode || p.boat_name || "—",
      subtitle: join(p.boat_name, p.package_owner, p.courier, p.status),
      to: "/shipsync",
    }),
  },
  {
    group: "Delivery notes", icon: "file-text",
    run: (db, like) => db.from("shipsync_delivery_notes")
      .select("id, number, boat_name, status")
      .or(`number.ilike.${like},boat_name.ilike.${like}`)
      .limit(PER_ENTITY),
    map: (n) => ({
      key: `dn-${n.id}`,
      title: n.number ? `DN-${n.number}` : "—",
      subtitle: join(n.boat_name, n.status),
      to: "/shipsync",
    }),
  },
];

/** Results plus the areas that could not be reached, so the palette can say so. */
type SearchOutcome = { results: Result[]; failed: string[] };

async function runSearch(q: string): Promise<SearchOutcome> {
  // Strip PostgREST or()-syntax delimiters and LIKE wildcards from the term.
  const like = `%${q.replace(/[,()"\\]/g, " ").replace(/[%_]/g, "\\$&").trim()}%`;
  const db = supabase as any;

  const settled = await Promise.all(
    SOURCES.map(async (source) => {
      try {
        const { data, error } = await source.run(db, like);
        // A failing area used to be swallowed by `data ?? []`, so a broken query
        // was indistinguishable from "no matches". Report it instead.
        if (error) return { source, rows: [] as any[], failed: true };
        return { source, rows: data ?? [], failed: false };
      } catch {
        return { source, rows: [] as any[], failed: true };
      }
    }),
  );

  const results: Result[] = [];
  const failed: string[] = [];
  for (const { source, rows, failed: didFail } of settled) {
    if (didFail) { failed.push(source.group); continue; }
    for (const row of rows) results.push({ group: source.group, icon: source.icon, ...source.map(row) });
  }
  return { results, failed };
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
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
    else { setQ(""); setResults([]); setFailed([]); setActive(0); }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (q.trim().length < MIN_CHARS) { setResults([]); setFailed([]); setLoading(false); return; }
    setLoading(true);
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const { results: r, failed: f } = await runSearch(q.trim());
        if (seq.current === mySeq) { setResults(r); setFailed(f); setActive(0); }
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
                placeholder="Search yachts, crew, visas, permits, boats, projects, packages…"
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
              {/* Say so when an area could not be reached, rather than quietly
                  returning fewer results and looking like there were no matches. */}
              {failed.length > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 16px", fontSize: 12,
                  color: "var(--pds-warning, #e0a44a)",
                  borderBottom: "1px solid var(--pds-border)",
                  background: "rgba(224,164,74,0.08)",
                }}>
                  <TIcon name="alert-triangle" size={14} />
                  <span>Couldn’t search {failed.join(", ")} — these results may be incomplete.</span>
                </div>
              )}
              {q.trim().length < MIN_CHARS ? (
                <div style={{ padding: "22px 16px", fontSize: 13, color: "var(--pds-text-secondary)" }}>
                  Type at least {MIN_CHARS} characters — searches vessel and boat names, crew names, passport and permit numbers, project and package references…
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
