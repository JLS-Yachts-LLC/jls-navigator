/**
 * Shared vocabulary for the Yacht IT Network module — disciplines, link types,
 * status and criticality — plus the row shapes every view works from.
 *
 * Kept in one place because the register, the detail panel and the canvas all
 * need to agree on what a "discipline" is: the register groups by it, the
 * canvas colours by it, and auto-layout tiers by it.
 *
 * Ported from the New Horizon-IT service desk (src/components/yacht-it/), where
 * the module was built, and kept in two-way sync with it. The vocabulary below
 * must stay identical on both sides: the database CHECK constraints mirror it,
 * and a value only one desk knows is rejected by the other's sync.
 */
import {
  Satellite, Network, Wifi, Server, Tv, Lightbulb, Compass, Camera,
  PhoneCall, Sparkles, BatteryCharging, Laptop, Boxes,
  type LucideIcon,
} from "lucide-react";

// ─── Disciplines ──────────────────────────────────────────────────────────────

export type Discipline =
  | "wan_comms" | "core_network" | "wireless" | "servers_storage"
  | "av_entertainment" | "lighting_knx" | "bridge_nav" | "security_cctv"
  | "telephony" | "bespoke_platform" | "power_ups" | "crew_it" | "other";

export interface DisciplineMeta {
  key: Discipline;
  label: string;
  /** One line in the "add system" picker, describing what belongs here. */
  hint: string;
  icon: LucideIcon;
  /** Tailwind-free hex, so React Flow nodes and register pills can share it. */
  colour: string;
  /** Row on the auto-laid-out canvas: 0 is the top (off-ship), 4 the endpoints. */
  tier: number;
}

export const DISCIPLINES: DisciplineMeta[] = [
  { key: "wan_comms",        label: "WAN & Comms",        hint: "VSAT, Starlink, bonded 4G/5G, shore connections", icon: Satellite,       colour: "#0ea5e9", tier: 0 },
  { key: "core_network",     label: "Core Network",       hint: "Firewalls, routers, core and access switches",    icon: Network,         colour: "#6366f1", tier: 1 },
  { key: "wireless",         label: "Wireless",           hint: "Controllers, access points, guest Wi-Fi",         icon: Wifi,            colour: "#8b5cf6", tier: 2 },
  { key: "servers_storage",  label: "Servers & Storage",  hint: "Servers, NAS, backup appliances, hypervisors",    icon: Server,          colour: "#14b8a6", tier: 2 },
  { key: "av_entertainment", label: "AV & Entertainment", hint: "Crestron, Kaleidescape, matrices, displays",      icon: Tv,              colour: "#f43f5e", tier: 3 },
  { key: "lighting_knx",     label: "Lighting & KNX",     hint: "KNX gateways, DALI, lighting controllers",        icon: Lightbulb,       colour: "#eab308", tier: 3 },
  { key: "bridge_nav",       label: "Bridge & Nav",       hint: "ECDIS, NMEA gateways, radar, AIS feeds",          icon: Compass,         colour: "#0891b2", tier: 3 },
  { key: "security_cctv",    label: "Security & CCTV",    hint: "NVRs, cameras, access control",                   icon: Camera,          colour: "#64748b", tier: 3 },
  { key: "telephony",        label: "Telephony",          hint: "PBX, handsets, DECT, GSM gateways",               icon: PhoneCall,       colour: "#22c55e", tier: 3 },
  { key: "bespoke_platform", label: "Bespoke Platforms",  hint: "YachtEye, IDEA, alarm & monitoring platforms",    icon: Sparkles,        colour: "#d946ef", tier: 3 },
  { key: "power_ups",        label: "Power & UPS",        hint: "UPS, PDUs, inverters serving IT loads",           icon: BatteryCharging, colour: "#f97316", tier: 4 },
  { key: "crew_it",          label: "Crew & Guest IT",    hint: "Workstations, printers, tablets, TVs in cabins",  icon: Laptop,          colour: "#94a3b8", tier: 4 },
  { key: "other",            label: "Other",              hint: "Anything that doesn't sit under the above",       icon: Boxes,           colour: "#a1a1aa", tier: 4 },
];

export const DISCIPLINE_MAP: Record<Discipline, DisciplineMeta> = Object.fromEntries(
  DISCIPLINES.map((d) => [d.key, d]),
) as Record<Discipline, DisciplineMeta>;

