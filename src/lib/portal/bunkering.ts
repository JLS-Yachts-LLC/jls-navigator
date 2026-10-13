/**
 * What a vessel sees of its bunkering enquiries in the Client Portal. Every field the portal receives passes through
 * `shapeForVessel`, so what is NOT shown is decided in one place and tested: internal notes, the log's comments, quotations
 * the team has not shared, who logged it, and the money fields for positions that don't see the vessel's finance.
 */
import { STATUS_LABEL, unitLabel, vatTreatment, fuelRule, type EnquiryStatus, type VatNote, type FuelRuleNote } from '@/lib/bunkering/model'

export interface RawEnquiry {
  id: string; number: string; status: EnquiryStatus; yacht_name: string; port: string | null; berth: string | null
  preferred_date: string | null; preferred_time: string | null; sails_out_of_uae: string | null; departure_date: string | null; fuel_type: string | null; fuel_other: string | null
  quantity: number | null; quantity_unit: string | null; spec_notes: string | null; delivery_method: string | null; special_requirements: string | null
  declared_by_role: string | null; declared_by_name: string | null; declared_at: string | null; declaration_method: string | null
  approved_quote_id: string | null; approved_by_role: string | null; approved_by_name: string | null; approved_at: string | null; approval_method: string | null
  delivered_date: string | null; delivered_quantity: number | null; delivered_unit: string | null; bdn_number: string | null; created_at: string
}
export interface RawQuote {
  id: string; supplier: string; quote_ref: string | null; fuel_type: string | null; quantity: number | null; quantity_unit: string | null
  unit_price: number | null; price_unit: string | null; currency: string; total: number | null; valid_until: string | null; delivery_terms: string | null
  status: string; shared_with_vessel: boolean
}
export interface RawEvent { kind: string; actor_name: string | null; to_status: string | null; created_at: string }
export interface RawFile { name: string; doc_type: string | null; url: string }

export interface VesselEnquiry {
  id: string; number: string; status: EnquiryStatus; statusLabel: string; yachtName: string
  port: string | null; berth: string | null; preferredDate: string | null; preferredTime: string | null
  fuel: string | null; quantity: number | null; unit: string; specNotes: string | null; deliveryMethod: string | null; specialRequirements: string | null
  sailsOut: string | null; departureDate: string | null
  /** How UAE VAT applies to this enquiry, and whether the 48-hour rule for 1000 ppm fuel is met — worked out from the facts above. */
  vat: VatNote; fuelRule: FuelRuleNote | null
  /** Has JLS received the Master's signed VAT declaration for this enquiry? */
  declarationReceived: boolean
  confirmation: { by: string; role: string; at: string | null; method: string | null } | null
  quotations: Array<{
    id: string; supplier: string; quoteRef: string | null; fuel: string | null; quantity: number | null; unit: string
    unitPrice: number | null; priceUnit: string | null; currency: string; total: number | null
    validUntil: string | null; terms: string | null; status: string; approved: boolean
  }>
  approval: { by: string; role: string; at: string | null; method: string | null } | null
  delivery: { date: string | null; quantity: number | null; unit: string; bdn: string | null } | null
  timeline: Array<{ label: string; at: string }>
  documents: Array<{ name: string; url: string }>
  createdAt: string
}

/** The quotation statuses a vessel can meaningfully see (a request still waiting for a price is the team's business). */
const VISIBLE_QUOTE_STATUS = new Set(['received', 'approved', 'rejected', 'expired'])
/** Documents the vessel is given: the bunker delivery note. Quotation PDFs and the team's other files stay internal. */
const VESSEL_DOC_TYPES = new Set(['Bunker delivery note'])

export function shapeForVessel(
  e: RawEnquiry, quotes: RawQuote[], events: RawEvent[], files: Array<RawFile & { url: string }>, opts: { canSeeFinance: boolean; declarationReceived?: boolean },
): VesselEnquiry {
  return {
    id: e.id, number: e.number, status: e.status, statusLabel: STATUS_LABEL[e.status] ?? e.status, yachtName: e.yacht_name,
    port: e.port, berth: e.berth, preferredDate: e.preferred_date, preferredTime: e.preferred_time,
    fuel: e.fuel_type === 'Other' ? e.fuel_other : e.fuel_type, quantity: e.quantity, unit: unitLabel(e.quantity_unit),
    specNotes: e.spec_notes, deliveryMethod: e.delivery_method, specialRequirements: e.special_requirements,
    sailsOut: e.sails_out_of_uae, departureDate: e.departure_date,
    vat: vatTreatment({ sailsOut: e.sails_out_of_uae, bunkerDate: e.preferred_date, departureDate: e.departure_date }),
    fuelRule: fuelRule({ fuelType: e.fuel_type, bunkerDate: e.preferred_date, departureDate: e.departure_date }),
    declarationReceived: !!opts.declarationReceived,
    confirmation: e.declared_by_name && e.declared_by_role ? { by: e.declared_by_name, role: e.declared_by_role, at: e.declared_at, method: e.declaration_method } : null,
    quotations: quotes
      .filter((q) => q.shared_with_vessel && VISIBLE_QUOTE_STATUS.has(q.status))
      .map((q) => ({
        id: q.id, supplier: q.supplier, quoteRef: q.quote_ref, fuel: q.fuel_type, quantity: q.quantity, unit: unitLabel(q.quantity_unit),
        unitPrice: opts.canSeeFinance ? q.unit_price : null, priceUnit: q.price_unit, currency: q.currency, total: opts.canSeeFinance ? q.total : null,
        validUntil: q.valid_until, terms: q.delivery_terms, status: q.status, approved: q.id === e.approved_quote_id,
      })),
    approval: e.approved_by_name && e.approved_by_role ? { by: e.approved_by_name, role: e.approved_by_role, at: e.approved_at, method: e.approval_method } : null,
    delivery: e.status === 'delivered' ? { date: e.delivered_date, quantity: e.delivered_quantity, unit: unitLabel(e.delivered_unit), bdn: e.bdn_number } : null,
    // Only the milestones. Comments, quotation edits, file uploads and who-did-what stay internal.
    timeline: events.flatMap((ev) => {
      if (ev.kind === 'created') return [{ label: 'Enquiry logged', at: ev.created_at }]
      if (ev.kind === 'status' && ev.to_status) return [{ label: STATUS_LABEL[ev.to_status as EnquiryStatus] ?? ev.to_status, at: ev.created_at }]
      if (ev.kind === 'approved') return [{ label: 'Approved', at: ev.created_at }]
      if (ev.kind === 'delivered') return [{ label: 'Delivered', at: ev.created_at }]
      return []
    }),
    documents: files.filter((f) => f.doc_type && VESSEL_DOC_TYPES.has(f.doc_type)).map((f) => ({ name: f.name, url: f.url })),
    createdAt: e.created_at,
  }
}
