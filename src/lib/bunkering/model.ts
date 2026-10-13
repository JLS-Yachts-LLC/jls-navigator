/**
 * Bunkering enquiries — the rules, with no database in them so they can be tested on their own: the lists the form offers
 * (taken from JLS's own Bunker Delivery sheet), what an enquiry and a quotation must say, how a quotation's total is worked
 * out, and who may do what.
 */

export type EnquiryStatus = 'new' | 'quotes_requested' | 'quotes_received' | 'awaiting_vessel' | 'approved' | 'delivered' | 'cancelled'
export type QuoteStatus = 'requested' | 'received' | 'approved' | 'rejected' | 'expired'

export const STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: 'New', quotes_requested: 'Quotes requested', quotes_received: 'Quotes received', awaiting_vessel: 'With the vessel',
  approved: 'Approved', delivered: 'Delivered', cancelled: 'Cancelled',
}
/** The order an enquiry normally moves through. */
export const STATUS_ORDER: EnquiryStatus[] = ['new', 'quotes_requested', 'quotes_received', 'awaiting_vessel', 'approved', 'delivered']
export const OPEN_STATUSES: EnquiryStatus[] = ['new', 'quotes_requested', 'quotes_received', 'awaiting_vessel', 'approved']
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = { requested: 'Requested', received: 'Received', approved: 'Approved', rejected: 'Not chosen', expired: 'Expired' }

export const FUEL_TYPES = ['MGO / DMA', 'ULSMGO', 'LSMGO', 'VLSFO', 'MDO', 'HFO', 'Other'] as const
/** Delivery ports from the Bunker Delivery sheet. */
export const PORTS = ['Mina Rashid', 'Dubai Harbour', 'Yas Marina', 'Emirates Palace', 'AUH Freeport', 'Anchorage', 'Other'] as const
export const DELIVERY_METHODS = ['Bunker barge', 'Road tanker', 'Ex-wharf', 'No preference'] as const
export const ROLES = ['Captain', 'Chief Engineer'] as const
export const CONFIRM_METHODS = ['Signed on screen', 'Signed form attached', 'Email confirmation', 'WhatsApp confirmation'] as const
export const CURRENCIES = ['USD', 'AED', 'EUR', 'GBP'] as const
export const DOC_TYPES = ['Quotation', 'Vessel confirmation', 'Signed form', 'Master declaration', 'Bunker delivery note', 'Other'] as const

/** Quantity units, and the matching price basis. */
export const UNITS: Array<{ code: string; label: string; priceUnit: string }> = [
  { code: 'MT', label: 'Metric tonnes (MT)', priceUnit: 'per MT' },
  { code: 'L', label: 'Litres', priceUnit: 'per litre' },
  { code: 'USG', label: 'US gallons', priceUnit: 'per US gallon' },
  { code: 'IG', label: 'Imperial gallons', priceUnit: 'per imperial gallon' },
  { code: 'm3', label: 'Cubic metres (m³)', priceUnit: 'per m³' },
]
export const PRICE_UNITS = [...UNITS.map((u) => u.priceUnit), 'lump sum']
export const unitLabel = (code: string | null | undefined) => UNITS.find((u) => u.code === code)?.label ?? code ?? ''
export const priceUnitFor = (code: string | null | undefined) => UNITS.find((u) => u.code === code)?.priceUnit ?? ''

/**
 * UAE rules for bunkers, as given by the Port Operations & Agency team, shown to staff and (in the Client Portal) to clients.
 * They are guidance: the form works out how they apply to an enquiry, and the Agency team confirms with the client.
 */
