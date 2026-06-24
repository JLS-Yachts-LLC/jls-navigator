'use client'
import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { COLORS, FONTS } from '@/lib/tokens'
import { formatName } from '@/lib/formatName'
import type {
  AdditionalInfoFields, AdditionalInfoField, FieldState,
  PersonalInfoApiResponse, OcrApiResponse,
} from './types'
import { EMPTY_FIELDS, computeProgress, TOTAL_FIELDS } from './types'

// ─── Design constants ────────────────────────────────────────────────────────

const GREEN    = '#1D9E75'
const AMBER    = '#E8A020'
const OCR_BG   = `${GREEN}0F`
const OCR_BDR  = `${GREEN}40`
const CONF_BG  = `${AMBER}0F`
const CONF_BDR = `${AMBER}40`

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontFamily: FONTS.display, fontSize: 10, fontWeight: 700,
  letterSpacing: '0.16em', textTransform: 'uppercase',
  color: COLORS.muted, marginBottom: 7,
}

const baseInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  fontFamily: FONTS.display, fontSize: 13,
  borderRadius: 7, padding: '9px 12px', outline: 'none',
}

// ─── Small shared components ─────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: FONTS.display, fontSize: 9, fontWeight: 700,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      color, background: `${color}18`,
      border: `1px solid ${color}50`, borderRadius: 3, padding: '1px 5px',
    }}>
      {label}
    </span>
  )
}

function EditIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function CheckIcon({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── OCR field (read-only, unlock to edit) ───────────────────────────────────

interface OcrFieldProps {
  label:    string
  field:    AdditionalInfoField
  onChange: (f: AdditionalInfoField) => void
  children: React.ReactNode  // the input/select
  isUnlocked: boolean
  onUnlock: () => void
}

function OcrFieldWrapper({ label, field, isUnlocked, onUnlock, children }: OcrFieldProps) {
  const confirmed  = field.state === 'ocr_confirmed'
  const edited     = field.state === 'ocr_edited'

  const borderColor = edited   ? 'var(--border)'
                    : confirmed ? `${GREEN}50`
                    :             OCR_BDR

  const bg = edited ? COLORS.abyss : OCR_BG

  return (
    <div>
      <div style={labelStyle}>
        <span>{label}</span>
        {!edited && <Badge label="Auto populated" color={GREEN} />}
        {!isUnlocked && !edited && (
          <button
            type="button"
            title="Edit this field"
            onClick={onUnlock}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', color: COLORS.muted, display: 'flex', padding: 0,
            }}
          >
            <EditIcon />
          </button>
        )}
      </div>
      <div style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 7, overflow: 'hidden',
      }}>
        {children}
      </div>
      {!isUnlocked && !edited && field.value && (
        <div style={{ fontFamily: FONTS.display, fontSize: 10, color: GREEN, marginTop: 4 }}>
          Auto-populated from passport · click <EditIcon /> to edit
        </div>
      )}
    </div>
  )
}

// ─── Confirm-required field ──────────────────────────────────────────────────

interface ConfirmFieldProps {
  label:     string
  field:     AdditionalInfoField
  onConfirm: () => void
  children:  React.ReactNode
}

