/**
 * Pre-Arrival form row operations. The form row stores trip-specific fields plus
 * particulars that have no yacht-profile home yet (see migration notes); profile
 * fields are read live via getPrearrivalPrefill and never copied here.
 */

import { supabase } from '@/integrations/supabase/client'

export interface PreArrivalFormRow {
  id: string
  yacht_id: string
  status: 'draft' | 'ready_for_review' | 'submitted'
  arrival_date: string | null
  last_port_of_call: string | null
  arrival_emirate: string | null
  arrival_port: string | null
  max_air_draft_m: number | null
  beam_m: number | null
  max_forward_draft_m: number | null
  dead_weight_tn: number | null
  max_stern_draft_m: number | null
  summer_dead_weight_tn: number | null
  displacement_tn: number | null
  main_propulsion_kw: number | null
  generators_kw: number | null
  hull_id_number: string | null
  engine_serial_no: string | null
  fuel_type: string | null
  captain_name: string | null
  captain_email: string | null
  purser_name: string | null
  purser_email: string | null
  chief_engineer_name: string | null
  chief_engineer_email: string | null
  created_at: string
  submitted_at: string | null
}

/** Create a draft form (no profile values copied) and return it. */
export async function createDraftPrearrivalForm(yachtId: string): Promise<PreArrivalFormRow> {
  const { data, error } = await supabase
    .from('pre_arrival_forms')
    .insert({ yacht_id: yachtId, status: 'draft' })
    .select()
    .single()
  if (error) throw error
  return data as PreArrivalFormRow
}

/** Load a form row by id. */
export async function getPrearrivalForm(formId: string): Promise<PreArrivalFormRow> {
  const { data, error } = await supabase.from('pre_arrival_forms').select('*').eq('id', formId).single()
  if (error) throw error
  return data as PreArrivalFormRow
}

/** Most recent draft for a yacht, or null. */
export async function getLatestDraft(yachtId: string): Promise<PreArrivalFormRow | null> {
  const { data, error } = await supabase
    .from('pre_arrival_forms')
    .select('*')
    .eq('yacht_id', yachtId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as PreArrivalFormRow) ?? null
}

export type PreArrivalFormPatch = Partial<Omit<PreArrivalFormRow, 'id' | 'yacht_id' | 'created_at'>>

/** Save trip + captured-particular fields on the form row. */
export async function savePrearrivalForm(formId: string, patch: PreArrivalFormPatch): Promise<void> {
  const { error } = await supabase.from('pre_arrival_forms').update(patch).eq('id', formId)
  if (error) throw error
}

/** Mark a form submitted. */
export async function submitPrearrivalForm(formId: string, patch: PreArrivalFormPatch): Promise<void> {
  const { error } = await supabase
    .from('pre_arrival_forms')
    .update({ ...patch, status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', formId)
  if (error) throw error
}
