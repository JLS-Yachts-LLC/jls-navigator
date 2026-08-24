/**
 * Pre-Arrival / Cruising Permit form.
 * Route: /yachts/:id/prearrival
 *
 * Profile fields are auto-filled LIVE from the yacht profile (read-only here — the
 * yacht profile's Edit button is the single place to correct them, per spec §6).
 * Trip-specific fields and particulars with no profile home (extended dimensions,
 * engine breakdown, hull id, fuel type, department heads) are editable and saved
 * on the submission. Tenders come from the profile with an inline add.
 */

import { createFileRoute, useParams, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { COLORS, FONTS } from '@/lib/tokens'
import { supabase } from '@/integrations/supabase/client'
import { getPrearrivalPrefill, type PrearrivalPrefill } from '@/lib/prearrival/getPrearrivalPrefill'
import {
  getLatestDraft, createDraftPrearrivalForm, submitPrearrivalForm,
  savePrearrivalForm, type PreArrivalFormRow,
} from '@/lib/prearrival/prearrivalForm'

export const Route = createFileRoute('/_app/yachts/$id/prearrival')({
  component: PreArrivalPage,
  head: () => ({ meta: [{ title: 'Pre-Arrival / Cruising Permit — Polaris' }] }),
})

const AMBER = '#E8A020'
const GREEN = '#1D9E75'

type FormState = Record<string, string>

function PreArrivalPage() {
  const { id: yachtId } = useParams({ from: '/_app/yachts/$id/prearrival' })
  const navigate = useNavigate()
  const [prefill, setPrefill] = useState<PrearrivalPrefill | null>(null)
  const [form, setForm] = useState<PreArrivalFormRow | null>(null)
  const [vals, setVals] = useState<FormState>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const pre = await getPrearrivalPrefill(yachtId)
        let row = await getLatestDraft(yachtId)
        if (!row) row = await createDraftPrearrivalForm(yachtId)
        if (!alive) return
        setPrefill(pre)
        setForm(row)
        setVals(rowToVals(row))
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load form')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [yachtId])

  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }))

  const TRIP_REQUIRED = ['arrival_date', 'last_port_of_call', 'arrival_emirate', 'arrival_port']

  function collectPatch() {
    const num = (k: string) => (vals[k]?.trim() ? Number(vals[k]) : null)
    const str = (k: string) => (vals[k]?.trim() ? vals[k].trim() : null)
    return {
      arrival_date: str('arrival_date'),
      last_port_of_call: str('last_port_of_call'),
      arrival_emirate: str('arrival_emirate'),
      arrival_port: str('arrival_port'),
      max_air_draft_m: num('max_air_draft_m'),
      beam_m: num('beam_m'),
      max_forward_draft_m: num('max_forward_draft_m'),
      dead_weight_tn: num('dead_weight_tn'),
      max_stern_draft_m: num('max_stern_draft_m'),
      summer_dead_weight_tn: num('summer_dead_weight_tn'),
      displacement_tn: num('displacement_tn'),
      main_propulsion_kw: num('main_propulsion_kw'),
      generators_kw: num('generators_kw'),
      hull_id_number: str('hull_id_number'),
      engine_serial_no: str('engine_serial_no'),
      fuel_type: str('fuel_type'),
      captain_name: str('captain_name'),
      captain_email: str('captain_email'),
      purser_name: str('purser_name'),
      purser_email: str('purser_email'),
      chief_engineer_name: str('chief_engineer_name'),
      chief_engineer_email: str('chief_engineer_email'),
    }
  }

  async function handleSaveDraft() {
    if (!form) return
    setSaving(true)
    try {
      await savePrearrivalForm(form.id, collectPatch())
      toast('Draft saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  async function handleSubmit() {
    if (!form) return
    const missing = TRIP_REQUIRED.filter((k) => !vals[k]?.trim())
    if (missing.length) {
      toast.error(`Please complete: ${missing.map(labelOf).join(', ')}`)
      return
    }
    setSaving(true)
    try {
      await submitPrearrivalForm(form.id, collectPatch())
      toast('Pre-Arrival form submitted')
      navigate({ to: '/yachts/$id', params: { id: yachtId } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed')
    } finally { setSaving(false) }
  }

  if (loading) return <Centered>Loading form…</Centered>
  if (error) return <Centered tone="error">{error}</Centered>
  if (!prefill) return <Centered tone="error">No yacht profile found.</Centered>

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px', fontFamily: FONTS.display }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.frost, margin: '0 0 4px' }}>
        Pre-Arrival / Cruising Permit
      </h1>
      <p style={{ fontSize: 13, color: COLORS.muted, margin: '0 0 20px', lineHeight: 1.6 }}>
        Vessel details are auto-filled from the yacht profile. Correct any profile value with the
        Edit button on the yacht profile — it flows through here automatically. Complete the arrival
        details and any blank fields, then submit.
      </p>

      <Section title="Arrival — this trip">
        <TripField label="Arrival Date" type="date" value={vals.arrival_date ?? ''} onChange={(v) => set('arrival_date', v)} />
        <TripField label="Last Port of Call" value={vals.last_port_of_call ?? ''} onChange={(v) => set('last_port_of_call', v)} />
        <TripField label="Arrival Emirate" value={vals.arrival_emirate ?? ''} onChange={(v) => set('arrival_emirate', v)} />
        <TripField label="Arrival Port" value={vals.arrival_port ?? ''} onChange={(v) => set('arrival_port', v)} />
      </Section>

      <Section title="Vessel">
        <Prefill label="Vessel Name" value={prefill.vesselName} />
        <Prefill label="IMO No." value={prefill.imoNo} />
        <Prefill label="Vessel Type" value={prefill.vesselType} />
        <Prefill label="Official No." value={prefill.officialNo} />
        <Prefill label="Flag" value={prefill.flag} />
        <Prefill label="Port of Registry" value={prefill.portOfRegistry} />
      </Section>

      <Section title="Dimensions & Engine">
        <Prefill label="Gross Tonnage" value={prefill.grossTonnage} />
        <Prefill label="Net Tonnage" value={prefill.netTonnage} />
        <Prefill label="Length Overall (m)" value={prefill.lengthOverallM} />
        <Prefill label="Breadth (m)" value={prefill.breadthM} />
        <Prefill label="Draught (m)" value={prefill.draughtM} />
        <Prefill label="Air Draft (m)" value={prefill.airDraftM} />
        <Prefill label="Engine" value={prefill.engine} />
        {/* Captured particulars — no profile home yet */}
        <Captured label="Max Air Draft (m)" value={vals.max_air_draft_m ?? ''} onChange={(v) => set('max_air_draft_m', v)} />
        <Captured label="Beam (m)" value={vals.beam_m ?? ''} onChange={(v) => set('beam_m', v)} />
        <Captured label="Max Forward Draft (m)" value={vals.max_forward_draft_m ?? ''} onChange={(v) => set('max_forward_draft_m', v)} />
        <Captured label="Max Stern Draft (m)" value={vals.max_stern_draft_m ?? ''} onChange={(v) => set('max_stern_draft_m', v)} />
        <Captured label="Dead Weight (tn)" value={vals.dead_weight_tn ?? ''} onChange={(v) => set('dead_weight_tn', v)} />
        <Captured label="Summer Dead Weight (tn)" value={vals.summer_dead_weight_tn ?? ''} onChange={(v) => set('summer_dead_weight_tn', v)} />
        <Captured label="Displacement (tn)" value={vals.displacement_tn ?? ''} onChange={(v) => set('displacement_tn', v)} />
        <Captured label="Main Propulsion Power (kW)" value={vals.main_propulsion_kw ?? ''} onChange={(v) => set('main_propulsion_kw', v)} />
        <Captured label="Generators Power (kW)" value={vals.generators_kw ?? ''} onChange={(v) => set('generators_kw', v)} />
        <Captured label="Hull Identification Number" value={vals.hull_id_number ?? ''} onChange={(v) => set('hull_id_number', v)} />
        <Captured label="Engine Serial Number" value={vals.engine_serial_no ?? ''} onChange={(v) => set('engine_serial_no', v)} />
        <Captured label="Fuel Type" value={vals.fuel_type ?? ''} onChange={(v) => set('fuel_type', v)} />
      </Section>

      <Section title="Radio & Communications">
        <Prefill label="Radio Call Sign" value={prefill.radioCallSign} />
        <Prefill label="Frequency" value={prefill.frequency} />
        <Prefill label="Equipment Model" value={prefill.equipmentModel} />
        <Prefill label="Manufacturer" value={prefill.manufacturer} />
        <Prefill label="Serial No." value={prefill.serialNo} />
        <Prefill label="MMSI" value={prefill.mmsi} />
      </Section>

      <Section title="Manning">
        <Prefill label="Max No. of Crew" value={prefill.maxCrew} />
        <Prefill label="Max No. of Guests" value={prefill.maxGuests} />
      </Section>

      <Section title="Department Heads">
        <Captured label="Captain — Name" value={vals.captain_name ?? ''} onChange={(v) => set('captain_name', v)} />
        <Captured label="Captain — Email" value={vals.captain_email ?? ''} onChange={(v) => set('captain_email', v)} />
        <Captured label="Purser / Stew — Name" value={vals.purser_name ?? ''} onChange={(v) => set('purser_name', v)} />
        <Captured label="Purser / Stew — Email" value={vals.purser_email ?? ''} onChange={(v) => set('purser_email', v)} />
        <Captured label="Chief Engineer — Name" value={vals.chief_engineer_name ?? ''} onChange={(v) => set('chief_engineer_name', v)} />
        <Captured label="Chief Engineer — Email" value={vals.chief_engineer_email ?? ''} onChange={(v) => set('chief_engineer_email', v)} />
      </Section>

      <Section title="Owner">
        <Prefill label="Owner's Name" value={prefill.ownerName} />
        <Prefill label="Nationality" value={prefill.ownerNationality} />
        <Prefill label="Address" value={prefill.ownerAddress} />
      </Section>

      <Section title="Billing">
        <Prefill label="Company Name" value={prefill.billingCompanyName} />
        <Prefill label="Contact Person" value={prefill.billingContactPerson} />
        <Prefill label="Email" value={prefill.billingEmail} />
        <Prefill label="Contact No." value={prefill.billingContactNo} />
        <Prefill label="Address" value={prefill.billingAddress} />
      </Section>

      <TendersSection yachtId={yachtId} tenders={prefill.tenders} onChange={(t) => setPrefill({ ...prefill, tenders: t })} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button onClick={handleSaveDraft} disabled={saving} style={btnStyle(false, saving)}>Save draft</button>
        <button onClick={handleSubmit} disabled={saving} style={btnStyle(true, saving)}>Submit</button>
      </div>
    </div>
  )
}

// ── small building blocks ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLORS.steel, margin: '0 0 10px' }}>
        {title}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {children}
      </div>
    </section>
  )
}

