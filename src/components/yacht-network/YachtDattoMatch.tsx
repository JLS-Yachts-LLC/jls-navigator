/**
 * Propose links between register systems and Datto RMM devices, on IP.
 *
 * Review-then-apply rather than auto-link. Datto's client mapping is patchy
 * (most synced devices carry no client_id), so a candidate can legitimately
 * come from another site's subnet — 192.168.1.1 exists on every vessel afloat.
 * Every row therefore shows the Datto site it came from, and anything the
 * matcher is not certain about arrives unticked.
 */
import { useMemo, useState } from "react";
import {
  normaliseIp, dattoPresence, type DattoDevice, type YachtSystem,
} from "@/components/yacht-network/taxonomy";
import { X, Loader2, Link2, AlertTriangle, CheckCircle2, ServerCog } from "lucide-react";

export interface ProposedLink {
  systemId: string;
  dattoUid: string;
}

interface Row {
  system: YachtSystem;
  ip: string;
  candidates: DattoDevice[];
  /** Ticked by default only when the match is unambiguous and unlinked. */
  confident: boolean;
  alreadyLinkedTo: DattoDevice | null;
}

export function YachtDattoMatch({ systems, devices, expectedSites, onApply, onClose }: {
  systems: YachtSystem[];
  devices: DattoDevice[];
  /** Datto site names already linked on this vessel — used to spot odd matches. */
  expectedSites: string[];
  onApply: (links: ProposedLink[]) => Promise<void>;
  onClose: () => void;
}) {
  const [applying, setApplying] = useState(false);

  // Index devices by normalised internal IP. Several devices can share one —
  // DHCP churn leaves stale rows behind — so this is a list, not a single hit.
  const byIp = useMemo(() => {
    const map = new Map<string, DattoDevice[]>();
    for (const d of devices) {
      // A record Datto has dropped is never the right answer — it's usually
      // the old MAC-named twin of the device Datto re-discovered.
      if (d.removed_from_datto_at) continue;
      const ip = normaliseIp(d.int_ip);
      if (!ip) continue;
      if (!map.has(ip)) map.set(ip, []);
      map.get(ip)!.push(d);
    }
    // Best candidate first, since ticking a row takes candidates[0]. Datto keeps
    // old untyped SNMP records (hostname = MAC, e.g. 5451DE10F446) alongside the
    // re-discovered named device at the same IP — it hides them from its own
    // Network view, but the API still returns them. Live, typed, recently seen
    // beats a record that last checked in months ago.
    const rank = (d: DattoDevice) =>
      (dattoPresence(d).stale ? 0 : 4) + (d.online ? 2 : 0) + (d.category ? 1 : 0);
    for (const list of map.values()) {
      list.sort((a, b) =>
        rank(b) - rank(a) ||
        (new Date(b.last_seen_at ?? 0).getTime() - new Date(a.last_seen_at ?? 0).getTime()));
    }
    return map;
  }, [devices]);

  const deviceByUid = useMemo(
    () => new Map(devices.map((d) => [d.datto_uid, d])),
    [devices],
  );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const system of systems) {
      const ip = normaliseIp(system.ip_address);
      if (!ip) continue;
      const candidates = byIp.get(ip) ?? [];
      if (candidates.length === 0) continue;
      const alreadyLinkedTo = system.datto_uid ? deviceByUid.get(system.datto_uid) ?? null : null;
      // One live device plus stale leftovers is not a real ambiguity.
      const live = candidates.filter((d) => !dattoPresence(d).stale);
      const clearWinner = candidates.length === 1 || live.length === 1;
      // Linked to a dead twin while the live device sits at the same IP: the
      // relink is the obvious fix, so offer it ticked.
      const stuckOnStale =
        !!alreadyLinkedTo && live.length === 1 && alreadyLinkedTo.datto_uid !== live[0].datto_uid &&
        dattoPresence(alreadyLinkedTo).stale;
      out.push({
        system,
        ip,
        candidates,
        confident: stuckOnStale || (
          clearWinner &&
          !system.datto_uid &&
          // An unexpected site is the main way an IP collision shows up.
          (expectedSites.length === 0 || expectedSites.includes(candidates[0].site_name ?? ""))
        ),
        alreadyLinkedTo,
      });
    }
    return out.sort((a, b) => a.system.name.localeCompare(b.system.name));
  }, [systems, byIp, deviceByUid, expectedSites]);

  // Selection: systemId -> chosen datto_uid, or null for "don't link".
  const [choice, setChoice] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(rows.map((r) => [r.system.id, r.confident ? r.candidates[0].datto_uid : null])),
  );

  const withIpNoMatch = useMemo(
    () => systems.filter((s) => normaliseIp(s.ip_address) && !(byIp.get(normaliseIp(s.ip_address)!)?.length)),
    [systems, byIp],
  );
  const withoutIp = useMemo(
    () => systems.filter((s) => !normaliseIp(s.ip_address)),
    [systems],
  );

  const selectedCount = Object.values(choice).filter(Boolean).length;

  const apply = async () => {
    const links: ProposedLink[] = Object.entries(choice)
      .filter(([, uid]) => !!uid)
      .map(([systemId, uid]) => ({ systemId, dattoUid: uid! }));
    if (links.length === 0) return;
    setApplying(true);
    await onApply(links);
    setApplying(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl border border-border bg-card shadow-xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2">
              <ServerCog className="h-4 w-4 text-primary" /> Match from Datto RMM
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Systems are matched on their IP address against Datto's internal IP.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <AlertTriangle className="h-6 w-6 mx-auto text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">No IP matches found</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                {withoutIp.length === systems.length
                  ? "None of this vessel's systems have an IP address recorded yet — add some and try again."
                  : "Datto has no device whose internal IP matches any system here. Check the Datto sync has the kit you expect."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const chosen = choice[row.system.id] ?? null;
                const ambiguous = row.candidates.length > 1;
                return (
                  <div
                    key={row.system.id}
                    className={`rounded-lg border p-3 ${chosen ? "border-primary/40 bg-primary/5" : "border-border"}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!!chosen}
                        onChange={(e) =>
                          setChoice((p) => ({
                            ...p,
                            [row.system.id]: e.target.checked ? row.candidates[0].datto_uid : null,
                          }))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {row.system.name}
                          <span className="ml-2 font-mono text-[11px] text-muted-foreground">{row.ip}</span>
                        </p>

                        {row.alreadyLinkedTo && (
                          <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                            Already linked to {row.alreadyLinkedTo.hostname ?? row.alreadyLinkedTo.datto_uid} — ticking this relinks it.
                          </p>
                        )}

                        <div className="mt-2 space-y-1">
                          {row.candidates.map((d) => {
                            const offSite =
                              expectedSites.length > 0 && !expectedSites.includes(d.site_name ?? "");
                            return (
                              <label
                                key={d.datto_uid}
                                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer ${
                                  chosen === d.datto_uid ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                                }`}
                              >
                                {ambiguous && (
                                  <input
                                    type="radio"
                                    name={`cand-${row.system.id}`}
                                    checked={chosen === d.datto_uid}
                                    onChange={() => setChoice((p) => ({ ...p, [row.system.id]: d.datto_uid }))}
                                  />
                                )}
                                <span
                                  className="h-2 w-2 rounded-full shrink-0"
                                  style={{ background: dattoPresence(d).colour }}
                                  title={dattoPresence(d).label}
                                />
                                <span className="font-medium truncate">{d.hostname ?? d.device_name ?? d.datto_uid}</span>
                                {d.category && <span className="text-muted-foreground truncate">{d.category}</span>}
                                <span className={`ml-auto shrink-0 ${offSite ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                                  {offSite && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                                  {d.site_name ?? "No site"}
                                </span>
                              </label>
                            );
                          })}
                        </div>

                        {ambiguous && (
                          <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                            {row.candidates.length} devices share this IP — pick the right one.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(withIpNoMatch.length > 0 || withoutIp.length > 0) && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1">
              {withIpNoMatch.length > 0 && (
                <p>{withIpNoMatch.length} system{withIpNoMatch.length === 1 ? " has" : "s have"} an IP with no Datto device at that address.</p>
              )}
              {withoutIp.length > 0 && (
                <p>{withoutIp.length} system{withoutIp.length === 1 ? " has" : "s have"} no IP recorded, so can't be matched this way.</p>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            {selectedCount > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
            {selectedCount} of {rows.length} will be linked
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={apply}
              disabled={applying || selectedCount === 0}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Link {selectedCount > 0 ? selectedCount : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
