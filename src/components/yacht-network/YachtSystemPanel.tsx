/**
 * The detail panel for one system — the four groups the register exists to
 * capture: network identity, support & vendor, lifecycle, access & location.
 *
 * Fields commit on blur rather than on every keystroke, so a slow satellite
 * link doesn't turn typing a hostname into forty round trips. The whole panel
 * is keyed on the system id upstream, so switching systems remounts the inputs
 * instead of leaving stale drafts behind.
 */
import { createContext, useContext, useEffect, useState } from "react";
import {
  DISCIPLINES, LINK_TYPES, STATUSES, CRITICALITIES, disciplineMeta, linkMeta,
  inputCls, daysUntil, CONTRACT_WARN_DAYS, normaliseIp, dattoPresence,
  type YachtSystem, type YachtLink, type LinkType,
  type DattoDevice,
} from "@/components/yacht-network/taxonomy";

/**
 * View-only access (the operations and orbit departments hold view on yacht_it).
 * A context rather than a disabled <fieldset>, because a fieldset would also
 * disable the section toggles and the "open linked system" buttons — reading a
 * system should still mean being able to expand it and follow its links.
 */
const ReadOnly = createContext(false);
import {
  X, Trash2, ChevronDown, Network, LifeBuoy, History, MapPin, KeyRound, Cable,
  ServerCog, Unlink, DownloadCloud,
} from "lucide-react";