const labelStyle: React.CSSProperties = { fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted, marginBottom: 4 }
const inputStyle: React.CSSProperties = {
  width: '100%', background: COLORS.void, border: `1px solid var(--border)`, borderRadius: 8,
  padding: '8px 10px', fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost, boxSizing: 'border-box',
}

function Prefill({ label, value }: { label: string; value: string | number | null }) {
  const has = value !== null && value !== undefined && String(value) !== ''
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={labelStyle}>{label}</span>
        {has ? (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: GREEN }}>AUTO-FILLED</span>
        ) : (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: AMBER }}>ADD VIA PROFILE</span>
        )}
      </div>
      <div style={{
        ...inputStyle,
        background: COLORS.abyss, color: has ? COLORS.frost : COLORS.steel,
        borderColor: has ? GREEN + '55' : AMBER + '55', minHeight: 36, display: 'flex', alignItems: 'center',
      }}>
        {has ? String(value) : 'Not on profile — use the yacht Edit button'}
      </div>
    </div>
  )
}

function Captured({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  )
}

function TripField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  const empty = !value.trim()
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={labelStyle}>{label} *</span>
        {empty && <span style={{ fontSize: 9, fontWeight: 700, color: AMBER }}>REQUIRED</span>}
      </div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, borderColor: empty ? AMBER + '55' : 'var(--border)' }} />
    </div>
  )
}

