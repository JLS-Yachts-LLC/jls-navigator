// Content script: shows an "Attach Prof Inv" button on QuickBooks Sales Order
// pages, ANCHORED next to the Attachments box (drag it anywhere to override —
// the position is remembered). On click it finds the matching Polaris Prof Inv
// (by the customer name on the form), fetches the PDF via the background
// worker, and hands it to the page's OWN attachment control — QuickBooks
// itself performs the upload inside the user's session.
(() => {
  const BTN_ID = 'polaris-profinv-btn'
  const TOAST_ID = 'polaris-profinv-toast'

  function report(event, message) {
    try { chrome.runtime.sendMessage({ action: 'telemetry', event, message, page: location.pathname + location.search }) } catch { /* best-effort */ }
  }

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
    const h = document.querySelector('h1, [class*="pageTitle"], [data-testid*="title"]')
    return !!h && /sales\s*order\s*#/i.test(h.textContent || '')
  }

  function customerName() {
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
    const all = [...document.querySelectorAll('div, section, label')]
    return all.find((el) => {
      if (!/add attachment/i.test(el.textContent || '')) return false
      const r = el.getBoundingClientRect()
      return r.height > 20 && r.height < 220 && r.width > 100
    }) ?? null
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
      // Make sure the attachments section is rendered before we hunt for it.
      findDropZone()?.scrollIntoView({ block: 'center', behavior: 'instant' })

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
      toast(`Attaching ${dl.fileName} — check the Attachments list, then Save.`, 'ok', 9000)
      report('attach-ok', `${dl.fileName} via ${via}`)
    } catch (e) {
      const msg = String((e && e.message) || e)
      toast(msg, 'error', 10000)
      report('attach-fail', msg)
    } finally {
      busy = false
      const b = document.getElementById(BTN_ID)
      if (b) b.textContent = 'Attach Prof Inv'
    }
  }

  // ── Button: anchored to the Attachments box, draggable, position remembered ──
  let customPos = null // {x, y} once the user drags it
  chrome.storage.local.get('profinvBtnPos').then((s) => { customPos = s.profinvBtnPos ?? null })

  function positionButton(btn) {
    if (customPos) {
      btn.style.left = `${Math.min(Math.max(customPos.x, 4), window.innerWidth - 150)}px`
      btn.style.top = `${Math.min(Math.max(customPos.y, 4), window.innerHeight - 44)}px`
      btn.style.bottom = ''
      btn.style.right = ''
      return
    }
    const zone = findDropZone()
    if (zone) {
      const r = zone.getBoundingClientRect()
      if (r.bottom > 0 && r.top < window.innerHeight) {
        btn.style.left = `${Math.min(r.right + 14, window.innerWidth - 160)}px`
        btn.style.top = `${r.top + r.height / 2 - 18}px`
        btn.style.bottom = ''
        btn.style.right = ''
        return
      }
    }
    // Fallback: bottom-LEFT (clear of QuickBooks' Save / Review and send).
    btn.style.left = '24px'
    btn.style.top = ''
    btn.style.bottom = '70px'
    btn.style.right = ''
  }

  function makeDraggable(btn) {
    let start = null, moved = false
    btn.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, bx: btn.getBoundingClientRect().left, by: btn.getBoundingClientRect().top }
      moved = false
      btn.setPointerCapture(e.pointerId)
    })
    btn.addEventListener('pointermove', (e) => {
      if (!start) return
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      if (!moved && Math.hypot(dx, dy) < 5) return
      moved = true
      customPos = { x: start.bx + dx, y: start.by + dy }
      positionButton(btn)
    })
    btn.addEventListener('pointerup', (e) => {
      btn.releasePointerCapture(e.pointerId)
      if (moved) {
        chrome.storage.local.set({ profinvBtnPos: customPos })
      } else {
        attachProfInv() // plain click
      }
      start = null
    })
    btn.addEventListener('dblclick', () => {
      // Double-click resets to the anchored position.
      customPos = null
      chrome.storage.local.remove('profinvBtnPos')
      positionButton(btn)
    })
  }

  function ensureButton() {
    const want = isSalesOrderPage()
    const existing = document.getElementById(BTN_ID)
    if (!want) { existing?.remove(); return }
    if (existing) { positionButton(existing); return }
    const btn = document.createElement('button')
    btn.id = BTN_ID
    btn.textContent = 'Attach Prof Inv'
    btn.title = 'Attach the Polaris Prof Inv to this Sales Order. Drag to move; double-click to snap back beside the attachment box.'
    Object.assign(btn.style, {
      position: 'fixed', zIndex: 2147483646, touchAction: 'none',
      background: '#0f766e', color: '#fff', border: 'none', borderRadius: '999px',
      padding: '10px 18px', font: '600 13px -apple-system, Segoe UI, sans-serif',
      cursor: 'grab', boxShadow: '0 4px 20px rgba(0,0,0,.3)', userSelect: 'none',
    })
    makeDraggable(btn)
    document.body.appendChild(btn)
    positionButton(btn)
  }

  const mo = new MutationObserver(() => ensureButton())
  mo.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('scroll', () => { const b = document.getElementById(BTN_ID); if (b) positionButton(b) }, { passive: true, capture: true })
  window.addEventListener('resize', () => { const b = document.getElementById(BTN_ID); if (b) positionButton(b) })
  ensureButton()
})()
