import { supabase } from '@/integrations/supabase/client'
import { formatName } from '@/lib/formatName'

export interface CrewMember {
  id:                 string
  full_name:          string | null
  first_name:         string | null
  last_name:          string | null
  date_of_birth:      string | null
  email:              string | null
  phone:              string | null
  rank:               string | null
  nationality:        string | null
  multiple_passports: boolean
  yacht_id:           string | null
}

export interface CrewPassport {
  id:               string
  crew_id:          string
  nationality:      string
  passport_number:  string
  issue_date:       string
  expiry_date:      string
  issuing_country:  string
  is_primary:       boolean
  document_url:     string | null
  cover_url?:       string | null
  headshot_url?:    string | null
  seamans_book_url?:string | null
  no_seamans_book?: boolean
  double_checked?:  boolean
}

/**
 * Look for an existing crew profile matching full_name + date_of_birth.
 * Returns the first match or null. Never matches on nationality alone.
 */
export async function findCrewMatch(
  fullName: string,
  dateOfBirth: string,
): Promise<CrewMember | null> {
  if (!fullName.trim() || !dateOfBirth) return null

  const { data } = await (supabase as any)
    .from('crew_members')
    .select('*')
    .ilike('full_name', fullName.trim())
    .eq('date_of_birth', dateOfBirth)
    .limit(1)

  return data?.[0] ?? null
}

/** Load all passports for a crew member, primary first */
export async function loadCrewPassports(crewId: string): Promise<CrewPassport[]> {
  const { data } = await (supabase as any)
    .from('crew_passports')
    .select('*')
    .eq('crew_id', crewId)
    .order('is_primary', { ascending: false })
    .order('expiry_date',  { ascending: false })

  return data ?? []
}

/** Upsert a crew member. Returns the saved record. */
export async function upsertCrewMember(
  fields: Partial<CrewMember> & { first_name: string; last_name: string },
): Promise<CrewMember> {
  const firstName  = formatName(fields.first_name)
  const middleName = formatName((fields as any).middle_name)
  const lastName   = formatName(fields.last_name)

  const payload = {
    ...fields,
    first_name: firstName,
    last_name:  lastName,
    full_name: [firstName, middleName, lastName]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    updated_at: new Date().toISOString(),
  }
  if (middleName !== undefined) (payload as any).middle_name = middleName

  if (fields.id) {
    const { data, error } = await (supabase as any)
      .from('crew_members')
      .update(payload)
      .eq('id', fields.id)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await (supabase as any)
    .from('crew_members')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** Save a passport record. Returns saved record. */
export async function upsertPassport(
  fields: Partial<CrewPassport> & { crew_id: string; passport_number: string },
): Promise<CrewPassport> {
  const payload = { ...fields, updated_at: new Date().toISOString() }

  if (fields.id) {
    const { data, error } = await (supabase as any)
      .from('crew_passports')
      .update(payload)
      .eq('id', fields.id)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await (supabase as any)
    .from('crew_passports')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** Set one passport as primary, clear all others for this crew member */
export async function setPrimaryPassport(crewId: string, passportId: string) {
  await (supabase as any)
    .from('crew_passports')
    .update({ is_primary: false })
    .eq('crew_id', crewId)

  await (supabase as any)
    .from('crew_passports')
    .update({ is_primary: true })
    .eq('id', passportId)
}
