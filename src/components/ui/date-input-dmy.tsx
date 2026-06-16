import React, { useRef, useState, useEffect } from 'react'

/**
 * Date input locked to dd/mm/yyyy display REGARDLESS of the browser/OS locale
 * (native <input type="date"> follows the user's region, which we don't want).
 * - Shows/accepts dd/mm/yyyy as masked text.
 * - Emits the canonical ISO value (yyyy-mm-dd) via onChange, or '' when incomplete.
 * - A calendar button opens the native date picker for convenience.
 */
type Props = {
  value: string                       // ISO yyyy-mm-dd (or '')
  onChange: (iso: string) => void
  style?: React.CSSProperties
  placeholder?: string
  id?: string
}

function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

function displayToIso(text: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!m) return ''
  const dd = +m[1], mm = +m[2], yyyy = +m[3]
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2200) return ''
  const d = new Date(Date.UTC(yyyy, mm - 1, dd))
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return ''
  return `${m[3]}-${m[2]}-${m[1]}`
}

function mask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return digits
}

export function DateInputDMY({ value, onChange, style, placeholder = 'dd/mm/yyyy', id }: Props) {
  const [text, setText] = useState(() => isoToDisplay(value))
  const pickerRef = useRef<HTMLInputElement>(null)

  // Keep the text in sync when the value is changed externally (e.g. calendar pick).
  useEffect(() => {
    const next = isoToDisplay(value)
    if (displayToIso(text) !== value) setText(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleText(raw: string) {
    const masked = mask(raw)
    setText(masked)
    onChange(displayToIso(masked))
  }

  function openPicker() {
    const el = pickerRef.current
    if (!el) return
    // showPicker() is the reliable cross-locale way to open the calendar.
    if (typeof (el as any).showPicker === 'function') (el as any).showPicker()
    else el.focus()
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={e => handleText(e.target.value)}
        style={{ ...style, paddingRight: 38 }}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Open calendar"
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 2,
          color: 'var(--muted-foreground)', lineHeight: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
      {/* Hidden native picker — value/onChange in ISO; only used for the popup calendar. */}
      <input
        ref={pickerRef}
        type="date"
        value={value}
        onChange={e => { onChange(e.target.value); setText(isoToDisplay(e.target.value)) }}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', right: 8, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}
