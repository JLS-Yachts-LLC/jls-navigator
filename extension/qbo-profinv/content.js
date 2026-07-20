// Content script: shows an "Attach Prof Inv" button on QuickBooks Sales Order
// pages. On click it finds the matching Polaris Prof Inv (by the customer name
// on the form), fetches the PDF via the background worker, and hands it to the
// page's OWN attachment control (file input or drag-drop zone) — so QuickBooks
// itself performs the upload inside the user's session.
(() => {
  const BTN_ID = 'polaris-profinv-btn'
  const TOAST_ID = 'polaris-profinv-toast'

  // ── UI helpers ───────────────────────────────────────────────────────────────
  function toast(text, kind = 'info', ms = 6000) {
    document.getElementById(TOAST_ID)?.remove()
    const el = document.createElement('div')
    el.id = TOAST_ID
    el.textContent = text
    Object.assign(el.style, {
      position: 'fixed', bottom: '84px', right: '24px', zIndex: 2147483647,
      background: kind === 'error' ? '#7f1d1d' : kind === 'ok' ? '#14532d' : '#1e293b',
      color: '#fff', padding: '10px 16px', borderRadius: '8px',
      font: '13px/1.45 -apple-system, Segoe UI, sans-serif', maxWidth: '420px',
      boxShadow: '0 4px 24px rgba(0,0,0,.35)',
    })
    document.body.appendChild(el)
    if (ms) setTimeout(() => el.remove(), ms)
  }

  // ── Page detection ───────────────────────────────────────────────────────────
  function isSalesOrderPage() {
    const path = location.pathname + location.search
    if (/salesorder/i.test(path)) return true
    // Fallback: header text like "Sales order #1003"
    const h = document.querySelector('h1, [class*="pageTitle"], [data-testid*="title"]')
    return !!h && /sales\s*order\s*#/i.test(h.textContent || '')
  }

  function customerName() {
    // The SO form's "Customer name" combobox input carries the display name.
    const candidates = [
      'input[aria-label*="Customer" i]',
      'input[placeholder*="customer" i]',
      '[data-testid*="customer" i] input',
      'input[name*="customer" i]',
    ]
    for (const sel of candidates) {
      const el = document.querySelector(sel)
      if (el && el.value && el.value.trim()) return el.value.trim()
    }
    return ''
  }

  // ── Attachment control discovery ─────────────────────────────────────────────
  function findFileInput() {
    const inputs = [...document.querySelectorAll('input[type="file"]')]
    if (!inputs.length) return null
    // Prefer one near an "attachment" affordance; else take the first.
    const scored = inputs.map((el) => {
      let node = el, score = 0
      for (let d = 0; d < 6 && node; d++, node = node.parentElement) {
        const t = ((node.className || '') + ' ' + (node.id || '') + ' ' + (node.getAttribute?.('data-testid') || '')).toLowerCase()
        if (t.includes('attach')) { score = 10 - d; break }
      }
      return { el, score }
    }).sort((a, b) => b.score - a.score)
    return scored[0].el
  }

  function findDropZone() {
    // The "Add attachment / Max file size" box.
    const all = [...document.querySelectorAll('div, section, label')]
    return all.find((el) => /add attachment/i.test(el.textContent || '') && el.getBoundingClientRect().height < 220 && el.getBoundingClientRect().height > 20) ?? null
  }

  function deliverFile(file) {
    const dt = new DataTransfer()
    dt.items.add(file)

    const input = findFileInput()
    if (input) {
      input.files = dt.files
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return 'file-input'
    }
    const zone = findDropZone()
    if (zone) {
      for (const type of ['dragenter', 'dragover', 'drop']) {
        zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
      }
      return 'drop-zone'
    }
    return null
  }

  // ── Main flow ────────────────────────────────────────────────────────────────
  let busy = false
  async function attachProfInv() {
    if (busy) return
    busy = true
    const btn = document.getElementById(BTN_ID)
    if (btn) btn.textContent = 'Working…'
    try {
      const client = customerName()
      toast(client ? `Looking up Prof Inv for “${client}”…` : 'Looking up the latest Prof Inv…')

      const search = await chrome.runtime.sendMessage({ action: 'search', q: client })
      if (!search?.ok) throw new Error(search?.error || 'Polaris lookup failed')
      const match = (search.results || [])[0]
      if (!match) throw new Error(client ? `No Prof Inv found for “${client}” — has the quotation been marked Accepted?` : 'No Prof Invs found')

      const dl = await chrome.runtime.sendMessage({ action: 'download', docNumber: match.doc_number })
      if (!dl?.ok) throw new Error(dl?.error || 'PDF download failed')

      const bytes = Uint8Array.from(atob(dl.base64), (c) => c.charCodeAt(0))
      const file = new File([bytes], dl.fileName, { type: 'application/pdf' })

      const via = deliverFile(file)
      if (!via) throw new Error('Could not find the attachment box on this page — scroll it into view and try again')
      toast(`Attaching ${dl.fileName} (via ${via}) — check the Attachments list, then Save.`, 'ok', 9000)
    } catch (e) {
      toast(String((e && e.message) || e), 'error', 10000)
    } finally {
      busy = false
      const b = document.getElementById(BTN_ID)
      if (b) b.textContent = 'Attach Prof Inv'
    }
  }

  // ── Button lifecycle (SPA-safe: re-check on DOM changes) ─────────────────────
  function ensureButton() {
    const want = isSalesOrderPage()
    const existing = document.getElementById(BTN_ID)
    if (!want) { existing?.remove(); return }
    if (existing) return
    const btn = document.createElement('button')
    btn.id = BTN_ID
    btn.textContent = 'Attach Prof Inv'
    Object.assign(btn.style, {
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 2147483646,
      background: '#0f766e', color: '#fff', border: 'none', borderRadius: '999px',
      padding: '12px 20px', font: '600 13px -apple-system, Segoe UI, sans-serif',
      cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,.3)',
    })
    btn.addEventListener('click', attachProfInv)
    document.body.appendChild(btn)
  }

  const mo = new MutationObserver(() => ensureButton())
  mo.observe(document.documentElement, { childList: true, subtree: true })
  ensureButton()
})()
