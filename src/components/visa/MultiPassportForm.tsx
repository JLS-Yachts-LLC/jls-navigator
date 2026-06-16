import React, { useState, useRef } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { supabase } from '@/integrations/supabase/client'
import { CrewPassport, upsertPassport, setPrimaryPassport } from '@/lib/visa/crewMatching'
import PassportBadge from './PassportBadge'
import { SignedAnchor } from '@/components/ui/signed-file'

interface MultiPassportFormProps {
  crewId: string
  passports: CrewPassport[]
  onSaved: (passport: CrewPassport) => void
  onSetPrimary: (passportId: string) => void
}

interface PassportFormState {
  nationality: string
  passport_number: string
  issue_date: string
  expiry_date: string
  issuing_country: string
  document_url: string | null
}

const EMPTY_FORM: PassportFormState = {
  nationality: '',
  passport_number: '',
  issue_date: '',
  expiry_date: '',
  issuing_country: '',
  document_url: null,
}

export default function MultiPassportForm({
  crewId,
  passports,
  onSaved,
  onSetPrimary,
}: MultiPassportFormProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PassportFormState>(EMPTY_FORM)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }

  function openEdit(p: CrewPassport) {
    setEditingId(p.id)
    setForm({
      nationality: p.nationality,
      passport_number: p.passport_number,
      issue_date: p.issue_date,
      expiry_date: p.expiry_date,
      issuing_country: p.issuing_country,
      document_url: p.document_url ?? null,
    })
    setError(null)
    setShowForm(true)
  }

  function cancel() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  function setField(key: keyof PassportFormState, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const ext = file.name.split('.').pop() ?? 'pdf'
      const path = `crew/${crewId}/passport_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('permit-documents')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage
        .from('permit-documents')
        .getPublicUrl(path)
      setForm(f => ({ ...f, document_url: urlData.publicUrl }))
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!form.passport_number.trim()) {
      setError('Passport number is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: Partial<CrewPassport> & { crew_id: string; passport_number: string } = {
        crew_id: crewId,
        passport_number: form.passport_number.trim(),
        nationality: form.nationality.trim(),
        issue_date: form.issue_date,
        expiry_date: form.expiry_date,
        issuing_country: form.issuing_country.trim(),
        document_url: form.document_url,
        ...(editingId ? { id: editingId } : {}),
      }
      const result = await upsertPassport(payload)
      onSaved(result)
      cancel()
    } catch (err: any) {
      setError(err?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleSetPrimary(passportId: string) {
    setSettingPrimary(passportId)
    try {
      await setPrimaryPassport(crewId, passportId)
      onSetPrimary(passportId)
    } catch (err: any) {
      setError(err?.message ?? 'Could not set primary passport')
    } finally {
      setSettingPrimary(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: COLORS.deep,
    border: `1px solid ${COLORS.ocean}`,
    borderRadius: 6,
    color: COLORS.frost,
    fontFamily: FONTS.display,
    fontSize: 14,
    padding: '8px 12px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: FONTS.display,
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 4,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  }

  const btnPrimary: React.CSSProperties = {
    background: COLORS.signal,
    color: COLORS.void,
    border: 'none',
    borderRadius: 6,
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: 14,
    padding: '8px 20px',
    cursor: 'pointer',
  }

  const btnGhost: React.CSSProperties = {
    background: 'transparent',
    color: COLORS.muted,
    border: `1px solid ${COLORS.ocean}`,
    borderRadius: 6,
    fontFamily: FONTS.display,
    fontSize: 13,
    padding: '6px 14px',
    cursor: 'pointer',
  }

  const btnSmall: React.CSSProperties = {
    background: 'transparent',
    color: COLORS.signal,
    border: `1px solid ${COLORS.ocean}`,
    borderRadius: 4,
    fontFamily: FONTS.display,
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ fontFamily: FONTS.display }}>
      {/* Passport list */}
      {passports.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {passports.map(p => (
            <div
              key={p.id}
              style={{
                background: COLORS.abyss,
                border: `1px solid ${COLORS.ocean}`,
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <PassportBadge passport={p} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                {!p.is_primary && (
                  <button
                    style={{
                      ...btnSmall,
                      opacity: settingPrimary === p.id ? 0.6 : 1,
                    }}
                    disabled={settingPrimary === p.id}
                    onClick={() => handleSetPrimary(p.id)}
                  >
                    {settingPrimary === p.id ? 'Setting…' : 'Set Primary'}
                  </button>
                )}
                {p.is_primary && (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: FONTS.display,
                      color: COLORS.signal,
                      background: `${COLORS.signal}18`,
                      borderRadius: 4,
                      padding: '3px 8px',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Primary
                  </span>
                )}
                <button
                  style={{ ...btnSmall, color: COLORS.muted }}
                  onClick={() => openEdit(p)}
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {passports.length === 0 && !showForm && (
        <p style={{ color: COLORS.muted, fontSize: 14, marginBottom: 12 }}>
          No passports on file.
        </p>
      )}

      {/* Add button */}
      {!showForm && (
        <button style={btnGhost} onClick={openAdd}>
          + Add Passport
        </button>
      )}

      {/* Inline Add/Edit form */}
      {showForm && (
        <div
          style={{
            background: COLORS.abyss,
            border: `1px solid ${COLORS.ocean}`,
            borderRadius: 10,
            padding: 20,
            marginTop: 8,
          }}
        >
          <p
            style={{
              fontFamily: FONTS.display,
              fontWeight: 600,
              fontSize: 15,
              color: COLORS.frost,
              margin: '0 0 16px',
            }}
          >
            {editingId ? 'Edit Passport' : 'Add Passport'}
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Nationality</label>
              <input
                style={inputStyle}
                value={form.nationality}
                onChange={e => setField('nationality', e.target.value)}
                placeholder="e.g. British"
              />
            </div>

            <div>
              <label style={labelStyle}>Passport Number</label>
              <input
                style={inputStyle}
                value={form.passport_number}
                onChange={e => setField('passport_number', e.target.value)}
                placeholder="123456789"
              />
            </div>

            <div>
              <label style={labelStyle}>Issue Date</label>
              <input
                type="date"
                style={inputStyle}
                value={form.issue_date}
                onChange={e => setField('issue_date', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Expiry Date</label>
              <input
                type="date"
                style={inputStyle}
                value={form.expiry_date}
                onChange={e => setField('expiry_date', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Issuing Country</label>
              <input
                style={inputStyle}
                value={form.issuing_country}
                onChange={e => setField('issuing_country', e.target.value)}
                placeholder="e.g. United Kingdom"
              />
            </div>
          </div>

          {/* Document upload */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Document Upload</label>
            {form.document_url ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: COLORS.signal, fontSize: 13, fontFamily: FONTS.display }}>
                  <SignedAnchor stored={form.document_url}>
                    View uploaded document
                  </SignedAnchor>
                </span>
                <button
                  style={{ ...btnSmall, color: COLORS.warn, borderColor: COLORS.warn }}
                  onClick={() => setForm(f => ({ ...f, document_url: null }))}
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <button
                  style={{
                    ...btnGhost,
                    opacity: uploading ? 0.6 : 1,
                    fontSize: 13,
                  }}
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? 'Uploading…' : 'Choose File'}
                </button>
              </>
            )}
          </div>

          {error && (
            <p
              style={{
                color: COLORS.warn,
                fontSize: 13,
                fontFamily: FONTS.display,
                marginBottom: 12,
              }}
            >
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : 'Save Passport'}
            </button>
            <button style={btnGhost} onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
