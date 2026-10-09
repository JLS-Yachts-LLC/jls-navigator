import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { COLORS } from '@/lib/tokens'
import { shrinkOldPhotos, SHRINK_ABOVE_BYTES, type ShrinkEvent } from '@/lib/shipsync/shrink-old-photos'

export const Route = createFileRoute('/_app/admin/shrink-photos')({
  component: ShrinkPhotosPage,
  head: () => ({ meta: [{ title: 'Shrink Old Photos — Admin — Polaris' }] }),
})

const mb = (n: number) => (n / 1048576).toFixed(1)

function ShrinkPhotosPage() {
  const [running, setRunning] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [done, setDone] = useState({ shrunk: 0, skipped: 0, failed: 0, before: 0, after: 0 })
  const [problems, setProblems] = useState<string[]>([])
  const [finished, setFinished] = useState(false)
  const stop = useRef(false)

  function onEvent(e: ShrinkEvent) {
    if (e.kind === 'found') { setTotal(e.total); return }
    setDone((d) => e.kind === 'shrunk' ? { ...d, shrunk: d.shrunk + 1, before: d.before + e.before, after: d.after + e.after }
      : e.kind === 'skipped' ? { ...d, skipped: d.skipped + 1 } : { ...d, failed: d.failed + 1 })
    if (e.kind === 'failed') setProblems((p) => [...p, `${e.path}: ${e.error}`].slice(-30))
  }

  async function run() {
    stop.current = false
    setRunning(true); setFinished(false); setProblems([]); setTotal(null)
    setDone({ shrunk: 0, skipped: 0, failed: 0, before: 0, after: 0 })
    try { await shrinkOldPhotos(onEvent, () => stop.current) }
    catch (e) { setProblems((p) => [...p, e instanceof Error ? e.message : String(e)]) }
    setRunning(false); setFinished(true)
  }

  const handled = done.shrunk + done.skipped + done.failed
  const text = { color: COLORS.frost, fontFamily: "'Space Grotesk', sans-serif" } as const

  return (
    <div style={{ ...text, maxWidth: 640, fontSize: 15, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Shrink old photos</h1>
      <p style={{ color: COLORS.muted, marginBottom: 16 }}>
        Item photos over {mb(SHRINK_ABOVE_BYTES)} MB (the September import, 4–9 MB each) are re-saved at review size so the ShipSync lists load fast.
        Each original is first copied to <code>originals/</code> in the same storage folder, and the photo keeps its address, so nothing breaks.
        Keep this page open while it runs. You can stop and start again; photos already done are skipped.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button type="button" disabled={running} onClick={() => void run()}
          style={{ padding: '10px 18px', borderRadius: 6, background: COLORS.signal, color: COLORS.void, fontWeight: 600, border: 0, opacity: running ? 0.5 : 1, cursor: running ? 'default' : 'pointer' }}>
          {running ? 'Working…' : finished ? 'Run again' : 'Start'}
        </button>
        {running && (
          <button type="button" onClick={() => { stop.current = true }}
            style={{ padding: '10px 18px', borderRadius: 6, background: 'transparent', color: COLORS.frost, border: `1px solid ${COLORS.ocean}`, cursor: 'pointer' }}>Stop</button>
        )}
      </div>

      {(running || finished) && (
        <div style={{ background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 8, padding: 16 }}>
          <div>{total === null ? 'Finding photos…' : `${handled} of ${total} checked`}</div>
          <div>Shrunk: <b>{done.shrunk}</b> · Already small / skipped: <b>{done.skipped}</b> · Failed: <b style={{ color: done.failed ? COLORS.error : undefined }}>{done.failed}</b></div>
          <div>Saved so far: <b>{mb(done.before - done.after)} MB</b> ({mb(done.before)} MB → {mb(done.after)} MB)</div>
          {finished && <div style={{ marginTop: 8, color: COLORS.success }}>{stop.current ? 'Stopped.' : 'Finished.'}</div>}
          {problems.length > 0 && (
            <ul style={{ marginTop: 10, color: COLORS.error, fontSize: 14 }}>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  )
}
