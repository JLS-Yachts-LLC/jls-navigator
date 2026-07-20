// Service worker: talks to Polaris (host_permissions bypass CORS here) and
// hands PDF bytes to the content script. The extension NEVER sees QuickBooks
// credentials — the upload itself is done by the QBO page's own code.

const VERSION = chrome.runtime.getManifest().version

async function settings() {
  const s = await chrome.storage.sync.get({ baseUrl: 'https://jls-navigator.m-peeters-4a0.workers.dev', token: '', who: '' })
  if (!s.token) throw new Error('Extension not configured — right-click the extension icon → Options and enter the Polaris token.')
  return s
}

async function polaris(path, init) {
  const { baseUrl, token } = await settings()
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...(init || {}),
    headers: { Authorization: `Bearer ${token}`, ...((init && init.headers) || {}) },
  })
  if (!res.ok) {
    let msg = `Polaris responded ${res.status}`
    try { msg = (await res.json()).error || msg } catch { /* keep default */ }
    throw new Error(msg)
  }
  return res
}

async function telemetry(event, message, page) {
  try {
    const { who } = await chrome.storage.sync.get({ who: '' })
    await polaris('/api/qb/profinv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, message, page, name: who || 'unnamed', version: VERSION }),
    })
  } catch { /* telemetry is best-effort */ }
}

chrome.runtime.onInstalled.addListener(() => { telemetry('install') })
chrome.runtime.onStartup?.addListener(() => { telemetry('heartbeat') })

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (msg.action === 'search') {
        telemetry('heartbeat') // cheap "still installed" signal on real use
        const res = await polaris(`/api/qb/profinv?q=${encodeURIComponent(msg.q ?? '')}`)
        sendResponse({ ok: true, ...(await res.json()) })
      } else if (msg.action === 'download') {
        const res = await polaris(`/api/qb/profinv?download=${encodeURIComponent(msg.docNumber)}`)
        const buf = await res.arrayBuffer()
        let bin = ''
        const bytes = new Uint8Array(buf)
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        sendResponse({
          ok: true,
          base64: btoa(bin),
          fileName: res.headers.get('X-Profinv-Filename') || `Prof Inv ${msg.docNumber}.pdf`,
        })
      } else if (msg.action === 'telemetry') {
        await telemetry(msg.event, msg.message, msg.page)
        sendResponse({ ok: true })
      } else {
        sendResponse({ ok: false, error: 'unknown action' })
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) })
    }
  })()
  return true // async response
})
