/**
 * Warehouse requests — the rules, with no database in them so they can be tested on their own:
 * the three kinds of request, what each one must say, what the form sends, and who may do what.
 *
 *   incoming  an expected delivery        picking  goods to pick and prepare        dispatch  goods to go out
 */

export type RequestType = 'incoming' | 'picking' | 'dispatch'
export type RequestStatus = 'submitted' | 'confirmed' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled'

export const TYPE_LABEL: Record<RequestType, string> = {
  incoming: 'Incoming shipment', picking: 'Picking request', dispatch: 'Dispatch request',
}
export const TYPE_BLURB: Record<RequestType, string> = {
  incoming: 'Tell the Warehouse what is arriving and when, so space and handling can be prepared.',
  picking: 'Ask the Warehouse to pick and prepare items.',
  dispatch: 'Ask the Warehouse to send items out to a yacht or recipient.',
}
export const STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: 'Submitted', confirmed: 'Confirmed', in_progress: 'In progress', completed: 'Completed', on_hold: 'On hold', cancelled: 'Cancelled',
}
export const OPEN_STATUSES: RequestStatus[] = ['submitted', 'confirmed', 'in_progress', 'on_hold']
export const DOC_TYPES = ['Delivery order', 'Packing list', 'Invoice', 'Shipping document', 'Photo', 'Other'] as const
export const UNITS = ['pcs', 'box', 'crate', 'pallet', 'set', 'kg', 'm', 'other'] as const

export interface RequestLineInput {
  description: string
  quantity: string
  unit: string
  /** A large crate or oversized cargo — its dimensions and weight must be given. */
  oversized: boolean
  length: string
  width: string
  height: string
  weight: string
}

export interface RequestFormInput {
  type: RequestType
  yacht: string
  reference: string
  /** datetime-local text, "2026-10-14T09:30" */
  eta: string
  requiredAt: string
  destination: string
  berth: string
  recipientName: string
  recipientPhone: string
  recipientEmail: string
  urgent: boolean
  urgentReason: string
  deadline: string
  notes: string
  lines: RequestLineInput[]
}

export const emptyLine = (): RequestLineInput => ({ description: '', quantity: '', unit: 'pcs', oversized: false, length: '', width: '', height: '', weight: '' })

export const emptyForm = (type: RequestType): RequestFormInput => ({
  type, yacht: '', reference: '', eta: '', requiredAt: '', destination: '', berth: '',
  recipientName: '', recipientPhone: '', recipientEmail: '', urgent: false, urgentReason: '', deadline: '', notes: '', lines: [emptyLine()],
})

const num = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : NaN }
const positive = (s: string) => num(s) > 0
const blank = (s: string) => !String(s ?? '').trim()
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

/**
 * What is wrong with this request, in words the person filling it in can act on. Empty = ready to send.
 * (Documents and photos are encouraged but never required: an incoming shipment's paperwork is often not there yet.)
 */
export function requestProblems(f: RequestFormInput): string[] {
  const out: string[] = []

  const described = f.lines.filter((l) => !blank(l.description))
  if (described.length === 0) out.push('Add at least one item, with a description and a quantity.')
  f.lines.forEach((l, i) => {
    const n = i + 1
    const touched = !blank(l.description) || !blank(l.quantity)
    if (!touched) return
    if (blank(l.description)) out.push(`Item ${n}: add a description.`)
    if (!positive(l.quantity)) out.push(`Item ${n}: add a quantity.`)
    if (l.oversized && !(positive(l.length) && positive(l.width) && positive(l.height) && positive(l.weight))) {
      out.push(`Item ${n}: a large crate or oversized item needs its length, width, height and weight.`)
    }
  })

  if (f.type === 'incoming') {
    if (blank(f.eta)) out.push('Give the expected arrival date and time (ETA).')
    if (blank(f.yacht)) out.push('Give the yacht or project reference.')
  }
  if (f.type === 'picking' && blank(f.requiredAt)) out.push('Give the date and time the items are needed by.')
  if (f.type === 'dispatch') {
    if (blank(f.destination)) out.push('Give the destination yacht.')
    if (blank(f.recipientName)) out.push('Give the name of the person receiving it.')
    if (blank(f.recipientPhone) && blank(f.recipientEmail)) out.push('Give a phone number or an email for the recipient.')
    if (blank(f.requiredAt)) out.push('Give the required delivery date and time.')
  }
  if (!blank(f.recipientEmail) && !looksLikeEmail(f.recipientEmail)) out.push('The recipient email does not look right.')
  if (f.urgent) {
    if (blank(f.urgentReason)) out.push('An urgent request needs the reason it is urgent.')
    if (blank(f.deadline)) out.push('An urgent request needs the deadline.')
  }
  return out
}

