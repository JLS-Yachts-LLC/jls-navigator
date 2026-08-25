/**
 * POST /api/backups — admin actions for the Mini Backup platform.
 *
 * { action: 'discover' }                 → EC2 instances in the configured region
 * { action: 'run-now', instancePk }      → start a backup immediately
 * { action: 'tick' }                     → advance the runner without waiting for cron
 * { action: 'test-offsite' }             → write+read a probe object in Impossible Cloud
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { awsBackupConfig, impossibleConfig, describeInstances, s3Put, s3Get } from '@/lib/backup/aws.server'
import { runBackupTick, startRun } from '@/lib/backup/runner.server'

export async function backupsHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request)
  if (!session.ok) return session.response
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  try {
    const body = await request.json() as any
    const cfg = await awsBackupConfig()

    if (body.action === 'discover') {
      if (!cfg.accessKeyId) return json({ error: 'AWS credentials are not configured yet.' }, 400)
      const region = String(body.region ?? cfg.region)
      return json({ instances: await describeInstances(cfg, region), region })
    }

    if (body.action === 'run-now') {
      if (!cfg.accessKeyId) return json({ error: 'AWS credentials are not configured yet.' }, 400)
      const { data: inst } = await (supabaseAdmin as any)
        .from('it_backup_instances').select('*').eq('id', body.instancePk).single()
      if (!inst) return json({ error: 'Instance not found' }, 404)
      const runId = await startRun(supabaseAdmin as any, cfg, inst)
      return json({ ok: true, runId })
    }

    if (body.action === 'tick') {
      const summary = await runBackupTick()
      return json({ ok: true, summary })
    }

    if (body.action === 'test-offsite') {
      const ic = await impossibleConfig()
      if (!ic) return json({ error: 'Impossible Cloud is not configured (or not enabled) yet.' }, 400)
      const key = `_polaris-probe/${Date.now()}.txt`
      await s3Put(ic, key, 'polaris backup probe', 'text/plain')
      const back = await s3Get(ic, key)
      return json({ ok: !!back, bucket: ic.bucket })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e: any) {
    return json({ error: String(e?.message ?? e).slice(0, 300) }, 500)
  }
}