export const disciplineMeta = (key: string | null | undefined): DisciplineMeta =>
  DISCIPLINE_MAP[(key ?? "other") as Discipline] ?? DISCIPLINE_MAP.other;

// ─── Link types ───────────────────────────────────────────────────────────────

export type LinkType =
  | "ethernet" | "fibre" | "wireless" | "serial" | "hdmi" | "dante" | "knx_bus" | "power";

export interface LinkMeta {
  key: LinkType;
  label: string;
  colour: string;
  /** SVG stroke-dasharray; undefined draws solid. */
  dash?: string;
}

export const LINK_TYPES: LinkMeta[] = [
  { key: "ethernet", label: "Ethernet",  colour: "#3b82f6" },
  { key: "fibre",    label: "Fibre",     colour: "#f59e0b", dash: "8 4" },
  { key: "wireless", label: "Wireless",  colour: "#8b5cf6", dash: "2 4" },
  { key: "serial",   label: "Serial",    colour: "#64748b", dash: "6 3" },
  { key: "hdmi",     label: "HDMI / AV", colour: "#f43f5e" },
  { key: "dante",    label: "Dante",     colour: "#a855f7" },
  { key: "knx_bus",  label: "KNX bus",   colour: "#22c55e", dash: "4 3" },
  { key: "power",    label: "Power",     colour: "#ef4444", dash: "1 5" },
];

export const LINK_MAP: Record<LinkType, LinkMeta> = Object.fromEntries(
  LINK_TYPES.map((l) => [l.key, l]),
) as Record<LinkType, LinkMeta>;

export const linkMeta = (key: string | null | undefined): LinkMeta =>
  LINK_MAP[(key ?? "ethernet") as LinkType] ?? LINK_MAP.ethernet;

// ─── Status & criticality ─────────────────────────────────────────────────────

export type SystemStatus = "operational" | "degraded" | "fault" | "planned" | "decommissioned";
export type Criticality = "critical" | "high" | "medium" | "low";

export const STATUSES: { key: SystemStatus; label: string; colour: string }[] = [
  { key: "operational",     label: "Operational",     colour: "#22c55e" },
  { key: "degraded",        label: "Degraded",        colour: "#f59e0b" },
  { key: "fault",           label: "Fault",           colour: "#ef4444" },
  { key: "planned",         label: "Planned",         colour: "#3b82f6" },
  { key: "decommissioned",  label: "Decommissioned",  colour: "#71717a" },
];

export const statusMeta = (key: string | null | undefined) =>
  STATUSES.find((s) => s.key === key) ?? STATUSES[0];

export const CRITICALITIES: { key: Criticality; label: string; colour: string }[] = [
  { key: "critical", label: "Critical", colour: "#ef4444" },
  { key: "high",     label: "High",     colour: "#f97316" },
  { key: "medium",   label: "Medium",   colour: "#64748b" },
  { key: "low",      label: "Low",      colour: "#94a3b8" },
];

export const criticalityMeta = (key: string | null | undefined) =>
  CRITICALITIES.find((c) => c.key === key) ?? CRITICALITIES[2];

// ─── Row shapes ───────────────────────────────────────────────────────────────
//
// Hand-written because src/integrations/supabase/types.ts is generated ad hoc
// and already lags several tables behind; every recent register does the same.

