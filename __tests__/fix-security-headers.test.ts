import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applySecurityHeaders } from '../src/lib/security-headers.server'

// Pure unit tests for the new security-headers helper. No network, no
// database, no real user data â all bodies/markers below are synthetic and
// prefixed TEST_ so nothing needs cleanup.

describe('applySecurityHeaders', () => {
  it('sets the baseline security headers and no-store on a document response', () => {
    const original = new Response('<html>TEST_BODY</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })

    const result = applySecurityHeaders(original, { isDocument: true })

    assert.equal(result.status, 200)
    assert.equal(result.headers.get('X-Frame-Options'), 'DENY')
    assert.equal(result.headers.get('X-Content-Type-Options'), 'nosniff')
    assert.equal(result.headers.get('Cross-Origin-Resource-Policy'), 'same-origin')
    assert.equal(result.headers.get('Cross-Origin-Opener-Policy'), 'same-origin-allow-popups')
    assert.equal(result.headers.get('Strict-Transport-Security'), 'max-age=31536000')
    assert.equal(
      result.headers.get('Permissions-Policy'),
      "payment=(), usb=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=(), interest-cohort=()"
    )
    assert.ok(result.headers.get('Content-Security-Policy-Report-Only')?.startsWith("default-src 'self'"))
    assert.ok(result.headers.get('Content-Security-Policy-Report-Only')?.includes('https://cqzdroabjcdyncfqwawy.supabase.co'))
    assert.equal(result.headers.get('Cross-Origin-Embedder-Policy-Report-Only'), 'credentialless')
    assert.equal(result.headers.get('Cache-Control'), 'no-store')
  })

  it('does not force Cache-Control on non-document (asset) responses', () => {
    const original = new Response('TEST_ASSET_CONTENT', {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })

    const result = applySecurityHeaders(original, { isDocument: false })

    assert.equal(result.headers.get('Cache-Control'), 'public, max-age=31536000, immutable')
    assert.equal(result.headers.get('X-Content-Type-Options'), 'nosniff')
    assert.equal(result.headers.get('Cross-Origin-Resource-Policy'), 'same-origin')
  })

  it('preserves existing status, body headers, and defaults isDocument to falsy behaviour when omitted', () => {
    const original = new Response(null, {
      status: 302,
      headers: { Location: 'https://polaris.jlsyachts.com/TEST_login', 'X-Test-Marker': 'TEST_MARKER' },
    })

    const result = applySecurityHeaders(original)

    assert.equal(result.status, 302)
    assert.equal(result.headers.get('Location'), 'https://polaris.jlsyachts.com/TEST_login')
    assert.equal(result.headers.get('X-Test-Marker'), 'TEST_MARKER')
    assert.equal(result.headers.get('X-Frame-Options'), 'DENY')
    assert.equal(result.headers.get('Cache-Control'), null)
  })
})
