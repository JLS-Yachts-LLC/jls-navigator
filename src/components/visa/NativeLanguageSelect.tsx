/**
 * NativeLanguageSelect
 *
 * Native Language field for the Visa Application form, with intelligent
 * default pre-population per the four-tier priority chain:
 *
 *   1. Passport-derived language
 *   2. Last used selection
 *   3. Nationality-derived language
 *   4. No default (placeholder + Popular Languages)
 *
 * The component itself is "dumb" about the resolution logic — it receives
 * the resolved default and full language list as props (fetched by the
 * parent via /api/native-language/resolve-default), and is purely
 * responsible for the searchable UI and emitting onChange/onSave events.
 * This keeps the resolution logic server-side and testable independently
 * of the component tree.
 *
 * Behaviour:
 *   - Pre-selects the resolved default on mount, if any.
 *   - Always fully searchable — typing filters both Popular and All sections.
 *   - User can always override the default; doing so does not error or warn.
 *   - Shows a small "Suggested from passport" / "Last used" badge next to
 *     the pre-selected value so the user understands why it was chosen —
 *     this builds trust and makes the override action feel natural rather
 *     than like fighting the system.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LanguageOption {
  code:        string;
  name:        string;
  nativeName?: string;
  isPopular:   boolean;
  sortOrder:   number;
}

export type DefaultSource = 'passport' | 'last_used' | 'nationality' | 'none';

export interface NativeLanguageSelectProps {
  /** Currently selected value — fully controlled by parent */
  value: string | null;

  /** Fired whenever the user changes the selection (not a save event) */
  onChange: (languageCode: string) => void;

  /** Full language list, fetched from /api/native-language/resolve-default */
  languages: LanguageOption[];

  /** The source that produced the initial default — drives the badge text */
  defaultSource?: DefaultSource;

  /** True if `value` currently equals the originally-resolved default (i.e. not yet overridden) */
  isUnmodifiedDefault?: boolean;

  placeholder?: string;
  disabled?:    boolean;
  error?:       string;
  required?:    boolean;
}

// ─── Badge copy per source ────────────────────────────────────────────────────

