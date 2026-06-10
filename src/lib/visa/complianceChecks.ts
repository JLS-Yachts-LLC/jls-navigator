import { addMonths } from 'date-fns'
import { COUNTRY_CONFIGS, type CountryCode } from './countryConfig'
import type { CrewPassport } from './crewMatching'

export interface ComplianceResult {
  type:     string
  severity: 'critical' | 'warn' | 'info'
  message:  string
  blocks:   boolean   // true = disables Submit; false = warn only (must acknowledge)
}

/**
 * Run all compliance checks for an application before submission.
 * Returns an array of results. Empty array = all clear.
 *
 * Rules:
 *   blocks: true  → Submit is DISABLED until resolved
 *   blocks: false → Warning shown; user must acknowledge but can still submit
 */
export function runComplianceChecks(
  passport:        CrewPassport,
  countryCode:     string,
  applicationDate: Date = new Date(),
): ComplianceResult[] {
  const results: ComplianceResult[] = []
  const sixMonthsFromNow = addMonths(applicationDate, 6)
  const expiryDate       = new Date(passport.expiry_date)

  // ── Global: passport expiry ───────────────────────────────
  if (expiryDate < sixMonthsFromNow) {
    const daysLeft = Math.ceil(
      (expiryDate.getTime() - applicationDate.getTime()) / 86_400_000,
    )
    results.push({
      type:     'passport_expiry',
      severity: 'critical',
      message:  daysLeft <= 0
        ? `Passport has expired (${passport.expiry_date}). Application cannot proceed.`
        : `Passport expires ${passport.expiry_date} — only ${daysLeft} days remaining. Must be valid for at least 6 months from application date. Application cannot proceed.`,
      blocks: true,
    })
  }

  // ── Country-specific validation rules ────────────────────
  const config = COUNTRY_CONFIGS[countryCode as CountryCode]
  if (config) {
    config.validationRules.forEach(rule => {
      results.push({
        type:     'compliance_block',
        severity: 'warn',
        message:  rule,
        blocks:   false,
      })
    })
  }

  return results
}

/** True if any result hard-blocks submission */
export function hasBlockingIssues(results: ComplianceResult[]): boolean {
  return results.some(r => r.blocks)
}

/** Days until a date (negative = overdue) */
export function daysUntil(dateStr: string): number {
  return Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / 86_400_000,
  )
}
