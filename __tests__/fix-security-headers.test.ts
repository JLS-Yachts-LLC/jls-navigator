import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applySecurityHeaders } from '../src/lib/security-headers.server'

// Pure-function tests — no database, no network, no real user data touched.
// Synthetic TEST_ URL paths are used only as inert fixture values.

test('applySecurityHeaders sets the agreed security headers on a document response', async () => {
  const request = new Request('https://polaris.jlsyachts.com/TEST_dashboard')
  const original = new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })

  const result = applySecurityHeaders(request, original)

  assert.equal(result.headers.get('X-Frame-Options'), 'SAMEORIGIN')
  assert.equal(result.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(result.headers.get('Cross-Origin-Resource-Policy'), 'same-origin')
  assert.equal(
    result.headers.get('Permissions-Policy'),
    'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  )
  assert.equal(result.headers.get('Strict-Transport-Security'), 'max-age=63072000')
  assert.ok(result.headers.get('Content-Security-Policy-Report-Only')?.startsWith("default-src 'self'"))
  assert.equal(result.headers.get('Cache-Control'), 'no-store, must-revalidate')
  assert.equal(result.status, 200)
})

test('applySecurityHeaders gives /assets/* a long, immutable Cache-Control', async () => {
  const request = new Request('https://polaris.jlsyachts.com/assets/TEST_index-abc123.js')
  const original = new Response('console.log(1)', { status: 200, headers: { 'Content-Type': 'application/javascript' } })

  const result = applySecurityHeaders(request, original)

  assert.equal(result.headers.get('Cache-Control'), 'public, max-age=31536000, immutable')
  assert.equal(result.headers.get('X-Frame-Options'), 'SAMEORIGIN')
  assert.equal(result.headers.get('Cross-Origin-Resource-Policy'), 'same-origin')
})

test('applySecurityHeaders treats /favicon.svg as a cacheable asset', async () => {
  const request = new Request('https://polaris.jlsyachts.com/favicon.svg')
  const original = new Response('<svg></svg>', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } })

  const result = applySecurityHeaders(request, original)

  assert.equal(result.headers.get('Cache-Control'), 'public, max-age=31536000, immutable')
})

test('applySecurityHeaders never sets an enforcing CSP or COEP/COOP header', async () => {
  const request = new Request('https://polaris.jlsyachts.com/TEST_page')
  const original = new Response('ok', { status: 200 })

  const result = applySecurityHeaders(request, original)

  assert.equal(result.headers.get('Content-Security-Policy'), null)
  assert.equal(result.headers.get('Cross-Origin-Embedder-Policy'), null)
  assert.equal(result.headers.get('Cross-Origin-Opener-Policy'), null)
})

test('applySecurityHeaders preserves status and existing headers', async () => {
  const request = new Request('https://polaris.jlsyachts.com/TEST_api/thing')
  const original = new Response(JSON.stringify({ ok: true }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'X-Test-Marker': 'TEST_keep-me' },
  })

  const result = applySecurityHeaders(request, original)

  assert.equal(result.status, 404)
  assert.equal(result.headers.get('Content-Type'), 'application/json')
  assert.equal(result.headers.get('X-Test-Marker'), 'TEST_keep-me')
})
