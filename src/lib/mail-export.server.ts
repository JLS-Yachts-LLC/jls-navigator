/**
 * TEMPORARY one-off utility (Matt's request, 2026-07-13): export every EXTERNAL
 * recipient any staff mailbox has emailed in the last 90 days as CSV
 * (DisplayName, Email — deduped). Uses the Polaris mail Graph app (which now has
 * Mail.Read + User.Read.All application permissions). Safe to delete after use.
 *
 * Bounded for the Worker: caps total Graph subrequests and pages-per-mailbox so
 * a big tenant can't blow the subrequest/CPU budget; sets `capped: true` if it
 * had to stop early.
 */
import { getGraphToken } from '@/lib/sharepoint-sync.server'

const MAIL_TENANT_ID = process.env.MAIL_GRAPH_TENANT_ID ?? '428f2dd0-7a0b-431d-9470-7162111882dd'
const MAIL_CLIENT_ID = process.env.MAIL_GRAPH_CLIENT_ID ?? '4f37ca1a-ddbe-4c80-b409-d8e42ac986fa'
const INTERNAL_DOMAINS = ['jlsyachts.com', 'newhorizon-it.co.uk']

const MAX_SUBREQUESTS = 900      // Worker paid limit is 1000 — leave headroom
const MAX_PAGES_PER_MAILBOX = 15 // 15 × 100 = up to 1500 sent items / mailbox / 90d
const BATCH = 8                  // mailboxes read concurrently

type Recipient = { emailAddress?: { address?: string; name?: string } }
type Message = { toRecipients?: Recipient[]; ccRecipients?: Recipient[]; bccRecipients?: Recipient[] }

export type MailExportResult = { csv: string; count: number; mailboxes: number; capped: boolean }

export async function exportExternalRecipients(days = 90): Promise<MailExportResult> {
  const secret = process.env.MAIL_GRAPH_CLIENT_SECRET ?? process.env.MAIL_GRAPH_CLIENT_SECRE
  if (!secret) throw new Error('MAIL_GRAPH_CLIENT_SECRET is not set')
  const token = await getGraphToken(MAIL_TENANT_ID, MAIL_CLIENT_ID, secret)
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' }

  let subreq = 0
  let capped = false
  const budget = () => subreq < MAX_SUBREQUESTS
  const gget = async (url: string): Promise<any> => {
    subreq++
    const r = await fetch(url, { headers: H })
    if (!r.ok) throw new Error(`Graph ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
    return r.json()
  }

  // 1. Enumerate mail-enabled, active users.
  const users: { id: string; mail: string }[] = []
  let u: string | undefined = 'https://graph.microsoft.com/v1.0/users?$select=id,mail,accountEnabled&$top=999'
  while (u && budget()) {
    const page: any = await gget(u)
    for (const x of page.value ?? []) if (x.mail && x.accountEnabled) users.push({ id: x.id, mail: x.mail })
    u = page['@odata.nextLink']
  }

  const since = new Date(Date.now() - days * 86400000).toISOString().replace(/\.\d+Z$/, 'Z')
  const map = new Map<string, string>() // lowercased email → display name (first seen)

  const scanMailbox = async (usr: { id: string; mail: string }) => {
    let url: string | undefined =
      `https://graph.microsoft.com/v1.0/users/${usr.id}/mailFolders/SentItems/messages` +
      `?$filter=sentDateTime ge ${since}&$select=toRecipients,ccRecipients,bccRecipients&$top=100`
    let pages = 0
    try {
      while (url && pages < MAX_PAGES_PER_MAILBOX && budget()) {
        const page: any = await gget(url)
        for (const m of (page.value ?? []) as Message[]) {
          for (const rcpt of [...(m.toRecipients ?? []), ...(m.ccRecipients ?? []), ...(m.bccRecipients ?? [])]) {
            const addr = rcpt.emailAddress?.address
            if (!addr) continue
            const lower = addr.toLowerCase()
            if (INTERNAL_DOMAINS.includes(lower.split('@').pop() ?? '')) continue
            if (!map.has(lower)) map.set(lower, rcpt.emailAddress?.name ?? '')
          }
        }
        url = page['@odata.nextLink']
        pages++
      }
      if (url) capped = true // more pages remained for this mailbox
    } catch { /* skip mailboxes we can't read (shared/blocked) */ }
  }

  // 2. Read mailboxes in bounded-concurrency batches.
  for (let i = 0; i < users.length && budget(); i += BATCH) {
    await Promise.all(users.slice(i, i + BATCH).map(scanMailbox))
  }
  if (!budget()) capped = true

  // 3. Build CSV (RFC-4180 quoting).
  const esc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const rows = [...map.entries()]
    .map(([email, name]) => ({ name, email }))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
  const csv = ['Display Name,Email', ...rows.map((r) => `${esc(r.name)},${esc(r.email)}`)].join('\r\n')

  return { csv, count: rows.length, mailboxes: users.length, capped }
}
