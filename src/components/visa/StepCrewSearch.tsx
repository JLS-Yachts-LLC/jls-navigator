import { useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { DateInputDMY } from '@/components/ui/date-input-dmy'
import { findCrewMatch, upsertCrewMember, CrewMember } from '@/lib/visa/crewMatching'
import { supabase } from '@/integrations/supabase/client'
import { PhoneInput, EMPTY_PHONE } from '@/components/phone-input'
import type { PhoneValue } from '@/components/phone-input'
import { NameInput } from '@/components/name-input'
import { useAuth } from '@/lib/auth'

// Statuses that mean an application is still alive — a second one must be blocked.
const ACTIVE_STATUSES = ['draft', 'pending_docs', 'submitted', 'in_review', 'approved']

async function findActiveApplication(crewId: string): Promise<{ id: string; status: string } | null> {
  const db = supabase as any
  const { data } = await db
    .from('visa_applications')
    .select('id, status')
    .eq('crew_member_id', crewId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

interface WizardState {
  step: number
  countryCode: string
  crew: CrewMember | null
  isNewCrew: boolean
  passport: any | null
  passports: any[]
  countryFields: Record<string, string>
  uploadedDocs: Record<string, string>
  complianceResults: any[]
  complianceAcknowledged: boolean
}

interface Props {
  state: WizardState
  onUpdate: (partial: Partial<WizardState>) => void
  onNext: () => void
  onBack: () => void
}

interface NewCrewForm {
  first_name: string
  middle_name: string
  last_name: string
  date_of_birth: string
  email: string
  phone: PhoneValue
  rank: string
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: COLORS.deep,
  border: `1px solid ${COLORS.ocean}`,
  borderRadius: 6,
  padding: '8px 12px',
  color: COLORS.frost,
  fontFamily: FONTS.display,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: FONTS.display,
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 6,
}

const fieldGroup = (children: React.ReactNode, key?: string) => (
  <div key={key} style={{ marginBottom: 16 }}>
    {children}
  </div>
)

export default function StepCrewSearch({ state, onUpdate, onNext, onBack }: Props) {
  const { session } = useAuth()
  const [searchName, setSearchName] = useState('')
  const [searchDob, setSearchDob] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchDone, setSearchDone] = useState(false)
  const [matchedCrewList, setMatchedCrewList] = useState<CrewMember[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [duplicateApp, setDuplicateApp] = useState<{ id: string; status: string } | null>(null)

  const [newForm, setNewForm] = useState<NewCrewForm>({
    first_name: '',
    middle_name: '',
    last_name: '',
    date_of_birth: '',
    email: '',
    phone: { ...EMPTY_PHONE },
    rank: '',
  })

  const handleSearch = async () => {
    if (!searchName.trim() && !searchDob) return
    const token = session?.access_token ?? ''
    if (!token) { setSearchError('Not authenticated. Please refresh and try again.'); return }
    setSearching(true)
    setSearchError(null)
    setSearchDone(false)
    setMatchedCrewList([])
    setShowCreateForm(false)
    setDuplicateApp(null)
    onUpdate({ crew: null, isNewCrew: false })
    try {
      const results = await findCrewMatch(searchName, searchDob, token)
      setMatchedCrewList(results)
      setSearchDone(true)
      if (results.length === 0) {
        setShowCreateForm(true)
        const parts = searchName.trim().split(/\s+/).filter(Boolean)
        setNewForm(f => ({
          ...f,
          first_name:    parts[0] ?? '',
          middle_name:   parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
          last_name:     parts.length > 1 ? parts[parts.length - 1] : '',
          date_of_birth: searchDob,
        }))
      }
    } catch {
      setSearchError('Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  const handleUseProfile = async (crew: CrewMember) => {
    setDuplicateApp(null)
    const existing = await findActiveApplication(crew.id)
    if (existing) { setDuplicateApp(existing); return }
    onUpdate({ crew, isNewCrew: false })
  }

  const handleCreateInstead = () => {
    setShowCreateForm(true)
    setMatchedCrewList([])
    onUpdate({ crew: null, isNewCrew: true })
    const parts = searchName.trim().split(/\s+/).filter(Boolean)
    setNewForm(f => ({
      ...f,
      first_name:    parts[0] ?? '',
      middle_name:   parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
      last_name:     parts.length > 1 ? parts[parts.length - 1] : '',
      date_of_birth: searchDob,
    }))
  }

  const newFormValid =
    newForm.first_name.trim() &&
    newForm.last_name.trim() &&
    newForm.date_of_birth

  const handleSaveNew = async () => {
    if (!newFormValid) return
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await upsertCrewMember({
        first_name: newForm.first_name.trim(),
        middle_name: newForm.middle_name.trim() || null,
        last_name: newForm.last_name.trim(),
        date_of_birth: newForm.date_of_birth,
        email: newForm.email.trim() || null,
        phone_country_code: newForm.phone.phoneNumber ? newForm.phone.countryCode : null,
        phone_number: newForm.phone.phoneNumber || null,
        rank: newForm.rank.trim() || null,
      } as any)
      // A newly upserted crew member may already have an active application.
      const existing = await findActiveApplication(saved.id)
      if (existing) { setDuplicateApp(existing); setSaving(false); return }
      onUpdate({ crew: saved, isNewCrew: true })
    } catch {
      setSaveError('Failed to save crew member. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const crewReady = !!state.crew

  const canContinue = crewReady

  return (
    <div style={{ fontFamily: FONTS.display, color: COLORS.frost }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.frost, marginBottom: 4 }}>
        Crew Member
      </h2>
      <p style={{ fontSize: 14, color: COLORS.muted, marginBottom: 28 }}>
        Search for an existing crew profile or create a new one.
      </p>

      {/* Search fields */}
      <div style={{
        background: COLORS.abyss,
        border: `1px solid ${COLORS.ocean}`,
        borderRadius: 10,
        padding: 20,
        marginBottom: 20,
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.steel, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Search existing crew
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Full Name (as per passport)</label>
            <input
              style={inputStyle}
              type="text"
              placeholder="Full name as per passport — e.g. Jane Anne Smith"
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div>
            <label style={labelStyle}>Date of Birth</label>
            <DateInputDMY style={inputStyle} value={searchDob} onChange={setSearchDob} />
          </div>
        </div>
        <button
          onClick={handleSearch}
          disabled={(!searchName.trim() && !searchDob) || searching}
          style={{
            background: ((!searchName.trim() && !searchDob) || searching) ? COLORS.ocean : COLORS.signal,
            color: ((!searchName.trim() && !searchDob) || searching) ? COLORS.muted : COLORS.void,
            border: 'none',
            borderRadius: 6,
            padding: '8px 20px',
            fontFamily: FONTS.display,
            fontWeight: 700,
            fontSize: 14,
            cursor: ((!searchName.trim() && !searchDob) || searching) ? 'not-allowed' : 'pointer',
          }}
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
        {searchError && (
          <p style={{ color: COLORS.warn, fontSize: 13, marginTop: 10 }}>{searchError}</p>
        )}
      </div>

      {/* Match(es) found */}
      {searchDone && matchedCrewList.length > 0 && !showCreateForm && (
        <div style={{
          background: COLORS.abyss,
          border: `1px solid ${COLORS.signal}`,
          borderRadius: 10,
          padding: 20,
          marginBottom: 20,
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: COLORS.signal, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {matchedCrewList.length === 1 ? 'Existing profile found' : `${matchedCrewList.length} profiles found`}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {matchedCrewList.map(crew => (
              <div key={crew.id} style={{
                background: COLORS.deep,
                border: `1px solid ${state.crew?.id === crew.id ? COLORS.signal : COLORS.ocean}`,
                borderRadius: 8,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: COLORS.frost, margin: 0 }}>
                    {crew.full_name}
                  </p>
                  <p style={{ fontSize: 12, color: COLORS.muted, margin: '3px 0 0' }}>
                    {[crew.date_of_birth && `DOB: ${crew.date_of_birth}`, crew.rank].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  onClick={() => handleUseProfile(crew)}
                  style={{
                    background: state.crew?.id === crew.id ? COLORS.signal : COLORS.ocean,
                    color: state.crew?.id === crew.id ? COLORS.void : COLORS.frost,
                    border: 'none',
                    borderRadius: 6,
                    padding: '7px 16px',
                    fontFamily: FONTS.display,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {state.crew?.id === crew.id ? 'Selected' : 'Use profile'}
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={handleCreateInstead}
            style={{
              background: 'transparent',
              color: COLORS.muted,
              border: `1px solid ${COLORS.steel}`,
              borderRadius: 6,
              padding: '8px 18px',
              fontFamily: FONTS.display,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            None of these — create new
          </button>
        </div>
      )}

      {/* Duplicate application block */}
      {duplicateApp && (
        <div style={{
          display: 'flex', gap: 14, alignItems: 'flex-start',
          padding: '14px 16px', marginBottom: 20,
          background: '#1A0808',
          border: `1px solid ${COLORS.warn}`,
          borderRadius: 8,
        }} role="alert">
          <span style={{ fontSize: 20, flexShrink: 0, color: COLORS.warn }} aria-hidden="true">⊘</span>
          <div>
            <p style={{ fontFamily: FONTS.display, fontSize: 13, fontWeight: 700, color: COLORS.warn, margin: '0 0 4px' }}>
              Application already exists for this crew member
            </p>
            <p style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, margin: '0 0 10px', lineHeight: 1.6 }}>
              Each crew member can only have one active application at a time.
              The existing application (status: <strong style={{ color: COLORS.frost }}>{duplicateApp.status.replace('_', ' ')}</strong>) must be
              cancelled or completed before a new one can be created.
            </p>
            <a
              href={`/crew-immigration/visas/${duplicateApp.id}`}
              style={{
                fontFamily: FONTS.display, fontSize: 12, fontWeight: 700,
                color: COLORS.signal, textDecoration: 'none',
                borderBottom: `1px solid ${COLORS.signal}50`,
                paddingBottom: 1,
              }}
            >
              View existing application →
            </a>
          </div>
        </div>
      )}

      {/* No match or Create new form */}
      {showCreateForm && !state.crew && (
        <div style={{
          background: COLORS.abyss,
          border: `1px solid ${COLORS.ocean}`,
          borderRadius: 10,
          padding: 20,
          marginBottom: 20,
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: COLORS.leoAmber, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {searchDone && matchedCrewList.length === 0 ? 'No profile found — create new' : 'Create new crew member'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {fieldGroup(
              <NameInput
                label="First Name * (as per passport)"
                placeholder="As per passport"
                value={newForm.first_name}
                onChange={v => setNewForm(f => ({ ...f, first_name: v }))}
                style={{ width: '100%' }}
              />,
              'fn'
            )}
            {fieldGroup(
              <NameInput
                label="Middle Name (as per passport)"
                placeholder="As per passport — leave blank if none"
                value={newForm.middle_name}
                onChange={v => setNewForm(f => ({ ...f, middle_name: v }))}
                style={{ width: '100%' }}
              />,
              'mn'
            )}
            {fieldGroup(
              <NameInput
                label="Last Name * (as per passport)"
                placeholder="As per passport"
                value={newForm.last_name}
                onChange={v => setNewForm(f => ({ ...f, last_name: v }))}
                style={{ width: '100%' }}
              />,
              'ln'
            )}
            {fieldGroup(
              <>
                <label style={labelStyle}>Date of Birth *</label>
                <DateInputDMY
                  style={inputStyle}
                  value={newForm.date_of_birth}
                  onChange={iso => setNewForm(f => ({ ...f, date_of_birth: iso }))}
                />
              </>,
              'dob'
            )}
            {fieldGroup(
              <>
                <label style={labelStyle}>Position / Rank</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="e.g. Captain, Deckhand"
                  value={newForm.rank}
                  onChange={e => setNewForm(f => ({ ...f, rank: e.target.value }))}
                />
              </>,
              'rank'
            )}
            {fieldGroup(
              <>
                <label style={labelStyle}>Email</label>
                <input
                  style={inputStyle}
                  type="email"
                  value={newForm.email}
                  onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                />
              </>,
              'email'
            )}
            {fieldGroup(
              <PhoneInput
                value={newForm.phone}
                onChange={phone => setNewForm(f => ({ ...f, phone }))}
              />,
              'phone'
            )}
          </div>

          {saveError && (
            <p style={{ color: COLORS.warn, fontSize: 13, marginBottom: 12 }}>{saveError}</p>
          )}

          <button
            onClick={handleSaveNew}
            disabled={!newFormValid || saving}
            style={{
              background: (!newFormValid || saving) ? COLORS.ocean : COLORS.leoAmber,
              color: (!newFormValid || saving) ? COLORS.muted : COLORS.void,
              border: 'none',
              borderRadius: 6,
              padding: '9px 22px',
              fontFamily: FONTS.display,
              fontWeight: 700,
              fontSize: 14,
              cursor: (!newFormValid || saving) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save crew member'}
          </button>
        </div>
      )}

      {/* Selected crew summary */}
      {state.crew && (
        <div style={{
          background: COLORS.deep,
          border: `1px solid ${COLORS.signal}`,
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: COLORS.signal,
            flexShrink: 0,
          }} />
          <p style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.signal, margin: 0, fontWeight: 600 }}>
            Crew set: <span style={{ color: COLORS.frost }}>{state.crew.full_name}</span>
            {state.crew.rank ? <span style={{ color: COLORS.muted }}> — {state.crew.rank}</span> : null}
          </p>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            color: COLORS.muted,
            border: `1px solid ${COLORS.steel}`,
            borderRadius: 6,
            padding: '9px 22px',
            fontFamily: FONTS.display,
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!canContinue}
          style={{
            background: canContinue ? COLORS.signal : COLORS.ocean,
            color: canContinue ? COLORS.void : COLORS.muted,
            border: 'none',
            borderRadius: 6,
            padding: '9px 28px',
            fontFamily: FONTS.display,
            fontWeight: 700,
            fontSize: 14,
            cursor: canContinue ? 'pointer' : 'not-allowed',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
