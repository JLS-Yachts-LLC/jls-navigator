import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { applySecurityHeaders, SECURITY_HEADERS } from '../src/lib/security-headers.server'

const __dirname = dirname(fileURLToPath(import.meta.url))

// All assertions below run purely in-process against synthetic Response
// objects and a static SVG file already in the repo (public/favicon.svg) — no
// network calls, no Supabase access, no real user data is touched, so there
// is nothing to clean up.

test('applySecurityHeaders: adds the full baseline header set to an HTML response', () => {
  const original = new Response('<html><body>TEST_PAGE</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })

  const result = applySecurityHeaders(original)

  assert.equal(result.status, 200)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(result.headers.get(key), value, `expected header ${key} to be set`)
  }
  assert.equal(
    result.headers.get('Cache-Control'),
    'no-store, must-revalidate',
    'HTML responses must not be cacheable'
  )
})

test('applySecurityHeaders: CSP is Report-Only, not enforced, and keeps the report-uri', () => {
  const original = new Response('TEST_BODY', { headers: { 'Content-Type': 'application/json' } })
  const result = applySecurityHeaders(original)

  assert.equal(result.headers.get('Content-Security-Policy'), null, 'CSP must stay Report-Only (not enforced)')
  const csp = result.headers.get('Content-Security-Policy-Report-Only')
  assert.ok(csp, 'Content-Security-Policy-Report-Only must be set')
  assert.match(csp!, /default-src 'self'/)
  assert.match(csp!, /report-uri \/api\/csp-report/)
})

test('applySecurityHeaders: does not force no-store Cache-Control on non-HTML responses', () => {
  const original = new Response('{"ok":true}', {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
  })
  const result = applySecurityHeaders(original)

  // Security headers are still added…
  assert.equal(result.headers.get('X-Frame-Options'), 'SAMEORIGIN')
  // …but an existing, intentional Cache-Control on a non-HTML response is left alone.
  assert.equal(result.headers.get('Cache-Control'), 'public, max-age=60')
})

test('applySecurityHeaders: preserves existing unrelated headers and the response body', async () => {
  const original = new Response('TEST_BODY_PRESERVED', {
    status: 201,
    headers: { 'Content-Type': 'text/plain', 'X-Test-Marker': 'TEST_KEEP_ME' },
  })
  const result = applySecurityHeaders(original)

  assert.equal(result.status, 201)
  assert.equal(result.headers.get('X-Test-Marker'), 'TEST_KEEP_ME')
  assert.equal(await result.text(), 'TEST_BODY_PRESERVED')
})

test('public/favicon.svg no longer contains the internal build-tooling comment', () => {
  const svgPath = resolve(__dirname, '../public/favicon.svg')
  const content = readFileSync(svgPath, 'utf8')
  assert.ok(!content.includes('<!--'), 'favicon.svg must not contain HTML comments (Information Disclosure finding)')
  assert.ok(content.includes('<svg'), 'favicon.svg must still be a valid SVG')
})

test('public/_headers scopes long-lived immutable caching to /assets/* only, with baseline security headers on /*', () => {
  const headersPath = resolve(__dirname, '../public/_headers')
  const content = readFileSync(headersPath, 'utf8')

  assert.match(content, /^\/\*\s*$/m, 'must define a baseline block for all paths')
  assert.match(content, /X-Frame-Options: SAMEORIGIN/)
  assert.match(content, /X-Content-Type-Options: nosniff/)
  assert.match(content, /Strict-Transport-Security: max-age=15552000/)
  assert.match(content, /Cross-Origin-Resource-Policy: same-origin/)

  assert.match(content, /^\/assets\/\*\s*$/m, 'must scope the long-cache rule to /assets/*')
  assert.match(content, /Cache-Control: public, max-age=31536000, immutable/)

  // The immutable rule must not appear in the catch-all block, i.e. favicon.svg
  // and version.json (served from the root, not /assets/) are unaffected by it.
  const catchAllBlock = content.split('/assets/*')[0]
  assert.ok(
    !catchAllBlock.includes('max-age=31536000'),
    'the root /* block must not carry the immutable long-cache directive'
  )
})
