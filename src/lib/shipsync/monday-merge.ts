/**
 * The Monday boards (Import, Export, EDAS) are re-pulled every sync. A value someone types into a Monday-sourced cell here must
 * survive that — until Monday itself changes that cell, when Monday's new value wins. The same rule the first-class columns
 * already follow, applied to the verbatim Monday row (extra.monday).
 *
 * To know whether MONDAY changed a cell, a second copy of the row is kept exactly as Monday last sent it (extra.monday_synced);
 * extra.monday is what is shown, and may hold local edits.
 */
type Row = Record<string, string>

/**
 * @param stored      what is stored and shown now (extra.monday — may hold edits made here)
 * @param lastSynced  what Monday sent last time (extra.monday_synced); absent on rows synced before it was kept
 * @param incoming    what Monday sends now
 */
export function mergeMondayRow(stored: Row | undefined, lastSynced: Row | undefined, incoming: Row): Row {
  const have = stored ?? {}
  // A row with no record of the last sync can't tell an edit from Monday's own value: treat what is stored as what Monday sent.
  const was = lastSynced ?? have
  const out: Row = {}
  for (const key of new Set([...Object.keys(have), ...Object.keys(incoming)])) {
    const mondayChanged = (was[key] ?? '') !== (incoming[key] ?? '')
    const value = mondayChanged ? incoming[key] : have[key]
    if (value != null && value !== '') out[key] = value
  }
  return out
}
