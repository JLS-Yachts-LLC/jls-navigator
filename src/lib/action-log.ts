/**
 * Lightweight in-memory activity log for the bug-report widget. Keeps the last
 * ~20 user actions (route changes + explicit logs) and the most recent JS error,
 * so a bug report can attach context about what happened just before it.
 * Nothing is persisted until the user submits a report.
 */

type Entry = { t: string; msg: string }

const MAX = 20
const actions: Entry[] = []
let lastError: string | null = null

export function recordAction(msg: string) {
  try {
    actions.push({ t: new Date().toISOString(), msg })
    if (actions.length > MAX) actions.shift()
  } catch { /* never throw from logging */ }
}

export type CapturedLog = {
  url: string
  userAgent: string
  capturedAt: string
  actions: Entry[]
  lastError: string | null
}

export function getCapturedLog(): CapturedLog {
  return {
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    capturedAt: new Date().toISOString(),
    actions: [...actions],
    lastError,
  }
}

// Install global error capture once (browser only).
let installed = false
export function installErrorCapture() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e) => {
    lastError = `${e.message}${e.filename ? ` @ ${e.filename}:${e.lineno}:${e.colno}` : ''}`
    recordAction(`Error: ${e.message}`)
  })
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason)
    lastError = `Unhandled rejection: ${reason}`
    recordAction(`Unhandled rejection: ${reason}`)
  })
}
