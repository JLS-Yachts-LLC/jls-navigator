/**
 * Warehouse requests — saving and loading them (the rules themselves are in requests-model.ts).
 * A request, its items, its files and its first log entry are saved by one database function, so a failed save leaves
 * nothing half-made; every file is uploaded BEFORE that, for the same reason.
 */
import { supabase } from '@/integrations/supabase/client'
import { storageRef } from '@/lib/signed-url'
import { shrinkImage } from '@/lib/shipsync/image-shrink'
import { uploadWarehouseFile } from '@/lib/warehouse/data'
import {
  requestProblems, toPayload, linePayload,
  type RequestFormInput, type RequestLineInput, type RequestStatus, type RequestType,
} from './requests-model'

const db = () => supabase as any

export interface WarehouseRequest {
  id: string; number: string; type: RequestType; status: RequestStatus
  department: string | null; requester_id: string | null; requester_name: string | null; requester_email: string | null
  yacht: string | null; reference: string | null; eta: string | null; required_at: string | null
  destination: string | null; berth: string | null
  recipient_name: string | null; recipient_phone: string | null; recipient_email: string | null
  urgent: boolean; urgent_reason: string | null; deadline: string | null
  notes: string | null; hold_reason: string | null; amended_count: number
  created_at: string; updated_at: string
}
export interface RequestLine {
  id: string; position: number; description: string; quantity: number | null; unit: string | null; oversized: boolean
  length_cm: number | null; width_cm: number | null; height_cm: number | null; weight_kg: number | null
}
export interface RequestFile { id: string; kind: 'document' | 'photo'; doc_type: string | null; name: string; url: string; created_at: string }
export interface RequestEvent { id: string; kind: 'submitted' | 'status' | 'comment' | 'amended' | 'file'; actor_name: string | null; body: string | null; from_status: string | null; to_status: string | null; created_at: string }
export interface RequestDetail { request: WarehouseRequest; lines: RequestLine[]; files: RequestFile[]; events: RequestEvent[] }

/** A file chosen on the form, waiting to be uploaded with the request. */
export interface PendingFile { file: File; kind: 'document' | 'photo'; docType: string }

export interface RequesterIdentity { name: string; email: string; department: string }

export async function myIdentity(): Promise<RequesterIdentity> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You are signed out — sign in again.')
  const { data } = await db().from('user_profiles').select('display_name, email, department').eq('user_id', user.id).maybeSingle()
  return {
    name: data?.display_name ?? user.email ?? '',
    email: data?.email ?? user.email ?? '',
    department: data?.department ?? '',
  }
}

const safeName = (n: string) => n.replace(/[^\w.-]+/g, '_')

/** Upload files for a request; returns the rows the database function stores. Photos are shrunk to review size first. */
async function uploadAll(folder: string, files: PendingFile[]) {
  const out: Array<{ kind: 'document' | 'photo'; doc_type: string; name: string; url: string }> = []
  for (const f of files) {
    const stamp = `${Date.now()}-${out.length}`
    if (f.kind === 'photo') {
      const small = await shrinkImage(f.file)
      const ext = small.type === 'image/png' ? 'png' : 'jpg'
      const base = safeName(f.file.name).replace(/\.[^.]+$/, '') || 'photo'
      const name = `${base}.${ext}`
      const url = await uploadWarehouseFile(small, `requests/${folder}/${stamp}-${name}`)
      out.push({ kind: 'photo', doc_type: f.docType || 'Photo', name, url })
    } else {
      const url = await uploadWarehouseFile(f.file, `requests/${folder}/${stamp}-${safeName(f.file.name)}`)
      out.push({ kind: 'document', doc_type: f.docType || 'Other', name: f.file.name, url })
    }
  }
  return out
}

const newFolder = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** Tell the Warehouse (and Logistics) by email. Never throws — the request is saved whether or not the email goes. */
export async function notifyRequest(requestId: string, event: 'submitted' | 'status' | 'comment' | 'amended', note?: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return false
    const res = await fetch('/api/warehouse-requests/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ requestId, event, note }),
    })
    return res.ok
  } catch { return false }
}

export async function createWarehouseRequest(
  form: RequestFormInput, files: PendingFile[], who?: RequesterIdentity,
): Promise<{ request: WarehouseRequest; emailed: boolean }> {
  const problems = requestProblems(form)
  if (problems.length) throw new Error(problems.join(' '))
  const identity = who ?? await myIdentity()
  const payload = toPayload(form, identity)
  const uploaded = await uploadAll(newFolder(), files)           // before anything is saved
  const { data, error } = await db().rpc('create_warehouse_request', { p_request: payload.request, p_lines: payload.lines, p_files: uploaded })
  if (error) throw new Error(error.message)
  const request = data as WarehouseRequest
  return { request, emailed: await notifyRequest(request.id, 'submitted') }
}