export function YachtSystemPanel({
  system, systems, links, datto, readOnly = false,
  onChange, onDelete, onUpdateLink, onDeleteLink, onUnlinkDatto, onPullFromDatto,
  onClose, onSelect,
}: {
  system: YachtSystem;
  systems: YachtSystem[];
  links: YachtLink[];
  datto: DattoDevice | null;
  readOnly?: boolean;
  onChange: (id: string, patch: Partial<YachtSystem>) => void;
  onDelete: (id: string) => void;
  onUpdateLink: (id: string, patch: Partial<YachtLink>) => void;
  onDeleteLink: (id: string) => void;
  onUnlinkDatto: (systemId: string) => void;
  onPullFromDatto: (system: YachtSystem) => void;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const meta = disciplineMeta(system.discipline);
  const Icon = meta.icon;
  const set = (patch: Partial<YachtSystem>) => onChange(system.id, patch);

  const others = systems.filter((s) => s.id !== system.id);
  const myLinks = links.filter((l) => l.from_system_id === system.id || l.to_system_id === system.id);
  const nameOf = (id: string) => systems.find((s) => s.id === id)?.name ?? "Unknown";

  const contractLeft = daysUntil(system.support_contract_end);

  return (
    <ReadOnly.Provider value={readOnly}>
    <aside key={system.id} className="w-[360px] shrink-0 border-l border-border bg-card flex flex-col min-h-0">
      <div className="shrink-0 flex items-start gap-2 border-b border-border px-4 py-3">
        <Icon className="h-5 w-5 mt-0.5 shrink-0" style={{ color: meta.colour }} />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{system.name}</p>
          <p className="text-[11px] text-muted-foreground">{meta.label}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">

        {/* Identity — always open, it's what you came for */}
        <div className="space-y-2.5">
          <Text label="Name" value={system.name} onCommit={(v) => set({ name: v || "Unnamed system" })} />

          <Field label="Discipline">
            <select
              value={system.discipline}
              onChange={(e) => set({ discipline: e.target.value as YachtSystem["discipline"] })}
              className={inputCls}
              disabled={readOnly}
            >
              {DISCIPLINES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Text label="Manufacturer" value={system.manufacturer} onCommit={(v) => set({ manufacturer: v || null })} />
            <Text label="Model" value={system.model} onCommit={(v) => set({ model: v || null })} />
          </div>

          <Area label="What it does" value={system.role_description} rows={2}
                onCommit={(v) => set({ role_description: v || null })} />

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Status">
              <select
                value={system.status}
                onChange={(e) => set({ status: e.target.value as YachtSystem["status"] })}
                className={inputCls}
              disabled={readOnly}
              >
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Criticality">
              <select
                value={system.criticality}
                onChange={(e) => set({ criticality: e.target.value as YachtSystem["criticality"] })}
                className={inputCls}
              disabled={readOnly}
              >
                {CRITICALITIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <Section title="Network identity" icon={Network} defaultOpen>
          <div className="grid grid-cols-2 gap-2.5">
            <Text label="Hostname" value={system.hostname} mono onCommit={(v) => set({ hostname: v || null })} />
            <Text label="IP address" value={system.ip_address} mono onCommit={(v) => set({ ip_address: v || null })} />
            <Text label="Subnet / mask" value={system.subnet} mono onCommit={(v) => set({ subnet: v || null })} />
            <Text label="VLAN" value={system.vlan} mono onCommit={(v) => set({ vlan: v || null })} />
            <Text label="MAC" value={system.mac} mono onCommit={(v) => set({ mac: v || null })} />
            <Text label="Switch port" value={system.switch_port} onCommit={(v) => set({ switch_port: v || null })} />
          </div>
          <Field label="Uplinks to">
            <select
              value={system.uplink_system_id ?? ""}
              onChange={(e) => set({ uplink_system_id: e.target.value || null })}
              className={inputCls}
              disabled={readOnly}
            >
              <option value="">— nothing recorded —</option>
              {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cables the two together on the map, unless you've already drawn a link between them.
            </p>
          </Field>
          {system.uplink_system_id && (
            <button
              onClick={() => onSelect(system.uplink_system_id!)}
              className="text-[11px] text-primary hover:underline"
            >
              Open {nameOf(system.uplink_system_id)} →
            </button>
          )}
        </Section>

        {system.datto_uid && (
          <Section title="Datto RMM" icon={ServerCog} defaultOpen>
            {!datto ? (
              <div className="space-y-2">
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Linked to a device that is no longer in the Datto sync. It may have been
                  removed from Datto, or the sync hasn't picked it up.
                </p>
                <p className="text-[11px] text-muted-foreground font-mono break-all">{system.datto_uid}</p>
                {!readOnly && (
                  <button
                    onClick={() => onUnlinkDatto(system.id)}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-muted"
                  >
                    <Unlink className="h-3.5 w-3.5" /> Unlink
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const presence = dattoPresence(datto);
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: presence.colour }}
                        />
                        <span className="text-sm font-medium truncate">
                          {datto.hostname ?? datto.device_name ?? "Unnamed device"}
                        </span>
                        <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                          {presence.label}
                        </span>
                      </div>
                      {presence.stale && (
                        <p className="text-[11px] text-muted-foreground">
                          Datto's API hasn't had a check-in from this device since
                          {datto.last_seen_at ? ` ${new Date(datto.last_seen_at).toLocaleDateString()}` : " ever"},
                          so it reports no state rather than off. Agentless kit — SNMP switches,
                          network-discovered devices — behaves this way even while Datto's own
                          console shows it up.
                        </p>
                      )}
                    </>
                  );
                })()}

                <dl className="text-[11px] space-y-1">
                  <Row label="Datto site" value={datto.site_name} />
                  <Row label="Category" value={datto.category} />
                  <Row label="Internal IP" value={datto.int_ip} mono />
                  <Row label="External IP" value={datto.ext_ip} mono />
                  <Row label="OS" value={datto.operating_system} />
                  <Row label="Last user" value={datto.logged_in_username} />
                  <Row
                    label="Last seen"
                    value={datto.last_seen_at ? new Date(datto.last_seen_at).toLocaleString() : null}
                  />
                  <Row
                    label="Linked"
                    value={system.datto_linked_at ? new Date(system.datto_linked_at).toLocaleDateString() : null}
                  />
                </dl>

                {datto.int_ip && normalisedDiffers(system.ip_address, datto.int_ip) && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    This system records {system.ip_address}, but Datto now reports {datto.int_ip}.
                    The device may have been re-addressed since the link was made.
                  </p>
                )}

                {!readOnly && <div className="flex gap-2">
                  <button
                    onClick={() => onPullFromDatto(system)}
                    title="Fill any blank hostname, IP or version fields from Datto"
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-muted"
                  >
                    <DownloadCloud className="h-3.5 w-3.5" /> Fill blanks
                  </button>
                  <button
                    onClick={() => onUnlinkDatto(system.id)}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-muted"
                  >
                    <Unlink className="h-3.5 w-3.5" /> Unlink
                  </button>
                </div>}
              </div>
            )}
          </Section>
        )}

        {/* No vendor picker: on New Horizon it links their procurement vendors,
            which have no counterpart here. The supplier is the useful answer. */}
        <Section title="Support & vendor" icon={LifeBuoy}>
          <Text label="Supplier / integrator" value={system.supplier_name}
                onCommit={(v) => set({ supplier_name: v || null })} />
          <Field label="Support contract ends">
            <input
              type="date"
              value={system.support_contract_end ?? ""}
              onChange={(e) => set({ support_contract_end: e.target.value || null })}
              className={inputCls}
              disabled={readOnly}
            />
            {contractLeft !== null && contractLeft < 0 && (
              <p className="mt-1 text-[11px] text-destructive">Lapsed {Math.abs(contractLeft)} days ago.</p>
            )}
            {contractLeft !== null && contractLeft >= 0 && contractLeft <= CONTRACT_WARN_DAYS && (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Expires in {contractLeft} days.</p>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Text label="Support phone" value={system.support_phone} onCommit={(v) => set({ support_phone: v || null })} />
            <Text label="Support email" value={system.support_email} onCommit={(v) => set({ support_email: v || null })} />
          </div>
          <Area label="Escalation notes" value={system.escalation_notes} rows={3}
                onCommit={(v) => set({ escalation_notes: v || null })} />
        </Section>

        <Section title="Lifecycle & compliance" icon={History}>
          <Text label="Firmware / software version" value={system.firmware_version}
                onCommit={(v) => set({ firmware_version: v || null })} />
          <div className="grid grid-cols-2 gap-2.5">
            <DateField label="Installed" value={system.install_date} onCommit={(v) => set({ install_date: v })} />
            <DateField label="Warranty ends" value={system.warranty_end} onCommit={(v) => set({ warranty_end: v })} />
            <DateField label="End of life" value={system.eol_date} onCommit={(v) => set({ eol_date: v })} />
            <DateField label="Last serviced" value={system.last_serviced} onCommit={(v) => set({ last_serviced: v })} />
          </div>
        </Section>

        <Section title="Access & location" icon={MapPin}>
          <div className="grid grid-cols-2 gap-2.5">
            <Text label="Deck" value={system.deck} onCommit={(v) => set({ deck: v || null })} />
            <Text label="Compartment" value={system.compartment} onCommit={(v) => set({ compartment: v || null })} />
          </div>
          <Text label="Rack / position" value={system.rack_location} onCommit={(v) => set({ rack_location: v || null })} />
          <Area label="Access notes" value={system.access_notes} rows={2}
                onCommit={(v) => set({ access_notes: v || null })} />
          <Field label={<span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" /> Credential reference</span>}>
            <input
              value={system.credential_ref ?? ""}
              onChange={(e) => set({ credential_ref: e.target.value || null })}
              placeholder="e.g. Keeper › M/Y Aurora › Crestron CP4"
              className={inputCls}
              disabled={readOnly}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Where the credentials live — never the credentials themselves.
            </p>
          </Field>
        </Section>

        <Section title={`Links (${myLinks.length})`} icon={Cable}>
          {myLinks.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nothing cabled to this yet. Draw connections on the Map tab.
            </p>
          ) : (
            <div className="space-y-1.5">
              {myLinks.map((l) => {
                const otherId = l.from_system_id === system.id ? l.to_system_id : l.from_system_id;
                const lm = linkMeta(l.link_type);
                return (
                  <div key={l.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: lm.colour }} />
                    <button
                      onClick={() => onSelect(otherId)}
                      className="text-xs truncate hover:underline min-w-0 flex-1 text-left"
                      title={nameOf(otherId)}
                    >
                      {l.from_system_id === system.id ? "→ " : "← "}{nameOf(otherId)}
                    </button>
                    <select
                      value={l.link_type}
                      onChange={(e) => onUpdateLink(l.id, { link_type: e.target.value as LinkType })}
                      disabled={readOnly}
                      className="text-[11px] bg-background border border-border rounded px-1 py-0.5"
                    >
                      {LINK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    {!readOnly && (
                      <button
                        onClick={() => onDeleteLink(l.id)}
                        title="Remove link"
                        className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Area label="Notes" value={system.notes} rows={4} onCommit={(v) => set({ notes: v || null })} />

        <div className="pt-2 border-t border-border">
          <label className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <input
              type="checkbox"
              checked={system.on_canvas}
              disabled={readOnly}
              onChange={(e) => set({ on_canvas: e.target.checked })}
            />
            Show on the map
          </label>
          {!readOnly && (
            <button
              onClick={() => onDelete(system.id)}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete system
            </button>
          )}
        </div>
      </div>
    </aside>
    </ReadOnly.Provider>
  );
}

// ─── Datto helpers ────────────────────────────────────────────────────────────

/** True only when both are real addresses and they genuinely differ. */
function normalisedDiffers(recorded: string | null, live: string | null) {
  const a = normaliseIp(recorded);
  const b = normaliseIp(live);
  return !!a && !!b && a !== b;
}

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground shrink-0 w-24">{label}</dt>
      <dd className={`min-w-0 break-words ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

// ─── Field primitives ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Section({ title, icon: Icon, defaultOpen, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-muted/50 rounded-lg"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="truncate">{title}</span>
        <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

/** Text input that only writes back once you leave it. */
function Text({ label, value, mono, onCommit }: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  onCommit: (value: string) => void;
}) {
  const ro = useContext(ReadOnly);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  return (
    <Field label={label}>
      <input
        disabled={ro}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (value ?? "")) onCommit(draft.trim()); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={`${inputCls} ${mono ? "font-mono text-xs" : ""}`}
      />
    </Field>
  );
}

function Area({ label, value, rows, onCommit }: {
  label: string;
  value: string | null | undefined;
  rows: number;
  onCommit: (value: string) => void;
}) {
  const ro = useContext(ReadOnly);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  return (
    <Field label={label}>
      <textarea
        disabled={ro}
        rows={rows}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (value ?? "")) onCommit(draft.trim()); }}
        className={`${inputCls} resize-y`}
      />
    </Field>
  );
}

function DateField({ label, value, onCommit }: {
  label: string;
  value: string | null;
  onCommit: (value: string | null) => void;
}) {
  const ro = useContext(ReadOnly);
  return (
    <Field label={label}>
      <input
        type="date"
        disabled={ro}
        value={value ?? ""}
        onChange={(e) => onCommit(e.target.value || null)}
        className={inputCls}
      />
    </Field>
  );
}
