/**
 * Pre-Arrival prefill — reads yacht profile fields LIVE (never a stored copy)
 * so corrections made via the yacht profile Edit are reflected next time the
 * form is opened. Adapted to the real `yachts` schema (owner + billing live on
 * the yachts row; single `engine` field; radio fields are frequency/
 * equipment_model/manufacturer/serial_no).
 */

import { supabase } from '@/integrations/supabase/client'

export interface PrearrivalTenderRow {
  id?: string
  description: string | null
  manufacturerModel: string | null
  lengthM: number | null
  idSerialNo: string | null
  color: string | null
  fuelType: string | null
  yearOfBuild: number | null
}

export interface PrearrivalPrefill {
  vesselName: string | null
  imoNo: string | null
  vesselType: string | null
  officialNo: string | null
  flag: string | null
  portOfRegistry: string | null
  grossTonnage: number | null
  netTonnage: number | null
  lengthOverallM: number | null
  breadthM: number | null
  draughtM: number | null
  airDraftM: number | null
  maxCrew: number | null
  maxGuests: number | null
  mmsi: string | null
  radioCallSign: string | null
  frequency: string | null
  equipmentModel: string | null
  manufacturer: string | null
  serialNo: string | null
  engine: string | null
  ownerName: string | null
  ownerNationality: string | null
  ownerAddress: string | null
  billingCompanyName: string | null
  billingContactPerson: string | null
  billingEmail: string | null
  billingContactNo: string | null
  billingAddress: string | null
  tenders: PrearrivalTenderRow[]
}

export async function getPrearrivalPrefill(yachtId: string): Promise<PrearrivalPrefill> {
  const [{ data: profile, error: profileErr }, { data: tenders, error: tendersErr }] = await Promise.all([
    supabase.from('v_prearrival_prefill').select('*').eq('yacht_id', yachtId).single(),
    supabase.from('yacht_tenders').select('*').eq('yacht_id', yachtId).order('created_at'),
  ])

  if (profileErr) throw profileErr
  if (tendersErr) throw tendersErr

  const p = profile as Record<string, any>
  return {
    vesselName: p.vessel_name ?? null,
    imoNo: p.imo_no ?? null,
    vesselType: p.vessel_type ?? null,
    officialNo: p.official_no ?? null,
    flag: p.flag ?? null,
    portOfRegistry: p.port_of_registry ?? null,
    grossTonnage: p.gross_tonnage ?? null,
    netTonnage: p.net_tonnage ?? null,
    lengthOverallM: p.length_overall_m ?? null,
    breadthM: p.breadth_m ?? null,
    draughtM: p.draught_m ?? null,
    airDraftM: p.air_draft_m ?? null,
    maxCrew: p.max_crew ?? null,
    maxGuests: p.max_guests ?? null,
    mmsi: p.mmsi ?? null,
    radioCallSign: p.radio_call_sign ?? null,
    frequency: p.frequency ?? null,
    equipmentModel: p.equipment_model ?? null,
    manufacturer: p.manufacturer ?? null,
    serialNo: p.serial_no ?? null,
    engine: p.engine ?? null,
    ownerName: p.owners_name ?? null,
    ownerNationality: p.owners_nationality ?? null,
    ownerAddress: p.owners_address ?? null,
    billingCompanyName: p.company_name ?? null,
    billingContactPerson: p.contact_person ?? null,
    billingEmail: p.email_address ?? null,
    billingContactNo: p.contact_no ?? null,
    billingAddress: p.billing_address ?? null,
    tenders: ((tenders ?? []) as Record<string, any>[]).map((t) => ({
      id: t.id,
      description: t.description ?? null,
      manufacturerModel: t.manufacturer_model ?? null,
      lengthM: t.length_m ?? null,
      idSerialNo: t.id_serial_no ?? null,
      color: t.color ?? null,
      fuelType: t.fuel_type ?? null,
      yearOfBuild: t.year_of_build ?? null,
    })),
  }
}
