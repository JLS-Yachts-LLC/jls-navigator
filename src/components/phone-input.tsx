/**
 * PhoneInput — structured international phone number field
 *
 * Layout: [🇦🇪 +971 ▼] | [50 274 7733        ]
 * Single unified border wrapping both segments.
 *
 * Stores: { countryCode: '+971', phoneNumber: '502747733' }
 * Display-only formatted string is never written to DB.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { COUNTRIES } from '@/routes/api.phone'
import type { CountryEntry } from '@/routes/api.phone'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PhoneValue {
  countryCode: string   // e.g. '+971'
  phoneNumber: string   // digits only, e.g. '502747733'
}

export interface PhoneInputProps {
  value: PhoneValue
  onChange: (value: PhoneValue) => void
  defaultCountryIso2?: string
  label?: string
  required?: boolean
  disabled?: boolean
  verifiedStatus?: 'unverified' | 'otp_verified' | 'whatsapp_verified'
  showVerifiedBadge?: boolean  // Phase 2
}

// ── Format helper ─────────────────────────────────────────────────────────────

function applyFormat(digits: string, format: string): string {
  let i = 0
  return format.replace(/X/g, () => digits[i++] ?? '').replace(/[\s]+$/, '')
}

function stripToDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** When user pastes a full international number, extract country code + local number. */
function parsePaste(raw: string, currentDialCode: string): PhoneValue {
  const clean = raw.replace(/[\s\-().]/g, '')
  // Match known dial codes (longest first to avoid +1 eating +1868 etc.)
  const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length)
  for (const c of sorted) {
    if (clean.startsWith(c.dialCode)) {
      return { countryCode: c.dialCode, phoneNumber: clean.slice(c.dialCode.length) }
    }
    // Also handle "00XXX" prefix
    const bare = c.dialCode.slice(1) // '971'
    if (clean.startsWith('00' + bare)) {
      return { countryCode: c.dialCode, phoneNumber: clean.slice(2 + bare.length) }
    }
  }
  // No prefix found — strip non-digits and store as local number
  return { countryCode: currentDialCode, phoneNumber: stripToDigits(clean) }
}