export const VAT_STAY_DAYS = 21
export const QUICK_DEPARTURE_HOURS = 48
export const CLEANER_FUELS_URL = 'https://u.ae/en/information-and-services/environment-and-energy/the-green-economy-initiative/efforts-to-achieve-green-economy-/cleaner-fuels'
export const GUIDANCE: Array<{ title: string; points: string[]; link?: { label: string; url: string } }> = [
  {
    title: 'VAT on bunkers in the UAE',
    points: [
      "UAE law allows bunkers to be zero-rated when they are supplied to an internationally sailing vessel, as shown on the Master's declaration.",
      'VAT is a consumption-based tax: VAT is charged at 5% on fuel consumed in the UAE.',
      `If the vessel will be consuming the fuel in the UAE and its stay is longer than ${VAT_STAY_DAYS} days, it is subject to 5% VAT.`,
      `If the vessel sails out of the UAE after the bunkers are supplied (within ${VAT_STAY_DAYS} days), it is zero-rated.`,
    ],
  },
  {
    title: 'Fuel quality — 10 ppm sulphur diesel',
    points: [
      'Since 19 July 2022 a new Cabinet decree and updated guidelines from the Emirates Authority for Standardization and Metrology (ESMA) require diesel containing 500 parts per million (ppm) of sulphur to be replaced with diesel containing only 10 ppm — similar to Euro 5 standards.',
    ],
    link: { label: 'Read more on u.ae', url: CLEANER_FUELS_URL },
  },
  {
    title: '500 / 1000 ppm fuel',
    points: [`500 / 1000 ppm fuel can only be supplied if the vessel departs within ${QUICK_DEPARTURE_HOURS} hours.`],
  },
]

export type SailsOut = 'yes' | 'no' | 'unsure'
export const SAILS_OUT_OPTIONS: Array<{ value: SailsOut; label: string }> = [
  { value: 'yes', label: 'Yes — it sails out of the UAE after bunkering' },
  { value: 'no', label: 'No — it stays / consumes the fuel in the UAE' },
  { value: 'unsure', label: 'Not sure yet' },
]

/** Whole days from one YYYY-MM-DD date to another (b − a), or null if either is missing or unreadable. */
export function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  const da = Date.parse(`${a ?? ''}T00:00:00Z`), db = Date.parse(`${b ?? ''}T00:00:00Z`)
  if (Number.isNaN(da) || Number.isNaN(db)) return null
  return Math.round((db - da) / 86_400_000)
}

export interface VatNote { rate: 0 | 5 | null; text: string }
/**
 * How UAE VAT applies to the bunkers, from the facts the form holds: does the vessel sail out of the UAE after bunkering, and when.
 * Zero-rated if it sails out within 21 days (on the Master's declaration); 5% if the fuel is consumed in the UAE or the stay is longer
 * than 21 days; otherwise "to be confirmed" — never a guess.
 */
export function vatTreatment(i: { sailsOut: string | null | undefined; bunkerDate: string | null | undefined; departureDate: string | null | undefined }): VatNote {
  const days = daysBetween(i.bunkerDate, i.departureDate)
  if (days !== null && days < 0) return { rate: null, text: 'VAT to be confirmed — the planned departure is before the bunkering date; please check the dates.' }
  if (days !== null && days > VAT_STAY_DAYS) return { rate: 5, text: `5% VAT — the vessel stays more than ${VAT_STAY_DAYS} days after bunkering, so the fuel is consumed in the UAE.` }
  if (i.sailsOut === 'no') return { rate: 5, text: '5% VAT — the fuel will be consumed in the UAE.' }
  if (i.sailsOut === 'yes' && days !== null) return { rate: 0, text: `Zero-rated (0%) — the vessel sails out of the UAE within ${VAT_STAY_DAYS} days. This relies on the Master's declaration that the vessel sails internationally.` }
  if (i.sailsOut === 'yes') return { rate: null, text: `Zero-rated if the vessel sails out of the UAE within ${VAT_STAY_DAYS} days of the bunkers being supplied — give the planned departure date to confirm.` }
  return { rate: null, text: 'VAT to be confirmed — say whether the vessel sails out of the UAE after bunkering, and when.' }
}

