/**
 * Mini Backup runner — advanced by the 15-minute cron.
 *
 * Lifecycle per protected instance:
 *   1. At its scheduled hour: CreateImage (NoReboot) → run row in 'imaging'.
 *   2. While 'imaging': poll the AMI; when available, record its snapshots,
 *      prune AMIs beyond retention, and (if offsite is on and Impossible Cloud
 *      is configured) move to 'offsite', else 'complete'.
 *   3. While 'offsite': copy snapshot blocks to Impossible Cloud, a bounded
 *      batch per tick (Workers cap subrequests per invocation, so a full first
 *      copy drains over many ticks; later runs copy only the blocks changed since
 *      the previous run's snapshot). Layout in the bucket:
 *        {instancePk}/{runId}/blocks/{snapshotId}/{blockIndex}   raw 512KiB block
 *        {instancePk}/{runId}/manifest.json                      index → where
 *        {instancePk}/{runId}/restore.md                         how to rebuild
 *      Incremental runs reference the parent run's objects for unchanged blocks,
 *      so restore never needs more than the manifest chain.
 */
import { createClient } from '@supabase/supabase-js'
import {
  awsBackupConfig, impossibleConfig, type AwsBackupConfig, type ImpossibleConfig,
  createImage, describeImage, listBackupImages, deregisterImage,
  listSnapshotBlocks, listChangedBlocks, getSnapshotBlock, s3Put, s3Get,
} from './aws.server'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

/** Blocks copied per tick — 2 subrequests each (EBS GET + Impossible PUT), kept
 *  well inside the Worker's per-invocation subrequest budget. ~150MB/tick. */
const BLOCKS_PER_TICK = 300

type Cursor = {
  si?: number                 // which snapshot in the run we're on
  pageToken?: string | null
  pageOffset?: number         // blocks of the CURRENT page already uploaded
  mode?: 'full' | 'incr'
  parentRunId?: string | null
  parentSnapshotId?: string | null
  blocksDone?: number
  // block index → object key suffix, accumulated for the CURRENT snapshot only,
  // flushed to a per-snapshot manifest part when the snapshot finishes.
  // (kept in the bucket, not the DB — see manifest-{si}.json)
}

export type TickSummary = {
  scheduled: number; imaged: number; offsiteActive: boolean; errors: string[]
} | null

export async function runBackupTick(): Promise<TickSummary> {
  const cfg = await awsBackupConfig()
  if (!cfg.enabled || !cfg.accessKeyId || !cfg.secretAccessKey) return null
  const sb = admin() as any
  const errors: string[] = []
  const now = new Date()

  // ── 1. Start due backups ─────────────────────────────────────────────────────
  let scheduled = 0
  const { data: instances } = await sb.from('it_backup_instances').select('*').eq('active', true)
  for (const inst of (instances ?? []) as any[]) {
    try {
      if (inst.schedule === 'manual') continue
      if (inst.schedule === 'weekly' && now.getUTCDay() !== 1) continue
      if (now.getUTCHours() !== inst.hour_utc) continue
      const { data: today } = await sb.from('it_backup_runs').select('id')
        .eq('instance_pk', inst.id)
        .gte('started_at', new Date(now.getTime() - 20 * 3600_000).toISOString())
        .limit(1).maybeSingle()
      if (today) continue
      await startRun(sb, cfg, inst)
      scheduled++
    } catch (e: any) {
      errors.push(`${inst.name}: ${e?.message ?? e}`)
    }
  }

  // ── 2. Poll AMIs being created ───────────────────────────────────────────────
  let imaged = 0
  const { data: imaging } = await sb.from('it_backup_runs')
    .select('*, it_backup_instances(*)').eq('status', 'imaging')
  for (const run of (imaging ?? []) as any[]) {
    const inst = run.it_backup_instances
    try {
      const img = await describeImage(cfg, inst.region, run.ami_id)
      if (img.state === 'available') {
        await pruneRetention(sb, cfg, inst)
        const ic = inst.offsite ? await impossibleConfig() : null
        await sb.from('it_backup_runs').update({
          snapshots: img.snapshots,
          status: ic ? 'offsite' : 'complete',
          ...(ic ? { offsite_cursor: {} } : { finished_at: new Date().toISOString() }),
        }).eq('id', run.id)
        imaged++
      } else if (img.state === 'failed' || img.state === 'error') {
        await sb.from('it_backup_runs').update({
          status: 'error', error: `AMI entered state ${img.state}`, finished_at: new Date().toISOString(),
        }).eq('id', run.id)
      } // pending → check again next tick
    } catch (e: any) {
      errors.push(`${inst.name} imaging: ${e?.message ?? e}`)
    }
  }

  // ── 3. Advance ONE offsite copy (oldest first) ───────────────────────────────
  let offsiteActive = false
  const ic = await impossibleConfig()
  if (ic) {
    const { data: offsite } = await sb.from('it_backup_runs')
      .select('*, it_backup_instances(*)').eq('status', 'offsite')
      .order('started_at', { ascending: true }).limit(1)
    const run = (offsite ?? [])[0] as any
    if (run) {
      offsiteActive = true
      try {
        await advanceOffsite(sb, cfg, ic, run)
      } catch (e: any) {
        // Transient failures should retry next tick, not kill the run — only a
        // handful of repeats mark it failed.
        const strikes = (run.offsite_cursor?.strikes ?? 0) + 1
        if (strikes >= 8) {
          await sb.from('it_backup_runs').update({
            status: 'error', error: String(e?.message ?? e).slice(0, 400), finished_at: new Date().toISOString(),
          }).eq('id', run.id)
        } else {
          await sb.from('it_backup_runs').update({
            offsite_cursor: { ...(run.offsite_cursor ?? {}), strikes },
          }).eq('id', run.id)
        }
        errors.push(`${run.it_backup_instances?.name} offsite: ${e?.message ?? e}`)
      }
    }
  }

  if (scheduled || imaged || offsiteActive || errors.length) return { scheduled, imaged, offsiteActive, errors }
  return null
}

