/**
 * The Pre-Arrival / Cruising Permit form's editable fields — shared by the
 * portal screen and /api/portal/prearrival so both agree on what a client can
 * fill in. Vessel particulars that live on the profile (name, IMO, tonnage…)
 * are not here: they're read live and corrected by JLS.
 */

export type PrearrivalField = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "email";
  group: "trip" | "particulars" | "heads";
  /** Trip details are new every time; everything else carries over from the last submission. */
  trip?: boolean;
};

export const PREARRIVAL_FIELDS: PrearrivalField[] = [
  { key: "arrival_date", label: "Arrival date", type: "date", group: "trip", trip: true },
  { key: "last_port_of_call", label: "Last port of call", type: "text", group: "trip", trip: true },
  { key: "arrival_emirate", label: "Arrival emirate", type: "text", group: "trip", trip: true },
  { key: "arrival_port", label: "Arrival port", type: "text", group: "trip", trip: true },

  { key: "max_air_draft_m", label: "Max air draft (m)", type: "number", group: "particulars" },
  { key: "beam_m", label: "Beam (m)", type: "number", group: "particulars" },
  { key: "max_forward_draft_m", label: "Max forward draft (m)", type: "number", group: "particulars" },
  { key: "max_stern_draft_m", label: "Max stern draft (m)", type: "number", group: "particulars" },
  { key: "dead_weight_tn", label: "Dead weight (t)", type: "number", group: "particulars" },
  { key: "summer_dead_weight_tn", label: "Summer dead weight (t)", type: "number", group: "particulars" },
  { key: "displacement_tn", label: "Displacement (t)", type: "number", group: "particulars" },
  { key: "main_propulsion_kw", label: "Main propulsion (kW)", type: "number", group: "particulars" },
  { key: "generators_kw", label: "Generators (kW)", type: "number", group: "particulars" },
  { key: "hull_id_number", label: "Hull identification number", type: "text", group: "particulars" },
  { key: "engine_serial_no", label: "Engine serial number", type: "text", group: "particulars" },
  { key: "fuel_type", label: "Fuel type", type: "text", group: "particulars" },

  { key: "captain_name", label: "Captain — name", type: "text", group: "heads" },
  { key: "captain_email", label: "Captain — email", type: "email", group: "heads" },
  { key: "purser_name", label: "Purser / Stew — name", type: "text", group: "heads" },
  { key: "purser_email", label: "Purser / Stew — email", type: "email", group: "heads" },
  { key: "chief_engineer_name", label: "Chief Engineer — name", type: "text", group: "heads" },
  { key: "chief_engineer_email", label: "Chief Engineer — email", type: "email", group: "heads" },
];

export const PREARRIVAL_REQUIRED = ["arrival_date", "last_port_of_call", "arrival_emirate", "arrival_port"];

/** Profile particulars shown read-only on the form, from v_prearrival_prefill. */
export const PREARRIVAL_PROFILE: Array<{ group: string; fields: Array<[key: string, label: string]> }> = [
  { group: "Vessel", fields: [
    ["vessel_name", "Vessel name"], ["imo_no", "IMO no."], ["vessel_type", "Vessel type"],
    ["official_no", "Official no."], ["flag", "Flag"], ["port_of_registry", "Port of registry"],
  ] },
  { group: "Dimensions & engine", fields: [
    ["gross_tonnage", "Gross tonnage"], ["net_tonnage", "Net tonnage"], ["length_overall_m", "Length overall (m)"],
    ["breadth_m", "Breadth (m)"], ["draught_m", "Draught (m)"], ["air_draft_m", "Air draft (m)"], ["engine", "Engine"],
  ] },
  { group: "Radio & manning", fields: [
    ["radio_call_sign", "Call sign"], ["mmsi", "MMSI"], ["frequency", "Frequency"], ["equipment_model", "Radio model"],
    ["max_crew", "Max crew"], ["max_guests", "Max guests"],
  ] },
  { group: "Owner & billing", fields: [
    ["owners_name", "Owner"], ["owners_nationality", "Owner nationality"], ["company_name", "Billing company"],
    ["contact_person", "Billing contact"], ["email_address", "Billing email"], ["contact_no", "Billing phone"],
  ] },
];
