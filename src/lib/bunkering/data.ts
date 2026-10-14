/**
 * Bunkering enquiries — saving and loading them (the rules are in model.ts). Logging an enquiry with its files, recording the
 * vessel's approval and every status change each go through one database function, so a failed save leaves nothing half-made;
 * files are uploaded BEFORE that, for the same reason.
 */
import { supabase } from '@/integrations/supabase/client'
import { shrinkImage } from '@/lib/shipsync/image-shrink'
import { uploadWarehouseFile } from '@/lib/warehouse/data'
import { myIdentity, type PendingFile } from '@/lib/warehouse/requests'
import {
  enquiryProblems, enquiryPayload, quoteProblems, quotePayload, approvalProblems,
  type EnquiryForm, type QuoteForm, type EnquiryStatus, type QuoteStatus,
} from './model'

const db = () => supabase as any

export interface BunkerEnquiry {
  id: string; number: string; status: EnquiryStatus; created_by: string | null; created_by_name: string | null
  yacht_id: string | null; yacht_name: string; flag: string | null; loa_m: number | null; imo_no: string | null
  captain_name: string | null; chief_engineer_name: string | null; contact_number: string | null; contact_email: string | null
  port: string | null; berth: string | null; preferred_date: string | null; preferred_time: string | null
  fuel_type: string | null; fuel_other: string | null; quantity: number | null; quantity_unit: string | null; spec_notes: string | null
  delivery_method: string | null; fuel_remaining: string | null; tank_capacity: string | null; special_requirements: string | null
  sails_out_of_uae: string | null; departure_date: string | null
  declared_by_role: string | null; declared_by_name: string | null; declared_at: string | null; declaration_method: string | null; declaration_signature_url: string | null
  date_enquiry_sent: string | null
  approved_quote_id: string | null; approved_by_role: string | null; approved_by_name: string | null; approved_at: string | null; approval_method: string | null; approval_note: string | null
  delivered_date: string | null; delivered_quantity: number | null; delivered_unit: string | null; bdn_number: string | null
  cancel_reason: string | null; notes: string | null; created_at: string; updated_at: string
}
export interface BunkerQuote {
  id: string; enquiry_id: string; supplier: string; supplier_contact: string | null; supplier_phone: string | null; supplier_email: string | null
  quote_ref: string | null; date_requested: string | null; date_received: string | null; fuel_type: string | null
  quantity: number | null; quantity_unit: string | null; unit_price: number | null; price_unit: string | null; currency: string; total: number | null
  valid_until: string | null; delivery_terms: string | null; status: QuoteStatus; notes: string | null; shared_with_vessel: boolean; created_at: string
}
export interface EnquiryFile { id: string; kind: 'document' | 'photo'; doc_type: string | null; name: string; url: string; created_at: string }
export interface EnquiryEvent { id: string; kind: string; actor_name: string | null; body: string | null; from_status: string | null; to_status: string | null; created_at: string }
export interface EnquiryDetail { enquiry: BunkerEnquiry; quotes: BunkerQuote[]; files: EnquiryFile[]; events: EnquiryEvent[] }

/** Tell the Agency team by email. Never throws — what was done is saved whether or not the email goes. */
export async function notifyBunkering(enquiryId: string, event: 'created' | 'status' | 'approved' | 'delivered' | 'comment', note?: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return false
    const res = await fetch('/api/bunkering/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ enquiryId, event, note }),
    })
    return res.ok
  } catch { return false }
}

const safeName = (n: string) => n.replace(/[^\w.-]+/g, '_')
const newFolder = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

async function uploadAll(folder: string, files: PendingFile[]) {
  const out: Array<{ kind: 'document' | 'photo'; doc_type: string; name: string; url: string }> = []
  for (const f of files) {
    const stamp = `${Date.now()}-${out.length}`
    if (f.kind === 'photo') {
      const small = await shrinkImage(f.file)
      const ext = small.type === 'image/png' ? 'png' : 'jpg'
      const name = `${safeName(f.file.name).replace(/\.[^.]+$/, '') || 'photo'}.${ext}`
      out.push({ kind: 'photo', doc_type: f.docType || 'Other', name, url: await uploadWarehouseFile(small, `bunkering/${folder}/${stamp}-${name}`) })
    } else {
      out.push({ kind: 'document', doc_type: f.docType || 'Other', name: f.file.name, url: await uploadWarehouseFile(f.file, `bunkering/${folder}/${stamp}-${safeName(f.file.name)}`) })
    }
  }
  return out
}

