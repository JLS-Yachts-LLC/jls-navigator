import { storageRef } from '@/lib/signed-url'
import { useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { fileToBase64 } from '@/lib/file-to-base64'
import { COLORS, FONTS } from '@/lib/tokens'
import { toast } from 'sonner'

/**
 * Bulk visa intake: drop/select many issued visas, OCR each, match it to a crew
 * member (passport number = high, name = medium), then work out what to DO with it:
 *
 *   • Already on file  — an application for that crew already carries this visa
 *                        number, so nothing is written.
 *   • Attach           — the crew member has an open application awaiting its visa;
 *                        the document goes onto THAT application and moves it to
 *                        Approved, exactly as the single "Attach Visa" button does.
 *   • New application  — only when there is nothing open to attach to.
 *
 * Attaching is the normal case. Blindly inserting a new application is what caused
 * SD-0020: three crew who each had a Submitted application ended up with a second,
 * duplicate Approved row that had lost its vessel and country.
 */

type CrewHit = { id: string; name: string; passport_number: string | null }

/** An existing application for the matched crew member. */
type AppHit = {
  id: string
  status: string | null
  vessel_name: string | null
  yacht_id: string | null
  country_code: string | null
  visa_number: string | null
  visa_type: string | null
  passport_number: string | null
  visa_document_url: string | null
  created_at: string | null
}

/** What we intend to do with this file once it has been scanned and matched. */
type Plan = 'attach' | 'create' | 'filed'

type Row = {
  key: string
  fileName: string
  base64: string
  contentType: string
  status: 'scanning' | 'ready' | 'working' | 'done' | 'error'
  error?: string
  ocr?: any
  match?: CrewHit | null
  confidence?: 'high' | 'medium' | 'none'
  plan?: Plan
  /** The application we would attach to, or the one that already holds this visa. */
  app?: AppHit | null
  /** Most recent application of any status — used to seed a new one's vessel/country. */
  seed?: AppHit | null
  resultLabel?: string
}

const norm = (s?: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Statuses that mean "this application is still running and has not had its visa
 * issued yet". Includes the tracker-imported aliases, since imported rows are
 * exactly the ones an operator is most likely to be filing visas against.
 */
const OPEN_STATUSES = new Set([
  'draft', 'submitted', 'in_review', 'processing', 'pending_docs', 'amendment_required',
])

const APP_FIELDS =
  'id, status, vessel_name, yacht_id, country_code, visa_number, visa_type, passport_number, visa_document_url, created_at'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', in_review: 'In Review',
  processing: 'Processing', pending_docs: 'Pending Docs', amendment_required: 'Amendment Required',
}

export function VisaBulkUpload({ countryCode, onClose, onChanged }: {
  countryCode?: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Crew list is fetched once per dialog rather than three times per file. */
  const crewCache = useRef<any[] | null>(null)
  const db = supabase as any

  async function allCrew(): Promise<any[]> {
    if (crewCache.current) return crewCache.current
    const { data } = await db
      .from('crew_members')
      .select('id, first_name, last_name, passport_number')
      .limit(5000) // explicit, so matching can't silently degrade past the default page size
    crewCache.current = (data ?? []) as any[]
    return crewCache.current
  }

  async function matchCrew(ocr: any): Promise<{ hit: CrewHit | null; confidence: 'high' | 'medium' | 'none' }> {
    const name = (c: any) => `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
    const pn = norm(ocr?.passport_number)
    const cm = await allCrew()

    // 1) Exact passport-number match (high confidence) — on crew, then on passports.
    if (pn) {
      const exact = cm.find((c: any) => norm(c.passport_number) === pn)
      if (exact) return { hit: { id: exact.id, name: name(exact), passport_number: exact.passport_number }, confidence: 'high' }
      const { data: cp } = await db.from('crew_passports').select('crew_id, passport_number')
      const pHit = (cp ?? []).find((p: any) => norm(p.passport_number) === pn)
      if (pHit?.crew_id) {
        const c = cm.find((x: any) => x.id === pHit.crew_id)
        if (c) return { hit: { id: c.id, name: name(c), passport_number: c.passport_number }, confidence: 'high' }
      }
    }
    // 2) Name match (medium confidence).
    const sn = norm(ocr?.surname), gn = norm(ocr?.given_names)
    if (sn || gn) {
      const nHit = cm.find((c: any) => norm(c.last_name) === sn && (gn ? norm(c.first_name).includes(gn.slice(0, 4)) : true))
      if (nHit) return { hit: { id: nHit.id, name: name(nHit), passport_number: nHit.passport_number }, confidence: 'medium' }
    }
    return { hit: null, confidence: 'none' }
  }

  /**
   * Decide what to do with a scanned visa for a known crew member: is it already
   * filed, is there an open application waiting for it, or is there nothing to
   * attach to?
   */
  async function planFor(crewId: string, ocr: any): Promise<{ plan: Plan; app: AppHit | null; seed: AppHit | null }> {
    const { data } = await db
      .from('visa_applications')
      .select(APP_FIELDS)
      .eq('crew_member_id', crewId)
      .order('created_at', { ascending: false })
    const apps = ((data ?? []) as AppHit[])
    const seed = apps[0] ?? null

    // Already filed — same visa number on an application for this crew member.
    const vn = norm(ocr?.visa_number)
    if (vn) {
      const already = apps.find(a => norm(a.visa_number) === vn)
      if (already) return { plan: 'filed', app: already, seed }
    }

    // Open and still waiting for its visa. Prefer one for the same country, then
    // the most recent — the list is already newest-first.
    const open = apps.filter(a => OPEN_STATUSES.has((a.status ?? '').toLowerCase()) && !a.visa_document_url)
    const wanted = countryCode ?? seed?.country_code ?? null
    const pick = (wanted && open.find(a => a.country_code === wanted)) || open[0] || null
    if (pick) return { plan: 'attach', app: pick, seed }

    return { plan: 'create', app: null, seed }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${rows.length}-${Math.round(performance.now())}`
      let base64 = ''
      try { base64 = await fileToBase64(file) } catch { /* skip */ }
      setRows(prev => [...prev, { key, fileName: file.name, base64, contentType: file.type, status: 'scanning' }])
      try {
        const r = await fetch('/api/visa/passport-ocr', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type, docType: 'visa' }),
        })
        const j = await r.json()
        if (!j.ok) { setRows(prev => prev.map(x => x.key === key ? { ...x, status: 'error', error: j.error ?? 'Scan failed' } : x)); continue }
        const { hit, confidence } = await matchCrew(j.data)
        const p = hit ? await planFor(hit.id, j.data) : { plan: 'create' as Plan, app: null, seed: null }
        setRows(prev => prev.map(x => x.key === key
          ? { ...x, status: 'ready', ocr: j.data, match: hit, confidence, plan: p.plan, app: p.app, seed: p.seed }
          : x))
      } catch (e) {
        setRows(prev => prev.map(x => x.key === key ? { ...x, status: 'error', error: e instanceof Error ? e.message : 'Scan error' } : x))
      }
    }
  }

  /** Put the file in storage and return its public URL. */
  async function uploadDoc(row: Row, path: string): Promise<string> {
    const bytes = Uint8Array.from(atob(row.base64), c => c.charCodeAt(0))
    const { error } = await supabase.storage.from('permit-documents')
      .upload(path, bytes, { contentType: row.contentType || 'application/octet-stream', upsert: true })
    if (error) throw error
    return storageRef('permit-documents', path)
  }

  /**
   * Attach the visa to an existing application and move it to Approved — the same
   * outcome as the "Attach Visa" button on the applications list. The application's
   * own vessel, country and references are the record: only blanks are filled in.
   */
  async function attachToApp(row: Row, app: AppHit) {
    const ext = row.fileName.split('.').pop() || 'pdf'
    const url = await uploadDoc(row, `visa/${app.id}/visa-document.${ext}`)
    const o = row.ocr ?? {}
    const now = new Date().toISOString()
    const patch: any = { visa_document_url: url, status: 'approved', approved_at: now, updated_at: now }
    if (o.visa_number) patch.visa_number = o.visa_number
    if (o.issue_date) patch.visa_issuance_date = o.issue_date
    if (o.expiry_date) patch.visa_expiry = o.expiry_date
    if (o.first_entry_expiry) patch.first_entry_expiry = o.first_entry_expiry
    // The scan knows the real visa type ("Multiple/Yachts Crew 180 days"); take it
    // only when the application has nothing better than the generic default.
    if (o.visa_type && (!app.visa_type || app.visa_type === 'Crew Visa')) patch.visa_type = o.visa_type
    if (o.passport_number && !app.passport_number) patch.passport_number = o.passport_number
    if (!app.country_code && (countryCode ?? o.country_code)) patch.country_code = countryCode ?? o.country_code
    const { error } = await db.from('visa_applications').update(patch).eq('id', app.id)
    if (error) throw error
  }

  /**
   * Create an approved application, for a crew member with nothing open. Vessel and
   * country are inherited from their most recent application so the new row doesn't
   * land on the list showing "—" for both.
   */
  async function createAppFor(row: Row, crewId: string, seed: AppHit | null) {
    const ext = row.fileName.split('.').pop() || 'pdf'
    const url = await uploadDoc(row, `visa/bulk/${crewId}-${Date.now()}.${ext}`)
    const o = row.ocr ?? {}
    const { error } = await db.from('visa_applications').insert({
      crew_member_id: crewId, status: 'approved', visa_type: o.visa_type ?? 'Crew Visa',
      country_code: countryCode ?? seed?.country_code ?? null,
      vessel_name: seed?.vessel_name ?? null, yacht_id: seed?.yacht_id ?? null,
      destination_country: o.destination_country ?? null,
      visa_number: o.visa_number ?? null, visa_issuance_date: o.issue_date ?? null,
      visa_expiry: o.expiry_date ?? null, first_entry_expiry: o.first_entry_expiry ?? null,
      passport_number: o.passport_number ?? null, nationality: o.nationality ?? null,
      given_name: o.given_names ?? null, surname: o.surname ?? null,
      visa_document_url: url, approved_at: new Date().toISOString(),
    })
    if (error) throw error
  }

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows(prev => prev.map(x => x.key === key ? { ...x, ...patch } : x))

  /** Run the row's plan. `force` creates a new application even if one is open. */
  async function apply(row: Row, force?: 'create') {
    const crewId = row.match?.id
    if (!crewId) return
    setRow(row.key, { status: 'working', error: undefined })
    try {
      if (!force && row.plan === 'attach' && row.app) {
        await attachToApp(row, row.app)
        const st = STATUS_LABEL[(row.app.status ?? '').toLowerCase()] ?? row.app.status ?? 'existing'
        setRow(row.key, { status: 'done', resultLabel: `Attached to ${row.match!.name}'s ${st} application — now Approved` })
      } else {
        await createAppFor(row, crewId, row.seed ?? null)
        setRow(row.key, { status: 'done', resultLabel: `New application created for ${row.match!.name}` })
      }
      onChanged()
    } catch (e) {
      setRow(row.key, { status: 'ready', error: e instanceof Error ? e.message : 'Failed' })
      toast.error('Could not file the visa')
    }
  }

  /** No crew match: create the crew member from the scan, then file the visa. */
  async function createCrewAndFile(row: Row) {
    const o = row.ocr ?? {}
    setRow(row.key, { status: 'working', error: undefined })
    try {
      const { data: crew, error } = await db.from('crew_members').insert({
        first_name: (o.given_names ?? o.holder_name ?? 'New').trim() || 'New',
        last_name: (o.surname ?? '').trim() || 'Crew',
        nationality: o.nationality ?? null,
        date_of_birth: o.date_of_birth ?? null,
        passport_number: o.passport_number ?? null,
        status: 'active',
      }).select('id, first_name, last_name').single()
      if (error) throw error
      crewCache.current = null // the new crew member must be findable for later files
      await createAppFor(row, crew.id, null)
      setRow(row.key, { status: 'done', resultLabel: `Created ${crew.first_name} ${crew.last_name} + filed visa` })
      onChanged()
    } catch (e) {
      setRow(row.key, { status: 'ready', error: e instanceof Error ? e.message : 'Failed' })
      toast.error('Could not create the crew member')
    }
  }

  const confColor = (c?: string) => c === 'high' ? '#22c55e' : c === 'medium' ? COLORS.leoAmber : COLORS.steel

  /** The one line that tells the operator what pressing the button will do. */
  function planLine(row: Row) {
    if (row.plan === 'filed') {
      return <span style={{ color: '#22c55e' }}>Already on file — visa {row.app?.visa_number} is on this crew member's application</span>
    }
    if (row.plan === 'attach' && row.app) {
      const st = STATUS_LABEL[(row.app.status ?? '').toLowerCase()] ?? row.app.status
      const where = [st, row.app.vessel_name].filter(Boolean).join(' · ')
      return <span style={{ color: COLORS.signal }}>Attaches to the open application{where ? ` (${where})` : ''}</span>
    }
    if (!row.match) return <span style={{ color: COLORS.muted }}>Creates a crew member and an application</span>
    return <span style={{ color: COLORS.leoAmber }}>No open application — creates a new one</span>
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflow: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(820px, 100%)', background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 12, padding: 22, fontFamily: FONTS.display, color: COLORS.frost }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Bulk Upload Visas</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: COLORS.muted, marginTop: 0 }}>
          Drop the issued visas. Each one is scanned, matched to its crew member, and filed
          against that crew member's <strong style={{ color: COLORS.frost }}>open application</strong>, moving it to
          Approved. A new application is only created when there is nothing open to attach to.
        </p>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '26px', borderRadius: 10, cursor: 'pointer', textAlign: 'center', border: `2px dashed ${dragOver ? COLORS.signal : COLORS.deep}`, background: dragOver ? `${COLORS.signal}0c` : COLORS.void }}
        >
          <div style={{ fontSize: 26, color: COLORS.signal }}>↑</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.signal }}>Drag &amp; drop visas here, or click</div>
          <div style={{ fontSize: 12, color: COLORS.muted }}>PDF, JPG or PNG · multiple files supported</div>
          <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style={{ display: 'none' }} onChange={e => { void addFiles(e.target.files); if (e.target) e.target.value = '' }} />
        </div>

        {rows.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(row => (
              <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: COLORS.void, border: `1px solid ${COLORS.deep}`, borderRadius: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.fileName}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>
                    {row.status === 'scanning' ? 'Scanning…'
                      : row.status === 'error' ? <span style={{ color: COLORS.warn }}>{row.error}</span>
                      : row.status === 'done' ? <span style={{ color: '#22c55e' }}>✓ {row.resultLabel}</span>
                      : <>
                          {row.ocr?.holder_name || [row.ocr?.given_names, row.ocr?.surname].filter(Boolean).join(' ') || '—'}
                          {row.ocr?.passport_number ? ` · ${row.ocr.passport_number}` : ''}
                          {' · '}
                          <span style={{ color: confColor(row.confidence) }}>
                            {row.confidence === 'high' ? `Match: ${row.match?.name} (passport)` : row.confidence === 'medium' ? `Likely: ${row.match?.name} (name)` : 'No match found'}
                          </span>
                        </>}
                  </div>
                  {row.status === 'ready' && (
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      {planLine(row)}
                      {row.error && <span style={{ color: COLORS.warn }}> · {row.error}</span>}
                    </div>
                  )}
                </div>

                {row.status === 'ready' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {row.plan === 'attach' && (
                      <>
                        <button onClick={() => apply(row)} style={btn(COLORS.signal, COLORS.void)}>Attach</button>
                        <button onClick={() => apply(row, 'create')} style={linkBtn}>new instead</button>
                      </>
                    )}
                    {row.plan === 'filed' && (
                      <button onClick={() => apply(row, 'create')} style={linkBtn}>file anyway</button>
                    )}
                    {row.plan === 'create' && (
                      row.match
                        ? <button onClick={() => apply(row, 'create')} style={btn('transparent', COLORS.signal, COLORS.signal)}>Create application</button>
                        : <button onClick={() => createCrewAndFile(row)} style={btn('transparent', COLORS.signal, COLORS.signal)}>Create crew</button>
                    )}
                  </div>
                )}
                {row.status === 'working' && <span style={{ fontSize: 11, color: COLORS.muted }}>Working…</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function btn(bg: string, color: string, border?: string): React.CSSProperties {
  return { fontFamily: FONTS.display, fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: bg, color, border: border ? `1px solid ${border}` : 'none', flexShrink: 0 }
}

const linkBtn: React.CSSProperties = {
  fontFamily: FONTS.display, fontSize: 11, background: 'none', border: 'none',
  color: COLORS.muted, textDecoration: 'underline', cursor: 'pointer', padding: 0, flexShrink: 0,
}