export interface YachtMap {
  id: string;
  name: string;
  /** The IT Yachts record this vessel belongs to. Local to Polaris — not synced. */
  it_yacht_id: string | null;
  imo: string | null;
  builder: string | null;
  flag: string | null;
  length_m: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface YachtSystem {
  id: string;
  map_id: string;
  zone_id: string | null;
  discipline: Discipline;
  name: string;
  manufacturer: string | null;
  model: string | null;
  role_description: string | null;

  hostname: string | null;
  ip_address: string | null;
  subnet: string | null;
  vlan: string | null;
  mac: string | null;
  uplink_system_id: string | null;
  switch_port: string | null;

  supplier_name: string | null;
  support_contract_end: string | null;
  support_phone: string | null;
  support_email: string | null;
  escalation_notes: string | null;

  firmware_version: string | null;
  install_date: string | null;
  warranty_end: string | null;
  eol_date: string | null;
  last_serviced: string | null;
  criticality: Criticality;

  deck: string | null;
  compartment: string | null;
  rack_location: string | null;
  access_notes: string | null;
  credential_ref: string | null;

  status: SystemStatus;
  notes: string | null;
  position_x: number;
  position_y: number;
  on_canvas: boolean;
  sort_order: number;
  updated_at: string;

  /** Linked Datto RMM device, if one was matched. See yacht_it_datto_link. */
  datto_uid: string | null;
  datto_linked_at: string | null;
}

// ─── Datto RMM ────────────────────────────────────────────────────────────────

/**
 * A Datto RMM device, as New Horizon's partner endpoint returns it. Datto is
 * their account; the endpoint lifts IP and category out of the raw payload
 * server-side and returns only JLS's own Datto sites.
 */
export interface DattoDevice {
  datto_uid: string;
  site_name: string | null;
  hostname: string | null;
  device_name: string | null;
  /** e.g. "Network Device (Switch)", "Server", "Workstation". */
  category: string | null;
  int_ip: string | null;
  ext_ip: string | null;
  online: boolean | null;
  operating_system: string | null;
  logged_in_username: string | null;
  last_seen_at: string | null;
  /** Set once a complete sync stopped returning it — deleted or re-discovered in Datto. */
  removed_from_datto_at: string | null;
}

/**
 * Beyond this, an `online: false` from Datto is not evidence the thing is off.
 *
 * Datto's account/devices API reports agent check-in state. Agentless kit —
 * SNMP switches, network-discovered devices — is onboarded once and then never
 * checks in again, so the API keeps returning online:false with a lastSeen
 * months old while Datto's own UI shows it up. Presenting that as "Offline"
 * says something false about a device that is very likely running.
 */
export const DATTO_STALE_DAYS = 14;

export interface DattoPresence {
  label: string;
  colour: string;
  /** True when we genuinely don't know — don't dress it up as a state. */
  stale: boolean;
}

export function dattoPresence(
  device: Pick<DattoDevice, "online" | "last_seen_at"> & { removed_from_datto_at?: string | null },
): DattoPresence {
  // Its last-known state means nothing now — Datto holds a different record, or none.
  if (device.removed_from_datto_at) return { label: "Removed from Datto", colour: "#ef4444", stale: true };
  if (device.online) return { label: "Online", colour: "#22c55e", stale: false };

  const seen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : NaN;
  const ageDays = Number.isNaN(seen) ? null : (Date.now() - seen) / 86_400_000;

  if (ageDays === null || ageDays > DATTO_STALE_DAYS) {
    return { label: "No check-in", colour: "#a1a1aa", stale: true };
  }
  return { label: "Offline", colour: "#71717a", stale: false };
}


/**
 * IPv4 written the same way twice isn't guaranteed to *look* the same —
 * "192.168.010.5", stray whitespace, a "/24" someone pasted in. Compare on a
 * normalised form so those still match, but never treat a range as an address:
 * a system documented as "192.168.10.0/24" must not bind to a device at
 * 192.168.10.0.
 */
export function normaliseIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("-")) return null;
  const parts = trimmed.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets.join(".");
}

export interface YachtZone {
  id: string;
  map_id: string;
  name: string;
  deck: string | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  colour: string | null;
  sort_order: number;
}

export interface YachtLink {
  id: string;
  map_id: string;
  /** Upstream end — drawn from this node's bottom handle. */
  from_system_id: string;
  /** Downstream end. */
  to_system_id: string;
  link_type: LinkType;
  label: string | null;
  notes: string | null;
  /** Created from an uplink rather than drawn by hand; only these auto-remove. */
  from_uplink: boolean;
}

// ─── Starter template ─────────────────────────────────────────────────────────
//
// A new map seeded with the kit almost every yacht of this size carries, as
// blank placeholders. Building a real vessel then means editing rows rather
// than typing thirty of them from nothing — and it doubles as a checklist of
// what to go and find aboard.

export interface TemplateSystem {
  discipline: Discipline;
  name: string;
  manufacturer?: string;
  criticality?: Criticality;
}

