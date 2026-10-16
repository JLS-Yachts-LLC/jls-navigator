/**
 * Which meaning a Monday status or group name carries: amber = waiting, blue = on its way, green = done, red = a problem,
 * grey = cancelled or unknown. Monday gives every label its own colour whatever it means; ShipSync gives the same words the
 * same colour on Import, Export and Local Packages.
 */
export type SemanticTone = 'amber' | 'blue' | 'green' | 'red' | 'grey'

export function semanticTone(label: string): SemanticTone {
  const t = label.toLowerCase()
  if (/cancel/.test(t)) return 'grey'
  if (/\bhold\b|held|return|refus|problem|delay|fail|reject/.test(t)) return 'red'
  if (/warehouse|office|inspection|approval|new request|pending|waiting/.test(t)) return 'amber'
  if (/deliver|complete|exported|invoic|paid/.test(t) && !/out for|scheduled/.test(t)) return 'green'
  if (/transit|incoming|collected|out for|scheduled|approved|arrived/.test(t)) return 'blue'
  return 'grey'
}