const SOURCE_BADGE: Record<Exclude<DefaultSource, 'none'>, { label: string; icon: string }> = {
  passport:    { label: 'From passport',    icon: 'ti-passport' },
  last_used:   { label: 'Last used',        icon: 'ti-history' },
  nationality: { label: 'From nationality', icon: 'ti-flag' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function NativeLanguageSelect({
  value,
  onChange,
  languages,
  defaultSource,
  isUnmodifiedDefault = false,
  placeholder = 'Select native language',
  disabled = false,
  error,
  required = false,
}: NativeLanguageSelectProps) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLDivElement>(null);

  const selectedOption = languages.find((l) => l.code === value) ?? null;

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName?.toLowerCase().includes(q) ||
        l.code.toLowerCase() === q,
    );
  }, [languages, query]);

  const popularResults = useMemo(
    () => filtered.filter((l) => l.isPopular).sort((a, b) => a.sortOrder - b.sortOrder),
    [filtered],
  );

  const allResultsAZ = useMemo(
    () => [...filtered].sort((a, b) => a.name.localeCompare(b.name)),
    [filtered],
  );

  // Flat list for keyboard navigation — Popular first, then A–Z, de-duplicated.
  const flatList = useMemo(() => {
    const popularCodes = new Set(popularResults.map((l) => l.code));
    const azOnly = allResultsAZ.filter((l) => !popularCodes.has(l.code));
    return [...popularResults, ...azOnly];
  }, [popularResults, allResultsAZ]);

  // ── Outside click ─────────────────────────────────────────────────────────

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      setHighlightedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // ── Keyboard nav ──────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, flatList.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const choice = flatList[highlightedIndex];
      if (choice) {
        onChange(choice.code);
        setOpen(false);
        setQuery('');
      }
      return;
    }
  }

  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`) as HTMLElement | null;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, open]);

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderOption(option: LanguageOption, flatIndex: number) {
    const isSelected    = option.code === value;
    const isHighlighted = flatIndex === highlightedIndex;

    return (
      <div
        key={option.code}
        data-index={flatIndex}
        role="option"
        aria-selected={isSelected}
        onMouseEnter={() => setHighlightedIndex(flatIndex)}
        onClick={() => {
          onChange(option.code);
          setOpen(false);
          setQuery('');
        }}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '9px 12px',
          borderRadius:   '7px',
          cursor:         'pointer',
          background:     isSelected
                            ? 'rgba(201,162,39,0.18)'
                            : isHighlighted
                              ? 'rgba(255,255,255,0.07)'
                              : 'transparent',
          transition:     'background 0.1s ease',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span
            style={{
              fontFamily: "'DINPro','Inter',sans-serif",
              fontSize:   '15px',
              fontWeight: isSelected ? '500' : '400',
              color:      isSelected ? '#E9CC72' : '#FFFFFF',
            }}
          >
            {option.name}
          </span>
          {option.nativeName && option.nativeName !== option.name && (
            <span
              style={{
                fontFamily: "'DINPro','Inter',sans-serif",
                fontSize:   '12px',
                color:      'rgba(255,255,255,0.40)',
              }}
            >
              {option.nativeName}
            </span>
          )}
        </span>
        {isSelected && (
          <i className="ti ti-check" aria-hidden="true" style={{ fontSize: '14px', color: '#E9CC72' }} />
        )}
      </div>
    );
  }

  const showPopularSection = !query.trim() || popularResults.length > 0;
  const azListExcludingPopular = useMemo(() => {
    const popularCodes = new Set(popularResults.map((l) => l.code));
    return allResultsAZ.filter((l) => !popularCodes.has(l.code));
  }, [allResultsAZ, popularResults]);

  // ── Render ────────────────────────────────────────────────────────────────

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
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          width:          '100%',
          padding:        '12px 16px',
          borderRadius:   '10px',
          border:         error
                            ? '1px solid #EF4444'
                            : open
                              ? '1px solid #C9A227'
                              : '1px solid rgba(255,255,255,0.18)',
          background:     'rgba(255,255,255,0.04)',
          cursor:         disabled ? 'not-allowed' : 'pointer',
          opacity:        disabled ? 0.5 : 1,
          boxShadow:      open ? '0 0 0 3px rgba(201,162,39,0.20)' : 'none',
          transition:     'border 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span
            style={{
              fontFamily:   "'DINPro','Inter',sans-serif",
              fontSize:     '15px',
              fontWeight:   selectedOption ? '500' : '400',
              color:        selectedOption ? '#FFFFFF' : 'rgba(255,255,255,0.45)',
              whiteSpace:   'nowrap',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {selectedOption ? selectedOption.name : placeholder}
          </span>

          {/* Source badge — only shown while value is the unmodified suggestion */}
          {selectedOption && isUnmodifiedDefault && defaultSource && defaultSource !== 'none' && (
            <span
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          '4px',
                flexShrink:   0,
                fontFamily:   "'DINPro','Inter',sans-serif",
                fontSize:     '11px',
                fontWeight:   '500',
                padding:      '2px 8px',
                borderRadius: '20px',
                background:   'rgba(233,204,114,0.16)',
                color:        '#E9CC72',
                border:       '1px solid rgba(233,204,114,0.40)',
              }}
            >
              <i className={`ti ${SOURCE_BADGE[defaultSource].icon}`} aria-hidden="true" style={{ fontSize: '10px' }} />
              {SOURCE_BADGE[defaultSource].label}
            </span>
          )}
        </div>

        <i
          className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`}
          aria-hidden="true"
          style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', flexShrink: 0 }}
        />
      </div>

      {/* Popup */}
      {open && (
        <div
          style={{
            position:     'absolute',
            top:          'calc(100% + 6px)',
            left:         0,
            right:        0,
            zIndex:       50,
            borderRadius: '10px',
            border:       '1px solid rgba(255,255,255,0.12)',
            background:   '#0A2E42',
            boxShadow:    '0 12px 28px rgba(0,0,0,0.35)',
            overflow:     'hidden',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ position: 'relative' }}>
              <i
                className="ti ti-search"
                aria-hidden="true"
                style={{
                  position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '14px', color: 'rgba(255,255,255,0.40)',
                }}
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlightedIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Search languages…"
                aria-label="Search languages"
                style={{
                  width:        '100%',
                  padding:      '9px 12px 9px 32px',
                  borderRadius: '7px',
                  border:       'none',
                  outline:      'none',
                  background:   'rgba(255,255,255,0.06)',
                  color:        '#FFFFFF',
                  fontFamily:   "'DINPro','Inter',sans-serif",
                  fontSize:     '14px',
                }}
              />
            </div>
          </div>

          {/* Results */}
          <div ref={listRef} role="listbox" aria-label="Language options" style={{ maxHeight: '280px', overflowY: 'auto', padding: '6px' }}>
            {flatList.length === 0 ? (
              <div
                style={{
                  padding:    '20px 12px',
                  textAlign:  'center',
                  fontFamily: "'DINPro','Inter',sans-serif",
                  fontSize:   '13px',
                  color:      'rgba(255,255,255,0.40)',
                }}
              >
                No languages match "{query}"
              </div>
            ) : (
              <>
                {showPopularSection && popularResults.length > 0 && (
                  <>
                    <div
                      style={{
                        padding:       '6px 12px 4px',
                        fontFamily:    "'DINPro','Inter',sans-serif",
                        fontSize:      '11px',
                        fontWeight:    '600',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color:         'rgba(255,255,255,0.35)',
                      }}
                    >
                      Popular Languages
                    </div>
                    {popularResults.map((opt) =>
                      renderOption(opt, flatList.findIndex((f) => f.code === opt.code)),
                    )}
                  </>
                )}

                {azListExcludingPopular.length > 0 && (
                  <>
                    <div
                      style={{
                        padding:       '10px 12px 4px',
                        fontFamily:    "'DINPro','Inter',sans-serif",
                        fontSize:      '11px',
                        fontWeight:    '600',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color:         'rgba(255,255,255,0.35)',
                      }}
                    >
                      All Languages (A–Z)
                    </div>
                    {azListExcludingPopular.map((opt) =>
                      renderOption(opt, flatList.findIndex((f) => f.code === opt.code)),
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{ marginTop: '6px', fontFamily: "'DINPro','Inter',sans-serif", fontSize: '13px', color: '#F87171' }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export default NativeLanguageSelect;
