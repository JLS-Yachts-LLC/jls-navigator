/**
 * resolvePhoneCountryDefault — intelligent country-code default resolver.
 *
 * Priority chain (POLARIS-PHONE-BETA-INTEGRATION.md):
 *   1. last_used        — a prior saved selection for this crew/guest
 *   2. nationality      — crew member's nationality → dial code
 *   3. vessel_location  — vessel's home-port country
 *   4. org_location     — organisation's primary location country
 *   5. none             — nothing to go on; user picks manually
 *
 * The live API route (api.phone.ts) is the authoritative resolver used by the
 * field at runtime; this module exposes the shared source type and a pure
 * resolver usable server-side (e.g. by persistPhoneSelection's analytics).
 */

export type PhoneDefaultSource =
  | 'last_used'
  | 'nationality'
  | 'vessel_location'
  | 'org_location'
  | 'none';

export interface ResolveInput {
  /** ISO country code of a previously saved selection, if any. */
  lastUsedCountry?: string | null;
  /** ISO country code derived from the crew member's nationality, if mappable. */
  nationalityCountry?: string | null;
  /** ISO country code of the vessel's home port. */
  vesselLocationCountry?: string | null;
  /** ISO country code of the organisation's primary location. */
  orgLocationCountry?: string | null;
}

export interface ResolveResult {
  countryCode: string | null;
  source: PhoneDefaultSource;
}

/** Apply the priority chain to whatever context is available. */
export function resolvePhoneCountryDefault(input: ResolveInput): ResolveResult {
  if (input.lastUsedCountry) return { countryCode: input.lastUsedCountry, source: 'last_used' };
  if (input.nationalityCountry) return { countryCode: input.nationalityCountry, source: 'nationality' };
  if (input.vesselLocationCountry) return { countryCode: input.vesselLocationCountry, source: 'vessel_location' };
  if (input.orgLocationCountry) return { countryCode: input.orgLocationCountry, source: 'org_location' };
  return { countryCode: null, source: 'none' };
}
