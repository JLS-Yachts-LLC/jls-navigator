import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { COLORS } from '@/lib/tokens'
import { toDMY } from '@/lib/utils'
import type { CrewMember, CrewPassport } from '@/lib/visa/crewMatching'
import type { CountryVisaConfig } from '@/lib/visa/countryConfig'
import { COUNTRY_CONFIGS } from '@/lib/visa/countryConfig'
import { SignedAnchor } from '@/components/ui/signed-file'
import type { ComplianceResult } from '@/lib/visa/complianceChecks'

interface WizardState {
  step: number
  countryCode: string
  crew: CrewMember | null
  isNewCrew: boolean
  passport: CrewPassport | null
  passports: CrewPassport[]
  countryFields: Record<string, string>
  uploadedDocs: Record<string, string>
  complianceResults: ComplianceResult[]
  complianceAcknowledged: boolean
}

interface Props {
  state: WizardState
  onUpdate: (partial: Partial<WizardState>) => void
  onNext: () => void
  onBack: () => void
}

const font = { fontFamily: 'Space Grotesk, sans-serif' }

const extractBtn: React.CSSProperties = {
  fontFamily: 'Space Grotesk, sans-serif', fontSize: 12.5, fontWeight: 600,
  color: COLORS.signal, background: `${COLORS.signal}14`, border: `1px solid ${COLORS.signal}44`,
  borderRadius: 8, padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
}

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    background: COLORS.abyss,
    border: `1px solid ${COLORS.deep}`,
    borderRadius: 10,
    padding: '16px 20px',
    marginBottom: 16,
    ...font,
  }}>
    <div style={{
      color: COLORS.muted,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: 12,
    }}>
      {title}
    </div>
    {children}
  </div>
)

const KV: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'flex-start' }}>
    <span style={{ color: COLORS.steel, fontSize: 13, minWidth: 140, flexShrink: 0 }}>{label}</span>
    <span style={{ color: COLORS.frost, fontSize: 13 }}>{value}</span>
  </div>
)

