import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { COLORS } from '@/lib/tokens'
import type { ShipSyncCompareResult } from '@/lib/sharepoint-sync.server'

export const Route = createFileRoute('/_app/admin/shipsync-compare')({
  component: ShipSyncComparePage,
  head: () => ({ meta: [{ title: 'Power App vs Polaris — Admin — Polaris' }] }),
})

function ShipSyncComparePage() {
  const { session } = useAuth()
  const token = (session as any)?.access_token ?? ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ShipSyncCompareResult | null>(null)

  async function run() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/admin/shipsync-compare', { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as any)?.error ?? `HTTP ${res.status}`)
      setData(body as ShipSyncCompareResult)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  function download() {
    if (!data) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'powerapp-vs-polaris.json'; a.click(); URL.revokeObjectURL(url)
  }

  const card = { background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 8, padding: 16, marginBottom: 14 } as const
  const th = { textAlign: 'left', padding: '6px 10px', color: COLORS.muted, fontWeight: 600, fontSize: 14 } as const
  const td = { padding: '6px 10px', fontSize: 15, borderTop: `1px solid ${COLORS.deep}` } as const

  return (
    <div style={{ color: COLORS.frost, fontFamily: "'Space Grotesk', sans-serif", maxWidth: 980, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Power App vs Polaris</h1>
      <p style={{ color: COLORS.muted, fontSize: 15, marginBottom: 14 }}>
        Reads the Power App's SharePoint lists (Packages and Delivered Packages) and sets every parcel against what Polaris holds. Read-only. It takes up to a minute.
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button type="button" disabled={busy || !token} onClick={() => void run()}
          style={{ padding: '10px 18px', borderRadius: 6, background: COLORS.signal, color: COLORS.void, fontWeight: 600, border: 0, opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Comparing…' : data ? 'Run again' : 'Run the comparison'}
        </button>
        {data && <button type="button" onClick={download} style={{ padding: '10px 18px', borderRadius: 6, background: 'transparent', color: COLORS.frost, border: `1px solid ${COLORS.ocean}` }}>Download the full result</button>}
      </div>
      {error && <div style={{ ...card, color: COLORS.error }}>{error}</div>}

      {data && (
        <>
          <div style={card}>Polaris holds <b>{data.polarisParcels.toLocaleString()}</b> parcels. Compared {new Date(data.at).toLocaleString()}.</div>

          {data.lists.map((l) => (
            <div key={l.list} style={card}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{l.list}</h2>
              <p style={{ fontSize: 15 }}>
                SharePoint has <b>{l.spItems.toLocaleString()}</b>. In Polaris: <b>{l.inPolaris.toLocaleString()}</b>.
                Not in Polaris: <b style={{ color: l.notInPolaris ? COLORS.warn : COLORS.success }}>{l.notInPolaris.toLocaleString()}</b>.
                With attachments: <b>{l.withAttachments.toLocaleString()}</b>.
              </p>

              <h3 style={{ fontSize: 15, margin: '12px 0 4px', color: COLORS.muted }}>Pictures</h3>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr><th style={th}>Picture</th><th style={th}>In SharePoint</th><th style={th}>Polaris holds</th><th style={th}>SharePoint has, Polaris doesn't</th></tr></thead>
                <tbody>{Object.entries(l.pictures).map(([k, v]) => (
                  <tr key={k}><td style={td}>{k}</td><td style={td}>{v.inSharePoint.toLocaleString()}</td><td style={td}>{v.inPolaris.toLocaleString()}</td><td style={td}>{v.inSharePointNotInPolaris.toLocaleString()}</td></tr>
                ))}</tbody>
              </table>

              <h3 style={{ fontSize: 15, margin: '12px 0 4px', color: COLORS.muted }}>Fields that disagree (parcels in both)</h3>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr><th style={th}>Field</th><th style={th}>Polaris blank</th><th style={th}>Different</th><th style={th}>Example (SharePoint → Polaris)</th></tr></thead>
                <tbody>{Object.entries(l.fieldDifferences).map(([k, v]) => (
                  <tr key={k}><td style={td}>{k}</td><td style={td}>{v.missingInPolaris.toLocaleString()}</td><td style={td}>{v.different.toLocaleString()}</td>
                    <td style={{ ...td, fontSize: 14, color: COLORS.muted }}>{v.samples[0] ? `${v.samples[0].barcode}: ${v.samples[0].sharepoint} → ${v.samples[0].polaris || '(blank)'}` : '—'}</td></tr>
                ))}</tbody>
              </table>

              {l.notInPolarisSample.length > 0 && (
                <>
                  <h3 style={{ fontSize: 15, margin: '12px 0 4px', color: COLORS.muted }}>Some that are not in Polaris</h3>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead><tr><th style={th}>Barcode</th><th style={th}>Vessel</th><th style={th}>Note</th><th style={th}>Status</th></tr></thead>
                    <tbody>{l.notInPolarisSample.map((r, i) => <tr key={i}><td style={td}>{r.barcode}</td><td style={td}>{r.vessel}</td><td style={td}>{r.note}</td><td style={td}>{r.status}</td></tr>)}</tbody>
                  </table>
                </>
              )}
            </div>
          ))}

          <div style={card}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Only in Polaris</h2>
            <p style={{ fontSize: 15 }}>
              <b>{data.polarisOnly.total.toLocaleString()}</b> parcels are in Polaris but in neither SharePoint list.
              By source: {Object.entries(data.polarisOnly.bySource).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}.
              By status: {Object.entries(data.polarisOnly.byStatus).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