// ── ChevronIcon ───────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
         aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PhoneInput({
  value,
  onChange,
  defaultCountryIso2 = 'AE',
  label = 'Phone',
  required = false,
  disabled = false,
}: PhoneInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery]   = useState('')
  const [error, setError]               = useState<string | null>(null)
  const [touched, setTouched]           = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef    = useRef<HTMLInputElement>(null)
  const numberRef    = useRef<HTMLInputElement>(null)

  // Resolve selected country from dialCode
  const selectedCountry: CountryEntry =
    COUNTRIES.find((c) => c.dialCode === value.countryCode) ??
    COUNTRIES.find((c) => c.iso2 === defaultCountryIso2) ??
    COUNTRIES[0]

  // Initialise country code from prop on first render if empty
  useEffect(() => {
    if (!value.countryCode) {
      const def = COUNTRIES.find((c) => c.iso2 === defaultCountryIso2) ?? COUNTRIES[0]
      onChange({ countryCode: def.dialCode, phoneNumber: value.phoneNumber })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  // Focus search when dropdown opens
  useEffect(() => {
    if (dropdownOpen) setTimeout(() => searchRef.current?.focus(), 30)
  }, [dropdownOpen])

  // Filtered country list
  const q = searchQuery.toLowerCase().trim()
  const filtered = q
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.iso2.toLowerCase().includes(q) ||
          c.dialCode.includes(q),
      )
    : COUNTRIES

  // GCC countries stay at top of unfiltered list (they're first in the array already)
  const gccCountries  = filtered.filter((c) => ['AE','SA','BH','KW','OM','QA'].includes(c.iso2))
  const restCountries = filtered.filter((c) => !['AE','SA','BH','KW','OM','QA'].includes(c.iso2))

  function selectCountry(c: CountryEntry) {
    setDropdownOpen(false)
    setSearchQuery('')
    onChange({ countryCode: c.dialCode, phoneNumber: value.phoneNumber })
    setTimeout(() => numberRef.current?.focus(), 30)
  }

  function handleNumberChange(raw: string) {
    const digits = stripToDigits(raw)
    onChange({ countryCode: value.countryCode, phoneNumber: digits })
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text')
    if (pasted.trim().startsWith('+') || pasted.trim().startsWith('00')) {
      e.preventDefault()
      const parsed = parsePaste(pasted, value.countryCode)
      onChange(parsed)
    }
    // Otherwise let default paste happen, then handleNumberChange strips non-digits
  }

  function handleBlur() {
    setTouched(true)
    validate(value.phoneNumber)
  }

  const validate = useCallback((digits: string) => {
    if (!digits) {
      // Partially entered = country code selected but no digits
      setError(required ? `${label} is required` : null)
      return
    }
    if (digits.length < selectedCountry.minLength) {
      setError(
        `${selectedCountry.name} numbers must be at least ${selectedCountry.minLength} digits. ` +
        `You entered ${digits.length}.`,
      )
      return
    }
    if (digits.length > selectedCountry.maxLength) {
      setError(
        `${selectedCountry.name} numbers must be no more than ${selectedCountry.maxLength} digits. ` +
        `You entered ${digits.length}.`,
      )
      return
    }
    setError(null)
  }, [selectedCountry, required, label])

  // Keyboard nav in dropdown
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const allFiltered = [...gccCountries, ...restCountries]

  function handleDropdownKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex((i) => Math.min(i + 1, allFiltered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlightedIndex((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); if (allFiltered[highlightedIndex]) selectCountry(allFiltered[highlightedIndex]) }
    if (e.key === 'Escape')    { setDropdownOpen(false) }
  }

  const displayValue = value.phoneNumber
    ? applyFormat(value.phoneNumber, selectedCountry.format)
    : ''

  const hasError = touched && !!error
  const borderColor = hasError ? '#E87020' : dropdownOpen || document.activeElement === numberRef.current ? COLORS.signal : COLORS.deep

  return (
    <div style={{ fontFamily: FONTS.display }}>
      {/* Label */}
      <label style={{
        display: 'block', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: COLORS.muted, marginBottom: 6,
      }}>
        {label}
        {required && <span style={{ color: COLORS.warn, marginLeft: 3 }} aria-label="required">*</span>}
      </label>

      {/* Unified field wrapper */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'stretch',
          border: `1px solid ${borderColor}`,
          borderRadius: 7,
          background: COLORS.abyss,
          transition: 'border-color 0.15s',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {/* Country code button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setDropdownOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          aria-label={`Country code: ${selectedCountry.name} ${selectedCountry.dialCode}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '0 10px', flexShrink: 0, width: 112,
            background: 'none', border: 'none', borderRight: `1px solid ${COLORS.deep}`,
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: COLORS.frost,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden="true">{selectedCountry.flag}</span>
          <span style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 600, flex: 1, textAlign: 'left' }}>
            {selectedCountry.dialCode}
          </span>
          <span style={{ color: COLORS.steel }}>
            <ChevronIcon open={dropdownOpen} />
          </span>
        </button>

        {/* Number input */}
        <input
          ref={numberRef}
          type="tel"
          inputMode="numeric"
          disabled={disabled}
          value={displayValue}
          placeholder={selectedCountry.format.replace(/X/g, '0')}
          onChange={(e) => handleNumberChange(e.target.value)}
          onPaste={handlePaste}
          onBlur={handleBlur}
          aria-label={`${label} number`}
          aria-invalid={hasError}
          style={{
            flex: 1, padding: '9px 12px',
            background: 'none', border: 'none', outline: 'none',
            fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost,
            letterSpacing: '0.04em',
          }}
        />

        {/* Country dropdown */}
        {dropdownOpen && (
          <div
            role="listbox"
            aria-label="Select country code"
            onKeyDown={handleDropdownKeyDown}
            style={{
              position: 'absolute', zIndex: 60,
              top: 'calc(100% + 4px)', left: 0,
              width: 300,
              background: COLORS.abyss, border: `1px solid ${COLORS.deep}`,
              borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              maxHeight: 320, display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Search */}
            <div style={{ padding: '8px 10px', borderBottom: `1px solid ${COLORS.deep}`, flexShrink: 0 }}>
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setHighlightedIndex(0) }}
                placeholder="Search country or code…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px',
                  fontFamily: FONTS.display, fontSize: 12, color: COLORS.frost,
                  background: COLORS.void, border: `1px solid ${COLORS.deep}`,
                  borderRadius: 5, outline: 'none',
                }}
              />
            </div>

            {/* Results */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {allFiltered.length === 0 && (
                <div style={{ padding: '12px', fontFamily: FONTS.display, fontSize: 12, color: COLORS.steel, fontStyle: 'italic' }}>
                  No countries match
                </div>
              )}

              {/* GCC section */}
              {!q && gccCountries.length > 0 && (
                <>
                  <div style={{
                    padding: '6px 12px 4px',
                    fontFamily: FONTS.display, fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.18em', textTransform: 'uppercase', color: COLORS.steel,
                  }}>
                    Gulf &amp; Middle East
                  </div>
                  {gccCountries.map((c, idx) => (
                    <CountryRow
                      key={c.iso2} country={c}
                      selected={c.dialCode === value.countryCode}
                      highlighted={allFiltered.indexOf(c) === highlightedIndex}
                      onSelect={() => selectCountry(c)}
                    />
                  ))}
                  <div style={{ height: 1, background: COLORS.deep, margin: '4px 0' }} />
                </>
              )}

              {/* All / search results */}
              {(!q && restCountries.length > 0) && (
                <div style={{
                  padding: '6px 12px 4px',
                  fontFamily: FONTS.display, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.18em', textTransform: 'uppercase', color: COLORS.steel,
                }}>
                  All Countries
                </div>
              )}
              {(q ? allFiltered : restCountries).map((c) => (
                <CountryRow
                  key={c.iso2} country={c}
                  selected={c.dialCode === value.countryCode}
                  highlighted={allFiltered.indexOf(c) === highlightedIndex}
                  onSelect={() => selectCountry(c)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Validation error */}
      {hasError && (
        <div style={{
          marginTop: 5, fontFamily: FONTS.display, fontSize: 11,
          color: COLORS.warn,
        }} role="alert">
          {error}
        </div>
      )}
    </div>
  )
}

// ── Country row in dropdown ───────────────────────────────────────────────────

function CountryRow({ country, selected, highlighted, onSelect }: {
  country: CountryEntry
  selected: boolean
  highlighted: boolean
  onSelect: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 12px', cursor: 'pointer',
        background: selected
          ? `${COLORS.signal}18`
          : highlighted ? `${COLORS.deep}80` : 'transparent',
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true">{country.flag}</span>
      <span style={{
        fontFamily: FONTS.display, fontSize: 12,
        color: selected ? COLORS.signal : COLORS.frost,
        flex: 1,
      }}>
        {country.name}
      </span>
      <span style={{
        fontFamily: FONTS.display, fontSize: 11, fontWeight: 600,
        color: COLORS.muted, flexShrink: 0,
      }}>
        {country.dialCode}
      </span>
      {selected && (
        <span style={{ color: COLORS.signal, fontSize: 12 }} aria-hidden="true">✓</span>
      )}
    </div>
  )
}

// ── PhoneDisplay — read-only formatted view ───────────────────────────────────

export function PhoneDisplay({ countryCode, phoneNumber }: { countryCode?: string | null; phoneNumber?: string | null }) {
  if (!phoneNumber) return <span style={{ color: COLORS.steel, fontFamily: FONTS.display, fontSize: 13 }}>—</span>

  const country = COUNTRIES.find((c) => c.dialCode === countryCode)
  const formatted = country
    ? applyFormat(phoneNumber, country.format)
    : phoneNumber

  return (
    <span style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {country && <span style={{ fontSize: 16 }} aria-hidden="true">{country.flag}</span>}
      <span>{countryCode} {formatted}</span>
    </span>
  )
}

// ── EMPTY_PHONE helper for form initialisation ────────────────────────────────

export const EMPTY_PHONE: PhoneValue = { countryCode: '+971', phoneNumber: '' }