export function StepReviewSubmit({ state, onUpdate, onNext, onBack }: Props) {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  // Crew Verification letter — allow generating it here if it wasn't produced earlier.
  const [vlBusy, setVlBusy] = useState(false)
  const [vlErr, setVlErr] = useState<string | null>(null)
  const [vlUrl, setVlUrl] = useState<string | null>((state.passport as any)?.crew_verification_letter_url ?? null)
  async function generateVerificationLetter() {
    const p: any = state.passport
    const vessel = state.countryFields['vessel_name'] ?? ''
    if (!p?.id || !state.crew?.id) { setVlErr('Missing crew/passport.'); return }
    if (!vessel.trim()) { setVlErr('Vessel name is required (set it on the Details step).'); return }
    setVlBusy(true); setVlErr(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const fullName = (state.crew as any)?.full_name
        || [state.crew?.first_name, (state.crew as any)?.middle_name, state.crew?.last_name].filter(Boolean).join(' ')
      const r = await fetch('/api/crew/verification-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          crewId: state.crew.id, passportId: p.id, fullName,
          passportNumber: p.passport_number ?? '', nationality: p.nationality ?? '', vesselName: vessel.trim(),
        }),
      })
      const res = await r.json()
      if (!r.ok || !res.ok) throw new Error(res.error ?? `Generation failed (${r.status})`)
      setVlUrl(res.pdfUrl)
      onUpdate({ passport: { ...p, crew_verification_letter_url: res.pdfUrl } as any })
      toast.success('Verification letter generated')
    } catch (e: any) { setVlErr(e?.message ?? 'Could not generate'); }
    finally { setVlBusy(false) }
  }

  const config: CountryVisaConfig | undefined =
    COUNTRY_CONFIGS[state.countryCode as keyof typeof COUNTRY_CONFIGS]

  const warningCount = state.complianceResults.filter(r => !r.blocks).length

  // Re-fetch the persisted crew + passport so the summary is complete regardless
  // of what the wizard threaded through (e.g. the additional personal-info fields).
  const [crewFull, setCrewFull] = useState<any>(state.crew)
  const [passportFull, setPassportFull] = useState<any>(state.passport)
  // Additional personal info lives in a separate table (api/crew/:id/personal-info),
  // not on crew_members — fetch it so the summary isn't full of dashes.
  const [personalInfo, setPersonalInfo] = useState<any>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const db = supabase as any
      if (state.crew?.id) {
        const { data } = await db.from('crew_members').select('*').eq('id', state.crew.id).maybeSingle()
        if (data && !cancelled) setCrewFull((prev: any) => ({ ...prev, ...data }))
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const r = await fetch(`/api/crew/${state.crew.id}/personal-info`, {
            headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
          })
          if (r.ok && !cancelled) setPersonalInfo(await r.json())
        } catch { /* non-fatal — fall back to crew columns */ }
      }
      if (state.passport?.id) {
        const { data } = await db.from('crew_passports').select('*').eq('id', state.passport.id).maybeSingle()
        if (data && !cancelled) setPassportFull((prev: any) => ({ ...prev, ...data }))
      }
    })()
    return () => { cancelled = true }
  }, [state.crew?.id, state.passport?.id])

  // Build the full summary as labelled sections — drives both the display and the
  // Copy / CSV extract so what you see is exactly what gets exported.
  const summary = useMemo(() => {
    const c: any = crewFull ?? {}
    const p: any = passportFull ?? {}
    const pi: any = personalInfo ?? {}
    const fullName = c.full_name || [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ') || '—'
    const clean = (rows: { label: string; value: any }[]) =>
      rows.map(r => ({ label: r.label, value: (r.value ?? '') === '' ? '—' : String(r.value) }))
    const sections: { title: string; rows: { label: string; value: string }[] }[] = [
      { title: 'Destination', rows: clean([
        { label: 'Country', value: config?.countryName ?? state.countryCode },
        { label: 'Country code', value: state.countryCode },
      ]) },
      { title: 'Personal Details', rows: clean([
        { label: 'Full name', value: fullName },
        { label: 'First name', value: c.first_name },
        { label: 'Middle name', value: c.middle_name },
        { label: 'Last name', value: c.last_name },
        { label: 'Date of birth', value: toDMY(c.date_of_birth ?? p.date_of_birth) },
        { label: 'Place of birth', value: pi.placeOfBirth ?? c.place_of_birth },
        { label: 'Country of birth', value: pi.countryOfBirth ?? c.country_of_birth },
        { label: 'Gender', value: pi.gender ?? c.gender },
        { label: 'Nationality', value: pi.nationalityCitizenship ?? c.nationality ?? p.nationality },
        { label: 'Marital status', value: pi.maritalStatus ?? c.marital_status },
        { label: 'Religion', value: pi.religion ?? c.religion },
        { label: "Mother's maiden name", value: pi.mothersMaidenName ?? c.mothers_maiden_name ?? c.mother_name },
        { label: "Father's full name", value: pi.fathersFullName ?? c.fathers_full_name ?? c.father_name },
        { label: 'Native language', value: pi.nativeLanguage ?? c.native_language },
        { label: 'Occupation / rank', value: pi.occupation ?? c.occupation ?? c.rank },
        { label: 'Email', value: c.email },
        { label: 'Phone', value: c.phone_full ?? c.phone },
      ]) },
      { title: 'Passport', rows: clean([
        { label: 'Passport number', value: p.passport_number },
        { label: 'Passport nationality', value: p.nationality },
        { label: 'Issuing country', value: p.issuing_country },
        { label: 'Place of issue', value: p.place_of_issue ?? c.passport_place_of_issue },
        { label: 'Issue date', value: toDMY(p.issue_date) },
        { label: 'Expiry date', value: toDMY(p.expiry_date) },
      ]) },
      { title: 'Vessel', rows: clean([
        { label: 'Vessel', value: state.countryFields['vessel_name'] },
      ]) },
    ]
    const fieldRows = (config?.fields ?? [])
      .map(f => ({ label: f.label, value: state.countryFields[f.key] }))
      .filter(r => r.value != null && r.value !== '')
    if (fieldRows.length) sections.push({ title: 'Application Fields', rows: clean(fieldRows) })
    return sections
  }, [crewFull, passportFull, personalInfo, config, state.countryCode, state.countryFields])

  function copySummary() {
    const text = summary.map(s => `${s.title.toUpperCase()}\n` + s.rows.map(r => `${r.label}: ${r.value}`).join('\n')).join('\n\n')
    navigator.clipboard.writeText(text).then(() => toast.success('Summary copied to clipboard')).catch(() => toast.error('Copy failed'))
  }
  function downloadCsv() {
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const lines = ['Section,Field,Value', ...summary.flatMap(s => s.rows.map(r => [s.title, r.label, r.value].map(esc).join(',')))]
    const name = (crewFull?.full_name || [crewFull?.first_name, crewFull?.last_name].filter(Boolean).join('_') || 'crew').replace(/\s+/g, '_')
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `visa-${name}-${state.countryCode}.csv`; a.click(); URL.revokeObjectURL(url)
    toast.success('CSV downloaded')
  }

  async function handleSubmit() {
    if (!state.crew || !state.passport) {
      toast.error('Missing crew or passport — cannot submit.')
      return
    }
    setSubmitting(true)
    try {
      const db = supabase as any

      // Resolve the vessel: the user-entered/auto-filled vessel name is stored as
      // free text, and matched to a yacht row (by name) to also set yacht_id.
      const enteredVessel = (state.countryFields.vessel_name ?? '').trim()
      let resolvedYachtId: string | null = state.crew.yacht_id ?? null
      if (enteredVessel && !resolvedYachtId) {
        const { data: y } = await db
          .from('yachts').select('id').ilike('vessel_name', enteredVessel).limit(1).maybeSingle()
        resolvedYachtId = y?.id ?? null
      }

      // 1. Submit: convert the existing draft to 'submitted', or insert if none.
      const row = {
        crew_member_id:  state.crew.id,
        passport_id:     state.passport.id,
        country_code:    state.countryCode,
        status:          'submitted' as const,
        submitted_at:    new Date().toISOString(),
        yacht_id:        resolvedYachtId,
        vessel_name:     enteredVessel || null,
        visa_type:       'Crew Visa',
        // Mirror crew/passport details onto the row so the dashboard and
        // reports display correctly even for records without a crew join.
        given_name:      state.crew.first_name ?? null,
        surname:         state.crew.last_name ?? null,
        nationality:     state.passport.nationality ?? state.crew.nationality ?? null,
        passport_number: state.passport.passport_number ?? null,
        passport_expiry: state.passport.expiry_date ?? null,
      }
      const draftId = (state as any).draftId as string | null | undefined

      // Resolve the row id: prefer the wizard's tracked draftId, then look up
      // any existing record for this crew member, then insert as last resort.
      let resolvedId: string | null = draftId ?? null
      if (!resolvedId) {
        const { data: existing } = await db
          .from('visa_applications')
          .select('id')
          .eq('crew_member_id', state.crew.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        resolvedId = existing?.id ?? null
      }

      const { data: appData, error: appError } = resolvedId
        ? await db.from('visa_applications').update(row).eq('id', resolvedId).select('id').single()
        : await db.from('visa_applications').insert(row).select('id').single()

      if (appError) throw appError

      const applicationId = appData?.id

      // 2. Insert countryFields as key-value rows
      const fieldRows = Object.entries(state.countryFields)
        .filter(([, v]) => v !== '' && v !== undefined && v !== null)
        .map(([field_key, field_value]) => ({
          application_id: applicationId,
          field_key,
          field_value,
        }))

      if (fieldRows.length > 0) {
        const { error: fieldsError } = await (supabase as any)
          .from('visa_application_fields')
          .insert(fieldRows)

        if (fieldsError) throw fieldsError
      }

      // Mirror the new application into the SharePoint Excel trackers
      // (fire-and-forget — never block the UI on the write-back).
      if (applicationId) {
        fetch('/api/visa/excel-push', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: applicationId }),
        }).catch(() => {})
      }

      // Clear the saved draft now the application is submitted.
      try { localStorage.removeItem('polaris.visaDraft') } catch { /* ignore */ }

      toast.success('Visa application submitted.')
      navigate({ to: '/crew-immigration/visas' })
    } catch (err: any) {
      console.error('Visa submit error:', err)
      toast.error(err?.message ?? 'Failed to submit application.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ ...font, color: COLORS.frost }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.frost, margin: 0 }}>
            Review &amp; Submit
          </h2>
          <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, marginBottom: 0 }}>
            Confirm all details below. Use <strong>Copy</strong> or <strong>CSV</strong> to extract everything for the Immigration file.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={copySummary} style={extractBtn}>Copy details</button>
          <button type="button" onClick={downloadCsv} style={extractBtn}>Download CSV</button>
        </div>
      </div>

      {/* 1. Country */}
      <SectionCard title="Destination Country">
        {config ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>{config.flag}</span>
            <span style={{ color: COLORS.frost, fontSize: 15, fontWeight: 600 }}>
              {config.countryName}
            </span>
            <span style={{
              background: COLORS.ocean,
              color: COLORS.signal,
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {state.countryCode}
            </span>
          </div>
        ) : (
          <span style={{ color: COLORS.muted }}>{state.countryCode}</span>
        )}
      </SectionCard>

      {/* 2–4. Personal details, passport, vessel & application fields — complete
              record, identical to what Copy / CSV export. */}
      {summary.filter(s => s.title !== 'Destination').map(section => (
        <SectionCard key={section.title} title={section.title}>
          {section.rows.map(r => (
            <KV key={r.label} label={r.label} value={
              r.label === 'Expiry date' && r.value !== '—' && isExpiringSoon(r.value)
                ? <span style={{ color: COLORS.warn }}>{r.value}</span>
                : r.value
            } />
          ))}
        </SectionCard>
      ))}

      {/* 5. Documents */}
      <SectionCard title="Uploaded Documents">
        {(() => {
          // Combine the wizard's uploaded docs with the passport's stored files —
          // including the auto-generated Crew Verification letter (when no Seaman's
          // book) or the Seaman's book itself.
          const docs: Record<string, string> = { ...state.uploadedDocs }
          const p: any = state.passport
          const letterUrl = vlUrl ?? p?.crew_verification_letter_url
          if (letterUrl) docs['crew_verification_letter'] = letterUrl
          else if (p?.seamans_book_url) docs['seamans_book'] = p.seamans_book_url
          const entries = Object.entries(docs).filter(([, url]) => !!url)
          const needsLetter = !!p?.no_seamans_book && !letterUrl
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entries.length === 0 && !needsLetter && (
                <span style={{ color: COLORS.muted, fontSize: 13 }}>No documents uploaded.</span>
              )}
              {entries.map(([key, url]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: COLORS.steel, fontSize: 13, minWidth: 180 }}>
                    {key === 'crew_verification_letter' ? 'Crew Verification Letter' : key}
                  </span>
                  <span style={{ color: COLORS.signal, fontSize: 13, textDecoration: 'underline' }}>
                    <SignedAnchor stored={url}>
                      {key === 'crew_verification_letter' ? 'Download PDF' : 'View document'}
                    </SignedAnchor>
                  </span>
                </div>
              ))}
              {needsLetter && (
                <div style={{ marginTop: 4, padding: '10px 12px', background: `${COLORS.warn}10`, border: `1px solid ${COLORS.warn}33`, borderRadius: 8 }}>
                  <div style={{ fontSize: 12.5, color: COLORS.frost, marginBottom: 8 }}>
                    No Seaman's book — the Crew Verification letter hasn't been generated yet.
                  </div>
                  <button type="button" onClick={generateVerificationLetter} disabled={vlBusy}
                    style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 600, color: COLORS.signal,
                      background: `${COLORS.signal}14`, border: `1px solid ${COLORS.signal}44`, borderRadius: 7, padding: '7px 12px', cursor: vlBusy ? 'default' : 'pointer' }}>
                    {vlBusy ? 'Generating…' : 'Generate verification letter'}
                  </button>
                  {vlErr && <div style={{ marginTop: 8, fontSize: 12, color: COLORS.warn }}>{vlErr}</div>}
                </div>
              )}
            </div>
          )
        })()}
      </SectionCard>

      {/* 6. Compliance */}
      <SectionCard title="Compliance">
        {state.complianceResults.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#22c55e', fontSize: 16 }}>✓</span>
            <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>All clear — no compliance issues.</span>
          </div>
        ) : (
          <div>
            {warningCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ color: COLORS.leoAmber, fontSize: 15 }}>⚠</span>
                <span style={{ color: COLORS.leoAmber, fontSize: 13, fontWeight: 600 }}>
                  {warningCount} warning{warningCount !== 1 ? 's' : ''} acknowledged
                </span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {state.complianceResults.map((r, i) => (
                <div key={i} style={{
                  background: COLORS.deep,
                  borderLeft: `3px solid ${r.severity === 'critical' ? COLORS.warn : r.severity === 'warn' ? COLORS.leoAmber : COLORS.muted}`,
                  borderRadius: 4,
                  padding: '8px 12px',
                  fontSize: 12,
                  color: COLORS.frost,
                }}>
                  <span style={{
                    fontWeight: 700,
                    color: r.severity === 'critical' ? COLORS.warn : r.severity === 'warn' ? COLORS.leoAmber : COLORS.muted,
                    marginRight: 6,
                  }}>
                    {r.severity.toUpperCase()}
                  </span>
                  {r.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <button
          onClick={onBack}
          disabled={submitting}
          style={{
            background: 'transparent',
            border: `1px solid ${COLORS.deep}`,
            color: COLORS.muted,
            borderRadius: 8,
            padding: '10px 22px',
            fontSize: 14,
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.5 : 1,
          }}
        >
          Back
        </button>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            background: submitting ? COLORS.ocean : COLORS.signal,
            color: submitting ? COLORS.muted : COLORS.void,
            border: 'none',
            borderRadius: 8,
            padding: '10px 28px',
            fontSize: 14,
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'background 0.2s',
          }}
        >
          {submitting ? (
            <>
              <Spinner />
              Submitting…
            </>
          ) : (
            'Submit Application'
          )}
        </button>
      </div>
    </div>
  )
}

function isExpiringSoon(expiryDate: string): boolean {
  // expiryDate may now be dd/mm/yyyy (display format) — parse both.
  const dmy = expiryDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const exp = dmy ? new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}`) : new Date(expiryDate)
  if (isNaN(exp.getTime())) return false
  const sixMonths = new Date()
  sixMonths.setMonth(sixMonths.getMonth() + 6)
  return exp < sixMonths
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  )
}

export default StepReviewSubmit