export async function startRun(sb: any, cfg: AwsBackupConfig, inst: any): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  const amiId = await createImage(cfg, inst.region, inst.instance_id, `polaris-${inst.instance_id}-${stamp}`, inst.id)
  const { data, error } = await sb.from('it_backup_runs')
    .insert({ instance_pk: inst.id, ami_id: amiId, status: 'imaging' }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}

async function pruneRetention(sb: any, cfg: AwsBackupConfig, inst: any): Promise<void> {
  const images = await listBackupImages(cfg, inst.region, inst.id).catch(() => [])
  for (const img of images.slice(inst.retention)) {
    await deregisterImage(cfg, inst.region, img.amiId, img.snapshotIds).catch(() => {})
  }
}

// ── Offsite copy ────────────────────────────────────────────────────────────────

async function advanceOffsite(sb: any, cfg: AwsBackupConfig, ic: ImpossibleConfig, run: any): Promise<void> {
  const inst = run.it_backup_instances
  const snaps = (run.snapshots ?? []) as Array<{ snapshotId: string; volumeSizeGiB: number }>
  const cur: Cursor = { si: 0, pageToken: null, blocksDone: 0, ...(run.offsite_cursor ?? {}) }
  delete (cur as any).strikes
  const base = `${inst.id}/${run.id}`

  // First touch: decide full vs incremental by finding the previous complete run
  // with the same volume layout.
  if (cur.mode === undefined) {
    const { data: prev } = await sb.from('it_backup_runs').select('id, snapshots')
      .eq('instance_pk', inst.id).eq('status', 'complete').not('manifest_key', 'is', null)
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
    const prevSnaps = (prev?.snapshots ?? []) as Array<{ snapshotId: string }>
    cur.mode = prev && prevSnaps.length === snaps.length ? 'incr' : 'full'
    cur.parentRunId = cur.mode === 'incr' ? prev.id : null
    cur.si = 0
    cur.pageToken = null
    cur.blocksDone = 0
  }

  let budget = BLOCKS_PER_TICK
  let bytes = 0
  const sIdx = cur.si ?? 0

  while (budget > 0 && (cur.si ?? 0) < snaps.length) {
    const si = cur.si ?? 0
    const snap = snaps[si]

    let parentSnapshotId: string | null = null
    if (cur.mode === 'incr' && cur.parentRunId) {
      const { data: prev } = await sb.from('it_backup_runs').select('snapshots').eq('id', cur.parentRunId).single()
      parentSnapshotId = ((prev?.snapshots ?? [])[si] as any)?.snapshotId ?? null
    }

    const page = parentSnapshotId
      ? await listChangedBlocks(cfg, inst.region, parentSnapshotId, snap.snapshotId, cur.pageToken ?? null)
      : await listSnapshotBlocks(cfg, inst.region, snap.snapshotId, cur.pageToken ?? null)

    const skip = cur.pageOffset ?? 0
    const batch = page.blocks.slice(skip, skip + budget)
    const manifestPart: Record<number, string> = {}
    for (const block of batch) {
      const data = await getSnapshotBlock(cfg, inst.region, snap.snapshotId, block)
      const key = `${base}/blocks/${snap.snapshotId}/${block.BlockIndex}`
      await s3Put(ic, key, data)
      manifestPart[block.BlockIndex] = key
      bytes += data.byteLength
      budget--
    }
    if (Object.keys(manifestPart).length) {
      const partNo = (cur.blocksDone ?? 0)
      await s3Put(ic, `${base}/parts/${si}-${partNo}.json`, JSON.stringify(manifestPart), 'application/json')
      cur.blocksDone = partNo + batch.length
    }

    if (skip + batch.length < page.blocks.length) {
      cur.pageOffset = skip + batch.length
      // Budget exhausted mid-page: re-list this page next tick and skip what's done.
      // Pages are stable for the token's lifetime; simplest correct resume is to
      // keep the token and let the next tick re-fetch — already-uploaded blocks
      // are simply overwritten (idempotent PUTs), never corrupted.
      break
    }

    cur.pageOffset = 0
    if (page.nextToken) {
      cur.pageToken = page.nextToken
    } else {
      // Snapshot finished → assemble its manifest from parts (plus parent's, for
      // unchanged blocks on incremental runs).
      await finaliseSnapshotManifest(ic, base, si, snap, parentSnapshotId, cur, inst.id)
      cur.si = si + 1
      cur.pageToken = null
      cur.pageOffset = 0
      cur.blocksDone = 0
    }
  }

  if ((cur.si ?? 0) >= snaps.length) {
    const manifestKey = `${base}/manifest.json`
    await s3Put(ic, manifestKey, JSON.stringify({
      version: 1,
      instance: inst.instance_id,
      instanceName: inst.name,
      runId: run.id,
      amiId: run.ami_id,
      created: new Date().toISOString(),
      mode: cur.mode,
      parentRunId: cur.parentRunId ?? null,
      snapshots: snaps.map((s, i) => ({ ...s, manifest: `${base}/manifest-${i}.json` })),
    }, null, 2), 'application/json')
    await s3Put(ic, `${base}/restore.md`, RESTORE_DOC, 'text/markdown')
    await sb.from('it_backup_runs').update({
      status: 'complete', manifest_key: manifestKey, offsite_cursor: {},
      offsite_bytes: Number(run.offsite_bytes ?? 0) + bytes,
      finished_at: new Date().toISOString(),
    }).eq('id', run.id)
  } else {
    await sb.from('it_backup_runs').update({
      offsite_cursor: cur, offsite_bytes: Number(run.offsite_bytes ?? 0) + bytes,
    }).eq('id', run.id)
  }
  void sIdx
}

