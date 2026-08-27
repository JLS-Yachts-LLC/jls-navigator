/**
 * One-off import of the supplied vehicle and driver photos.
 *
 *   node scripts/import-fleet-photos.mjs --dry-run     # match + resize report, no writes
 *   node scripts/import-fleet-photos.mjs               # upload + link
 *
 * Both reading the fleet tables and writing to storage need the service role
 * key — RLS refuses anonymous reads of crew_vehicles/crew_drivers and the
 * storage policy refuses anonymous writes:
 *
 *   Windows:  set SUPABASE_SERVICE_ROLE_KEY=... && node scripts/import-fleet-photos.mjs --dry-run
 *   bash:     SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-fleet-photos.mjs --dry-run
 *
 * What it does
 *  • Vehicles: "JLS Vehicle Pictures.zip" holds one folder per vehicle named
 *    "<Make> <Model> <REGISTRATION>" with front/back/left/right images. Matched
 *    on the registration in the folder name. All four angles are kept in
 *    crew_vehicle_photos; front becomes the list thumbnail.
 *  • Drivers: "wetransfer_drivers-photo_*.zip" holds "<Name>.jpg", matched by
 *    exact name → all-token containment → email local-part → single-word
 *    spelling variant. Anything less certain is REPORTED, never guessed.
 *  • Every image is resized first (long edge 1600 vehicles / 800 driver avatars);
 *    the originals run 3.5–6 MB each, which would make the list views crawl.
 *
 * Re-running is safe: storage paths are deterministic (upsert) and the photo
 * rows are keyed on (vehicle, angle).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, basename } from 'node:path'
import sharp from 'sharp'
import { matchVehicleFolder, matchDriverFile, angleOf } from './lib/fleet-photo-match.mjs'

const DRY = process.argv.includes('--dry-run')
const TMP = '.fleet-photos-tmp'
const BUCKET = 'permit-documents'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const URL = process.env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!KEY) {
  console.error(`
SUPABASE_SERVICE_ROLE_KEY is not set.

It is needed even for --dry-run: row-level security refuses anonymous reads of
crew_vehicles and crew_drivers, so without it the script cannot see what to match
against (and would silently report everything as unmatched).

  Windows:  set SUPABASE_SERVICE_ROLE_KEY=<key> && node scripts/import-fleet-photos.mjs --dry-run
  bash:     SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/import-fleet-photos.mjs --dry-run
`)
  process.exit(1)
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

// ── Helpers ───────────────────────────────────────────────────────────────────
function unzip(zip, dest) {
  mkdirSync(dest, { recursive: true })
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
  ], { stdio: 'pipe' })
}
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    statSync(p).isDirectory() ? walk(p, out) : out.push(p)
  }
  return out
}
const isImage = p => /\.(jpe?g|png|webp)$/i.test(p)
const kb = n => `${Math.round(n / 1024)} KB`
const mb = n => `${(n / 1048576).toFixed(1)} MB`

const resize = (path, maxEdge) => sharp(path).rotate() // honour EXIF orientation
  .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 82, mozjpeg: true }).toBuffer()

async function upload(key, buf) {
  const { error } = await sb.storage.from(BUCKET).upload(key, buf, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`upload ${key}: ${error.message}`)
  return sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl
}

// ── Targets — fail loudly rather than matching against nothing ────────────────
const { data: vehicles, error: vErr } = await sb.from('crew_vehicles').select('id, make, model, registration')
const { data: drivers, error: dErr } = await sb.from('crew_drivers').select('id, full_name, email')
if (vErr) { console.error('Cannot read crew_vehicles:', vErr.message); process.exit(1) }
if (dErr) { console.error('Cannot read crew_drivers:', dErr.message); process.exit(1) }
if (!vehicles?.length || !drivers?.length) {
  console.error(`Read returned no rows (vehicles ${vehicles?.length ?? 0}, drivers ${drivers?.length ?? 0}) — the key is probably not the service role key. Refusing to continue.`)
  process.exit(1)
}
console.log(`Matching against ${vehicles.length} vehicles and ${drivers.length} drivers.`)

if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
const vehicleZip = readdirSync('.').find(f => /JLS Vehicle Pictures\.zip$/i.test(f))
const driverZip = readdirSync('.').find(f => /^wetransfer_drivers-photo.*\.zip$/i.test(f))
const report = { vehicles: [], drivers: [], review: [], before: 0, after: 0 }

// ── Vehicles ──────────────────────────────────────────────────────────────────
if (vehicleZip) {
  console.log(`\n── Vehicles — ${vehicleZip}`)
  const dest = join(TMP, 'vehicles')
  unzip(vehicleZip, dest)

  const byFolder = new Map()
  for (const f of walk(dest).filter(isImage)) {
    const folder = basename(join(f, '..'))
    if (!byFolder.has(folder)) byFolder.set(folder, [])
    byFolder.get(folder).push(f)
  }

  for (const [folder, imgs] of [...byFolder].sort()) {
    const m = matchVehicleFolder(folder, vehicles)
    if (!m.ok) { report.review.push(`VEHICLE ${m.reason}`); console.log(`  ⚠ ${folder} — ${m.reason}`); continue }

    const angles = []
    for (const img of imgs.sort()) {
      const angle = angleOf(basename(img))
      const before = statSync(img).size
      const buf = await resize(img, 1600)
      report.before += before; report.after += buf.length
      const url = DRY ? null : await upload(`vehicles/photos/${m.vehicle.id}/${angle}.jpg`, buf)
      angles.push({ angle, url })
    }

    if (!DRY) {
      const front = angles.find(a => a.angle === 'front') ?? angles[0]
      const { error: uErr } = await sb.from('crew_vehicles').update({ photo_url: front.url }).eq('id', m.vehicle.id)
      if (uErr) throw new Error(`link ${m.vehicle.registration}: ${uErr.message}`)
      for (const [i, a] of angles.entries()) {
        const { error: pErr } = await sb.from('crew_vehicle_photos')
          .upsert({ vehicle_id: m.vehicle.id, url: a.url, angle: a.angle, sort_order: i },
                  { onConflict: 'vehicle_id,angle' })
        if (pErr) throw new Error(`photo row ${m.vehicle.registration}/${a.angle}: ${pErr.message}`)
      }
    }
    report.vehicles.push(m.vehicle.registration)
    console.log(`  ✓ ${folder.padEnd(30)} → ${m.vehicle.registration.padEnd(8)} [${angles.map(a => a.angle).join(', ')}]`)
  }
} else {
  console.log('\n(no "JLS Vehicle Pictures.zip" in the project root)')
}

// ── Drivers ───────────────────────────────────────────────────────────────────
if (driverZip) {
  console.log(`\n── Drivers — ${driverZip}`)
  const dest = join(TMP, 'drivers')
  unzip(driverZip, dest)

  for (const f of walk(dest).filter(isImage).sort()) {
    const base = basename(f).replace(/\.[^.]+$/, '')
    const m = matchDriverFile(base, drivers)
    if (!m.ok) { report.review.push(`DRIVER ${m.reason}`); console.log(`  ⚠ ${base} — ${m.reason}`); continue }

    const before = statSync(f).size
    const buf = await resize(f, 800)
    report.before += before; report.after += buf.length
    if (!DRY) {
      const url = await upload(`drivers/photos/${m.driver.id}.jpg`, buf)
      const { error } = await sb.from('crew_drivers').update({ photo_url: url }).eq('id', m.driver.id)
      if (error) throw new Error(`link ${m.driver.full_name}: ${error.message}`)
    }
    report.drivers.push(m.driver.full_name)
    console.log(`  ✓ ${base.padEnd(30)} → ${m.driver.full_name.padEnd(28)} (${m.how})  ${kb(before)} → ${kb(buf.length)}`)
  }
} else {
  console.log('\n(no "wetransfer_drivers-photo_*.zip" in the project root)')
}

if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })

console.log(`\n──────── ${DRY ? 'DRY RUN — nothing written' : 'IMPORT COMPLETE'} ────────`)
console.log(`Vehicles linked : ${report.vehicles.length}`)
console.log(`Drivers linked  : ${report.drivers.length}`)
console.log(`Image payload   : ${mb(report.before)} → ${mb(report.after)}`)
if (report.review.length) {
  console.log(`\nLeft for a human (${report.review.length}) — nothing was guessed:`)
  for (const r of report.review) console.log('  •', r)
}
console.log()