/** The JSON the database function takes: only what the request type uses, text trimmed, dates as ISO instants. */
export function toPayload(f: RequestFormInput, who: { name: string; email: string; department: string }) {
  const iso = (s: string) => { if (blank(s)) return ''; const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : d.toISOString() }
  const t = (s: string) => String(s ?? '').trim()
  const dispatch = f.type === 'dispatch'
  return {
    request: {
      type: f.type, department: who.department, requester_name: who.name, requester_email: who.email,
      yacht: t(f.yacht), reference: t(f.reference),
      eta: f.type === 'incoming' ? iso(f.eta) : '',
      required_at: f.type === 'incoming' ? '' : iso(f.requiredAt),
      destination: dispatch ? t(f.destination) : '', berth: dispatch ? t(f.berth) : '',
      recipient_name: dispatch ? t(f.recipientName) : '', recipient_phone: dispatch ? t(f.recipientPhone) : '', recipient_email: dispatch ? t(f.recipientEmail) : '',
      urgent: f.urgent, urgent_reason: f.urgent ? t(f.urgentReason) : '', deadline: f.urgent ? iso(f.deadline) : '',
      notes: t(f.notes),
    },
    lines: f.lines.filter((l) => !blank(l.description)).map(linePayload),
  }
}

export function linePayload(l: RequestLineInput) {
  const n = (s: string) => (blank(s) ? '' : String(num(s)))
  return {
    description: l.description.trim(), quantity: n(l.quantity), unit: l.unit,
    oversized: l.oversized, length_cm: l.oversized ? n(l.length) : '', width_cm: l.oversized ? n(l.width) : '',
    height_cm: l.oversized ? n(l.height) : '', weight_kg: l.oversized ? n(l.weight) : '',
  }
}

/** Which status moves a person may make: the Warehouse team any open one; the person who raised it can only withdraw it. */
export function allowedMoves(status: RequestStatus, o: { isWarehouse: boolean; isRequester: boolean }): RequestStatus[] {
  if (status === 'completed' || status === 'cancelled') return []
  if (o.isWarehouse) {
    const all: RequestStatus[] = ['submitted', 'confirmed', 'in_progress', 'completed', 'on_hold', 'cancelled']
    return all.filter((s) => s !== status)
  }
  return o.isRequester ? ['cancelled'] : []
}

/** Moves that must come with a written reason. */
export const NEEDS_REASON: RequestStatus[] = ['on_hold', 'cancelled']

/** Can this person change the request's details? The requester or the Warehouse team, until it is completed or cancelled. */
export function canAmend(status: RequestStatus, o: { isWarehouse: boolean; isRequester: boolean }): boolean {
  return status !== 'completed' && status !== 'cancelled' && (o.isWarehouse || o.isRequester)
}

/** "3 items · 2 oversized" */
export function linesSummary(lines: Array<{ oversized?: boolean }>): string {
  const big = lines.filter((l) => l.oversized).length
  return `${lines.length} item${lines.length === 1 ? '' : 's'}${big ? ` · ${big} oversized` : ''}`
}