async function signatureRef(folder: string, signature: Blob | null): Promise<string> {
  return signature ? uploadWarehouseFile(signature, `bunkering/${folder}/signature-${Date.now()}.png`) : ''
}

/** What the vessel confirmed, given when the enquiry is logged (or added afterwards). */
export interface Declaration { role: string; name: string; method: string; signature: Blob | null }

export async function createEnquiry(form: EnquiryForm, files: PendingFile[], declaration: Declaration | null): Promise<BunkerEnquiry> {
  const problems = enquiryProblems(form)
  if (problems.length) throw new Error(problems.join(' '))
  const folder = newFolder()
  const uploaded = await uploadAll(folder, files)                       // before anything is saved
  const sig = declaration ? await signatureRef(folder, declaration.signature) : ''
  const p: Record<string, unknown> = { ...enquiryPayload(form) }
  if (declaration) {
    Object.assign(p, {
      declared_by_role: declaration.role, declared_by_name: declaration.name.trim(), declared_at: new Date().toISOString(),
      declaration_method: declaration.method, declaration_signature_url: sig,
    })
  }
  const { data, error } = await db().rpc('create_bunker_enquiry', { p, p_files: uploaded })
  if (error) throw new Error(error.message)
  const made = data as BunkerEnquiry
  await notifyBunkering(made.id, 'created')
  return made
}

export async function loadEnquiries(): Promise<BunkerEnquiry[]> {
  const { data, error } = await db().from('bunker_enquiries').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as BunkerEnquiry[]
}

export async function loadEnquiryDetail(id: string): Promise<EnquiryDetail> {
  const [e, q, f, ev] = await Promise.all([
    db().from('bunker_enquiries').select('*').eq('id', id).single(),
    db().from('bunker_quotes').select('*').eq('enquiry_id', id).order('created_at'),
    db().from('bunker_enquiry_files').select('*').eq('enquiry_id', id).order('created_at'),
    db().from('bunker_enquiry_events').select('*').eq('enquiry_id', id).order('created_at'),
  ])
  for (const x of [e, q, f, ev]) if (x.error) throw new Error(x.error.message)
  return { enquiry: e.data, quotes: q.data ?? [], files: f.data ?? [], events: ev.data ?? [] }
}

async function logEvent(enquiryId: string, kind: string, body: string) {
  const who = await myIdentity()
  const { data: { user } } = await supabase.auth.getUser()
  await db().from('bunker_enquiry_events').insert({ enquiry_id: enquiryId, kind, actor_id: user?.id, actor_name: who.name, body })
}

/** Add a quotation, or change one. */
export async function saveQuote(enquiryId: string, form: QuoteForm, quoteId?: string): Promise<void> {
  const problems = quoteProblems(form)
  if (problems.length) throw new Error(problems.join(' '))
  const row = quotePayload(form)
  if (quoteId) {
    const { error } = await db().from('bunker_quotes').update(row).eq('id', quoteId)
    if (error) throw new Error(error.message)
    await logEvent(enquiryId, 'quote', `Quotation from ${row.supplier} updated (${form.status})`)
  } else {
    const { error } = await db().from('bunker_quotes').insert({ ...row, enquiry_id: enquiryId })
    if (error) throw new Error(error.message)
    await logEvent(enquiryId, 'quote', `Quotation from ${row.supplier} added (${form.status})`)
  }
}

export async function deleteQuote(enquiryId: string, quote: BunkerQuote): Promise<void> {
  if (quote.status === 'approved') throw new Error('The approved quotation cannot be removed.')
  const { error } = await db().from('bunker_quotes').delete().eq('id', quote.id)
  if (error) throw new Error(error.message)
  await logEvent(enquiryId, 'quote', `Quotation from ${quote.supplier} removed`)
}

export async function setEnquiryStatus(id: string, status: EnquiryStatus, note?: string): Promise<void> {
  const { error } = await db().rpc('bunker_set_status', { p_id: id, p_status: status, p_note: note ?? null })
  if (error) throw new Error(error.message)
  await notifyBunkering(id, 'status', note)
}

