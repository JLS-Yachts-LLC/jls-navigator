// Service worker: talks to Polaris (host_permissions bypass CORS here) and
// hands PDF bytes to the content script. The extension NEVER sees QuickBooks
// credentials — the upload itself is done by the QBO page's own code.

async function settings() {
  const s = await chrome.storage.sync.get({ baseUrl: 'https://jls-navigator.m-peeters-4a0.workers.dev', token: '' })
  if (!s.token) throw new Error('Extension not configured — right-click the extension icon → Options and enter the Polaris token.')
  return s
}

async function polaris(path) {
  const { baseUrl, token } = await settings()
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    let msg = `Polaris responded ${res.status}`
    try { msg = (await res.json()).error || msg } catch { /* keep default */ }
    throw new Error(msg)
  }
  return res
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (msg.action === 'search') {
        const res = await polaris(`/api/qb/profinv?q=${encodeURIComponent(msg.q ?? '')}`)
        sendResponse({ ok: true, ...(await res.json()) })
      } else if (msg.action === 'download') {
        const res = await polaris(`/api/qb/profinv?download=${encodeURIComponent(msg.docNumber)}`)
        const buf = await res.arrayBuffer()
        // Chrome messages can't carry ArrayBuffers — base64 it.
        let bin = ''
        const bytes = new Uint8Array(buf)
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        sendResponse({
          ok: true,
          base64: btoa(bin),
          fileName: res.headers.get('X-Profinv-Filename') || `Prof Inv ${msg.docNumber}.pdf`,
        })
      } else {
        sendResponse({ ok: false, error: 'unknown action' })
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) })
    }
  })()
  return true // async response
})
