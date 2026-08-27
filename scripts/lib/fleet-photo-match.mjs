/**
 * Name/registration matching for the fleet photo import — kept separate so the
 * exact code that decides a match can be unit-tested against the real vessel and
 * driver lists, rather than trusted on a first run over 86 files.
 *
 * Everything here is deliberately conservative: any ambiguity is reported for a
 * human to settle instead of being resolved by a best guess.
 */

export const norm = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
export const tokens = s => norm(s).split(/[^a-z0-9]+/).filter(t => t.length > 1)
export const plate = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * Vehicle folders are named "<Make> <Model> <REGISTRATION>". Try progressively
 * longer tails so "Isuzu Reward NP T42313" and "Ram Z61308" both resolve.
 * @returns {{ok:true, vehicle:object}|{ok:false, reason:string}}
 */
export function matchVehicleFolder(folder, vehicles) {
  const parts = String(folder).trim().split(/\s+/)
  for (let i = parts.length; i > 0; i--) {
    const cand = plate(parts.slice(i - 1).join(''))
    if (cand.length < 4) continue
    const hit = vehicles.find(v => plate(v.registration) === cand)
    if (hit) return { ok: true, vehicle: hit, matchedOn: cand }
  }
  return { ok: false, reason: `no vehicle whose registration appears in "${folder}"` }
}

/** front/back/left/right from a file name; "rear" normalises to "back". */
export function angleOf(fileName) {
  const m = String(fileName).replace(/\.[^.]+$/, '').toLowerCase().match(/front|back|rear|left|right/)
  const a = m ? m[0] : 'other'
  return a === 'rear' ? 'back' : a
}

/** Strip trailing " - Truck Provi" style notes and " (1)" duplicate markers. */
export function cleanDriverName(fileBase) {
  return String(fileBase).replace(/\s*[-–]\s*.*$/, '').replace(/\s*\(\d+\)\s*$/, '').trim()
}

/** One-character-apart, or equal ignoring silent h (Satish ↔ Sathish). */
function nearName(candidate, target) {
  if (candidate === target) return true
  if (candidate.replace(/h/g, '') === target.replace(/h/g, '')) return true
  if (Math.abs(candidate.length - target.length) > 1) return false
  // single edit distance, cheap version
  const [a, b] = candidate.length >= target.length ? [candidate, target] : [target, candidate]
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    a.length === b.length ? (i++, j++) : i++
  }
  return true
}

/**
 * Match a driver photo file name to a driver record.
 * Order: exact name → all tokens contained → email local-part → single
 * near-spelling first name. Ambiguity is always reported, never resolved.
 * @returns {{ok:true, driver:object, how:string}|{ok:false, reason:string}}
 */
export function matchDriverFile(fileBase, drivers) {
  const cleaned = cleanDriverName(fileBase)
  const want = tokens(cleaned)
  if (!want.length) return { ok: false, reason: `"${fileBase}" — no usable name in the file name` }

  // 1. Exact.
  const exact = drivers.find(d => norm(d.full_name) === norm(cleaned))
  if (exact) return { ok: true, driver: exact, how: 'exact name' }

  // 2. Every token of the file name appears in the driver's name.
  const contained = drivers.filter(d => {
    const t = tokens(d.full_name)
    return want.every(w => t.includes(w))
  })
  if (contained.length === 1) return { ok: true, driver: contained[0], how: 'name tokens' }
  if (contained.length > 1) {
    return { ok: false, reason: `"${fileBase}" — ambiguous: ${contained.map(d => d.full_name).join(' / ')}` }
  }

  // 3. Email local-part — how "Lucy" resolves to Luzviminda Datuin Santiago.
  const byEmail = drivers.filter(d =>
    d.email && norm(d.email.split('@')[0]) === norm(cleaned).replace(/\s+/g, ''))
  if (byEmail.length === 1) return { ok: true, driver: byEmail[0], how: 'email' }

  // 4. Spelling-variant match on a SINGLE-word file name only.
  //    Never for a file that supplies a surname: "Ali Ismail" shares a first
  //    name with "Ali Rizwan" but is plainly a different person, and
  //    "Satish Bangera" is not obviously "Sathish Somappa". Where the surnames
  //    disagree, a human decides.
  if (want.length === 1) {
    const near = drivers.filter(d => tokens(d.full_name).some(t => nearName(t, want[0])))
    if (near.length === 1) return { ok: true, driver: near[0], how: 'first name (spelling variant)' }
    if (near.length > 1) {
      return { ok: false, reason: `"${fileBase}" — ambiguous: ${near.map(d => d.full_name).join(' / ')}` }
    }
  } else {
    // Surname supplied but no driver carries it — say so precisely.
    const sharesFirst = drivers.filter(d => tokens(d.full_name).some(t => nearName(t, want[0])))
    if (sharesFirst.length) {
      return {
        ok: false,
        reason: `"${fileBase}" — first name matches ${sharesFirst.map(d => d.full_name).join(' / ')}, but the surname doesn't; needs confirming`,
      }
    }
  }

  return { ok: false, reason: `"${fileBase}" — no driver of that name` }
}
