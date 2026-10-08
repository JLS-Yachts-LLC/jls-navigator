// Pure unit test for the ConnectSecure 2026-10-08 security-headers remediation.
// Uses Node's built-in test runner (node:test) so no new devDependency is
// required. No Supabase/Cloudflare bindings and no real data are touched —
// only synthetic, TEST_-prefixed in-memory Response objects are used, and
// there is nothing to clean up afterwards (no persisted state is created).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withSecurityHeaders, SECURITY_HEADERS } from '../src/lib/security-headers.server'

test('TEST_security_headers: adds every required header without altering body/status/existing headers', async () => {
  const original = new Response('TEST_BODY_OK', {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })

  const patched = withSecurityHeaders(original)

  // Status/statusText/body preserved
  assert.equal(patched.status, 200)
  assert.equal(patched.statusText, 'OK')
  assert.equal(await patched.text(), 'TEST_BODY_OK')

  // Existing header preserved
  assert.equal(patched.headers.get('Content-Type'), 'text/html; charset=utf-8')

  // Every required security header is present with the exact expected value
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(patched.headers.get(key), value, `expected header ${key} to equal "${value}"`)
  }

  // Explicitly confirm the report-only (not enforcing) CSP variant was used,
  // and that frame-ancestors / X-Frame-Options are both set (defence in depth)
  assert.equal(patched.headers.get('Content-Security-Policy'), null)
  assert.ok(patched.headers.get('Content-Security-Policy-Report-Only')?.includes("frame-ancestors 'self'"))
  assert.equal(patched.headers.get('X-Frame-Options'), 'SAMEORIGIN')

  // Document response must be non-cacheable
  assert.equal(patched.headers.get('Cache-Control'), 'no-store')
})

test('TEST_security_headers: does not mutate the original Response object', async () => {
  const original = new Response('TEST_BODY_404', { status: 404 })
  withSecurityHeaders(original)
  // The original response's headers must be untouched (new Response returned)
  assert.equal(original.headers.get('X-Frame-Options'), null)
  assert.equal(original.headers.get('Strict-Transport-Security'), null)
  assert.equal(original.status, 404)
})

test('TEST_security_headers: preserves non-200 status codes (e.g. redirects/errors)', async () => {
  const original = new Response(null, { status: 302, headers: { Location: 'https://polaris.jlsyachts.com/login' } })
  const patched = withSecurityHeaders(original)
  assert.equal(patched.status, 302)
  assert.equal(patched.headers.get('Location'), 'https://polaris.jlsyachts.com/login')
  assert.equal(patched.headers.get('Strict-Transport-Security'), 'max-age=15552000')
})