/** Merge this snapshot's uploaded parts (and the parent manifest on incremental
 *  runs) into one block-index → object-key map. */
async function finaliseSnapshotManifest(
  ic: ImpossibleConfig, base: string, si: number,
  snap: { snapshotId: string; volumeSizeGiB: number },
  parentSnapshotId: string | null, cur: Cursor, instancePk: string,
): Promise<void> {
  const blocks: Record<string, string> = {}
  if (parentSnapshotId && cur.parentRunId) {
    const parent = await s3Get(ic, `${instancePk}/${cur.parentRunId}/manifest-${si}.json`)
    if (parent) Object.assign(blocks, (JSON.parse(new TextDecoder().decode(parent)).blocks ?? {}))
  }
  // Parts were written as {blocksDoneSoFar}.json — walk them by listing is not
  // available on all S3-compats, so we track offsets: parts are at cumulative
  // block counts 0, n1, n1+n2… Reconstruct by probing sequentially.
  let offset = 0
  for (let guard = 0; guard < 100000; guard++) {
    const part = await s3Get(ic, `${base}/parts/${si}-${offset}.json`)
    if (!part) break
    const map = JSON.parse(new TextDecoder().decode(part)) as Record<string, string>
    Object.assign(blocks, map)
    offset += Object.keys(map).length
    if (Object.keys(map).length === 0) break
  }
  await s3Put(ic, `${base}/manifest-${si}.json`, JSON.stringify({
    snapshotId: snap.snapshotId,
    volumeSizeGiB: snap.volumeSizeGiB,
    blockSizeBytes: 524288,
    parentSnapshotId,
    blocks,
  }), 'application/json')
}

const RESTORE_DOC = `# Restoring this backup

Each volume of the AMI is stored as 512 KiB blocks under \`blocks/<snapshotId>/<blockIndex>\`,
with \`manifest-<n>.json\` mapping every allocated block index to its object key
(incremental runs point unchanged blocks at the parent run's objects).

To rebuild a raw disk image:

1. Download \`manifest-<n>.json\` for the volume.
2. Create an empty file of volumeSizeGiB GiB: \`truncate -s <size>G disk.raw\`
3. For every entry \`index → key\`: download the object and write it at the right offset:
   \`dd if=<block file> of=disk.raw bs=524288 seek=<index> conv=notrunc\`
   Unlisted indexes are zeros.
4. The result is a raw disk image — mount it via loopback, or import it back to AWS
   with \`aws ec2 import-snapshot\`.
`
