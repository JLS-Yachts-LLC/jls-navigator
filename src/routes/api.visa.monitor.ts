import { runDailyComplianceChecks } from '@/lib/visa/complianceMonitor.server'
import { requireMaintenanceAccess } from '@/lib/admin/maintenance-access'

export async function visaMonitorHandler(request: Request): Promise<Response> {
  // Runs the compliance sweep and writes compliance_alerts — global admin or
  // CRON_SECRET only, failing closed. The daily cron calls
  // runDailyComplianceChecks() directly and never comes through here.
  const denied = await requireMaintenanceAccess(request)
  if (denied) return denied

  try {
    const result = await runDailyComplianceChecks()
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
