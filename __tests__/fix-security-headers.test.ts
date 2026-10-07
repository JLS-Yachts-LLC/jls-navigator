import { describe, it, expect } from 'vitest'
import { withSecurityHeaders } from '../src/lib/security-headers.server'

// Pure-function test: no network, no DB, no real user data touched.
// Uses TEST_-prefixed synthetic payloads only; nothing to clean up.
describe('withSecurityHeaders (fix TEST_security-headers)', () => {
  it('adds exactly the 7 approved low-risk headers without altering body/status', async () => {
    const original = new Response(JSON.stringify({ ok: true, test: 'TEST_security_headers_payload' }), {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' },
    })

    const wrapped = withSecurityHeaders(original)

    expect(wrapped.status).toBe(200)
    expect(wrapped.statusText).toBe('OK')
    expect(wrapped.headers.get('Content-Type')).toBe('application/json')

    expect(wrapped.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
    expect(wrapped.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(wrapped.headers.get('Strict-Transport-Security')).toBe('max-age=31536000')
    expect(wrapped.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
    expect(wrapped.headers.get('Permissions-Policy')).toBe(
      'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
    )

    const csp = wrapped.headers.get('Content-Security-Policy-Report-Only')
    expect(csp).toBeTruthy()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain('https://cqzdroabjcdyncfqwawy.supabase.co')
    expect(csp).toContain('wss://cqzdroabjcdyncfqwawy.supabase.co')
    expect(csp).toContain('report-uri /api/csp-report')

    // Confirm we deliberately did NOT set the headers excluded from this fix
    expect(wrapped.headers.get('Cross-Origin-Embedder-Policy')).toBeNull()
    expect(wrapped.headers.get('Cross-Origin-Opener-Policy')).toBeNull()
    expect(wrapped.headers.get('Content-Security-Policy')).toBeNull()

    const body = await wrapped.json()
    expect(body.test).toBe('TEST_security_headers_payload')
  })

  it('does not mutate the original Response object (no shared state across requests)', () => {
    const original = new Response('TEST_body', { status: 201 })
    const wrapped = withSecurityHeaders(original)
    expect(original.headers.get('X-Frame-Options')).toBeNull()
    expect(wrapped.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
    expect(wrapped.status).toBe(201)
  })
})
