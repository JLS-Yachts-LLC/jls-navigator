import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSecurityHeaders } from '../src/worker-entry'

// Pure in-memory Headers checks — no network, no database rows are created, so
// there is nothing to clean up. A TEST_-prefixed marker header is used purely
// to prove buildSecurityHeaders() preserves headers a route already set.

test('buildSecurityHeaders sets all 5 low-risk scan headers with the agreed values', () => {
  const headers = buildSecurityHeaders()

  assert.equal(
    headers.get('Content-Security-Policy-Report-Only'),
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://cqzdroabjcdyncfqwawy.supabase.co wss://cqzdroabjcdyncfqwawy.supabase.co; worker-src 'self'; manifest-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
  )
  assert.equal(headers.get('X-Frame-Options'), 'SAMEORIGIN')
  assert.equal(headers.get('Strict-Transport-Security'), 'max-age=63072000')
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(
    headers.get('Permissions-Policy'),
    'microphone=(), payment=(), usb=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=()',
  )
  assert.equal(headers.get('Cache-Control'), 'no-cache, no-store, must-revalidate')
})

test('buildSecurityHeaders does not override a Cache-Control a route already set, and preserves other headers', () => {
  const existing = new Headers()
  existing.set('Cache-Control', 'public, max-age=86400')
  existing.set('X-Test-Marker', 'TEST_security_scan_fixture')

  const headers = buildSecurityHeaders(existing)

  assert.equal(headers.get('Cache-Control'), 'public, max-age=86400')
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(headers.get('X-Frame-Options'), 'SAMEORIGIN')
  assert.equal(headers.get('X-Test-Marker'), 'TEST_security_scan_fixture')
})

test('buildSecurityHeaders never sets an enforcing Content-Security-Policy or COEP/COOP/CORP (left for manual review)', () => {
  const headers = buildSecurityHeaders()

  assert.equal(headers.get('Content-Security-Policy'), null)
  assert.equal(headers.get('Cross-Origin-Embedder-Policy'), null)
  assert.equal(headers.get('Cross-Origin-Opener-Policy'), null)
  assert.equal(headers.get('Cross-Origin-Resource-Policy'), null)
})
