const PERMIT_FILE_LABEL: Record<string, string> = {
  exit_entry: 'Entry-Exit Permit', cruising_mothership: 'Cruising Permit', cruising_tenders: 'Cruising Permit (Tenders)',
  sanitation: 'Sanitation Certificate', navigation_license: 'Navigation Licence', tdra: 'TDRA Licence',
  dma: 'DMA Permit', gate_pass: 'Gate Pass', abu_dhabi: 'Abu Dhabi Permit',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type PermitFileNameInput = {
  permit_type: string
  dma_phase: string | null
  issue_date: string | null
  expiry_date: string | null
}

/**
 * The team's naming, "Madame Gu - Entry Permit - 23Mar2027.pdf" (vessel as its
 * SharePoint folder is named, the permit, its EXPIRY date — SD-0077: the team
 * looks for when a permit or certificate runs out, not when it was issued).
 * Falls back to the issue date, then the date it reached the inbox — the
 * emailed names ("3.pdf") say nothing.
 */
export function permitFileName(vesselFolder: string, p: PermitFileNameInput, fallbackDate: string): string {
  const label = p.permit_type === 'exit_entry' ? `${p.dma_phase === 'Exit' ? 'Exit' : 'Entry'} Permit` : (PERMIT_FILE_LABEL[p.permit_type] ?? 'Permit')
  const iso = p.expiry_date ?? p.issue_date ?? fallbackDate.slice(0, 10)
  const [y, m, d] = iso.split('-')
  return `${vesselFolder} - ${label} - ${d}${MONTHS[Number(m) - 1] ?? m}${y}.pdf`
}
