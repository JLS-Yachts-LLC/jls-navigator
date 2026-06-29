/**
 * Visa ⇄ Spreadsheet Sync — reconcile the app's visa records against the
 * SharePoint Crew Visa Tracker (per-vessel sheets).
 * Route: /crew-immigration/visas/sync
 *
 * Runs the reconcile in vessel chunks (driven by the endpoint's nextOffset) with
 * live progress. Dry-run first (no writes); Apply requires an explicit confirm.
 * Sheets are authoritative on this pull pass ("update the app against the sheets").
 */
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'

export const Route = createFileRoute('/_app/crew-immigration/visas/sync')({
  component: VisaSyncPage,
  head: () => ({ meta: [{ title: 'Visa Spreadsheet Sync — Polaris' }] }),
})

type Totals = { vessels: number; rows: number; matched: number; updated: number; created: number; unchanged: number; fields_changed: number }
const ZERO: Totals = { vessels: 0, rows: 0, matched: 0, updated: 0, created: 0, unchanged: 0, fields_changed: 0 }

type Action = { vessel: string; given: string; surname: string; passport: string; action: string; changes?: Record<string, { from: any; to: any }>; reason?: string }

function VisaSyncPage() {
  const [busy, setBusy] = useState<null | 'dry' | 'apply'>(null)
  const [createMissing, setCreateMissing] = useState(true)
  const [progress, setProgress] = useState(0)
  const [totals, setTotals] = useState<Totals>(ZERO)
  const [sample, setSample] = useState<Action[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<null | 'dry' | 'apply'>(null)

  async function run(apply: boolean) {
    if (apply && !window.confirm(`Apply changes to the app's visa records?\n\nThis updates matched records and ${createMissing ? 'creates missing ones' : 'skips unmatched rows'} from the Crew Visa Tracker. Run a dry-run first if unsure.`)) return
    setBusy(apply ? 'apply' : 'dry'); setError(null); setProgress(0); setTotals(ZERO); setSample([]); setDone(null)
    const agg: Totals = { ...ZERO }
    const firstActions: Action[] = []
    let offset: number | null = 0
    try {
      while (offset != null) {
        const qs = new URLSearchParams({ mode: 'pull-crew', offset: String(offset), limit: '20', create: createMissing ? '1' : '0' })
        if (apply) qs.set('apply', '1')
        const res: Response = await fetch(`/api/visa/excel-sync?${qs.toString()}`)
        const d: any = await res.json()
        if (!res.ok || !d.ok) throw new Error(d.error ?? 'Sync chunk failed')
        const s = d.summary as Totals
        for (const k of Object.keys(agg) as (keyof Totals)[]) agg[k] += (s[k] ?? 0)
        if (firstActions.length < 60) firstActions.push(...(d.actions ?? []).filter((a: Action) => a.action === 'update' || a.action === 'create').slice(0, 60 - firstActions.length))
        setTotals({ ...agg }); setSample([...firstActions])
        setProgress(d.nextOffset ?? agg.vessels)
        offset = d.nextOffset
      }
      setDone(apply ? 'apply' : 'dry')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setBusy(null)
    }
  }

  const card: React.CSSProperties = { background: COLORS.abyss, border: `1px solid var(--border)`, borderRadius: 12, padding: 16 }
  const btn = (variant: 'primary' | 'ghost' | 'danger', disabled?: boolean): React.CSSProperties => ({
    background: variant === 'primary' ? COLORS.signal : variant === 'danger' ? `${COLORS.warn}1a` : COLORS.void,
    border: `1px solid ${variant === 'primary' ? COLORS.signal : variant === 'danger' ? `${COLORS.warn}66` : 'var(--border)'}`,
    borderRadius: 8, padding: '9px 16px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    fontFamily: FONTS.display, fontSize: 13, fontWeight: 600, color: variant === 'primary' ? COLORS.void : variant === 'danger' ? COLORS.warn : COLORS.frost,
  })
  const stat = (label: string, val: number, color: string = COLORS.frost) => (
    <div style={{ ...card, padding: 12, minWidth: 96 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: FONTS.display }}>{val}</div>
      <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLORS.steel, marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px', fontFamily: FONTS.display, color: COLORS.frost }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Visa Spreadsheet Sync</h1>
      <p style={{ fontSize: 13, color: COLORS.muted, marginTop: 6, lineHeight: 1.5 }}>
        Reconciles the app's visa records against the SharePoint <strong>Crew Visa Tracker</strong> (one sheet per vessel).
        Crew are matched by passport (name fallback); status, visa reference, issuance/expiry and sign-on/off/arrival dates are refreshed.
        On this pull the spreadsheet is the source of truth. Always <strong>dry-run</strong> first to preview, then Apply.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '18px 0' }}>
        <button onClick={() => run(false)} disabled={!!busy} style={btn('ghost', !!busy)}>
          {busy === 'dry' ? 'Scanning…' : 'Dry run (preview)'}
        </button>
        <button onClick={() => run(true)} disabled={!!busy} style={btn('primary', !!busy)}>
          {busy === 'apply' ? 'Applying…' : 'Apply to app'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.muted, cursor: 'pointer' }}>
          <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} disabled={!!busy} />
          Create crew missing from the app
        </label>
        {busy && <span style={{ fontSize: 12, color: COLORS.signal }}>· {progress} vessels processed…</span>}
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: `${COLORS.warn}14`, border: `1px solid ${COLORS.warn}40`, fontSize: 12, color: COLORS.warn }}>{error}</div>
      )}
      {done && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: `${COLORS.signal}14`, border: `1px solid ${COLORS.signal}40`, fontSize: 12, color: COLORS.signal }}>
          {done === 'dry' ? 'Dry-run complete — nothing was written. Review below, then Apply.' : 'Applied to the app. Visa records updated/created from the tracker.'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {stat('Vessels', totals.vessels)}
        {stat('Rows', totals.rows)}
        {stat('Matched', totals.matched, COLORS.signal)}
        {stat('Updated', totals.updated, COLORS.signal)}
        {stat('Created', totals.created, '#22c55e')}
        {stat('Unchanged', totals.unchanged, COLORS.steel)}
        {stat('Field changes', totals.fields_changed)}
      </div>

      {sample.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLORS.steel, marginBottom: 10 }}>Sample changes ({sample.length} shown)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sample.map((a, i) => (
              <div key={i} style={{ fontSize: 12, borderBottom: `1px solid var(--border)`, paddingBottom: 8 }}>
                <span style={{ color: a.action === 'create' ? '#22c55e' : COLORS.signal, fontWeight: 700 }}>{a.action === 'create' ? 'NEW' : 'UPD'}</span>{' '}
                <span style={{ color: COLORS.frost }}>{a.given} {a.surname}</span>{' '}
                <span style={{ color: COLORS.steel }}>· {a.vessel} · {a.passport || '—'}</span>
                {a.changes && a.action === 'update' && (
                  <div style={{ color: COLORS.muted, marginTop: 3, paddingLeft: 8 }}>
                    {Object.entries(a.changes).map(([f, c]) => (
                      <span key={f} style={{ marginRight: 12 }}>{f}: <span style={{ color: COLORS.steel }}>{String(c.from ?? '—')}</span> → <span style={{ color: COLORS.frost }}>{String(c.to ?? '—')}</span></span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
