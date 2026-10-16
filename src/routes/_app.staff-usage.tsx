import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts'
import { useAuth } from '@/lib/auth'
import { useIsUsageAdmin } from '@/lib/usage-admin'
import { COLORS } from '@/lib/tokens'

export const Route = createFileRoute('/_app/staff-usage')({
  component: StaffUsagePage,
  head: () => ({ meta: [{ title: 'Staff Usage — Polaris' }] }),
})

type Status = 'Daily' | 'Regular' | 'Light' | 'Once' | 'New' | 'Inactive' | 'No login'
type Person = {
  key: string
  person: string
  email: string | null
  status: Status
  days_30: number
  days_7: number
  hours_30: number
  actions_30: number
  main_area: string | null
  last_active: string | null
  account_created: string | null
}
type Week = { week: string; staff: number; hours: number }
type Report = { generated_at: string; since: string; week_start: string; tracking_started: string | null; people: Person[]; weekly: Week[] }

type SortKey = 'person' | 'status' | 'days_30' | 'days_7' | 'hours_30' | 'actions_30' | 'main_area' | 'last_active' | 'email'

const GROUPS: { status: Status; label: string; def: string; color: string }[] = [
  { status: 'Daily',    label: 'Daily',          def: 'In on 12+ of the last 30 days', color: '#30A46C' },
  { status: 'Regular',  label: 'Regular',        def: '5 to 11 days',                  color: '#3E9BB8' },
  { status: 'Light',    label: 'Light',          def: '2 to 4 days',                   color: '#C9A227' },
  { status: 'Once',     label: 'Signed in once', def: 'One day, not back since',       color: '#E87020' },
  { status: 'New',      label: 'New',            def: 'Account under 7 days old',      color: '#8E7CC3' },
  { status: 'No login', label: 'No login',       def: 'In the staff directory only',   color: '#E5484D' },
]
// A login with no days in the window isn't one of Matt's groups but must still be counted somewhere.
const INACTIVE = { status: 'Inactive' as Status, label: 'Not in 30 days', def: 'Has a login, not used this month', color: '#8B8D98' }
const STATUS_ORDER: Record<Status, number> = { Daily: 0, Regular: 1, Light: 2, Once: 3, New: 4, Inactive: 5, 'No login': 6 }
const colorFor = (s: Status) => (GROUPS.find((g) => g.status === s) ?? INACTIVE).color
const labelFor = (s: Status) => (GROUPS.find((g) => g.status === s) ?? INACTIVE).label

/**
 * Staff Usage — who uses Polaris, how often and what they get done. The live
 * version of the 16 Oct 2026 usage dashboard. Admins only: the sidebar item is
 * hidden from everyone else, this page sends them home, and the figures come
 * from /api/admin/staff-usage (requireAccess) → admin_staff_usage(), which the
 * database refuses to anyone who isn't a global admin or has_role(admin).
 */
