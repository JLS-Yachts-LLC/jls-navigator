/**
 * Automatic messages to a client — the per-vessel / per-boat switch.
 *
 * Every message Polaris sends a client ON ITS OWN (no staff member pressing
 * Send) asks here first, at the moment of sending: phone notifications, "job
 * complete" emails to boat owners, "delivery 5 minutes away" emails, WhatsApp
 * expiry reminders and auto-replies. Staff switch a client on in Manage Users →
 * Client Portal; no row (or enabled = false) means off. A message raised while a
 * client is off is marked HELD and never sent later.
 *
 * Not covered on purpose: anything a staff member sends by pressing Send, the
 * side-effect emails Matt chose to keep (delivery POD/receipts, service-desk
 * ticket emails, e-sign signed copies, the seaport report), scheduled vessel
 * reports (the client's own opt-in counts), and internal alerts to JLS staff.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'

export const HELD = 'Held — automatic messages are switched off for this client'

export interface AutoMessageTargets {
  yachts: Set<string>
  boats: Set<string>
}

/** Every vessel and boat switched on. One read per run; callers check with allowed(). */
export async function autoMessageTargets(): Promise<AutoMessageTargets> {
  const { data, error } = await (supabaseAdmin as any)
    .from('client_auto_messages').select('yacht_id, boat_id').eq('enabled', true)
  // Fail closed: if the switch can't be read, nothing goes out.
  if (error) {
    console.error('[client-auto-messages] could not read switches:', error.message)
    return { yachts: new Set(), boats: new Set() }
  }
  const yachts = new Set<string>()
  const boats = new Set<string>()
  for (const r of (data ?? []) as any[]) {
    if (r.yacht_id) yachts.add(r.yacht_id)
    if (r.boat_id) boats.add(r.boat_id)
  }
  return { yachts, boats }
}

/** Is this client switched on? A message tied to no vessel or boat is never allowed. */
export function allowed(t: AutoMessageTargets, v: { yachtId?: string | null; boatId?: string | null }): boolean {
  return (!!v.yachtId && t.yachts.has(v.yachtId)) || (!!v.boatId && t.boats.has(v.boatId))
}
