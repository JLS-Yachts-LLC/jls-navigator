/**
 * 3rd Party Storage — space JLS rents from outside storage companies on a client's behalf.
 * CRUD over `third_party_storage`, same loadAll/makeCrud shape as the warehouse module.
 */
import { supabase } from '@/integrations/supabase/client'

const db = () => supabase as any

export const TPS_STATUSES = [
  'New Inquiry',
  'Quote Submitted',
  'Quote Approved - Schedule for Collection',
  'Stored',
  'Closed',
] as const
export type TpsStatus = (typeof TPS_STATUSES)[number]
export const TPS_CURRENCIES = ['AED', 'USD', 'EUR'] as const
export type TpsCurrency = (typeof TPS_CURRENCIES)[number]

export interface TpsFile { name: string; url: string }
export interface TpsUpdate { date: string; owner: string; text: string }

export interface ThirdPartyStorage {
  id: string
  ref_no: string
  client: string
  status: TpsStatus
  requested_by: string | null
  space_req_sqft: number | null
  storage_date: string | null
  due_date: string | null
  closed_date: string | null
  unit_number: string | null
  client_email: string | null
  client_contact: string | null
  location: string | null
  jls_quotation: string | null
  jls_invoice: string | null
  quoted_amount: number | null
  quoted_currency: TpsCurrency | null
  storage_company: string | null
  contact_person: string | null
  contact_number: string | null
  company_website: string | null
  company_email: string | null
  storage_company_quotation: TpsFile[]
  unit_images: TpsFile[]
  documents: TpsFile[]
  updates: TpsUpdate[]
  remarks: string | null
  created_at: string
  updated_at: string
}

export async function loadThirdPartyStorage(): Promise<ThirdPartyStorage[]> {
  const all: ThirdPartyStorage[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db().from('third_party_storage').select('*').order('ref_no', { ascending: false }).range(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as ThirdPartyStorage[]))
    if (data.length < 1000) break
  }
  return all
}

export async function createThirdPartyStorage(record: Partial<ThirdPartyStorage>): Promise<ThirdPartyStorage> {
  const { data: ref, error: refErr } = await db().rpc('next_third_party_storage_ref')
  if (refErr) throw refErr
  const { data, error } = await db().from('third_party_storage').insert([{ ...record, ref_no: ref as string }]).select('*').single()
  if (error) throw error
  return data as ThirdPartyStorage
}

export async function updateThirdPartyStorage(id: string, patch: Partial<ThirdPartyStorage>): Promise<void> {
  const { error } = await db().from('third_party_storage').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteThirdPartyStorage(id: string): Promise<void> {
  const { error } = await db().from('third_party_storage').delete().eq('id', id)
  if (error) throw error
}

/** Days until the due date (negative once past), or null with none. Date-only strings are read as local midnight. */
export function daysToDue(due: string | null, now = Date.now()): number | null {
  if (!due) return null
  const t = new Date(due + 'T00:00').getTime()
  return Number.isNaN(t) ? null : Math.ceil((t - now) / 86_400_000)
}

/** Overdue / Due Soon (within 14 days) for a record that is still running — never stored, so it can't go stale. */
export function dueFlag(r: Pick<ThirdPartyStorage, 'status' | 'due_date'>, now = Date.now()): 'Overdue' | 'Due Soon' | null {
  if (r.status === 'Closed') return null
  const d = daysToDue(r.due_date, now)
  if (d == null) return null
  if (d < 0) return 'Overdue'
  return d <= 14 ? 'Due Soon' : null
}