function TendersSection({ yachtId, tenders, onChange }: {
  yachtId: string
  tenders: PrearrivalPrefill['tenders']
  onChange: (t: PrearrivalPrefill['tenders']) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})

  async function addTender() {
    const payload = {
      yacht_id: yachtId,
      description: draft.description || null,
      manufacturer_model: draft.manufacturerModel || null,
      length_m: draft.lengthM ? Number(draft.lengthM) : null,
      id_serial_no: draft.idSerialNo || null,
      color: draft.color || null,
      fuel_type: draft.fuelType || null,
      year_of_build: draft.yearOfBuild ? Number(draft.yearOfBuild) : null,
    }
    const { data, error } = await supabase.from('yacht_tenders').insert(payload).select().single()
    if (error) { toast.error('Could not add tender'); return }
    const t = data as Record<string, any>
    onChange([...tenders, {
      id: t.id, description: t.description, manufacturerModel: t.manufacturer_model, lengthM: t.length_m,
      idSerialNo: t.id_serial_no, color: t.color, fuelType: t.fuel_type, yearOfBuild: t.year_of_build,
    }])
    setDraft({}); setAdding(false); toast('Tender added')
  }

  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLORS.steel, margin: '0 0 10px' }}>
        Tenders & Toys
      </h2>
      {tenders.length === 0 && <p style={{ fontSize: 12, color: COLORS.muted, margin: '0 0 10px' }}>No tenders recorded.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tenders.map((t, i) => (
          <div key={t.id ?? i} style={{ ...inputStyle, background: COLORS.abyss, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: COLORS.frost }}>{t.description ?? 'Tender'}</span>
            <span style={{ color: COLORS.muted }}>{[t.manufacturerModel, t.lengthM ? `${t.lengthM}m` : null, t.color, t.fuelType, t.yearOfBuild].filter(Boolean).join(' · ')}</span>
          </div>
        ))}
      </div>
      {adding ? (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 8 }}>
          {['description|Description', 'manufacturerModel|Manufacturer/Model', 'lengthM|Length (m)', 'idSerialNo|ID/Serial', 'color|Colour', 'fuelType|Fuel Type', 'yearOfBuild|Year'].map((f) => {
            const [k, lbl] = f.split('|')
            return <Captured key={k} label={lbl} value={draft[k] ?? ''} onChange={(v) => setDraft((s) => ({ ...s, [k]: v }))} />
          })}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button onClick={addTender} style={btnStyle(true, false)}>Add</button>
            <button onClick={() => { setAdding(false); setDraft({}) }} style={btnStyle(false, false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ ...btnStyle(false, false), marginTop: 10 }}>+ Add tender</button>
      )}
    </section>
  )
}

function Centered({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 40, textAlign: 'center', fontFamily: FONTS.display, fontSize: 13, color: tone === 'error' ? COLORS.warn : COLORS.muted }}>
      {children}
    </div>
  )
}

function btnStyle(primary: boolean, busy: boolean): React.CSSProperties {
  return {
    padding: '9px 20px', borderRadius: 8, border: primary ? 'none' : `1px solid var(--border)`,
    background: primary ? COLORS.signal : 'transparent', color: primary ? COLORS.void : COLORS.muted,
    fontFamily: FONTS.display, fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
  }
}

function rowToVals(row: PreArrivalFormRow): FormState {
  const out: FormState = {}
  for (const [k, v] of Object.entries(row)) {
    if (['id', 'yacht_id', 'status', 'created_at', 'submitted_at', 'submitted_by'].includes(k)) continue
    out[k] = v == null ? '' : String(v)
  }
  return out
}

function labelOf(key: string): string {
  return ({
    arrival_date: 'Arrival Date', last_port_of_call: 'Last Port of Call',
    arrival_emirate: 'Arrival Emirate', arrival_port: 'Arrival Port',
  } as Record<string, string>)[key] ?? key
}
