/**
 * The Bunker Delivery Note — JLS's "Bunker Delivery" sheet as a PDF, pre-filled from an approved enquiry. It is the document the
 * supplier and the vessel complete at the delivery itself: here only what JLS already knows is filled in (vessel particulars, port,
 * the fuel and quantity, the supplier from the approved quotation); everything that happens at the quayside is left for them.
 */
import { unitLabel } from './model'

/** The fuel grades on the sheet's lookup list, with their description and sulphur limit. */
export const BDN_GRADES: Array<{ grade: string; description: string; maxSulphur: string }> = [
  { grade: 'HFO', description: 'Heavy Fuel Oil', maxSulphur: '1.000% (m/m)' },
  { grade: 'MDO', description: 'Marine Diesel Oil', maxSulphur: '(sulfur 0.0015% max)' },
  { grade: 'MGO', description: 'Marine Gas Oil', maxSulphur: '1000ppm' },
  { grade: 'LSMGO', description: 'Fuel is to be used in EU Ports & Anchorages', maxSulphur: 'Low-Sulfur (0.1%) 10ppm' },
  { grade: 'ULSMGO', description: 'Ultra Low Sulfur Diesel in the US and Auto Gas Oil', maxSulphur: '(sulfur 0.001% max)' },
]

/** Our fuel names → the sheet's grade. VLSFO isn't on the sheet's list, so it is described in full. */
export function bdnGrade(fuelType: string | null | undefined, fuelOther?: string | null): { grade: string; description: string; maxSulphur: string } {
  const f = (fuelType ?? '').trim()
  const key = f === 'MGO / DMA' ? 'MGO' : f
  const hit = BDN_GRADES.find((g) => g.grade === key)
  if (hit) return hit
  if (f === 'VLSFO') return { grade: 'VLSFO', description: 'Very Low Sulphur Fuel Oil', maxSulphur: '0.50% (m/m)' }
  if (f === 'Other') return { grade: fuelOther ?? 'Other', description: '', maxSulphur: '' }
  return { grade: f, description: '', maxSulphur: '' }
}

/** The sheet's unit-of-measure list is L / IG / m3; metric tonnes and US gallons are added for ours. */
export function bdnUom(code: string | null | undefined): string {
  switch (code) { case 'MT': return 'MT'; case 'L': return 'L'; case 'USG': return 'US gal'; case 'IG': return 'IG'; case 'm3': return 'm3'; default: return code ?? '' }
}

export interface BdnPrefill {
  bdnNumber: string
  vesselName: string; flag: string; imo: string; loa: string
  deliveryPort: string; berth: string
  grade: string; description: string; maxSulphur: string; specs: string
  maxQty: string; uom: string
  /** 'Ex-Truck' when a road tanker was asked for, 'Ex-Wharf' for ex-wharf; '' otherwise (a bunker barge isn't on the sheet's list). */
  deliveryMethodTick: '' | 'Ex-Truck' | 'Ex-Wharf'
  deliveryMethodText: string
  supplierName: string; supplierContact: string
  deliveredQty: string
}

export function bdnPrefill(
  e: {
    yacht_name?: string | null; flag?: string | null; imo_no?: string | null; loa_m?: number | null; port?: string | null; berth?: string | null
    fuel_type?: string | null; fuel_other?: string | null; quantity?: number | null; quantity_unit?: string | null; spec_notes?: string | null
    delivery_method?: string | null; bdn_number?: string | null; delivered_quantity?: number | null; delivered_unit?: string | null
  },
  approved: { supplier?: string | null; supplier_phone?: string | null; supplier_contact?: string | null; fuel_type?: string | null; quantity?: number | null; quantity_unit?: string | null } | null,
): BdnPrefill {
  // The approved quotation is what will actually be supplied, so it wins over the original request.
  const fuel = approved?.fuel_type || e.fuel_type
  const g = bdnGrade(fuel, e.fuel_other)
  const qty = approved?.quantity ?? e.quantity
  const unit = approved?.quantity != null ? approved?.quantity_unit : e.quantity_unit
  const method = (e.delivery_method ?? '').trim()
  return {
    bdnNumber: e.bdn_number ?? '',
    vesselName: e.yacht_name ?? '', flag: e.flag ?? '', imo: e.imo_no ?? '', loa: e.loa_m != null ? `${e.loa_m}` : '',
    deliveryPort: e.port ?? '', berth: e.berth ?? '',
    grade: g.grade, description: g.description, maxSulphur: g.maxSulphur, specs: e.spec_notes ?? '',
    maxQty: qty != null ? `${qty}` : '', uom: bdnUom(unit),
    deliveryMethodTick: method === 'Road tanker' ? 'Ex-Truck' : method === 'Ex-wharf' ? 'Ex-Wharf' : '',
    deliveryMethodText: method,
    supplierName: approved?.supplier ?? '', supplierContact: [approved?.supplier_contact, approved?.supplier_phone].filter(Boolean).join(' · '),
    deliveredQty: e.delivered_quantity != null ? `${e.delivered_quantity} ${bdnUom(e.delivered_unit)}`.trim() : '',
  }
}

/** The MARPOL declaration printed on the note, exactly as on the sheet. */
export const BDN_DECLARATION = {
  lead: 'I certify that the fuel oil supplied is in conformity with regulation 18.3 of MARPOL Annex VI and that the sulphur content does not exceed:',
  options: [
    '0.50% m/m or as per the limit value in regulation 14.1 of MARPOL Annex VI;',
    '0.10% m/m as per te limit value in regulation 14.4 of MARPOL Annex VI; or',
    "the purchaser's specified limit value of ____________ (% m/m)",
  ],
}

export { unitLabel }
