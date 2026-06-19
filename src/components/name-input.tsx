/**
 * NameInput — text field with automatic title-case capitalisation.
 *
 * Capitalises on every keystroke (live). Full formatName() runs on blur.
 * If the user manually types a lower-case particle mid-name (van, de, etc.)
 * and blurs, formatName() will correct it — that is intentional.
 */

import { useRef } from 'react'
import { formatName } from '@/lib/formatName'
import { COLORS, FONTS } from '@/lib/tokens'

export interface NameInputProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  id?: string
  autoComplete?: string
  /** Extra inline styles on the outer wrapper */
  style?: React.CSSProperties
}

/** Capitalise-as-you-type: upper-cases the character after a space, hyphen, or apostrophe. */
function liveCapitalise(raw: string): string {
  if (!raw) return raw
  return raw.replace(/(^|[ \-'])([a-z])/g, (_, pre, char) => pre + char.toUpperCase())
}

export function NameInput({
  value,
  onChange,
  label,
  placeholder,
  required = false,
  disabled = false,
  id,
  autoComplete,
  style,
}: NameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(liveCapitalise(e.target.value))
  }

  function handleBlur() {
    const formatted = formatName(value)
    if (formatted !== value) onChange(formatted)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '9px 12px',
    fontFamily: FONTS.display,
    fontSize: 13,
    color: COLORS.frost,
    background: COLORS.abyss,
    border: `1px solid ${COLORS.deep}`,
    borderRadius: 7,
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: COLORS.muted,
    marginBottom: 6,
    fontFamily: FONTS.display,
  }

  return (
    <div style={style}>
      {label && (
        <label htmlFor={id} style={labelStyle}>
          {label}
          {required && <span style={{ color: COLORS.warn, marginLeft: 3 }} aria-label="required">*</span>}
        </label>
      )}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={handleChange}
        onBlur={handleBlur}
        style={inputStyle}
      />
    </div>
  )
}