export interface FuelRuleNote { level: 'ok' | 'warn'; text: string }
/** Fuels JLS lists at 1000 ppm sulphur (MGO / DMA): the 500 / 1000 ppm rule applies to them. */
export const HIGH_SULPHUR_FUELS = ['MGO / DMA']
/** The 48-hour rule for 500 / 1000 ppm fuel; null when the fuel isn't one it applies to. */
export function fuelRule(i: { fuelType: string | null | undefined; bunkerDate: string | null | undefined; departureDate: string | null | undefined }): FuelRuleNote | null {
  if (!i.fuelType || !HIGH_SULPHUR_FUELS.includes(i.fuelType)) return null
  const days = daysBetween(i.bunkerDate, i.departureDate)
  if (days === null) return { level: 'warn', text: `${i.fuelType} is 1000 ppm fuel, which can only be supplied if the vessel departs within ${QUICK_DEPARTURE_HOURS} hours. Give the planned departure date — otherwise ULSMGO / LSMGO (10 ppm) is needed.` }
  if (days <= QUICK_DEPARTURE_HOURS / 24) return { level: 'ok', text: `${i.fuelType} (1000 ppm) can be supplied: the vessel departs within ${QUICK_DEPARTURE_HOURS} hours.` }
  return { level: 'warn', text: `${i.fuelType} is 1000 ppm fuel and the vessel departs more than ${QUICK_DEPARTURE_HOURS} hours after bunkering, so it cannot be supplied. ULSMGO / LSMGO (10 ppm) is needed.` }
}

export interface EnquiryForm {
  /** The Polaris yacht this enquiry is for ("" when not linked) — a linked enquiry is shown to the vessel in the Client Portal. */
  yachtId: string
  yachtName: string; flag: string; loa: string; imo: string
  captain: string; chiefEngineer: string; contactNumber: string; contactEmail: string
  port: string; berth: string; preferredDate: string; preferredTime: string
  fuelType: string; fuelOther: string; quantity: string; unit: string; specNotes: string
  deliveryMethod: string; fuelRemaining: string; tankCapacity: string; specialRequirements: string
  /** Does the vessel sail out of the UAE after bunkering? ('yes' | 'no' | 'unsure' | '') and its planned departure date. */
  sailsOut: string; departureDate: string
  notes: string
}
export const emptyEnquiry = (): EnquiryForm => ({
  sailsOut: '', departureDate: '', yachtId: '', yachtName: '', flag: '', loa: '', imo: '', captain: '', chiefEngineer: '', contactNumber: '', contactEmail: '',
  port: '', berth: '', preferredDate: '', preferredTime: '', fuelType: '', fuelOther: '', quantity: '', unit: 'MT', specNotes: '',
  deliveryMethod: '', fuelRemaining: '', tankCapacity: '', specialRequirements: '', notes: '',
})

