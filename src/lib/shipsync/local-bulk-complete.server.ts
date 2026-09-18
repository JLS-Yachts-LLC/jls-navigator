/**
 * One-off data cleanup for the Local Package board's "Delivered" tab, per
 * client request: a package sitting there should move to Completed once
 * either (a) it was delivered before 1 Sept 2026, or (b) it already has an
 * invoice number — an invoice number alone is enough regardless of delivery
 * status. Scoped to local_import null/'Local' + status delivered/delivered_tbi
 * only, so it never touches Import/Export/EDAS or already-terminal rows.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const db = () => supabaseAdmin as any

const CUTOFF_DATE = '2026-09-01'

export interface BulkCompleteResult {
  ok: true
  dryRun: boolean
  matched: number
  updated: number
  sample: { id: string; boat_name: string | null; status: string; delivered_at: string | null; invoice_no: string | null }[]
}

export async function bulkCompleteLocalDelivered(dryRun: boolean): Promise<BulkCompleteResult> {
  const { data: rows, error } = await db()
    .from('shipsync_packages')
    .select('id, boat_name, status, delivered_at, invoice_no, local_import')
    .in('status', ['delivered', 'delivered_tbi'])
    .or('local_import.is.null,local_import.eq.Local')
    .or(`delivered_at.lt.${CUTOFF_DATE},invoice_no.not.is.null`)
  if (error) throw error

  const matched = rows ?? []
  if (!dryRun && matched.length) {
    const ids = matched.map((r: any) => r.id)
    const { error: updateError } = await db().from('shipsync_packages').update({ status: 'completed' }).in('id', ids)
    if (updateError) throw updateError
  }

  return {
    ok: true,
    dryRun,
    matched: matched.length,
    updated: dryRun ? 0 : matched.length,
    sample: matched.slice(0, 20).map((r: any) => ({ id: r.id, boat_name: r.boat_name, status: r.status, delivered_at: r.delivered_at, invoice_no: r.invoice_no })),
  }
}
