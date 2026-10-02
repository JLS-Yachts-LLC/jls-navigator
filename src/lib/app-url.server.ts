/**
 * The public address Polaris lives at: `polaris.jlsyachts.com`.
 *
 * Every link we put in an email — password resets, invites, magic sign-in —
 * has to be built on this and nothing else. The Worker also answers on its
 * `*.workers.dev` address, so deriving the base from the incoming request
 * origin meant an admin who happened to be on the workers.dev URL sent out
 * links pointing at it. Those links work, but they hand the raw hostname to
 * the recipient and bypass the real domain.
 *
 * The env var comes first so the domain can be repointed without a code
 * change; the literal is the fallback. The request origin is deliberately not
 * consulted at all.
 */
export function appBaseUrl(): string {
  return (
    (process.env.VITE_APP_URL as string | undefined) ||
    'https://polaris.jlsyachts.com'
  ).replace(/\/$/, '')
}
