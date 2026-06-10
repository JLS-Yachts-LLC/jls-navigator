'use client'

import { COUNTRY_CONFIGS, CountryCode, SUPPORTED_COUNTRIES } from '@/lib/visa/countryConfig'
import { UAE_PROCESS_STEPS, UAE_KEY_RULES, UAE_PROCESSING_TIMES } from '@/lib/visa/uaeProcess'
import HandbookLink from '@/components/visa/HandbookLink'

interface CountryInfoPageProps {
  countryCode: string
}

const WHO_LABEL: Record<string, { label: string; color: string }> = {
  vessel:      { label: 'Vessel',        color: '#00C4CC' },
  team:        { label: 'Port & Agency', color: '#E8A020' },
  immigration: { label: 'UAE GDRFA',     color: '#7A9DB8' },
  crew:        { label: 'Crew',          color: '#4CAF80' },
}

export default function CountryInfoPage({ countryCode }: CountryInfoPageProps) {
  const code = countryCode.toUpperCase() as CountryCode

  if (!SUPPORTED_COUNTRIES.includes(code)) {
    return (
      <div style={{ padding: 32, fontFamily: 'Space Grotesk', color: '#E87050' }}>
        Country <strong>{countryCode}</strong> is not supported.
      </div>
    )
  }

  const config = COUNTRY_CONFIGS[code]
  const isUAE  = code === 'AE'

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px',
                  fontFamily: 'Space Grotesk' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <span style={{ fontSize: 40, lineHeight: 1 }}>{config.flag}</span>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#E8EDF5',
                       letterSpacing: '-0.01em' }}>
            {config.countryName} — Crew Visa Guide
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4A7090' }}>
            Information provided by our Port &amp; Agency Team
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <a
            href="/dashboard/visa/new"
            style={{ display: 'inline-block', padding: '8px 16px',
                     background: '#00C4CC', color: '#080D14', borderRadius: 5,
                     fontSize: 12, fontWeight: 700, textDecoration: 'none',
                     letterSpacing: '0.04em' }}
          >
            + New Application
          </a>
        </div>
      </div>

      {/* ── Handbook link ── */}
      <div style={{ marginBottom: 24 }}>
        <HandbookLink countryCode={code} />
      </div>

      {/* ── UAE: Key rules ── */}
      {isUAE && (
        <Section title="Key Rules">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {UAE_KEY_RULES.map((rule, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: '#E87050', fontWeight: 700, flexShrink: 0, fontSize: 13 }}>
                  ✕
                </span>
                <span style={{ fontSize: 13, color: '#C8D8E8', lineHeight: 1.55 }}>
                  {rule}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Required documents ── */}
      <Section title="Required Documents">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {config.requiredDocuments.map((doc, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center',
                                   padding: '10px 14px', background: '#080D14',
                                   border: '1px solid #0F2030', borderRadius: 5 }}>
              <span style={{ color: '#4CAF80', fontSize: 13, flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 13, color: '#C8D8E8' }}>{doc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Validation rules ── */}
      <Section title="Validation Requirements">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {config.validationRules.map((rule, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: '#E8A020', fontSize: 13, flexShrink: 0, marginTop: 1 }}>
                ◆
              </span>
              <span style={{ fontSize: 13, color: '#7A9DB8', lineHeight: 1.55 }}>{rule}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── UAE: Processing times ── */}
      {isUAE && (
        <Section title="Processing Times">
          <div style={{ border: '1px solid #0F2030', borderRadius: 6, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#1E4060' }}>
                  {['Type', 'Timing', 'Notes'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left',
                                         fontSize: 10, fontWeight: 700, color: '#7A9DB8',
                                         letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {UAE_PROCESSING_TIMES.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #0F2030',
                                       background: i % 2 === 0 ? '#080D14' : '#0D1520' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#E8EDF5',
                                  fontWeight: 600 }}>
                      {row.type}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13,
                                  color: row.timing === 'Not available' ? '#E87050' : '#4CAF80' }}>
                      {row.timing}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#4A7090' }}>
                      {row.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── UAE: 10-step process ── */}
      {isUAE && (
        <Section title="Application Process">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {UAE_PROCESS_STEPS.map((step, i) => {
              const who = WHO_LABEL[step.who]
              return (
                <div key={step.step} style={{ display: 'flex', gap: 0 }}>
                  {/* Step line */}
                  <div style={{ display: 'flex', flexDirection: 'column',
                                 alignItems: 'center', width: 36, flexShrink: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%',
                                   background: '#0D1520', border: '2px solid #0F2030',
                                   display: 'flex', alignItems: 'center', justifyContent: 'center',
                                   fontSize: 11, fontWeight: 700, color: '#00C4CC',
                                   flexShrink: 0, zIndex: 1 }}>
                      {step.step}
                    </div>
                    {i < UAE_PROCESS_STEPS.length - 1 && (
                      <div style={{ width: 1, flex: 1, minHeight: 20,
                                     background: '#0F2030', margin: '2px 0' }} />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ paddingLeft: 14, paddingBottom: i < UAE_PROCESS_STEPS.length - 1 ? 20 : 0,
                                 paddingTop: 2, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                                   marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#E8EDF5' }}>
                        {step.title}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
                                      textTransform: 'uppercase', color: who.color,
                                      padding: '2px 7px', background: '#080D14',
                                      border: `1px solid ${who.color}22`, borderRadius: 3 }}>
                        {who.label}
                      </span>
                      {step.timing && (
                        <span style={{ fontSize: 10, color: '#3A5570' }}>
                          {step.timing}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#4A7090', lineHeight: 1.6 }}>
                      {step.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* ── Contact ── */}
      <Section title="Get Help">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <ContactPill icon="✉" label="support@jlsyachts.com"
                       href="mailto:support@jlsyachts.com" />
          <ContactPill icon="☎" label="+971 4 331 3555"
                       href="tel:+97143313555" />
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 12, color: '#3A5570' }}>
          Our Port &amp; Agency Team — available for all visa and immigration queries.
        </p>
      </Section>

    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
                        textTransform: 'uppercase', color: '#3A5570',
                        fontFamily: 'Space Grotesk' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

function ContactPill({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <a
      href={href}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
               padding: '8px 14px', background: '#0D1520',
               border: '1px solid #0F2030', borderRadius: 5,
               fontSize: 12, color: '#7A9DB8', textDecoration: 'none',
               fontFamily: 'Space Grotesk' }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </a>
  )
}