export async function loadRequests(): Promise<WarehouseRequest[]> {
  const { data, error } = await db().from('warehouse_requests').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as WarehouseRequest[]
}

export async function loadRequestDetail(id: string): Promise<RequestDetail> {
  const [r, l, f, e] = await Promise.all([
    db().from('warehouse_requests').select('*').eq('id', id).single(),
    db().from('warehouse_request_lines').select('*').eq('request_id', id).order('position'),
    db().from('warehouse_request_files').select('*').eq('request_id', id).order('created_at'),
    db().from('warehouse_request_events').select('*').eq('request_id', id).order('created_at'),
  ])
  for (const x of [r, l, f, e]) if (x.error) throw new Error(x.error.message)
  return { request: r.data, lines: l.data ?? [], files: f.data ?? [], events: e.data ?? [] }
}

export async function setRequestStatus(id: string, status: RequestStatus, note?: string): Promise<boolean> {
  const { error } = await db().rpc('warehouse_request_set_status', { p_id: id, p_status: status, p_note: note ?? null })
  if (error) throw new Error(error.message)
  return notifyRequest(id, 'status', note)
}

/** Change a request's details. `reason` says what changed and why; it is recorded, and the request keeps its number. */
export async function amendRequest(id: string, form: RequestFormInput, reason: string): Promise<boolean> {
  const problems = requestProblems(form)
  if (problems.length) throw new Error(problems.join(' '))
  const payload = toPayload(form, { name: '', email: '', department: '' })
  const { error } = await db().rpc('amend_warehouse_request', { p_id: id, p_patch: payload.request, p_lines: payload.lines, p_reason: reason })
  if (error) throw new Error(error.message)
  return notifyRequest(id, 'amended', reason)
}

export async function addComment(id: string, text: string): Promise<boolean> {
  const body = text.trim()
  if (!body) throw new Error('Write a comment first.')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You are signed out — sign in again.')
  const who = await myIdentity()
  const { error } = await db().from('warehouse_request_events').insert({ request_id: id, kind: 'comment', actor_id: user.id, actor_name: who.name, body })
  if (error) throw new Error(error.message)
  return notifyRequest(id, 'comment', body)
}

/** Attach more documents or photos to an existing request. */
export async function addRequestFiles(id: string, files: PendingFile[]): Promise<void> {
  if (!files.length) return
  const uploaded = await uploadAll(id, files)
  const { data: { user } } = await supabase.auth.getUser()
  const who = await myIdentity()
  const { error } = await db().from('warehouse_request_files').insert(uploaded.map((u) => ({ ...u, request_id: id })))
  if (error) throw new Error(error.message)
  await db().from('warehouse_request_events').insert({
    request_id: id, kind: 'file', actor_id: user?.id, actor_name: who.name, body: `Added ${uploaded.map((u) => u.name).join(', ')}`,
  })
}

/** A stored request turned back into form text, to amend it. */
export function toFormInput(d: RequestDetail): RequestFormInput {
  const local = (iso: string | null) => {
    if (!iso) return ''
    const t = new Date(iso)
    if (Number.isNaN(t.getTime())) return ''
    const p = (n: number) => String(n).padStart(2, '0')
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`
  }
  const r = d.request
  const lines: RequestLineInput[] = d.lines.map((l) => ({
    description: l.description, quantity: l.quantity == null ? '' : String(l.quantity), unit: l.unit ?? 'pcs', oversized: l.oversized,
    length: l.length_cm == null ? '' : String(l.length_cm), width: l.width_cm == null ? '' : String(l.width_cm),
    height: l.height_cm == null ? '' : String(l.height_cm), weight: l.weight_kg == null ? '' : String(l.weight_kg),
  }))
  return {
    type: r.type, yacht: r.yacht ?? '', reference: r.reference ?? '', eta: local(r.eta), requiredAt: local(r.required_at),
    destination: r.destination ?? '', berth: r.berth ?? '', recipientName: r.recipient_name ?? '', recipientPhone: r.recipient_phone ?? '',
    recipientEmail: r.recipient_email ?? '', urgent: r.urgent, urgentReason: r.urgent_reason ?? '', deadline: local(r.deadline),
    notes: r.notes ?? '', lines: lines.length ? lines : [{ description: '', quantity: '', unit: 'pcs', oversized: false, length: '', width: '', height: '', weight: '' }],
  }
}

export { storageRef, linePayload }
