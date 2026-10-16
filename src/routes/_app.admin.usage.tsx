import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/lib/auth'
import { COLORS } from '@/lib/tokens'

export const Route = createFileRoute('/_app/admin/usage')({
  component: UsagePage,
  head: () => ({ meta: [{ title: 'Usage — Admin — Polaris' }] }),
})

type Person = {
  user_id: string
  name: string
  email: string
  department: string | null
  position: string | null
  days_active: number
  days_signed_in: number
  screens_visited: number
  distinct_screens: number
  top_modules: { module: string; views: number }[]
  last_seen: string | null
}
type NoLogin = { name: string; email: string | null; position: string | null; department: string | null }
type Week = { week: string; using: number; signed_in: number }
type Report = {
  since: string
  generated_at: string
  tracking_started: string | null
  people: Person[]
  no_login: NoLogin[]
  weekly: Week[]
}

type SortKey = 'name' | 'days_active' | 'days_signed_in' | 'screens_visited' | 'last_seen'

const PERIODS = [7, 30, 90] as const

/**
 * Admin → Usage: who is and isn't using Polaris. Staff only — client captains,
 * guests, New Horizon IT, itsupport@ and test logins are left out by the
 * admin_usage_report() database function, which also refuses anyone who isn't a
 * global admin. "Days active" and screens come from usage_events (recorded per
 * screen since this page shipped); "days signed in" comes from sign-in sessions
 * and covers the time before that.
 */