function StaffUsagePage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { allowed, loading: checking } = useIsUsageAdmin()
  const token = session?.access_token ?? ''

  useEffect(() => {
    if (!checking && !allowed) navigate({ to: '/polaris-redesign' })
  }, [checking, allowed, navigate])

  const { data, isLoading, error } = useQuery({
    queryKey: ['staff-usage'],
    enabled: allowed && !!token,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch('/api/admin/staff-usage', { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      return body as Report
    },
  })

  const [q, setQ] = useState('')
  const [group, setGroup] = useState<Status | 'All'>('All')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'days_30', desc: true })

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = (data?.people ?? []).filter((p) =>
      (group === 'All' || p.status === group) &&
      (!needle || [p.person, p.email, p.main_area, labelFor(p.status)].some((v) => (v ?? '').toLowerCase().includes(needle))),
    )
    const dir = sort.desc ? -1 : 1
    const val = (p: Person): number | string => {
      switch (sort.key) {
        case 'status': return STATUS_ORDER[p.status]
        case 'last_active': return p.last_active ? Date.parse(p.last_active) : 0
        case 'person': case 'main_area': case 'email': return (p[sort.key] ?? '').toLowerCase()
        default: return p[sort.key]
      }
    }
    return list.sort((a, b) => {
      const va = val(a), vb = val(b)
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return dir * c || b.hours_30 - a.hours_30 || a.person.localeCompare(b.person)
    })
  }, [data, q, group, sort])

  if (checking || !allowed) return <div style={{ minHeight: '100%' }} />
  if (error) return <Panel><div style={{ padding: 24, color: COLORS.muted, fontSize: 13 }}>Couldn't load staff usage: {(error as Error).message}</div></Panel>
  if (isLoading || !data) return <Panel><div style={{ padding: 32, textAlign: 'center', color: COLORS.steel, fontSize: 12 }}>Loading…</div></Panel>

  const count = (s: Status) => data.people.filter((p) => p.status === s).length
  const withLogin = data.people.filter((p) => p.status !== 'No login').length
  const thisWeek = data.people.filter((p) => p.days_7 > 0).length
  const inactive = count('Inactive')
  const tiles = inactive ? [...GROUPS.slice(0, 5), INACTIVE, GROUPS[5]] : GROUPS
  const weekly = data.weekly.map((w, i) => ({
    ...w,
    label: new Date(w.week + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    partial: i === data.weekly.length - 1,
  }))

  function header(key: SortKey, label: string, numeric = false) {
    const on = sort.key === key
    return (
      <th style={{ ...th, textAlign: numeric ? 'right' : 'left' }}>
        <button
          onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : numeric || key === 'last_active' }))}
          style={{ all: 'unset', cursor: 'pointer', color: on ? COLORS.frost : COLORS.steel }}
        >
          {label}{on ? (sort.desc ? ' ↓' : ' ↑') : ''}
        </button>
      </th>
    )
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0 24px' }}>
      <header>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: COLORS.frost }}>Polaris staff usage</h1>
        <div style={{ fontSize: 12, color: COLORS.steel, marginTop: 2 }}>
          Last 30 days, {fmtDate(data.since)} – {fmtDate(data.generated_at)} · live, updated {fmtTime(data.generated_at)}
        </div>
        <p style={{ fontSize: 14, color: COLORS.muted, margin: '10px 0 0', maxWidth: 820, lineHeight: 1.5 }}>
          <b style={{ color: COLORS.frost }}>{count('Daily')}</b> of <b style={{ color: COLORS.frost }}>{withLogin}</b> staff logins use Polaris most working days,
          and <b style={{ color: COLORS.frost }}>{thisWeek}</b> opened it this week. <b style={{ color: COLORS.frost }}>{count('Once')}</b> signed in once and haven't been back,
          and <b style={{ color: COLORS.frost }}>{count('No login')}</b> people and team mailboxes in the staff directory have no login at all.
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }} aria-label="Staff by how often they use Polaris">
        {tiles.map((g) => {
          const on = group === g.status
          return (
            <button
              key={g.status}
              onClick={() => setGroup(on ? 'All' : g.status)}
              title={on ? 'Show everyone' : `Show only ${g.label}`}
              style={{
                textAlign: 'left', cursor: 'pointer', background: COLORS.abyss, borderRadius: 8, padding: '12px 14px',
                border: `1px solid ${on ? g.color : COLORS.deep}`, boxShadow: on ? `inset 0 0 0 1px ${g.color}` : 'none',
              }}
            >
              <div style={{ fontSize: 12, color: COLORS.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color }} />{g.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.frost, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{count(g.status)}</div>
              <div style={{ fontSize: 11, color: COLORS.steel }}>{g.def}</div>
            </button>
          )
        })}
      </section>

      <Panel>
        <div style={{ padding: '14px 16px 0' }}>
          <h2 style={h2}>Staff using Polaris each week</h2>
          <p style={note}>Staff logins with Polaris open at least once that week, since launch on 22 June. The last bar is this week so far.</p>
        </div>
        <div style={{ height: 250, padding: '4px 8px 8px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 12, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(127,127,127,0.08)' }}
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                labelFormatter={(l: any, p: any) => `Week of ${l}${p?.[0]?.payload?.partial ? ' (so far)' : ''}`}
                formatter={(v: any, _n: any, p: any) => [`${v} staff · ${p?.payload?.hours ?? 0} hours open`, 'Active']}
              />
              <Bar dataKey="staff" radius={[3, 3, 0, 0]}>
                {weekly.map((w) => <Cell key={w.week} fill={COLORS.signal} fillOpacity={w.partial ? 0.55 : 1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel>
        <div style={{ padding: '14px 16px 10px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 320px' }}>
            <h2 style={h2}>Everyone, by person</h2>
            <p style={note}>Click a column to sort; search by name, email or area; click a group above to filter.</p>
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people, emails, areas"
            aria-label="Search people"
            style={{ flex: '0 1 280px', minWidth: 0, fontSize: 13, padding: '7px 10px', borderRadius: 6, border: `1px solid ${COLORS.deep}`, background: 'var(--background)', color: COLORS.frost }}
          />
          {group !== 'All' && (
            <button onClick={() => setGroup('All')} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${COLORS.deep}`, background: 'transparent', color: COLORS.muted }}>
              {labelFor(group)} ✕
            </button>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: COLORS.ocean }}>
                {header('person', 'Person')}
                {header('status', 'Group')}
                {header('days_30', 'Days in (30d)', true)}
                {header('days_7', 'Days this week', true)}
                {header('hours_30', 'Hours open', true)}
                {header('actions_30', 'Actions', true)}
                {header('main_area', 'Main area')}
                {header('last_active', 'Last active', true)}
                {header('email', 'Login')}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.key} style={{ borderTop: `1px solid ${COLORS.deep}` }}>
                  <td style={{ ...td, color: COLORS.frost, fontWeight: 500 }}>{p.person}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', color: COLORS.muted }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: colorFor(p.status) }} />{labelFor(p.status)}
                    </span>
                  </td>
                  <td style={{ ...td, ...num }}>{p.days_30}</td>
                  <td style={{ ...td, ...num }}>{p.days_7}</td>
                  <td style={{ ...td, ...num }}>{p.hours_30}</td>
                  <td style={{ ...td, ...num }}>{p.actions_30.toLocaleString()}</td>
                  <td style={{ ...td, color: COLORS.muted }}>{tidyArea(p.main_area)}</td>
                  <td style={{ ...td, ...num, color: COLORS.muted }}>{p.last_active ? fmtAgo(p.last_active) : '—'}</td>
                  <td style={{ ...td, color: COLORS.steel }}>{p.status === 'No login' ? (p.email ? `${p.email} (no account)` : 'No email on file') : p.email}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: COLORS.steel, padding: 24 }}>Nobody matches.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <div style={{ padding: '14px 16px 16px' }}>
          <h2 style={h2}>How these figures are worked out</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px 24px', margin: '10px 0 0' }}>
            <Def term="Days in">
              Days on which the person had Polaris open. A signed-in session renews about once an hour and each renewal is logged with its time,
              so this holds even for people who never sign out. The last sign-in date isn't used: people stay signed in for months.
              Screens opened{data.tracking_started ? ` (recorded since ${fmtDate(data.tracking_started)})` : ' (now being recorded)'} count too.
            </Def>
            <Def term="Hours open">
              Hours in which Polaris was open. A tab left open in the background counts, so read this as time Polaris was open, not time spent working in it.
            </Def>
            <Def term="Actions">
              Records the person created (crew, sign-ons, visas, permits, parcels, Orbit items, documents, messages and so on) plus changes the audit log puts against their name, in the last 30 days.
              Finance and ShipSync status edits only record who made them from 16 Oct 2026.
            </Def>
            <Def term="Main area">
              The screens they open most once screen tracking has history; until then, where most of their actions are; otherwise their department.
            </Def>
            <Def term="Shared logins">
              Role mailboxes such as support@, info.auh@ and accounts@ can't show which person did the work. Personal logins would make this report and the audit trail exact.
            </Def>
            <Def term="Left out">
              New Horizon IT, test, client-portal captain and guest logins, the itsupport@ system account, and locked-out accounts. Signing out clears a person's
              session history, so weeks long ago can read a little low.
            </Def>
            <Def term="Not a performance score">
              Roles differ: someone who looks things up all day records few actions. Use this to see who has adopted Polaris and who needs help or a login, not to rank people.
            </Def>
          </dl>
        </div>
      </Panel>
    </div>
  )
}

const h2: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 600, color: COLORS.frost }
const note: React.CSSProperties = { margin: '3px 0 0', fontSize: 12, color: COLORS.steel }
const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', userSelect: 'none' }
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' }
const num: React.CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: COLORS.frost }

function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 8, overflow: 'hidden' }}>{children}</div>
}

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt style={{ fontSize: 12, fontWeight: 600, color: COLORS.frost }}>{term}</dt>
      <dd style={{ margin: '2px 0 0', fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>{children}</dd>
    </div>
  )
}

/** Department names and module keys arrive lower-case ("finance", "orbit"). */
function tidyArea(a: string | null): string {
  if (!a) return '—'
  return a.split(', ').map((s) => (s === s.toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s)).join(', ')
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
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
