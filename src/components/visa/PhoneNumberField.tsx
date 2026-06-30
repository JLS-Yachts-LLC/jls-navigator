/**
 * PhoneNumberField
 *
 * Completes the beta implementation of the original POLARIS_PHONE_FIELD.md
 * spec: structured country code dropdown (flag + search) paired with an
 * auto-formatting local number field, intelligent default resolution,
 * live validation, and full user override capability.
 *
 * Composition:
 *   - Country selector: themed custom dropdown (same dark-popup pattern as
 *     VisaOccupationSelect / NativeLanguageSelect — no native <select>)
 *   - Number input: live-formats as the user types, validates against the
 *     selected country's min/max length + optional regex
 *   - Source badge: shows why the country was pre-selected (Last used /
 *     Nationality / Vessel location / Org location), disappears the
 *     moment the user changes the country manually
 *
 * This is a container + UI component combined (unlike the native language
 * feature's split Select/Field components) because the country selector
 * and number input are tightly coupled — validation rules depend on which
 * country is selected, so keeping them in one component avoids prop-drilling
 * the active rule between two separate components for a field this size.
 */

import React, { useState, useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import {
  validatePhoneNumber,
  normalizePhoneDigits,
  formatPhoneForDisplay,
  computeFullInternationalNumber,
  type CountryValidationRule,
} from '@/lib/phone/validatePhoneNumber';
import { getOrCreateGuestToken } from '@/lib/native-language/guestToken';   // shared cookie utility

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CountryDialOption {
  countryCode:       string;
  dialCode:          string;
  flagEmoji:         string | null;
  countryName:       string;
  minLength:         number;
  maxLength:         number;
  localFormatRegex?: string | null;
  isPopular:         boolean;
  sortOrder:         number;
}

export type PhoneDefaultSource = 'last_used' | 'nationality' | 'vessel_location' | 'org_location' | 'none';

export interface PhoneNumberFieldProps {
  crewMemberId?:          string;
  nationalityCountry?:    string | null;
  vesselLocationCountry?: string | null;
  orgLocationCountry?:    string | null;

  existingCountryCode?: string | null;
  existingLocalNumber?: string | null;

  isAuthenticated?: boolean;
  disabled?:        boolean;
  required?:        boolean;
  label?:           string;
}

export interface PhoneNumberFieldHandle {
  save: () => Promise<{ success: boolean; error?: string }>;
  getValue: () => { countryCode: string | null; localNumber: string; fullInternational: string | null };
  isValid: () => boolean;
}

const SOURCE_BADGE: Record<Exclude<PhoneDefaultSource, 'none'>, { label: string; icon: string }> = {
  last_used:       { label: 'Last used',        icon: 'ti-history' },
  nationality:     { label: 'From nationality', icon: 'ti-flag' },
  vessel_location: { label: 'Vessel location',  icon: 'ti-anchor' },
  org_location:    { label: 'Office location',  icon: 'ti-building' },
};

export const PhoneNumberField = forwardRef<PhoneNumberFieldHandle, PhoneNumberFieldProps>(
  function PhoneNumberField(
    {
      crewMemberId,
      nationalityCountry,
      vesselLocationCountry,
      orgLocationCountry,
      existingCountryCode,
      existingLocalNumber,
      isAuthenticated = false,
      disabled = false,
      required = false,
      label = 'Mobile Number',
    },
    ref,
  ) {
    const [countries, setCountries] = useState<CountryDialOption[]>([]);
    const [selectedCountry, setSelectedCountry] = useState<string | null>(existingCountryCode ?? null);
    const [localNumber, setLocalNumber] = useState<string>(existingLocalNumber ?? '');
    const [defaultSource, setDefaultSource] = useState<PhoneDefaultSource>('none');
    const [suggestedCountry, setSuggestedCountry] = useState<string | null>(existingCountryCode ?? null);
    const [loading, setLoading] = useState(!existingCountryCode);
    const [touched, setTouched] = useState(false);

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const hasResolvedOnce = useRef(false);

    const activeRule: CountryValidationRule | null = useMemo(() => {
      const c = countries.find((c) => c.countryCode === selectedCountry);
      if (!c) return null;
      return {
        countryCode: c.countryCode,
        dialCode: c.dialCode,
        minLength: c.minLength,
        maxLength: c.maxLength,
        localFormatRegex: c.localFormatRegex,
      };
    }, [countries, selectedCountry]);

    const validation = useMemo(
      () => validatePhoneNumber(localNumber, activeRule),
      [localNumber, activeRule],
    );

    const selectedCountryData = countries.find((c) => c.countryCode === selectedCountry) ?? null;

    useEffect(() => {
      if (existingCountryCode) {
        setLoading(true);
        fetch('/api/phone/resolve-default')
          .then((r) => r.json())
          .then((data) => setCountries(data.countries ?? []))
          .finally(() => setLoading(false));
        return;
      }

      if (hasResolvedOnce.current) return;
      hasResolvedOnce.current = true;

      setLoading(true);
      const guestToken = isAuthenticated ? null : getOrCreateGuestToken();

      const params = new URLSearchParams();
      if (nationalityCountry) params.set('nationalityCountry', nationalityCountry);
      if (vesselLocationCountry) params.set('vesselLocationCountry', vesselLocationCountry);
      if (orgLocationCountry) params.set('orgLocationCountry', orgLocationCountry);
      if (crewMemberId) params.set('crewMemberId', crewMemberId);

      fetch(`/api/phone/resolve-default?${params.toString()}`, {
        headers: guestToken ? { 'X-Guest-Token': guestToken } : undefined,
      })
        .then((r) => r.json())
        .then((data) => {
          setCountries(data.countries ?? []);
          setSelectedCountry(data.defaultCountryCode ?? null);
          setSuggestedCountry(data.defaultCountryCode ?? null);
          setDefaultSource(data.defaultSource ?? 'none');
        })
        .catch((err) => console.error('[PhoneNumberField] resolve-default failed:', err))
        .finally(() => setLoading(false));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      function handleClick(e: MouseEvent) {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setDropdownOpen(false);
          setQuery('');
        }
      }
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    useEffect(() => {
      if (dropdownOpen) {
        setHighlightedIndex(0);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    }, [dropdownOpen]);

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return countries;
      return countries.filter(
        (c) =>
          c.countryName.toLowerCase().includes(q) ||
          c.dialCode.includes(q) ||
          c.countryCode.toLowerCase() === q,
      );
    }, [countries, query]);

    const popularResults = useMemo(
      () => filtered.filter((c) => c.isPopular).sort((a, b) => a.sortOrder - b.sortOrder),
      [filtered],
    );
    const allAZ = useMemo(
      () => [...filtered].sort((a, b) => a.countryName.localeCompare(b.countryName)),
      [filtered],
    );
    const azExcludingPopular = useMemo(() => {
      const popularCodes = new Set(popularResults.map((c) => c.countryCode));
      return allAZ.filter((c) => !popularCodes.has(c.countryCode));
    }, [allAZ, popularResults]);

    const flatList = useMemo(() => [...popularResults, ...azExcludingPopular], [popularResults, azExcludingPopular]);

    useImperativeHandle(ref, () => ({
      getValue: () => ({
        countryCode: selectedCountry,
        localNumber,
        fullInternational: selectedCountryData
          ? computeFullInternationalNumber(selectedCountryData.dialCode, localNumber)
          : null,
      }),
      isValid: () => validation.isValid,
      save: async () => {
        setTouched(true);
        if (!selectedCountry || !validation.isValid) {
          return { success: false, error: validation.error ?? 'Select a country and enter a valid number' };
        }

        const guestToken = isAuthenticated ? null : getOrCreateGuestToken();

        const res = await fetch('/api/phone/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            finalCountryCode: selectedCountry,
            finalLocalNumber: localNumber,
            suggestedCountryCode: suggestedCountry,
            suggestedSource: defaultSource,
            crewMemberId,
            nationalityCountry,
            vesselLocationCountry,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { success: false, error: data.detail ?? data.error ?? 'Save failed' };
        }

        return { success: true };
      },
    }), [selectedCountry, localNumber, validation, suggestedCountry, defaultSource, crewMemberId, nationalityCountry, vesselLocationCountry, isAuthenticated, selectedCountryData]);

    function handleDropdownKeyDown(e: React.KeyboardEvent) {
      if (!dropdownOpen) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setDropdownOpen(true);
        }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setDropdownOpen(false); setQuery(''); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex((i) => Math.min(i + 1, flatList.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const choice = flatList[highlightedIndex];
        if (choice) {
          setSelectedCountry(choice.countryCode);
          setDropdownOpen(false);
          setQuery('');
        }
      }
    }

    const isUnmodifiedDefault = selectedCountry !== null && selectedCountry === suggestedCountry && defaultSource !== 'none';
    const showError = touched && !validation.isValid;

    return (
      <div ref={containerRef}>
        <div
          style={{
            fontFamily: "'DINPro','Inter',sans-serif",
            fontSize: '14px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.85)',
            marginBottom: '8px',
          }}
        >
          {label}
          {required && <span style={{ color: '#F87171', marginLeft: '4px' }}>*</span>}
        </div>

        <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
          <div style={{ position: 'relative', flexShrink: 0, minWidth: '118px' }}>
            <div
              role="combobox"
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
              tabIndex={disabled ? -1 : 0}
              onClick={() => { if (!disabled) setDropdownOpen(!dropdownOpen); }}
              onKeyDown={handleDropdownKeyDown}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 12px',
                borderRadius: '10px',
                border: dropdownOpen ? '1px solid #4590BA' : '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.04)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                boxShadow: dropdownOpen ? '0 0 0 3px rgba(69,144,186,0.20)' : 'none',
                transition: 'border 0.15s ease, box-shadow 0.15s ease',
                height: '48px',
              }}
            >
              {loading ? (
                <span style={{ fontFamily: "'DINPro','Inter',sans-serif", fontSize: '14px', color: 'rgba(255,255,255,0.35)' }}>…</span>
              ) : selectedCountryData ? (
                <>
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>{selectedCountryData.flagEmoji}</span>
                  <span style={{ fontFamily: "'DINPro','Inter',sans-serif", fontSize: '14px', fontWeight: 500, color: '#FFFFFF' }}>
                    {selectedCountryData.dialCode}
                  </span>
                </>
              ) : (
                <span style={{ fontFamily: "'DINPro','Inter',sans-serif", fontSize: '14px', color: 'rgba(255,255,255,0.45)' }}>
                  Code
                </span>
              )}
              <i className={`ti ${dropdownOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} aria-hidden="true" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginLeft: 'auto' }} />
            </div>

            {dropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  width: '300px',
                  zIndex: 50,
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: '#0A2E42',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ position: 'relative' }}>
                    <i className="ti ti-search" aria-hidden="true" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: 'rgba(255,255,255,0.40)' }} />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setHighlightedIndex(0); }}
                      onKeyDown={handleDropdownKeyDown}
                      placeholder="Search country or code…"
                      aria-label="Search countries"
                      style={{
                        width: '100%', padding: '9px 12px 9px 32px', borderRadius: '7px', border: 'none',
                        outline: 'none', background: 'rgba(255,255,255,0.06)', color: '#FFFFFF',
                        fontFamily: "'DINPro','Inter',sans-serif", fontSize: '14px',
                      }}
                    />
                  </div>
                </div>

                <div role="listbox" aria-label="Country options" style={{ maxHeight: '280px', overflowY: 'auto', padding: '6px' }}>
                  {flatList.length === 0 ? (
                    <div style={{ padding: '20px 12px', textAlign: 'center', fontFamily: "'DINPro','Inter',sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.40)' }}>
                      No countries match "{query}"
                    </div>
                  ) : (
                    <>
                      {popularResults.length > 0 && (
                        <>
                          <div style={{ padding: '6px 12px 4px', fontFamily: "'DINPro','Inter',sans-serif", fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
                            Popular
                          </div>
                          {popularResults.map((c) => (
                            <CountryRow
                              key={c.countryCode}
                              country={c}
                              isSelected={c.countryCode === selectedCountry}
                              isHighlighted={flatList.indexOf(c) === highlightedIndex}
                              onHover={() => setHighlightedIndex(flatList.indexOf(c))}
                              onSelect={() => { setSelectedCountry(c.countryCode); setDropdownOpen(false); setQuery(''); }}
                            />
                          ))}
                        </>
                      )}
                      {azExcludingPopular.length > 0 && (
                        <>
                          <div style={{ padding: '10px 12px 4px', fontFamily: "'DINPro','Inter',sans-serif", fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
                            All Countries (A–Z)
                          </div>
                          {azExcludingPopular.map((c) => (
                            <CountryRow
                              key={c.countryCode}
                              country={c}
                              isSelected={c.countryCode === selectedCountry}
                              isHighlighted={flatList.indexOf(c) === highlightedIndex}
                              onHover={() => setHighlightedIndex(flatList.indexOf(c))}
                              onSelect={() => { setSelectedCountry(c.countryCode); setDropdownOpen(false); setQuery(''); }}
                            />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="tel"
              inputMode="numeric"
              value={selectedCountryData ? formatPhoneForDisplay(localNumber, selectedCountryData.countryCode) : localNumber}
              onChange={(e) => setLocalNumber(normalizePhoneDigits(e.target.value))}
              onBlur={() => setTouched(true)}
              disabled={disabled || loading || !selectedCountry}
              placeholder={selectedCountryData ? `e.g. ${formatPhoneForDisplay('5'.padEnd(selectedCountryData.minLength, '0'), selectedCountryData.countryCode)}` : 'Select a country first'}
              aria-label="Phone number"
              aria-invalid={showError}
              style={{
                width: '100%',
                height: '48px',
                padding: '0 16px',
                borderRadius: '10px',
                border: showError ? '1px solid #EF4444' : '1px solid rgba(255,255,255,0.18)',
                outline: 'none',
                background: 'rgba(255,255,255,0.04)',
                color: '#FFFFFF',
                fontFamily: "'DINPro','Inter',sans-serif",
                fontSize: '15px',
                opacity: (disabled || !selectedCountry) ? 0.5 : 1,
                transition: 'border 0.15s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = '1px solid #4590BA';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(69,144,186,0.20)';
              }}
            />
          </div>
        </div>

        {selectedCountryData && isUnmodifiedDefault && defaultSource !== 'none' && !showError && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              marginTop: '8px',
              fontFamily: "'DINPro','Inter',sans-serif",
              fontSize: '11px',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '20px',
              background: 'rgba(150,203,199,0.16)',
              color: '#96CBC7',
              border: '1px solid rgba(150,203,199,0.40)',
            }}
          >
            <i className={`ti ${SOURCE_BADGE[defaultSource].icon}`} aria-hidden="true" style={{ fontSize: '10px' }} />
            {SOURCE_BADGE[defaultSource].label} — {selectedCountryData.countryName}
          </div>
        )}

        {selectedCountryData && localNumber && validation.isValid && (
          <div style={{ marginTop: '6px', fontFamily: "'DINPro','Inter',sans-serif", fontSize: '12px', color: 'rgba(255,255,255,0.40)' }}>
            Will be saved as: {computeFullInternationalNumber(selectedCountryData.dialCode, localNumber)}
          </div>
        )}

        {showError && (
          <div role="alert" style={{ marginTop: '6px', fontFamily: "'DINPro','Inter',sans-serif", fontSize: '13px', color: '#F87171' }}>
            {validation.error}
          </div>
        )}
      </div>
    );
  },
);

function CountryRow({
  country,
  isSelected,
  isHighlighted,
  onHover,
  onSelect,
}: {
  country: CountryDialOption;
  isSelected: boolean;
  isHighlighted: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      onMouseEnter={onHover}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '9px 12px',
        borderRadius: '7px',
        cursor: 'pointer',
        background: isSelected ? 'rgba(69,144,186,0.18)' : isHighlighted ? 'rgba(255,255,255,0.07)' : 'transparent',
        transition: 'background 0.1s ease',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '16px' }}>{country.flagEmoji}</span>
        <span style={{ fontFamily: "'DINPro','Inter',sans-serif", fontSize: '14px', fontWeight: isSelected ? 500 : 400, color: isSelected ? '#96CBC7' : '#FFFFFF' }}>
          {country.countryName}
        </span>
      </span>
      <span style={{ fontFamily: "'DINPro','Inter',sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>
        {country.dialCode}
      </span>
    </div>
  );
}

export default PhoneNumberField;