export async function approveQuote(enquiryId: string, quote: BunkerQuote, a: { role: string; name: string; method: string; note?: string }): Promise<void> {
  const problems = approvalProblems({ ...a, quote })
  if (problems.length) throw new Error(problems.join(' '))
  const { error } = await db().rpc('bunker_approve_quote', { p_enquiry: enquiryId, p_quote: quote.id, p_role: a.role, p_name: a.name, p_method: a.method, p_note: a.note ?? null })
  if (error) throw new Error(error.message)
  await notifyBunkering(enquiryId, 'approved', a.note)
}

export async function markDelivered(id: string, d: { date: string; quantity: number; unit: string; bdn?: string; note?: string }): Promise<void> {
  const { error } = await db().rpc('bunker_mark_delivered', { p_id: id, p_date: d.date, p_quantity: d.quantity, p_unit: d.unit, p_bdn: d.bdn ?? null, p_note: d.note ?? null })
  if (error) throw new Error(error.message)
  await notifyBunkering(id, 'delivered', d.note)
}

/** The vessel's confirmation of fuel type, specification and quantity (given later, or again if the requirements changed). */
export async function recordDeclaration(id: string, d: Declaration): Promise<void> {
  const sig = await signatureRef(id, d.signature)
  const { error } = await db().rpc('bunker_record_declaration', { p_id: id, p_role: d.role, p_name: d.name, p_method: d.method, p_signature_url: sig || null })
  if (error) throw new Error(error.message)
}

export async function addEnquiryComment(id: string, text: string): Promise<void> {
  const body = text.trim()
  if (!body) throw new Error('Write a comment first.')
  await logEvent(id, 'comment', body)
  await notifyBunkering(id, 'comment', body)
}

export async function addEnquiryFiles(id: string, files: PendingFile[]): Promise<void> {
  if (!files.length) return
  const uploaded = await uploadAll(id, files)
  const { error } = await db().from('bunker_enquiry_files').insert(uploaded.map((u) => ({ ...u, enquiry_id: id })))
  if (error) throw new Error(error.message)
  await logEvent(id, 'file', `Added ${uploaded.map((u) => u.name).join(', ')}`)
}

/** Change the enquiry's details. The reason is kept in the log, so what the vessel originally asked for is never lost. */
export async function updateEnquiry(id: string, form: EnquiryForm, reason: string): Promise<void> {
  const problems = enquiryProblems(form)
  if (problems.length) throw new Error(problems.join(' '))
  if (!reason.trim()) throw new Error('Say what changed and why.')
  const p = enquiryPayload(form) as Record<string, string>
  const row: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(p)) row[k] = v === '' ? null : v
  row.yacht_name = p.yacht_name
  const { error } = await db().from('bunker_enquiries').update(row).eq('id', id)
  if (error) throw new Error(error.message)
  await logEvent(id, 'edited', `Details changed — ${reason.trim()}`)
}

/** A stored enquiry turned back into form text, to change it. */
export function toEnquiryForm(e: BunkerEnquiry): EnquiryForm {
  const s = (v: string | number | null | undefined) => (v == null ? '' : String(v))
  return {
    yachtId: s(e.yacht_id), yachtName: s(e.yacht_name), flag: s(e.flag), loa: s(e.loa_m), imo: s(e.imo_no), captain: s(e.captain_name), chiefEngineer: s(e.chief_engineer_name),
    contactNumber: s(e.contact_number), contactEmail: s(e.contact_email), port: s(e.port), berth: s(e.berth), preferredDate: s(e.preferred_date),
    preferredTime: s(e.preferred_time), fuelType: s(e.fuel_type), fuelOther: s(e.fuel_other), quantity: s(e.quantity), unit: e.quantity_unit ?? 'MT',
    specNotes: s(e.spec_notes), deliveryMethod: s(e.delivery_method), fuelRemaining: s(e.fuel_remaining), tankCapacity: s(e.tank_capacity),
    specialRequirements: s(e.special_requirements), sailsOut: s(e.sails_out_of_uae), departureDate: s(e.departure_date), notes: s(e.notes),
  }
}
