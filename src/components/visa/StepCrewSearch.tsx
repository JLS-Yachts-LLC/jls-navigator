import { useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { findCrewMatch, upsertCrewMember, CrewMember } from '@/lib/visa/crewMatching'

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
  last_name: string
  date_of_birth: string
  email: string
  phone: string
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
  const [searchName, setSearchName] = useState('')
  const [searchDob, setSearchDob] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchDone, setSearchDone] = useState(false)
  const [matchedCrew, setMatchedCrew] = useState<CrewMember | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [multiplePassports, setMultiplePassports] = useState(false)

  const [newForm, setNewForm] = useState<NewCrewForm>({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    email: '',
    phone: '',
    rank: '',
  })

  const handleSearch = async () => {
    if (!searchName.trim() || !searchDob) return
    setSearching(true)
    setSearchError(null)
    setSearchDone(false)
    setMatchedCrew(null)
    setShowCreateForm(false)
    onUpdate({ crew: null, isNewCrew: false })
    try {
      const match = await findCrewMatch(searchName, searchDob)
      setMatchedCrew(match)
      setSearchDone(true)
      if (!match) {
        setShowCreateForm(true)
        setNewForm(f => ({
          ...f,
          first_name: searchName.split(' ')[0] ?? '',
          last_name: searchName.split(' ').slice(1).join(' '),
          date_of_birth: searchDob,
        }))
      }
    } catch {
      setSearchError('Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  const handleUseProfile = () => {
    if (!matchedCrew) return
    onUpdate({ crew: matchedCrew, isNewCrew: false })
  }

  const handleCreateInstead = () => {
    setShowCreateForm(true)
    setMatchedCrew(null)
    onUpdate({ crew: null, isNewCrew: true })
    setNewForm(f => ({
      ...f,
      first_name: searchName.split(' ')[0] ?? '',
      last_name: searchName.split(' ').slice(1).join(' '),
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
        last_name: newForm.last_name.trim(),
        date_of_birth: newForm.date_of_birth,
        email: newForm.email.trim() || null,
        phone: newForm.phone.trim() || null,
        rank: newForm.rank.trim() || null,
        multiple_passports: multiplePassports,
      } as any)
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
            <label style={labelStyle}>Full Name</label>
            <input
              style={inputStyle}
              type="text"
              placeholder="e.g. Jane Smith"
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div>
            <label style={labelStyle}>Date of Birth</label>
            <input
              style={inputStyle}
              type="date"
              value={searchDob}
              onChange={e => setSearchDob(e.target.value)}
            />
          </div>
        </div>
        <button
          onClick={handleSearch}
          disabled={!searchName.trim() || !searchDob || searching}
          style={{
            background: (!searchName.trim() || !searchDob || searching) ? COLORS.ocean : COLORS.signal,
            color: (!searchName.trim() || !searchDob || searching) ? COLORS.muted : COLORS.void,
            border: 'none',
            borderRadius: 6,
            padding: '8px 20px',
            fontFamily: FONTS.display,
            fontWeight: 700,
            fontSize: 14,
            cursor: (!searchName.trim() || !searchDob || searching) ? 'not-allowed' : 'pointer',
          }}
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
        {searchError && (
          <p style={{ color: COLORS.warn, fontSize: 13, marginTop: 10 }}>{searchError}</p>
        )}
      </div>

      {/* Match found */}
      {searchDone && matchedCrew && !showCreateForm && (
        <div style={{
          background: COLORS.abyss,
          border: `1px solid ${COLORS.signal}`,
          borderRadius: 10,
          padding: 20,
          marginBottom: 20,
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: COLORS.signal, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Existing profile found
          </p>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: COLORS.frost, margin: 0 }}>
              {matchedCrew.full_name}
            </p>
            {matchedCrew.date_of_birth && (
              <p style={{ fontSize: 13, color: COLORS.muted, margin: '4px 0 0' }}>
                DOB: {matchedCrew.date_of_birth}
              </p>
            )}
            {matchedCrew.rank && (
              <p style={{ fontSize: 13, color: COLORS.muted, margin: '4px 0 0' }}>
                Rank / Position: {matchedCrew.rank}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleUseProfile}
              style={{
                background: state.crew?.id === matchedCrew.id ? COLORS.signal : COLORS.ocean,
                color: state.crew?.id === matchedCrew.id ? COLORS.void : COLORS.frost,
                border: 'none',
                borderRadius: 6,
                padding: '8px 18px',
                fontFamily: FONTS.display,
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {state.crew?.id === matchedCrew.id ? 'Profile selected' : 'Use this profile'}
            </button>
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
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Create new instead
            </button>
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
            {searchDone && !matchedCrew ? 'No profile found — create new' : 'Create new crew member'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {fieldGroup(
              <>
                <label style={labelStyle}>First Name *</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={newForm.first_name}
                  onChange={e => setNewForm(f => ({ ...f, first_name: e.target.value }))}
                />
              </>,
              'fn'
            )}
            {fieldGroup(
              <>
                <label style={labelStyle}>Last Name *</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={newForm.last_name}
                  onChange={e => setNewForm(f => ({ ...f, last_name: e.target.value }))}
                />
              </>,
              'ln'
            )}
            {fieldGroup(
              <>
                <label style={labelStyle}>Date of Birth *</label>
                <input
                  style={inputStyle}
                  type="date"
                  value={newForm.date_of_birth}
                  onChange={e => setNewForm(f => ({ ...f, date_of_birth: e.target.value }))}
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
              <>
                <label style={labelStyle}>Phone</label>
                <input
                  style={inputStyle}
                  type="tel"
                  value={newForm.phone}
                  onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))}
                />
              </>,
              'phone'
            )}
          </div>

          {/* Multiple passports toggle */}
          <div style={{
            background: COLORS.deep,
            border: `1px solid ${COLORS.ocean}`,
            borderRadius: 8,
            padding: '14px 16px',
            marginTop: 8,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <p style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 14, color: COLORS.frost, margin: 0 }}>
                Multiple passports?
              </p>
              <p style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, margin: '2px 0 0' }}>
                Does this crew member hold more than one passport?
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setMultiplePassports(true)}
                style={{
                  background: multiplePassports ? COLORS.signal : COLORS.ocean,
                  color: multiplePassports ? COLORS.void : COLORS.muted,
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 16px',
                  fontFamily: FONTS.display,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Yes
              </button>
              <button
                onClick={() => setMultiplePassports(false)}
                style={{
                  background: !multiplePassports ? COLORS.signal : COLORS.ocean,
                  color: !multiplePassports ? COLORS.void : COLORS.muted,
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 16px',
                  fontFamily: FONTS.display,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                No
              </button>
            </div>
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

      {/* Multiple passports toggle for matched profile */}
      {state.crew && !showCreateForm && (
        <div style={{
          background: COLORS.deep,
          border: `1px solid ${COLORS.ocean}`,
          borderRadius: 8,
          padding: '14px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 14, color: COLORS.frost, margin: 0 }}>
              Multiple passports?
            </p>
            <p style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, margin: '2px 0 0' }}>
              Does this crew member hold more than one passport?
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setMultiplePassports(true)}
              style={{
                background: multiplePassports ? COLORS.signal : COLORS.ocean,
                color: multiplePassports ? COLORS.void : COLORS.muted,
                border: 'none',
                borderRadius: 6,
                padding: '6px 16px',
                fontFamily: FONTS.display,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Yes
            </button>
            <button
              onClick={() => setMultiplePassports(false)}
              style={{
                background: !multiplePassports ? COLORS.signal : COLORS.ocean,
                color: !multiplePassports ? COLORS.void : COLORS.muted,
                border: 'none',
                borderRadius: 6,
                padding: '6px 16px',
                fontFamily: FONTS.display,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              No
            </button>
          </div>
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