function ConfirmFieldWrapper({ label, field, onConfirm, children }: ConfirmFieldProps) {
  const confirmed = field.state === 'ocr_confirmed'

  return (
    <div>
      <div style={{ ...labelStyle, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{label}</span>
          {!confirmed
            ? <Badge label="Confirm" color={AMBER} />
            : <Badge label="Confirmed" color={GREEN} />
          }
        </div>
        {confirmed
          ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4,
                           fontFamily: FONTS.display, fontSize: 10, color: GREEN }}>
              <CheckIcon color={GREEN} /> Confirmed
            </span>
          )
          : (
            <button
              type="button"
              onClick={onConfirm}
              style={{
                fontFamily: FONTS.display, fontSize: 10, fontWeight: 700,
                color: AMBER, background: `${AMBER}14`,
                border: `1px solid ${AMBER}50`, borderRadius: 4,
                padding: '2px 8px', cursor: 'pointer',
              }}
            >
              Confirm
            </button>
          )
        }
      </div>
      <div style={{
        background: confirmed ? OCR_BG : CONF_BG,
        border: `1px solid ${confirmed ? OCR_BDR : CONF_BDR}`,
        borderRadius: 7, overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export interface AdditionalPersonalInfoSectionProps {
  crewId:            string
  applicationId:     string
  selectedPassportId: string | null
  authToken:         string
  /** When provided (wizard mode), called after save instead of route navigation. */
  onContinue?:       () => void
  /** Hide the internal footer button — the parent drives saving via the ref. */
  hideFooter?:       boolean
}

/** Imperative handle so a parent's single "Continue" can save this section. */
export interface AdditionalPersonalInfoHandle {
  /** Validate + persist. Returns true on success, false if blocked/failed. */
  save: () => Promise<boolean>
}

export const AdditionalPersonalInfoSection = forwardRef<AdditionalPersonalInfoHandle, AdditionalPersonalInfoSectionProps>(function AdditionalPersonalInfoSection({
  crewId,
  applicationId,
  selectedPassportId,
  authToken,
  onContinue,
  hideFooter,
}, ref) {
  const navigate = useNavigate()

  const [fields,       setFields]       = useState<AdditionalInfoFields>(EMPTY_FIELDS)
  const [isLoading,    setIsLoading]    = useState(true)
  const [isSaving,     setIsSaving]     = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)
  const [validationErr,setValidationErr]= useState<string | null>(null)
  const [isPreFilled,  setIsPreFilled]  = useState(false)
  const [prefillDate,  setPrefillDate]  = useState<string | null>(null)
  const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set())

  const headers = { Authorization: `Bearer ${authToken}` }

  // ── Load personal info + OCR on mount ────────────────────────────────────

  const load = useCallback(async () => {
    if (!crewId || !authToken) return
    setIsLoading(true)
    try {
      const [piRes, ocrRes] = await Promise.all([
        fetch(`/api/crew/${crewId}/personal-info`, { headers }),
        selectedPassportId
          ? fetch(`/api/crew/${crewId}/passports/${selectedPassportId}/ocr`, { headers })
          : Promise.resolve(null),
      ])

      const pi: PersonalInfoApiResponse = piRes.ok ? await piRes.json() : {} as PersonalInfoApiResponse
      const ocr: OcrApiResponse | null  = ocrRes?.ok ? await ocrRes.json() : null

      if (pi.personalInfoCompletedAt) {
        setIsPreFilled(true)
        setPrefillDate(pi.personalInfoCompletedAt)
      }

      const ocrPop  = new Set(pi.ocrPopulatedFields  ?? [])
      const ocrConf = new Set(pi.ocrConfirmedFields  ?? [])

      function resolveState(key: string, value: string | null): FieldState {
        if (!value) return 'manual'
        if (ocrConf.has(key)) return 'ocr_confirmed'
        if (ocrPop.has(key))  return 'ocr_auto'
        return 'manual'
      }

      function makeField(key: string, stored: string | null, ocrValue?: string | null): AdditionalInfoField {
        // Prefer stored value; fall back to OCR if stored is empty
        const value = stored ?? ocrValue ?? ''
        const state = resolveState(key, stored ?? null)
        // If not stored but OCR has it, mark as ocr_auto
        if (!stored && ocrValue) return { value: ocrValue, state: 'ocr_auto' }
        return { value, state }
      }

      const religionRaw  = pi.religion ?? ''
      const isOtherRelig = religionRaw && !['Christianity','Islam','Muslim','Hinduism','Buddhism','Judaism','None / prefer not to say'].includes(religionRaw)

      setFields({
        nationalityCitizenship: makeField('nationalityCitizenship', pi.nationalityCitizenship, ocr?.nationality),
        countryOfBirth:         makeField('countryOfBirth',         pi.countryOfBirth,         ocr?.countryOfBirth),
        gender:                 makeField('gender',                  pi.gender,                 ocr?.gender),
        placeOfBirth:           makeField('placeOfBirth',           pi.placeOfBirth,           ocr?.placeOfBirth),
        occupation:             makeField('occupation',             pi.occupation,              null),
        maritalStatus:          { value: pi.maritalStatus      ?? '', state: 'manual' },
        nativeLanguage:         { value: pi.nativeLanguage     ?? '', state: 'manual' },
        mothersMaidenName:      { value: pi.mothersMaidenName  ?? '', state: 'manual' },
        fathersFullName:        { value: pi.fathersFullName    ?? '', state: 'manual' },
        religion:               { value: isOtherRelig ? 'Other' : (religionRaw ?? ''), state: 'manual' },
        religionOther:          { value: isOtherRelig ? religionRaw : '', state: 'manual' },
      })
    } catch {
      // Non-fatal — start from empty
    } finally {
      setIsLoading(false)
    }
  }, [crewId, authToken, selectedPassportId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  // ── Field helpers ─────────────────────────────────────────────────────────

  function setField(key: keyof AdditionalInfoFields, value: string, state?: FieldState) {
    setFields(prev => ({
      ...prev,
      [key]: { value, state: state ?? prev[key].state },
    }))
    setValidationErr(null)
  }

  function confirmField(key: keyof AdditionalInfoFields) {
    setFields(prev => ({
      ...prev,
      [key]: { ...prev[key], state: 'ocr_confirmed' },
    }))
  }

  function unlockField(key: keyof AdditionalInfoFields) {
    setUnlockedFields(prev => new Set([...prev, key]))
    setFields(prev => ({
      ...prev,
      [key]: { ...prev[key], state: 'ocr_edited' },
    }))
  }

  function handleNameBlur(key: keyof AdditionalInfoFields, value: string) {
    const formatted = formatName(value)
    if (formatted && formatted !== value) {
      setField(key, formatted)
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): string | null {
    const required: Array<{ key: keyof AdditionalInfoFields; label: string }> = [
      { key: 'maritalStatus',     label: 'Marital status' },
      { key: 'nativeLanguage',    label: 'Native language' },
      { key: 'mothersMaidenName', label: "Mother's maiden name" },
      { key: 'fathersFullName',   label: "Father's full name" },
    ]
    for (const { key, label } of required) {
      if (!fields[key].value.trim()) return `${label} is required.`
    }

    const needsConfirm: Array<keyof AdditionalInfoFields> = ['placeOfBirth', 'occupation']
    const unconfirmed = needsConfirm.filter(k =>
      fields[k].value && fields[k].state !== 'ocr_confirmed' && fields[k].state !== 'manual'
    )
    if (unconfirmed.length > 0) {
      return 'Please confirm the highlighted fields before continuing.'
    }

    if (fields.occupation.value && !['Captain', 'Seaman'].includes(fields.occupation.value)) {
      return 'Occupation must be Captain or Seaman.'
    }

    return null
  }

  // ── Save and continue ─────────────────────────────────────────────────────

  // Validate + persist to the DB. Returns true on success — does NOT navigate,
  // so a parent (the wizard's single Continue) can call it and advance itself.
  async function persist(): Promise<boolean> {
    const err = validate()
    if (err) { setValidationErr(err); return false }

    setIsSaving(true)
    setSaveError(null)
    setValidationErr(null)

    try {
      // Compute which fields were OCR-populated vs confirmed
      const ocrPopulatedFields = Object.entries(fields)
        .filter(([, f]) => f.state === 'ocr_auto')
        .map(([k]) => k)

      const ocrConfirmedFields = Object.entries(fields)
        .filter(([, f]) => f.state === 'ocr_confirmed')
        .map(([k]) => k)

      const religionValue = fields.religion.value === 'Other'
        ? fields.religionOther.value.trim()
        : fields.religion.value

      // 1. Save personal info
      const piRes = await fetch(`/api/crew/${crewId}/personal-info`, {
        method:  'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nationalityCitizenship: fields.nationalityCitizenship.value || null,
          placeOfBirth:           fields.placeOfBirth.value           || null,
          countryOfBirth:         fields.countryOfBirth.value         || null,
          gender:                 fields.gender.value                 || null,
          maritalStatus:          fields.maritalStatus.value          || null,
          nativeLanguage:         fields.nativeLanguage.value         || null,
          occupation:             fields.occupation.value             || null,
          mothersMaidenName:      fields.mothersMaidenName.value      || null,
          fathersFullName:        fields.fathersFullName.value        || null,
          religion:               religionValue                       || null,
          ocrPopulatedFields,
          ocrConfirmedFields,
        }),
      })
      if (!piRes.ok) {
        const d = await piRes.json()
        throw new Error(d.error ?? 'Failed to save personal info')
      }

      // 2. Save passport selection (if an application + passport are set)
      if (applicationId && selectedPassportId) {
        const ppRes = await fetch(`/api/visa/${applicationId}/passport`, {
          method:  'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ passport_id: selectedPassportId }),
        })
        if (!ppRes.ok) {
          const d = await ppRes.json()
          throw new Error(d.error ?? 'Failed to save passport selection')
        }
      }

      return true
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed. Please try again.')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  // Footer button (standalone usage): persist then continue/navigate.
  async function handleSave() {
    const ok = await persist()
    if (!ok) return
    if (onContinue) {
      onContinue()
    } else {
      void navigate({
        to:     '/crew-immigration/visas/supporting-docs',
        search: { applicationId },
      })
    }
  }

  // Expose save() so a parent's single Continue can drive this section.
  useImperativeHandle(ref, () => ({ save: persist }))

  // ── Progress ──────────────────────────────────────────────────────────────

  const progress = computeProgress(fields)
  const filledCount = Math.round((progress / 100) * TOTAL_FIELDS)

  // ── Input style helpers ───────────────────────────────────────────────────

  function inputStyle(field: AdditionalInfoField, locked = false): React.CSSProperties {
    return {
      ...baseInputStyle,
      color:      COLORS.frost,
      background: 'transparent',
      border:     'none',
      cursor:     locked ? 'default' : 'text',
    }
  }

  const sectionInputStyle: React.CSSProperties = {
    ...baseInputStyle,
    color:      COLORS.frost,
    background: COLORS.abyss,
    border:     `1px solid var(--border)`,
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ padding: '24px 0', fontFamily: FONTS.display, fontSize: 13, color: COLORS.muted }}>
        Loading personal information…
      </div>
    )
  }

  const isOcrFieldUnlocked = (key: string) => unlockedFields.has(key)

  return (
    <div style={{ fontFamily: FONTS.display }}>

      {/* Section divider */}
      <div style={{ borderTop: `1px solid var(--border)`, margin: '28px 0' }} />

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 700, color: COLORS.frost, margin: '0 0 6px' }}>
          Additional Personal Information
        </h2>
        <p style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.muted, margin: 0, lineHeight: 1.6 }}>
          Required for UAE and GCC visa applications. Saved permanently to the crew profile — will not be requested again.
        </p>
      </div>

      {/* Pre-fill banner (returning applications) */}
      {isPreFilled && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 14px', marginBottom: 20, borderRadius: 8,
          background: `${GREEN}0F`, border: `1px solid ${GREEN}40`,
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckIcon />
          </div>
          <div>
            <div style={{ fontFamily: FONTS.display, fontSize: 13, fontWeight: 600, color: GREEN }}>
              Pre-filled from your crew profile.
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
              {prefillDate
                ? `Last updated ${new Date(prefillDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
                : ''
              }{' '}
              Review and update if anything has changed.
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontFamily: FONTS.display, fontSize: 11, fontWeight: 600, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Profile completeness
          </span>
          <span style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted }}>
            {filledCount} / {TOTAL_FIELDS} fields complete
          </span>
        </div>
        <div style={{ height: 6, background: COLORS.deep, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: progress === 100 ? GREEN : COLORS.signal,
            width: `${progress}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* ── OCR auto-filled fields ───────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontFamily: FONTS.display, fontSize: 10, fontWeight: 700, color: COLORS.muted,
                    textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 14px' }}>
          Auto-filled from passport
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>

          {/* Nationality / citizenship */}
          <OcrFieldWrapper
            label="Nationality / citizenship"
            field={fields.nationalityCitizenship}
            onChange={f => setFields(p => ({ ...p, nationalityCitizenship: f }))}
            isUnlocked={isOcrFieldUnlocked('nationalityCitizenship')}
            onUnlock={() => unlockField('nationalityCitizenship')}
          >
            <input
              style={inputStyle(fields.nationalityCitizenship, !isOcrFieldUnlocked('nationalityCitizenship') && fields.nationalityCitizenship.state === 'ocr_auto')}
              type="text"
              value={fields.nationalityCitizenship.value}
              readOnly={!isOcrFieldUnlocked('nationalityCitizenship') && fields.nationalityCitizenship.state === 'ocr_auto'}
              onChange={e => setField('nationalityCitizenship', e.target.value, 'ocr_edited')}
              placeholder="e.g. Irish"
            />
          </OcrFieldWrapper>

          {/* Country of birth */}
          <OcrFieldWrapper
            label="Country of birth"
            field={fields.countryOfBirth}
            onChange={f => setFields(p => ({ ...p, countryOfBirth: f }))}
            isUnlocked={isOcrFieldUnlocked('countryOfBirth')}
            onUnlock={() => unlockField('countryOfBirth')}
          >
            <input
              style={inputStyle(fields.countryOfBirth, !isOcrFieldUnlocked('countryOfBirth') && fields.countryOfBirth.state === 'ocr_auto')}
              type="text"
              value={fields.countryOfBirth.value}
              readOnly={!isOcrFieldUnlocked('countryOfBirth') && fields.countryOfBirth.state === 'ocr_auto'}
              onChange={e => setField('countryOfBirth', e.target.value, 'ocr_edited')}
              placeholder="e.g. Ireland"
            />
          </OcrFieldWrapper>

          {/* Gender */}
          <OcrFieldWrapper
            label="Gender"
            field={fields.gender}
            onChange={f => setFields(p => ({ ...p, gender: f }))}
            isUnlocked={isOcrFieldUnlocked('gender')}
            onUnlock={() => unlockField('gender')}
          >
            <select
              style={{
                ...inputStyle(fields.gender, !isOcrFieldUnlocked('gender') && fields.gender.state === 'ocr_auto'),
                appearance: 'none',
              }}
              value={fields.gender.value}
              disabled={!isOcrFieldUnlocked('gender') && fields.gender.state === 'ocr_auto'}
              onChange={e => setField('gender', e.target.value, 'ocr_edited')}
            >
              <option value="">Select…</option>
              {['Male','Female','Other','Prefer not to say'].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </OcrFieldWrapper>
        </div>
      </div>

      {/* ── Confirm required fields ──────────────────────────────────────── */}
      <div style={{ margin: '22px 0' }}>
        <p style={{ fontFamily: FONTS.display, fontSize: 10, fontWeight: 700, color: COLORS.muted,
                    textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 14px' }}>
          Confirm required
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>

          {/* Place of birth */}
          <ConfirmFieldWrapper
            label="Place of birth"
            field={fields.placeOfBirth}
            onConfirm={() => confirmField('placeOfBirth')}
          >
            <input
              style={inputStyle(fields.placeOfBirth)}
              type="text"
              value={fields.placeOfBirth.value}
              onChange={e => setField('placeOfBirth', e.target.value)}
              onBlur={e => handleNameBlur('placeOfBirth', e.target.value)}
              placeholder="e.g. Dublin"
            />
          </ConfirmFieldWrapper>

          {/* Occupation */}
          <ConfirmFieldWrapper
            label="Occupation"
            field={fields.occupation}
            onConfirm={() => confirmField('occupation')}
          >
            <select
              style={{ ...inputStyle(fields.occupation), appearance: 'none' }}
              value={fields.occupation.value}
              onChange={e => setField('occupation', e.target.value)}
            >
              <option value="">Select…</option>
              <option value="Captain">Captain</option>
              <option value="Seaman">Seaman</option>
            </select>
          </ConfirmFieldWrapper>
        </div>
      </div>

      {/* ── Additional information required ──────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: FONTS.display, fontSize: 10, fontWeight: 700, color: COLORS.muted,
                    textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 14px' }}>
          Additional information required
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>

          {/* Marital status */}
          <div>
            <label style={labelStyle}>Marital status <span style={{ color: COLORS.warn }}>*</span></label>
            <select
              style={{ ...sectionInputStyle, appearance: 'none' }}
              value={fields.maritalStatus.value}
              onChange={e => setField('maritalStatus', e.target.value)}
            >
              <option value="">Select…</option>
              {['Single','Married','Divorced','Widowed'].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* Native language */}
          <div>
            <label style={labelStyle}>Native language <span style={{ color: COLORS.warn }}>*</span></label>
            <input
              style={sectionInputStyle}
              type="text"
              value={fields.nativeLanguage.value}
              onChange={e => setField('nativeLanguage', e.target.value)}
              onBlur={e => handleNameBlur('nativeLanguage', e.target.value)}
              placeholder="e.g. English"
            />
          </div>

          {/* Mother's maiden name */}
          <div>
            <label style={labelStyle}>{"Mother's maiden name"} <span style={{ color: COLORS.warn }}>*</span></label>
            <input
              style={sectionInputStyle}
              type="text"
              value={fields.mothersMaidenName.value}
              onChange={e => setField('mothersMaidenName', e.target.value)}
              onBlur={e => handleNameBlur('mothersMaidenName', e.target.value)}
              placeholder="e.g. Murphy"
            />
          </div>

          {/* Father's full name */}
          <div>
            <label style={labelStyle}>{"Father's full name"} <span style={{ color: COLORS.warn }}>*</span></label>
            <input
              style={sectionInputStyle}
              type="text"
              value={fields.fathersFullName.value}
              onChange={e => setField('fathersFullName', e.target.value)}
              onBlur={e => handleNameBlur('fathersFullName', e.target.value)}
              placeholder="e.g. John Patrick Fetton"
            />
          </div>

          {/* Religion (optional) */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Religion <span style={{ fontWeight: 400, fontSize: 9 }}>(optional)</span></label>
            <select
              style={{ ...sectionInputStyle, appearance: 'none' }}
              value={fields.religion.value}
              onChange={e => setField('religion', e.target.value)}
            >
              <option value="">Prefer not to say / not specified</option>
              {['Christianity','Islam','Muslim','Hinduism','Buddhism','Judaism','None / prefer not to say','Other'].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            {fields.religion.value === 'Other' && (
              <input
                style={{ ...sectionInputStyle, marginTop: 8 }}
                type="text"
                value={fields.religionOther.value}
                onChange={e => setField('religionOther', e.target.value)}
                placeholder="Please specify…"
              />
            )}
          </div>

        </div>
      </div>

      {/* Validation error */}
      {validationErr && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 7,
          background: `${COLORS.warn}14`, border: `1px solid ${COLORS.warn}40`,
          fontFamily: FONTS.display, fontSize: 12, color: COLORS.warn,
        }}>
          {validationErr}
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 7,
          background: `${COLORS.warn}14`, border: `1px solid ${COLORS.warn}40`,
          fontFamily: FONTS.display, fontSize: 12, color: COLORS.warn,
        }}>
          {saveError}
        </div>
      )}

      {/* Save footer — only in standalone usage; the wizard drives save via ref. */}
      {!hideFooter && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
              color: '#fff', background: isSaving ? COLORS.ocean : COLORS.signal,
              border: 'none', borderRadius: 7,
              padding: '9px 26px', cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1, transition: 'opacity 0.15s',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {isSaving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      )}

    </div>
  )
})