const blank = (s: string | null | undefined) => !String(s ?? '').trim()
/** A typed number. "1,250" is a thousand-separator; "60,5" is a decimal comma — both are read the way the person meant them. */
const num = (s: string | number | null | undefined) => {
  const t = String(s ?? '').trim()
  if (!t) return NaN
  const n = Number(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

/** What is wrong with this enquiry, in words the person logging it can act on. Empty = ready to log. */
export function enquiryProblems(f: EnquiryForm): string[] {
  const out: string[] = []
  if (blank(f.yachtName)) out.push('Give the yacht name.')
  if (blank(f.contactNumber) && blank(f.contactEmail)) out.push('Give a phone number / WhatsApp or an email for the yacht.')
  if (!blank(f.contactEmail) && !looksLikeEmail(f.contactEmail)) out.push('The email address does not look right.')
  if (blank(f.port)) out.push('Give the bunkering port.')
  if (blank(f.preferredDate)) out.push('Give the preferred bunkering date.')
  if (blank(f.fuelType)) out.push('Choose the fuel type.')
  if (f.fuelType === 'Other' && blank(f.fuelOther)) out.push('Say which fuel "Other" is.')
  if (!(num(f.quantity) > 0)) out.push('Give the required quantity.')
  if (!f.unit) out.push('Choose the unit for the quantity.')
  if (!blank(f.loa) && !(num(f.loa) > 0)) out.push('The length overall should be a number of metres.')
  return out
}

/** The JSON the database function takes. Text is trimmed; empty fields are left empty. */
export function enquiryPayload(f: EnquiryForm) {
  const t = (s: string) => String(s ?? '').trim()
  const n = (s: string) => (blank(s) ? '' : String(num(s)))
  return {
    yacht_id: t(f.yachtId), yacht_name: t(f.yachtName), flag: t(f.flag), loa_m: n(f.loa), imo_no: t(f.imo),
    captain_name: t(f.captain), chief_engineer_name: t(f.chiefEngineer), contact_number: t(f.contactNumber), contact_email: t(f.contactEmail),
    port: t(f.port), berth: t(f.berth), preferred_date: t(f.preferredDate), preferred_time: t(f.preferredTime),
    fuel_type: t(f.fuelType), fuel_other: f.fuelType === 'Other' ? t(f.fuelOther) : '', quantity: n(f.quantity), quantity_unit: f.unit, spec_notes: t(f.specNotes),
    delivery_method: t(f.deliveryMethod), fuel_remaining: t(f.fuelRemaining), tank_capacity: t(f.tankCapacity), special_requirements: t(f.specialRequirements),
    sails_out_of_uae: t(f.sailsOut), departure_date: t(f.departureDate),
    notes: t(f.notes),
  }
}

export interface QuoteForm {
  supplier: string; contact: string; phone: string; email: string; quoteRef: string
  dateRequested: string; dateReceived: string
  fuelType: string; quantity: string; unit: string; unitPrice: string; priceUnit: string; currency: string; total: string
  validUntil: string; deliveryTerms: string; status: QuoteStatus; notes: string
  /** Shown to the vessel in the Client Portal. Off until the team chooses to share it. */
  sharedWithVessel: boolean
}
export const emptyQuote = (defaults: Partial<QuoteForm> = {}): QuoteForm => ({
  supplier: '', contact: '', phone: '', email: '', quoteRef: '', dateRequested: '', dateReceived: '',
  fuelType: '', quantity: '', unit: 'MT', unitPrice: '', priceUnit: 'per MT', currency: 'USD', total: '', validUntil: '', deliveryTerms: '',
  status: 'requested', notes: '', sharedWithVessel: false, ...defaults,
})

/**
 * A quotation's total, when it can be worked out: quantity × price if the price is per the same unit as the quantity, or the price
 * itself for a lump sum. Otherwise null — the person enters the total they were quoted.
 */
export function quoteTotal(quantity: string | number, unit: string, unitPrice: string | number, priceUnit: string): number | null {
  const price = num(unitPrice)
  if (!(price >= 0) || blank(String(unitPrice))) return null
  if (priceUnit === 'lump sum') return round2(price)
  const q = num(quantity)
  if (!(q > 0) || priceUnit !== priceUnitFor(unit)) return null
  return round2(q * price)
}
const round2 = (n: number) => Math.round(n * 100) / 100

/** What is wrong with this quotation. A received quotation must carry what was quoted. */
export function quoteProblems(q: QuoteForm): string[] {
  const out: string[] = []
  if (blank(q.supplier)) out.push('Give the supplier.')
  if (!blank(q.email) && !looksLikeEmail(q.email)) out.push('The supplier email does not look right.')
  if (q.status === 'received' || q.status === 'approved') {
    if (!(num(q.quantity) > 0)) out.push('Give the quantity quoted.')
    if (blank(q.unitPrice) || !(num(q.unitPrice) >= 0)) out.push('Give the price quoted.')
    if (blank(q.dateReceived)) out.push('Give the date the quotation was received.')
    if (!blank(q.total) && !(num(q.total) >= 0)) out.push('The total should be a number.')
    if (quoteTotal(q.quantity, q.unit, q.unitPrice, q.priceUnit) === null && blank(q.total)) out.push('Give the total, since it cannot be worked out from this price.')
  }
  return out
}

/** The JSON stored for a quotation (the total is worked out when it can be). */
export function quotePayload(q: QuoteForm) {
  const t = (s: string) => String(s ?? '').trim()
  const n = (s: string) => (blank(s) ? null : num(s))
  const worked = quoteTotal(q.quantity, q.unit, q.unitPrice, q.priceUnit)
  return {
    supplier: t(q.supplier), supplier_contact: t(q.contact) || null, supplier_phone: t(q.phone) || null, supplier_email: t(q.email) || null,
    quote_ref: t(q.quoteRef) || null, date_requested: t(q.dateRequested) || null, date_received: t(q.dateReceived) || null,
    fuel_type: t(q.fuelType) || null, quantity: n(q.quantity), quantity_unit: q.unit || null, unit_price: n(q.unitPrice), price_unit: q.priceUnit || null,
    currency: q.currency, total: blank(q.total) ? worked : num(q.total), valid_until: t(q.validUntil) || null,
    delivery_terms: t(q.deliveryTerms) || null, status: q.status, notes: t(q.notes) || null, shared_with_vessel: q.sharedWithVessel,
  }
}

/** "Quoted 20 MT against 25 MT requested" when the two differ — what the vessel must be told before approving; null when they match. */
export function quantityDifference(requested: number | null, requestedUnit: string | null, quoted: number | null, quotedUnit: string | null): string | null {
  if (requested == null || quoted == null) return null
  if (requestedUnit !== quotedUnit) return `Quoted in ${unitLabel(quotedUnit)}, requested in ${unitLabel(requestedUnit)}`
  if (Math.abs(requested - quoted) < 1e-9) return null
  return `Quoted ${quoted} ${requestedUnit ?? ''} against ${requested} requested`
}

/** Which status moves a person may make: the Agency team any open one (approval and delivery have their own forms); the person who logged it can only withdraw. */
export function allowedMoves(status: EnquiryStatus, o: { isAgency: boolean; isCreator: boolean }): EnquiryStatus[] {
  if (status === 'delivered' || status === 'cancelled') return []
  if (o.isAgency) return (['new', 'quotes_requested', 'quotes_received', 'awaiting_vessel', 'cancelled'] as EnquiryStatus[]).filter((s) => s !== status)
  return o.isCreator ? ['cancelled'] : []
}

/**
 * The yacht a typed name belongs to: an exact (case-insensitive) match on a Polaris yacht, or null. Only an exact match links —
 * linking is what lets the vessel see the enquiry, so a near-miss must never pick a different yacht.
 */
export function matchYacht(name: string, yachts: Array<{ id: string; vessel_name: string }>): { id: string; vessel_name: string } | null {
  const t = name.trim().toLowerCase()
  if (!t) return null
  const hits = yachts.filter((y) => y.vessel_name.trim().toLowerCase() === t)
  return hits.length === 1 ? hits[0] : null
}

/** The vessel has to confirm its requirements before enquiries go out to suppliers. */
export function canSendToSuppliers(declaredBy: { role: string | null; name: string | null }): boolean {
  return !!declaredBy.role && !!declaredBy.name?.trim()
}

/** Approval needs a received quotation, the Captain or Chief Engineer, their name, and how it was confirmed. */
export function approvalProblems(a: { role: string; name: string; method: string; quote: { status: QuoteStatus } | null }): string[] {
  const out: string[] = []
  if (!a.quote) out.push('Choose the quotation that was approved.')
  else if (a.quote.status !== 'received') out.push('Only a received quotation can be approved.')
  if (!(ROLES as readonly string[]).includes(a.role)) out.push('The approval must come from the Captain or the Chief Engineer.')
  if (blank(a.name)) out.push('Give the name of the person who approved it.')
  if (blank(a.method)) out.push('Say how it was confirmed.')
  return out
}

export const money = (n: number | null | undefined, currency: string) => (n == null ? '—' : `${currency} ${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
