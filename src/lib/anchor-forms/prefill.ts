/**
 * Anchor forms — what we can fill in before anyone types. Shared by the Forms
 * page (vessel picker) and Signature Campaigns (each recipient's own copy), so a
 * form is pre-filled the same way wherever it's made. Browser-safe.
 */
import { JLS_COMPANY } from "@/lib/brand/jls-company";
import type { FormDef } from "@/lib/anchor-forms/definitions";

// yachts column → form field key(s). A column may feed several forms' fields.
// Voyage-specific fields we don't hold (persons onboard, last port…) stay blank.
export const VESSEL_MAP: Record<string, string | string[]> = {
  vessel_name: "vessel_name", flag: "vessel_flag", imo_no: "imo", official_no: "official_no",
  length_overall_m: "loa", mmsi: "mmsi", berth: "berth",
  location: "marina_arrival", port_of_registry: ["marina_departure", "port_of_registry"],
  vessel_type: "vessel_type", built_year: "year_build", gross_tonnage: "gross_tonnage", net_tonnage: "net_tonnage",
  breadth_m: "beam", draught_m: "draft", air_draft_m: "air_draft", max_crew: "crew_count", max_guests: "max_passengers",
  radio_call_sign: "radio_call_sign", frequency: "frequency", equipment_model: "equipment_model",
  manufacturer: "manufacturer", serial_no: "radio_serial",
  owners_name: "owner_name", owners_nationality: "owner_nationality", owners_address: "owner_address",
  contact_no: ["owner_mobile", "billing_phone"], email_address: ["owner_email", "billing_email"],
  company_name: "billing_company", contact_person: "billing_contact", billing_address: "billing_address",
};
export const VESSEL_COLS =
  "id, vessel_name, flag, imo_no, official_no, length_overall_m, mmsi, berth, location, port_of_registry, " +
  "vessel_type, built_year, gross_tonnage, net_tonnage, breadth_m, draught_m, air_draft_m, max_crew, max_guests, " +
  "radio_call_sign, frequency, equipment_model, manufacturer, serial_no, " +
  "owners_name, owners_nationality, owners_address, contact_no, email_address, company_name, contact_person, billing_address, eta, etd";

// JLS is the Approved Maritime Agent — the agent block is always ours.
export const AGENT_DEFAULTS: Record<string, string> = {
  agent_details: `JLS Yachts LLC, ${JLS_COMPANY.address}`,
  contact_number: JLS_COMPANY.phone,
  email: JLS_COMPANY.email,
  // CF12a agent block
  agent_name: "JLS Yachts LLC",
  agent_phone: JLS_COMPANY.phone,
};

/** Fields JLS owns — never shown to the vessel to edit. */
export const AGENT_KEYS = new Set(Object.keys(AGENT_DEFAULTS));

export const formFieldKeys = (def: FormDef) => new Set(def.sections.flatMap((s) => s.fields).map((f) => f.key));

/** Which field keys a yacht record fills (for "from the vessel record" labels). */
export const VESSEL_FIELD_KEYS = new Set(Object.values(VESSEL_MAP).flatMap((k) => (Array.isArray(k) ? k : [k])));

const isoDay = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Vessel-record values for this form's fields. */
export function vesselValues(def: FormDef, yacht: Record<string, any> | null | undefined): Record<string, string> {
  const keys = formFieldKeys(def);
  const out: Record<string, string> = {};
  if (!yacht) return out;
  for (const [col, targets] of Object.entries(VESSEL_MAP)) {
    const v = yacht[col];
    if (v == null || v === "") continue;
    for (const key of Array.isArray(targets) ? targets : [targets]) if (keys.has(key)) out[key] = String(v);
  }
  // A planned arrival/departure on the record, if it's still ahead of us.
  const today = isoDay();
  const day = (v: unknown) => (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null);
  const eta = day(yacht.eta), etd = day(yacht.etd);
  if (eta && eta >= today) for (const k of ["eta_date", "arrival_date", "uae_entry_date"]) if (keys.has(k)) out[k] = eta;
  if (etd && etd >= today) for (const k of ["etd_date", "uae_departure_date"]) if (keys.has(k)) out[k] = etd;
  return out;
}

/** JLS agent details for this form's fields. */
export function agentValues(def: FormDef): Record<string, string> {
  const keys = formFieldKeys(def);
  return Object.fromEntries(Object.entries(AGENT_DEFAULTS).filter(([k]) => keys.has(k)));
}

/**
 * Everything we can fill for one recipient: JLS agent block, the vessel record,
 * the person it's going to, then whatever staff pre-filled for the campaign
 * (staff values win, except over the vessel's own details and JLS's).
 */
export function prefillFor(def: FormDef, opts: {
  yacht?: Record<string, any> | null;
  recipient?: { name?: string | null; email?: string | null; role?: string | null } | null;
  staffValues?: Record<string, unknown> | null;
  letterDate?: string;
}): Record<string, string> {
  const keys = formFieldKeys(def);
  const out: Record<string, string> = { ...agentValues(def) };
  const today = isoDay();
  for (const k of ["date_of_application", "declaration_date"]) if (keys.has(k)) out[k] = today;
  if (keys.has("letter_date")) out.letter_date = opts.letterDate ?? today;

  const r = opts.recipient;
  if (r?.name) {
    if (keys.has("signatory_name")) out.signatory_name = r.name;
    if (keys.has("signatory_title") && r.role) out.signatory_title = r.role;
    if (keys.has("applicant_name")) out.applicant_name = r.name;
    if (/captain|master/i.test(r.role ?? "")) {
      if (keys.has("captain_name")) out.captain_name = r.name;
      if (keys.has("captain_email") && r.email) out.captain_email = r.email;
    }
  }

  const vessel = vesselValues(def, opts.yacht);
  // The letter prints M/Y “…” itself, so drop a prefix the record may carry.
  if (vessel.vessel_name && def.layout === "client-letter") vessel.vessel_name = vessel.vessel_name.replace(/^(M\/?Y|S\/?Y)\.?\s+/i, "");
  Object.assign(out, vessel);

  // Staff values are campaign-wide, so they never replace a vessel's own record
  // fields — but a planned date staff set does beat the record's ETA/ETD.
  for (const [k, v] of Object.entries(opts.staffValues ?? {})) {
    if (!keys.has(k) || AGENT_KEYS.has(k) || VESSEL_FIELD_KEYS.has(k) || v == null || String(v).trim() === "") continue;
    out[k] = String(v);
  }
  return out;
}
