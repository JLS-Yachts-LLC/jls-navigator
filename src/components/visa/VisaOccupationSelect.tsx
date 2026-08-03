/**
 * VisaOccupationSelect
 *
 * Fixes the unreadable occupation dropdown in the Visa Application form.
 *
 * ROOT CAUSE:
 * The field was a native <select>. CSS cannot style <option> elements
 * inside a native select's popup in most browsers — they always fall
 * back to OS defaults (white background, system font, system highlight
 * colour). On a dark Polaris theme this produces grey-on-white text
 * that's nearly unreadable, and a jarring OS-blue highlight on hover
 * that has nothing to do with the brand palette.
 *
 * FIX:
 * Replace the native <select> with a fully custom-rendered dropdown.
 * Every visual state — trigger, popup, option rows, hover, selected —
 * is themed with the official Polaris palette. No native popup involved.
 *
 * Palette:
 *  Jamaica Bay  #96CBC7
 *  Dodger Blue  #4590BA
 *  Teal Blue    #07435E
 */

import React, { useState, useRef, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OccupationOption {
  value: string;
  label: string;
}

export interface VisaOccupationSelectProps {
  value:        string | null;
  onChange:     (value: string) => void;
  options?:     OccupationOption[];
  placeholder?: string;
  disabled?:    boolean;
  error?:       string;
  required?:    boolean;
  /** When true the field is a free-text combobox: pick a suggestion OR type any
   *  occupation. Used for the visa form so a value can always be entered even
   *  when nothing auto-populates and none of the suggestions fit. */
  allowCustom?: boolean;
}

// ─── Default options (replace with your seeded occupation list) ──────────────

export const DEFAULT_OCCUPATIONS: OccupationOption[] = [
  { value: 'captain',            label: 'Captain' },
  { value: 'seaman',             label: 'Seaman' },
  { value: 'chief_officer',      label: 'Chief Officer' },
  { value: 'chief_engineer',     label: 'Chief Engineer' },
  { value: 'deckhand',           label: 'Deckhand' },
  { value: 'steward_stewardess', label: 'Steward / Stewardess' },
  { value: 'chef',               label: 'Chef' },
  { value: 'engineer',           label: 'Engineer' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function VisaOccupationSelect({
  value,
  onChange,
  options = DEFAULT_OCCUPATIONS,
  placeholder = 'Select…',
  disabled = false,
  error,
  required = false,
  allowCustom = false,
}: VisaOccupationSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef       = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) ?? null;

  // Close on outside click (shared by both modes)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Editable combobox mode ───────────────────────────────────────────────
  // Type any occupation, or click a suggestion. The typed text IS the value, so
  // a value can always be entered even when nothing auto-populates.
  if (allowCustom) {
    const text = value ?? '';
    const matches = text.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(text.trim().toLowerCase()))
      : options;
    const exact = options.some((o) => o.label.toLowerCase() === text.trim().toLowerCase());

    return (
      <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={text}
            disabled={disabled}
            placeholder={placeholder}
            aria-required={required}
            onChange={(e) => { onChange(e.target.value); if (!open) setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter') { e.preventDefault(); setOpen(false); } }}
            style={{
              width: '100%', padding: '12px 40px 12px 16px', borderRadius: '10px',
              border: error ? '1px solid #EF4444' : open ? '1px solid #4590BA' : '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.04)', color: '#FFFFFF',
              fontFamily: "'DINPro','Inter',sans-serif", fontSize: '15px', fontWeight: 500,
              outline: 'none', boxShadow: open ? '0 0 0 3px rgba(69,144,186,0.20)' : 'none',
              opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'text',
            }}
          />
          <i
            className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`}
            aria-hidden="true"
            onClick={() => { if (!disabled) setOpen((o) => !o); }}
            style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                     fontSize: '14px', color: 'rgba(255,255,255,0.55)', cursor: disabled ? 'not-allowed' : 'pointer' }}
          />
        </div>

        {open && (matches.length > 0 || (!!text.trim() && !exact)) && (
          <div
            role="listbox"
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
              maxHeight: '260px', overflowY: 'auto', borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.12)', background: '#0A2E42',
              boxShadow: '0 12px 28px rgba(0,0,0,0.35)', padding: '6px',
            }}
          >
            {matches.map((option) => {
              const isSelected = option.label.toLowerCase() === text.trim().toLowerCase();
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { onChange(option.value); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: '7px', cursor: 'pointer',
                    background: isSelected ? 'rgba(69,144,186,0.18)' : 'transparent',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.07)'; }}
                  onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <span style={{ fontFamily: "'DINPro','Inter',sans-serif", fontSize: '15px',
                                 fontWeight: isSelected ? 500 : 400, color: isSelected ? '#96CBC7' : '#FFFFFF' }}>
                    {option.label}
                  </span>
                  {isSelected && <i className="ti ti-check" aria-hidden="true" style={{ fontSize: '14px', color: '#96CBC7' }} />}
                </div>
              );
            })}
            {!!text.trim() && !exact && (
              <div style={{ padding: '9px 12px', fontFamily: "'DINPro','Inter',sans-serif", fontSize: '13px',
                            color: 'rgba(255,255,255,0.55)', borderTop: matches.length ? '1px solid rgba(255,255,255,0.08)' : 'none',
                            marginTop: matches.length ? 4 : 0 }}>
                Custom entry — saved as “{text.trim()}”.
              </div>
            )}
          </div>
        )}

        {error && (
          <div role="alert" style={{ marginTop: '6px', fontFamily: "'DINPro','Inter',sans-serif", fontSize: '13px', color: '#F87171' }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;

    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setOpen(true);
      const currentIndex = options.findIndex((o) => o.value === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
      return;
    }

    if (!open) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, options.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        onChange(options[highlightedIndex].value);
        setOpen(false);
      }
      return;
    }

    if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  // Scroll highlighted option into view
  useEffect(() => {
    if (!open || highlightedIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, open]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={disabled}
        aria-required={required}
        tabIndex={disabled ? -1 : 0}
        onClick={() => { if (!disabled) setOpen(!open); }}
        onKeyDown={handleKeyDown}
        style={{
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          width:           '100%',
          padding:         '12px 16px',
          borderRadius:    '10px',
          border:          error
                             ? '1px solid #EF4444'
                             : open
                               ? '1px solid #4590BA'
                               : '1px solid rgba(255,255,255,0.18)',
          background:      'rgba(255,255,255,0.04)',
          cursor:          disabled ? 'not-allowed' : 'pointer',
          opacity:         disabled ? 0.5 : 1,
          boxShadow:       open ? '0 0 0 3px rgba(69,144,186,0.20)' : 'none',
          transition:      'border 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <span
          style={{
            fontFamily: "'DINPro','Inter',sans-serif",
            fontSize:   '15px',
            fontWeight: selectedOption ? '500' : '400',
            color:      selectedOption ? '#FFFFFF' : 'rgba(255,255,255,0.45)',
          }}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <i
          className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`}
          aria-hidden="true"
          style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)' }}
        />
      </div>

      {/* Popup */}
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Occupation options"
          style={{
            position:     'absolute',
            top:          'calc(100% + 6px)',
            left:         0,
            right:        0,
            zIndex:       50,
            maxHeight:    '260px',
            overflowY:    'auto',
            borderRadius: '10px',
            border:       '1px solid rgba(255,255,255,0.12)',
            background:   '#0A2E42',
            boxShadow:    '0 12px 28px rgba(0,0,0,0.35)',
            padding:      '6px',
          }}
        >
          {options.map((option, index) => {
            const isSelected    = option.value === value;
            const isHighlighted = index === highlightedIndex;

            return (
              <div
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  padding:        '10px 12px',
                  borderRadius:   '7px',
                  cursor:         'pointer',
                  background:     isSelected
                                    ? 'rgba(69,144,186,0.18)'
                                    : isHighlighted
                                      ? 'rgba(255,255,255,0.07)'
                                      : 'transparent',
                  transition:     'background 0.1s ease',
                }}
              >
                <span
                  style={{
                    fontFamily: "'DINPro','Inter',sans-serif",
                    fontSize:   '15px',
                    fontWeight: isSelected ? '500' : '400',
                    color:      isSelected ? '#96CBC7' : '#FFFFFF',
                  }}
                >
                  {option.label}
                </span>
                {isSelected && (
                  <i
                    className="ti ti-check"
                    aria-hidden="true"
                    style={{ fontSize: '14px', color: '#96CBC7' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          role="alert"
          style={{
            marginTop:  '6px',
            fontFamily: "'DINPro','Inter',sans-serif",
            fontSize:   '13px',
            color:      '#F87171',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export default VisaOccupationSelect;
