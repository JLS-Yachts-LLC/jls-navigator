import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { NAV_GROUPS } from "@/components/polaris-ui/shell";
import { BADGE_OPTIONS, BADGE_META, loadAllFeatureBadges, setFeatureBadge, type BadgeKind } from "@/lib/feature-badges";

/** Settings → Feature Release: tag any sidebar nav item with a lifecycle badge
 *  (Beta / In Development / Active). The badge renders as a small pill in the
 *  left sidebar (see polaris-ui/shell.tsx → NavList). */
export function FeatureReleasePanel() {
  const [map, setMap] = useState<Record<string, "none" | BadgeKind>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { loadAllFeatureBadges().then((m) => { setMap(m); setLoading(false); }); }, []);

  async function change(screen: string, value: "none" | BadgeKind) {
    setSaving(screen);
    const prev = map[screen] ?? "none";
    setMap((m) => ({ ...m, [screen]: value }));
    try { await setFeatureBadge(screen, value); }
    catch (e: any) { toast.error(e?.message ?? "Could not save"); setMap((m) => ({ ...m, [screen]: prev })); }
    finally { setSaving(null); }
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Feature Release</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tag any menu item with a lifecycle badge — it shows as a small pill next to that item in the sidebar. Changes apply immediately.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(["beta", "in_development", "active"] as BadgeKind[]).map((k) => <BadgePill key={k} kind={k} />)}
      </div>

      <div className="mt-5 space-y-5">
        {NAV_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">{g.label}</div>
            <div className="divide-y divide-border/50 rounded-xl border border-border">
              {g.items.map((it) => {
                const cur = map[it.screen] ?? "none";
                return (
                  <div key={it.screen} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex-1 truncate text-sm">{it.label}</span>
                    {cur !== "none" && <BadgePill kind={cur as BadgeKind} />}
                    {saving === it.screen && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    <select
                      value={cur}
                      disabled={saving === it.screen}
                      onChange={(e) => void change(it.screen, e.target.value as "none" | BadgeKind)}
                      className="h-8 w-40 rounded-md border border-border px-2 text-xs"
                      style={{ backgroundColor: "#0e1c26", color: "#e6edf3" }}
                    >
                      {BADGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value} style={{ backgroundColor: "#0e1c26", color: "#e6edf3" }}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BadgePill({ kind }: { kind: BadgeKind }) {
  const m = BADGE_META[kind];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, lineHeight: 1, letterSpacing: "0.04em",
      padding: "2px 6px", borderRadius: 5, textTransform: "uppercase",
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
    }}>{m.label}</span>
  );
}
