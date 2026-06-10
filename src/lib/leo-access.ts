/**
 * Leo Access Levels
 * Controls what operational data Leo has access to when building briefings.
 *
 * Developers have full platform visibility.
 * Access can be extended later via the user_roles table.
 */

export type AccessLevel = 'developer' | 'manager' | 'user' | 'guest'

/**
 * Full-access developer accounts.
 * Tighe Fetton (t.fetton@jlsyachts.com) — access pending, enable once confirmed.
 */
export const DEVELOPER_EMAILS: string[] = [
  'm.peeters@jlsyachts.com',         // Matt Peeters (JLS)
  'mattpeeters@newhorizon-it.co.uk', // Matt Peeters (New Horizon IT)
  'm.fetton@jlsyachts.com',          // Mike Fetton
  // 't.fetton@jlsyachts.com',       // Tighe Fetton — uncomment when access is granted
]

export function getAccessLevel(email?: string | null): AccessLevel {
  if (!email) return 'guest'
  const e = email.toLowerCase().trim()
  if (DEVELOPER_EMAILS.includes(e)) return 'developer'
  // Extend: check user_roles table for 'admin' / 'manager' roles
  return 'user'
}

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  developer: 'Developer · Full Access',
  manager:   'Fleet Manager',
  user:      'Standard User',
  guest:     'Guest',
}

/** Capabilities per level — used to gate what context Leo receives */
export const ACCESS_CAPS: Record<AccessLevel, {
  allVessels: boolean
  permitData: boolean
  crewData:   boolean
  tasksData:  boolean
  ticketsData:boolean
  financials: boolean
  esign:      boolean
}> = {
  developer: {
    allVessels:  true,
    permitData:  true,
    crewData:    true,
    tasksData:   true,
    ticketsData: true,
    financials:  true,
    esign:       true,
  },
  manager: {
    allVessels:  true,
    permitData:  true,
    crewData:    true,
    tasksData:   true,
    ticketsData: false,
    financials:  false,
    esign:       true,
  },
  user: {
    allVessels:  false,
    permitData:  false,
    crewData:    false,
    tasksData:   true,
    ticketsData: false,
    financials:  false,
    esign:       false,
  },
  guest: {
    allVessels:  false,
    permitData:  false,
    crewData:    false,
    tasksData:   false,
    ticketsData: false,
    financials:  false,
    esign:       false,
  },
}
