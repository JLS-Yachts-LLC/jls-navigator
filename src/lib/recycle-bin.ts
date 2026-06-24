/**
 * Recycle Bin — soft-delete for crew, yachts and visa applications.
 *
 * Instead of a hard DELETE, we snapshot the row (and a crew member's child
 * passports + visa applications) into `recycle_bin`, then remove the original.
 * Items are restorable for 90 days, after which they're purged.
 */

import { supabase } from '@/integrations/supabase/client'

export type RecycleEntityType = 'crew_member' | 'yacht' | 'visa_application'

const TABLE: Record<RecycleEntityType, string> = {
  crew_member: 'crew_members',
  yacht: 'yachts',
  visa_application: 'visa_applications',
}

const LABEL: Record<RecycleEntityType, string> = {
  crew_member: 'Crew member',
  yacht: 'Yacht',
  visa_application: 'Visa application',
}

export interface RecycleBinItem {
  id: string
  entity_type: RecycleEntityType
  entity_id: string
  label: string | null
  payload: any
  related: any
  deleted_by_email: string | null
  deleted_at: string
  expires_at: string
  restored_at: string | null
}

/** A quick dependency summary used to warn the user before deleting. */
export interface DeleteImpact {
  visaApplications: number
  passports: number
}

/** Count what a crew-member delete would take with it (visas + passports). */
export async function getCrewDeleteImpact(crewId: string): Promise<DeleteImpact> {
  const db = supabase as any
  const [{ count: visas }, { count: passports }] = await Promise.all([
    db.from('visa_applications').select('id', { count: 'exact', head: true }).eq('crew_member_id', crewId),
    db.from('crew_passports').select('id', { count: 'exact', head: true }).eq('crew_id', crewId),
  ])
  return { visaApplications: visas ?? 0, passports: passports ?? 0 }
}

/**
 * Soft-delete an entity: snapshot it (+ children for crew) into the recycle bin,
 * then remove the original (and its children). Restorable for 90 days.
 */
export async function softDeleteEntity(
  entityType: RecycleEntityType,
  id: string,
  label?: string,
): Promise<void> {
  const db = supabase as any

  const { data: row } = await db.from(TABLE[entityType]).select('*').eq('id', id).maybeSingle()
  if (!row) throw new Error(`${LABEL[entityType]} not found`)

  // For a crew member, also snapshot the children so a restore brings them back.
  let related: any = null
  if (entityType === 'crew_member') {
    const [{ data: visas }, { data: passports }] = await Promise.all([
      db.from('visa_applications').select('*').eq('crew_member_id', id),
      db.from('crew_passports').select('*').eq('crew_id', id),
    ])
    related = { visa_applications: visas ?? [], crew_passports: passports ?? [] }
  }

  const { data: auth } = await supabase.auth.getUser()

  const { error: insErr } = await db.from('recycle_bin').insert({
    entity_type: entityType,
    entity_id: id,
    label: label ?? null,
    payload: row,
    related,
    deleted_by: auth?.user?.id ?? null,
    deleted_by_email: auth?.user?.email ?? null,
  })
  if (insErr) throw insErr

  // Remove children first (in case FKs aren't ON DELETE CASCADE), then the row.
  if (entityType === 'crew_member') {
    await db.from('visa_applications').delete().eq('crew_member_id', id)
    await db.from('crew_passports').delete().eq('crew_id', id)
  }
  const { error: delErr } = await db.from(TABLE[entityType]).delete().eq('id', id)
  if (delErr) throw delErr
}

/** List active (not yet restored) recycle-bin items, newest first. */
export async function listRecycleBin(): Promise<RecycleBinItem[]> {
  const db = supabase as any
  const { data } = await db
    .from('recycle_bin')
    .select('*')
    .is('restored_at', null)
    .order('deleted_at', { ascending: false })
  return (data ?? []) as RecycleBinItem[]
}

/** Restore an item: re-insert the row (+ children) and clear it from the bin. */
export async function restoreEntity(item: RecycleBinItem): Promise<void> {
  const db = supabase as any
  const { error } = await db.from(TABLE[item.entity_type]).upsert(item.payload)
  if (error) throw error
  if (item.related?.crew_passports?.length) {
    await db.from('crew_passports').upsert(item.related.crew_passports)
  }
  if (item.related?.visa_applications?.length) {
    await db.from('visa_applications').upsert(item.related.visa_applications)
  }
  await db.from('recycle_bin').delete().eq('id', item.id)
}

/** Permanently remove a single recycle-bin item. */
export async function purgeForever(id: string): Promise<void> {
  await (supabase as any).from('recycle_bin').delete().eq('id', id)
}

/** Best-effort purge of anything past its 90-day window (called on bin load). */
export async function purgeExpired(): Promise<void> {
  try {
    await (supabase as any).from('recycle_bin').delete().lt('expires_at', new Date().toISOString())
  } catch { /* non-fatal */ }
}

export function daysUntilPurge(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000))
}

export function entityLabel(t: RecycleEntityType): string {
  return LABEL[t]
}
