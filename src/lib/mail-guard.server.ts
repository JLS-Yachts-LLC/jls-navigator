/**
 * Outbound email guard — blocks mail to clients.
 *
 * Added 2026-08-03 after Exit & Entry permit expiry notices were found going out
 * to client contacts automatically. Every outbound path in Polaris funnels
 * through graph-mail.server.ts, so filtering here covers all of them — permits,
 * visa reports, e-Sign, Anchor forms, ShipSync PODs, movements, seaport,
 * fleet finance, portal invites — including any caller added later.
 *
 * Internal addresses (JLS / New Horizon staff mailboxes) still go through, so
 * staff notifications and alerting keep working. Anything else is dropped and
 * logged, and the send is skipped entirely when no internal recipient remains.
 *
 * TO RE-ENABLE CLIENT EMAIL: set the Cloudflare secret/var
 *   CLIENT_EMAIL_ENABLED = "true"
 * There is deliberately no in-app toggle — re-enabling should be an explicit,
 * deliberate act, not a checkbox someone can trip over.
 */

/** Domains treated as internal — mail to these is never blocked. */
const INTERNAL_DOMAINS = [
  'jlsyachts.com',
  'newhorizon-it.co.uk',
]

export function clientEmailEnabled(): boolean {
  const v = (process.env.CLIENT_EMAIL_ENABLED ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

const domainOf = (addr: string) => String(addr).trim().toLowerCase().split('@')[1] ?? ''

export function isInternalAddress(addr: string): boolean {
  const d = domainOf(addr)
  return !!d && INTERNAL_DOMAINS.some((int) => d === int || d.endsWith(`.${int}`))
}

/** Thrown when a send is blocked outright, so callers never stamp "sent". */
export class ClientEmailDisabledError extends Error {
  constructor(context: string, blocked: string[]) {
    super(
      `Client email is currently disabled, so this message was not sent (${context}). ` +
      `Withheld: ${blocked.join(', ')}. An administrator can re-enable it by setting ` +
      `CLIENT_EMAIL_ENABLED=true on the Worker.`,
    )
    this.name = 'ClientEmailDisabledError'
  }
}

export type GuardResult = {
  /** Recipients that may be sent to. */
  to: string[]
  cc: string[]
  /** Addresses that were withheld. */
  blocked: string[]
  /** True when nothing may be sent — the caller must not call Graph at all. */
  suppressed: boolean
}

/**
 * Filter a recipient list. Returns `suppressed: true` when the whole send must be
 * abandoned (no internal recipient left), so we never deliver a client-facing
 * email to a partial audience by accident.
 */
export function guardRecipients(
  to: (string | null | undefined)[],
  cc: (string | null | undefined)[] = [],
  context = 'email',
): GuardResult {
  const cleanTo = to.filter(Boolean).map(String)
  const cleanCc = cc.filter(Boolean).map(String)

  if (clientEmailEnabled()) {
    return { to: cleanTo, cc: cleanCc, blocked: [], suppressed: cleanTo.length === 0 }
  }

  const keptTo = cleanTo.filter(isInternalAddress)
  const keptCc = cleanCc.filter(isInternalAddress)
  const blocked = [...cleanTo, ...cleanCc].filter((a) => !isInternalAddress(a))

  if (blocked.length) {
    console.warn(
      `[mail-guard] client email is disabled — withheld ${blocked.length} recipient(s) from ${context}: ${blocked.join(', ')}`,
    )
  }
  // No internal recipient left → drop the message rather than send a headless copy.
  const suppressed = keptTo.length === 0
  if (suppressed && cleanTo.length) {
    console.warn(`[mail-guard] SUPPRESSED ${context} entirely (all recipients external)`)
  }
  return { to: keptTo, cc: keptCc, blocked, suppressed }
}
