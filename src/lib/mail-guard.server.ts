/**
 * Outbound email guard.
 *
 * Every outbound path in Polaris funnels through graph-mail.server.ts (including
 * ses.server.ts, which delegates to it), so filtering here covers all of them —
 * permits, visa reports, e-Sign, Anchor forms, ShipSync PODs, movements, seaport,
 * fleet finance, portal invites, Service Desk — including any caller added later.
 *
 * TWO SWITCHES, both OFF by default. A send must pass both.
 *
 *   1. EMAIL_ENABLED  — the master switch. While this is off NOTHING is sent, to
 *      anyone, internal or external. Added 2026-08-15 on the MD's instruction
 *      after client vessels received permit notifications: no email of any kind
 *      goes out until each capability is deliberately switched back on.
 *
 *   2. CLIENT_EMAIL_ENABLED — with the master on, this still governs delivery to
 *      addresses outside jlsyachts.com / newhorizon-it.co.uk. Leave it off to run
 *      internal-only (staff alerts work, clients hear nothing).
 *
 * TO RESTORE EMAIL: set EMAIL_ENABLED = "true" on the Worker (internal mail only),
 * then CLIENT_EMAIL_ENABLED = "true" when client-facing mail should resume.
 * There is deliberately no in-app toggle — re-enabling should be an explicit,
 * deliberate act, not a checkbox someone can trip over.
 *
 * NOTE — what this canNOT stop: mail sent by systems outside Polaris. Supabase
 * Auth sends its own password-reset/invite messages, and Power Automate flows on
 * the SharePoint lists email vessels when a list item changes (that is what sent
 * the "<vessel> - TDRA" notices on 2026-08-15, not Polaris). Those must be turned
 * off where they live.
 */

/** Domains treated as internal — never client addresses. */
const INTERNAL_DOMAINS = [
  'jlsyachts.com',
  'newhorizon-it.co.uk',
]

/** Read a boolean env switch. Unset means OFF — email is opt-in, never assumed. */
function envFlag(name: string): boolean {
  const v = (process.env[name] ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

/** Master switch: while false, no email leaves Polaris at all. */
export function outboundEmailEnabled(): boolean {
  return envFlag('EMAIL_ENABLED')
}

export function clientEmailEnabled(): boolean {
  return envFlag('CLIENT_EMAIL_ENABLED')
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
      outboundEmailEnabled()
        ? `Client email is currently disabled, so this message was not sent (${context}). ` +
          `Withheld: ${blocked.join(', ')}. An administrator can re-enable it by setting ` +
          `CLIENT_EMAIL_ENABLED=true on the Worker.`
        : `Outbound email is switched off, so this message was not sent (${context}). ` +
          `Withheld: ${blocked.join(', ')}. An administrator can restore it by setting ` +
          `EMAIL_ENABLED=true on the Worker (and CLIENT_EMAIL_ENABLED=true for client-facing mail).`,
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

  // Master switch: nothing leaves Polaris, to anyone, while this is off.
  if (!outboundEmailEnabled()) {
    const all = [...cleanTo, ...cleanCc]
    if (all.length) {
      console.warn(
        `[mail-guard] outbound email is SWITCHED OFF — suppressed ${context}; ` +
        `withheld ${all.length} recipient(s): ${all.join(', ')}`,
      )
    }
    return { to: [], cc: [], blocked: all, suppressed: true }
  }

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