function UsagePage() {
  const { user } = useAuth()
  const [days, setDays] = useState<number>(30)
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'days_active', desc: true })

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-usage-report', days],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('admin_usage_report', { p_days: days })
      if (error) throw new Error(error.message)
      return data as Report
    },
  })

  const people = useMemo(() => {
    const rows = [...(data?.people ?? [])]
    const dir = sort.desc ? -1 : 1
    rows.sort((a, b) => {
      if (sort.key === 'name') return dir * a.name.localeCompare(b.name)
      if (sort.key === 'last_seen') return dir * ((a.last_seen ? Date.parse(a.last_seen) : 0) - (b.last_seen ? Date.parse(b.last_seen) : 0))
      const d = (a[sort.key] as number) - (b[sort.key] as number)
      // Ties fall back to sign-in days, so the never-tracked-yet rows still rank.
      return dir * (d || a.days_signed_in - b.days_signed_in)
    })
    return rows
  }, [data, sort])

  if (error) {
    const msg = (error as Error).message
    return (
      <Panel>
        <div style={{ padding: 24, color: COLORS.muted, fontSize: 13 }}>
          {/not allowed/i.test(msg) ? 'Usage is only available to global admins.' : `Couldn't load usage: ${msg}`}
        </div>
      </Panel>
    )
  }
  if (isLoading || !data) {
    return <Panel><div style={{ padding: 32, textAlign: 'center', color: COLORS.steel, fontSize: 12 }}>Loading…</div></Panel>
  }

  const week = Date.now() - 7 * 86_400_000
  const activeThisWeek = data.people.filter((p) => p.last_seen && Date.parse(p.last_seen) >= week).length
  const unused = data.people.filter((p) => p.days_signed_in === 0 && p.days_active === 0).length
  const weekly = data.weekly.map((w) => ({
    ...w,
    label: new Date(w.week + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
  }))

  function header(key: SortKey, label: string, align: 'left' | 'right' = 'right') {
    const on = sort.key === key
    return (
      <th
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}
        style={{ ...th, textAlign: align, cursor: 'pointer', color: on ? COLORS.frost : COLORS.steel }}
      >
        {label}{on ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </th>
    )
  }

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, color: COLORS.frost }}>
          Staff usage
        </h2>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setDays(p)}
              style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${days === p ? COLORS.signal : COLORS.deep}`,
                background: days === p ? 'rgba(201,162,39,0.12)' : 'transparent',
                color: days === p ? COLORS.frost : COLORS.muted,
              }}
            >
              Last {p} days
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Stat label="Staff with a login" value={data.people.length} />
        <Stat label="Seen in the last 7 days" value={activeThisWeek} />
        <Stat label={`Not signed in (last ${days} days)`} value={unused} tone={unused ? COLORS.warn : undefined} />
        <Stat label="Staff with no login" value={data.no_login.length} tone={data.no_login.length ? COLORS.warn : undefined} />
      </div>

      <Panel>
        <div style={{ padding: '14px 16px 4px', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.frost }}>Weekly active staff</span>
          <span style={{ fontSize: 11, color: COLORS.steel }}>
            Signed in = had Polaris open that week · Using = opened at least one screen
            {data.tracking_started ? ` (screen tracking since ${fmtDate(data.tracking_started)})` : ' (screen tracking has just started)'}
          </span>
        </div>
        <div style={{ height: 240, padding: '0 8px 8px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(127,127,127,0.08)' }}
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                labelFormatter={(l) => `Week of ${l}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="signed_in" name="Signed in" fill={COLORS.signal} radius={[3, 3, 0, 0]} />
              <Bar dataKey="using" name="Using (screens)" fill="#3E9BB8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: COLORS.ocean }}>
                {header('name', 'Person', 'left')}
                {header('days_active', 'Days active')}
                {header('days_signed_in', 'Days signed in')}
                {header('screens_visited', 'Screens visited')}
                <th style={{ ...th, textAlign: 'left' }}>Top modules</th>
                {header('last_seen', 'Last seen')}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.user_id} style={{ borderTop: `1px solid ${COLORS.deep}` }}>
                  <td style={td}>
                    <div style={{ color: COLORS.frost, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ color: COLORS.steel, fontSize: 11 }}>
                      {[p.email !== p.name.toLowerCase() ? p.email : null, p.department].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td style={{ ...td, ...num }}>{p.days_active || '—'}</td>
                  <td style={{ ...td, ...num, color: p.days_signed_in ? COLORS.frost : COLORS.warn }}>{p.days_signed_in}</td>
                  <td style={{ ...td, ...num }}>
                    {p.screens_visited ? <>{p.screens_visited}<span style={{ color: COLORS.steel }}> · {p.distinct_screens} different</span></> : '—'}
                  </td>
                  <td style={td}>
                    {p.top_modules.length ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {p.top_modules.map((m) => (
                          <span key={m.module} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, border: `1px solid ${COLORS.deep}`, color: COLORS.muted }}>
                            {m.module} <span style={{ color: COLORS.steel }}>{m.views}</span>
                          </span>
                        ))}
                      </div>
                    ) : <span style={{ color: COLORS.steel }}>—</span>}
                  </td>
                  <td style={{ ...td, ...num, color: COLORS.muted }}>{p.last_seen ? fmtAgo(p.last_seen) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {data.no_login.length > 0 && (
        <Panel>
          <div style={{ padding: '14px 16px 6px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.frost }}>In the staff directory but no Polaris login</div>
            <div style={{ fontSize: 11, color: COLORS.steel, marginTop: 2 }}>Active staff_profiles entries whose email has no account (includes team mailboxes).</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {data.no_login.map((s, i) => (
                <tr key={`${s.email ?? s.name}-${i}`} style={{ borderTop: `1px solid ${COLORS.deep}` }}>
                  <td style={{ ...td, color: COLORS.frost }}>{s.name}</td>
                  <td style={{ ...td, color: COLORS.muted }}>{s.position ?? ''}</td>
                  <td style={{ ...td, color: COLORS.muted }}>{s.department ?? ''}</td>
                  <td style={{ ...td, color: COLORS.steel }}>{s.email ?? 'No email on file'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', userSelect: 'none' }
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' }
const num: React.CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 8, overflow: 'hidden' }}>
      {children}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div style={{ background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: COLORS.steel }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: tone ?? COLORS.frost, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtAgo(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const d = Math.round(hrs / 24)
  if (d < 14) return `${d} day${d === 1 ? '' : 's'} ago`
  return fmtDate(iso)
}
