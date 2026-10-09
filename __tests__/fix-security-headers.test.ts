import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { withSecurityHeaders } from '../src/lib/security-headers.server'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

// Pure-function tests: no network, no Supabase, no DB records created or
// cleaned up — withSecurityHeaders only reads/writes HTTP Headers objects.
// Synthetic 'TEST_' bodies are used purely as readable fixtures.

test('withSecurityHeaders sets CSP-Report-Only, COEP, COOP, Permissions-Policy, HSTS and X-Content-Type-Options', () => {
  const original = new Response('<html>TEST_body</html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })

  const result = withSecurityHeaders(original, '/')

  assert.equal(
    result.headers.get('Content-Security-Policy-Report-Only'),
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://cqzdroabjcdyncfqwawy.supabase.co wss://cqzdroabjcdyncfqwawy.supabase.co; worker-src 'self' blob:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  )
  assert.equal(result.headers.get('Cross-Origin-Embedder-Policy'), 'credentialless')
  assert.equal(result.headers.get('Cross-Origin-Opener-Policy'), 'same-origin-allow-popups')
  assert.equal(
    result.headers.get('Permissions-Policy'),
    'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()',
  )
  assert.equal(result.headers.get('Strict-Transport-Security'), 'max-age=15552000')
  assert.equal(result.headers.get('X-Content-Type-Options'), 'nosniff')
})

test("withSecurityHeaders sets Cache-Control: no-cache, no-store, must-revalidate on the '/' document", () => {
  const original = new Response('<html>TEST_body</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
  const result = withSecurityHeaders(original, '/')
  assert.equal(result.headers.get('Cache-Control'), 'no-cache, no-store, must-revalidate')
})

test('withSecurityHeaders leaves Cache-Control untouched for /assets/* (long-lived caching is set declaratively in public/_headers instead)', () => {
  const original = new Response('TEST_asset_body', { status: 200, headers: { 'Content-Type': 'application/javascript' } })
  const result = withSecurityHeaders(original, '/assets/TEST_app.js')

  assert.equal(result.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(result.headers.get('Strict-Transport-Security'), 'max-age=15552000')
  assert.equal(result.headers.get('Cache-Control'), null)
})

test('withSecurityHeaders preserves status, statusText and existing headers', () => {
  const original = new Response('TEST_not_found', { status: 404, statusText: 'Not Found', headers: { 'Content-Type': 'text/plain' } })
  const result = withSecurityHeaders(original, '/TEST_missing')

  assert.equal(result.status, 404)
  assert.equal(result.statusText, 'Not Found')
  assert.equal(result.headers.get('Content-Type'), 'text/plain')
})

test('public/_headers sets long-lived immutable caching plus the scanner-flagged security headers for /assets/*', () => {
  const headersFile = readFileSync(resolve(repoRoot, 'public/_headers'), 'utf8')
  const assetsBlock = headersFile.slice(headersFile.indexOf('/assets/*'), headersFile.indexOf('\n/*'))

  assert.match(assetsBlock, /Cache-Control:\s*public, max-age=31536000, immutable/)
  assert.match(assetsBlock, /Strict-Transport-Security:\s*max-age=15552000/)
  assert.match(assetsBlock, /X-Content-Type-Options:\s*nosniff/)
  assert.match(assetsBlock, /Cross-Origin-Embedder-Policy:\s*credentialless/)
  assert.match(assetsBlock, /Cross-Origin-Opener-Policy:\s*same-origin-allow-popups/)
})

test('public/favicon.svg no longer contains the internal build-path comment flagged as information disclosure', () => {
  const svg = readFileSync(resolve(repoRoot, 'public/favicon.svg'), 'utf8')
  assert.ok(!svg.includes('<!--'), 'favicon.svg should contain no HTML comments')
  assert.ok(svg.includes('<svg'), 'favicon.svg should still be a valid svg document')
})
