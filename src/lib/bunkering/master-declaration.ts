/**
 * The Master's declaration for VAT zero-rating of bunkers — JLS's "Declaration for International Transportation" (pursuant to
 * Article 45(7) of Federal Decree-Law No. 8 of 2017 and Article 33 of Cabinet Decision No. 52 of 2017). The Master completes, signs
 * and stamps it, and it is returned to the supplier with the bunker delivery receipt so the supply can be invoiced at zero rate.
 *
 * Here: what the form is pre-filled with from an enquiry (the facts JLS already knows — never the Master's own statements:
 * the category tick, signature, date and ship stamp are always left for the Master).
 */
import { daysBetween } from './model'

export interface DeclarationPrefill {
  shipName: string
  imo: string
  /** Date of bunker supply (the delivery date if it has happened, else the preferred date), YYYY-MM-DD. */
  bunkerDate: string
  portOfSupply: string
  masterName: string
  /** The vessel's planned departure, if known: shown on the form as the next-port hint. Blank when not known. */
  departureDate: string
}

export const DOC_TYPE_MASTER_DECLARATION = 'Master declaration'

/** The enquiry facts the form is pre-filled from. */
export function declarationPrefill(e: {
  yacht_name?: string | null; imo_no?: string | null; preferred_date?: string | null; delivered_date?: string | null
  port?: string | null; berth?: string | null; captain_name?: string | null; departure_date?: string | null
} | null): DeclarationPrefill {
  if (!e) return { shipName: '', imo: '', bunkerDate: '', portOfSupply: '', masterName: '', departureDate: '' }
  return {
    shipName: e.yacht_name ?? '', imo: e.imo_no ?? '', bunkerDate: e.delivered_date ?? e.preferred_date ?? '',
    portOfSupply: [e.port, e.berth].filter(Boolean).join(' — '), masterName: e.captain_name ?? '', departureDate: e.departure_date ?? '',
  }
}

/** "30 Oct 2026" from YYYY-MM-DD ('' when empty or unreadable). */
export function declarationDate(d: string | null | undefined): string {
  if (!d || daysBetween(d, d) === null) return ''
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Has the signed declaration been received? True when a file of the Master declaration type is attached to the enquiry. */
export function declarationReceived(files: Array<{ doc_type: string | null }>): boolean {
  return files.some((f) => f.doc_type === DOC_TYPE_MASTER_DECLARATION)
}
