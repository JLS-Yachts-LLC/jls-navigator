/**
 * VesselChannelSelector
 *
 * Card-select component for the Vessel Comms Preferences screen (migration 050).
 * Replaces the old browser-native radio button group for delivery channel selection.
 *
 * Design rules:
 *  - Three cards: Email / WhatsApp / Both
 *  - Single click selects. Selected state: Dodger Blue left border + tinted bg + checkmark.
 *  - Unselected: neutral border, white bg.
 *  - "Coming soon" badge on WhatsApp crew delivery (per spec — vessel WhatsApp is live).
 *  - Keyboard accessible: Tab between cards, Space/Enter to select.
 *  - Fully controlled — parent owns the value.
 *
 * Used by: VesselCommsPreferences.tsx
 */

import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeliveryChannel = 'email' | 'whatsapp' | 'both';

export interface ChannelOption {
  value:       DeliveryChannel;
  label:       string;
  description: string;
  icon:        string;    // Tabler icon class e.g. 'ti-mail'
  badge?:      string;    // Optional pill text e.g. 'Coming soon'
  disabled?:   boolean;
}

export interface VesselChannelSelectorProps {
  value:     DeliveryChannel | null;
  onChange:  (channel: DeliveryChannel) => void;
  disabled?: boolean;
  label?:    string;
}

// ─── Channel definitions ──────────────────────────────────────────────────────

const CHANNELS: ChannelOption[] = [
  {
    value:       'email',
    label:       'Email only',
    description: "Weekly report and visa notifications sent to the vessel's registered email address.",
    icon:        'ti-mail',
  },
  {
    value:       'whatsapp',
    label:       'WhatsApp only',
    description: "Notifications sent via the vessel's registered WhatsApp number through the JLS n8n workflow.",
    icon:        'ti-brand-whatsapp',
  },
  {
    value:       'both',
    label:       'Email and WhatsApp',
    description: 'All notifications sent to both the vessel email and WhatsApp. Recommended for urgent expiry alerts.',
    icon:        'ti-layout-grid',
  },
];

// ─── Single channel card ──────────────────────────────────────────────────────

interface ChannelCardProps {
  option:    ChannelOption;
  selected:  boolean;
  disabled:  boolean;
  onSelect:  (v: DeliveryChannel) => void;
}

function ChannelCard({ option, selected, disabled, onSelect }: ChannelCardProps) {
  const isDisabled = disabled || option.disabled;

  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={isDisabled}
      tabIndex={isDisabled ? -1 : 0}
      onClick={() => { if (!isDisabled) onSelect(option.value); }}
      onKeyDown={(e) => {
        if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect(option.value);
        }
      }}
      style={{
        position:        'relative',
        display:         'flex',
        flexDirection:   'column',
        gap:             '8px',
        padding:         '16px',
        borderRadius:    '12px',
        border:          selected
                           ? '1px solid #4590BA'
                           : '1px solid #E5E7EB',
        borderLeft:      selected
                           ? '4px solid #4590BA'
                           : '4px solid transparent',
        background:      selected
                           ? 'rgba(69,144,186,0.06)'
                           : '#FFFFFF',
        cursor:          isDisabled ? 'not-allowed' : 'pointer',
        opacity:         isDisabled ? 0.5 : 1,
        transition:      'border 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
        flex:            '1 1 0',
        minWidth:        '160px',
      }}
      onMouseEnter={(e) => {
        if (isDisabled || selected) return;
        (e.currentTarget as HTMLDivElement).style.borderColor = '#96CBC7';
        (e.currentTarget as HTMLDivElement).style.borderLeftColor = '#96CBC7';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(7,67,94,0.07)';
      }}
      onMouseLeave={(e) => {
        if (isDisabled || selected) return;
        (e.currentTarget as HTMLDivElement).style.borderColor = '#E5E7EB';
        (e.currentTarget as HTMLDivElement).style.borderLeftColor = 'transparent';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Icon + checkmark row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div
          style={{
            width:        '36px',
            height:       '36px',
            borderRadius: '8px',
            background:   selected ? 'rgba(69,144,186,0.12)' : 'rgba(7,67,94,0.06)',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
          }}
        >
          <i
            className={`ti ${option.icon}`}
            aria-hidden="true"
            style={{
              fontSize: '18px',
              color:    selected ? '#4590BA' : '#07435E',
            }}
          />
        </div>

        {/* Selected checkmark */}
        {selected && (
          <div
            aria-hidden="true"
            style={{
              width:        '20px',
              height:       '20px',
              borderRadius: '50%',
              background:   '#4590BA',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
            }}
          >
            <i className="ti ti-check" style={{ fontSize: '12px', color: '#FFFFFF' }} />
          </div>
        )}
      </div>

      {/* Label */}
      <div
        style={{
          fontFamily: "'Halis GR','Inter',sans-serif",
          fontSize:   '15px',
          fontWeight: '500',
          color:      selected ? '#4590BA' : '#07435E',
        }}
      >
        {option.label}
      </div>

      {/* Description */}
      <div
        style={{
          fontFamily:  "'DINPro','Inter',sans-serif",
          fontSize:    '13px',
          color:       '#6B7280',
          lineHeight:  '1.5',
        }}
      >
        {option.description}
      </div>

      {/* Badge */}
      {option.badge && (
        <span
          style={{
            alignSelf:    'flex-start',
            fontFamily:   "'DINPro','Inter',sans-serif",
            fontSize:     '11px',
            fontWeight:   '500',
            padding:      '2px 8px',
            borderRadius: '20px',
            background:   'rgba(150,203,199,0.20)',
            color:        '#07435E',
            border:       '1px solid rgba(150,203,199,0.50)',
          }}
        >
          {option.badge}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VesselChannelSelector({
  value,
  onChange,
  disabled = false,
  label = 'Delivery channel',
}: VesselChannelSelectorProps) {
  return (
    <div>
      {/* Field label */}
      <div
        style={{
          fontFamily:   "'DINPro','Inter',sans-serif",
          fontSize:     '14px',
          fontWeight:   '500',
          color:        '#374151',
          marginBottom: '10px',
        }}
      >
        {label}
      </div>

      {/* Card group */}
      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display:    'flex',
          gap:        '12px',
          flexWrap:   'wrap',
        }}
      >
        {CHANNELS.map((option) => (
          <ChannelCard
            key={option.value}
            option={option}
            selected={value === option.value}
            disabled={disabled}
            onSelect={onChange}
          />
        ))}
      </div>

      {/* Helper text */}
      {value === 'both' && (
        <div
          role="status"
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '6px',
            marginTop:    '10px',
            fontFamily:   "'DINPro','Inter',sans-serif",
            fontSize:     '13px',
            color:        '#4590BA',
          }}
        >
          <i className="ti ti-info-circle" aria-hidden="true" style={{ fontSize: '14px' }} />
          Crew WhatsApp delivery is not yet enabled. Vessel notifications only at this time.
        </div>
      )}
    </div>
  );
}

export default VesselChannelSelector;