export const STARTER_TEMPLATE: TemplateSystem[] = [
  { discipline: "wan_comms",        name: "VSAT terminal",            criticality: "critical" },
  { discipline: "wan_comms",        name: "Starlink Maritime",        manufacturer: "SpaceX", criticality: "critical" },
  { discipline: "wan_comms",        name: "4G/5G bonded router",      criticality: "high" },
  { discipline: "wan_comms",        name: "Shore connection",         criticality: "medium" },
  { discipline: "core_network",     name: "Perimeter firewall",       criticality: "critical" },
  { discipline: "core_network",     name: "Core switch",              criticality: "critical" },
  { discipline: "core_network",     name: "Access switch — bridge",   criticality: "high" },
  { discipline: "core_network",     name: "Access switch — guest",    criticality: "high" },
  { discipline: "wireless",         name: "Wireless controller",      criticality: "high" },
  { discipline: "wireless",         name: "Access points",            criticality: "high" },
  { discipline: "servers_storage",  name: "Media / file server",      criticality: "high" },
  { discipline: "servers_storage",  name: "NAS",                      criticality: "high" },
  { discipline: "servers_storage",  name: "Backup appliance",         criticality: "medium" },
  { discipline: "av_entertainment", name: "Crestron control processor", manufacturer: "Crestron", criticality: "critical" },
  { discipline: "av_entertainment", name: "Kaleidescape server",      manufacturer: "Kaleidescape", criticality: "high" },
  { discipline: "av_entertainment", name: "AV matrix",                criticality: "high" },
  { discipline: "av_entertainment", name: "Satellite TV headend",     criticality: "medium" },
  { discipline: "lighting_knx",     name: "KNX IP gateway",           criticality: "critical" },
  { discipline: "lighting_knx",     name: "Lighting control server",  criticality: "high" },
  { discipline: "bridge_nav",       name: "NMEA gateway",             criticality: "critical" },
  { discipline: "bridge_nav",       name: "ECDIS workstation",        criticality: "critical" },
  { discipline: "security_cctv",    name: "CCTV NVR",                 criticality: "high" },
  { discipline: "security_cctv",    name: "Access control panel",     criticality: "medium" },
  { discipline: "telephony",        name: "PBX",                      criticality: "high" },
  { discipline: "telephony",        name: "DECT base stations",       criticality: "medium" },
  { discipline: "bespoke_platform", name: "YachtEye",                 criticality: "high" },
  { discipline: "bespoke_platform", name: "Alarm & monitoring (AMS)", criticality: "critical" },
  { discipline: "power_ups",        name: "UPS — main IT rack",       criticality: "critical" },
  { discipline: "power_ups",        name: "UPS — AV rack",            criticality: "high" },
  { discipline: "crew_it",          name: "Crew workstations",        criticality: "low" },
  { discipline: "crew_it",          name: "Cabin TVs",                criticality: "low" },
];

// ─── Canvas layout ────────────────────────────────────────────────────────────

export const NODE_W = 220;
export const TIER_H = 200;

/**
 * Tier-bucketed positions, one per input item in the same order — the same
 * approach the network diagram uses (`autoLayout` in network.diagram.tsx).
 * Deliberately not edge-aware: on a vessel the discipline *is* the hierarchy,
 * so bucketing by it reads better than any force-directed result, and it gives
 * a newly seeded map a sensible shape before a single cable is drawn.
 */
export function tierPositions(
  items: Array<{ discipline: Discipline }>,
): Array<{ x: number; y: number }> {
  const byTier = new Map<number, number[]>();
  items.forEach((item, idx) => {
    const tier = disciplineMeta(item.discipline).tier;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(idx);
  });

  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  const out = new Array<{ x: number; y: number }>(items.length);
  tiers.forEach((tier, row) => {
    const members = byTier.get(tier)!;
    members.forEach((idx, col) => {
      out[idx] = {
        x: -((members.length - 1) * NODE_W) / 2 + col * NODE_W,
        y: row * TIER_H,
      };
    });
  });
  return out;
}

// ─── Shared styling ───────────────────────────────────────────────────────────

/** The input class every register page in this codebase copy-pastes. */
export const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring " +
  // View-only users still need to read the value, so dim it rather than grey it out.
  "disabled:cursor-default disabled:opacity-80";

/** Days before a support contract lapses that we start warning about it. */
export const CONTRACT_WARN_DAYS = 90;

/** null when there's no date; negative once it has lapsed. */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const then = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(then)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((then - today.getTime()) / 86_400_000);
}
