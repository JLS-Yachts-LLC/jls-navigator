/**
 * persistPhoneSelection
 *
 * Write-only save path for the phone number field. Called only on
 * explicit form save — never from the resolver, never from a background
 * effect. This separation is what guarantees a user's deliberate country
 * code choice (whether they accepted the suggestion or overrode it) is
 * never silently replaced on a later form load.
 *
 * Writes:
 *   - crew_members.phone_country_code / phone_number (phone_full is
 *     auto-computed by the generated column from migration 025)
 *   - crew_members.phone_default_source — tagged 'manual' if the user
 *     changed the suggested country code, otherwise the originating tier
 *   - guest_phone_country_prefs, if the user is unauthenticated
 *   - phone_country_selection_log — analytics trail
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { PhoneDefaultSource } from './resolvePhoneCountryDefault';
import { validatePhoneNumber, normalizePhoneDigits, type CountryValidationRule } from './validatePhoneNumber';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PersistPhoneInput {
  /** Final selected ISO country code, e.g. 'AE' */
  finalCountryCode: string;

  /** Final local number digits, e.g. '502747733' */
  finalLocalNumber: string;

  /** What the resolver suggested before the user interacted with the field, if anything */
  suggestedCountryCode?: string | null;
  suggestedSource?:      PhoneDefaultSource | null;

  /** Identity — exactly one of these should be present */
  crewMemberId?: string | null;
  guestToken?:   string | null;

  /** Context for the analytics log */
  nationalityCountry?:    string | null;
  vesselLocationCountry?: string | null;

  /** Validation rule for the final country — used to record whether validation passed */
  validationRule?: CountryValidationRule | null;

  supabase?: SupabaseClient;
}

export interface PersistPhoneResult {
  success:          boolean;
  wasOverridden:    boolean;
  validationPassed: boolean;
  validationError?: string;
  error?:           string;
}

// ─── Client helper ─────────────────────────────────────────────────────────────

function getClient(existing?: SupabaseClient): SupabaseClient {
  if (existing) return existing;
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─── Main persistence function ─────────────────────────────────────────────────

export async function persistPhoneSelection(
  input: PersistPhoneInput,
): Promise<PersistPhoneResult> {
  const supabase = getClient(input.supabase);

  // ── Validate before writing — server-side is the authoritative check ──────

  const validation = validatePhoneNumber(input.finalLocalNumber, input.validationRule ?? null);
  if (!validation.isValid) {
    return {
      success:          false,
      wasOverridden:    false,
      validationPassed: false,
      validationError:  validation.error,
      error:            `Validation failed: ${validation.error}`,
    };
  }

  const wasOverridden = Boolean(
    input.suggestedCountryCode &&
    input.suggestedCountryCode !== input.finalCountryCode,
  );

  const sourceToStore: PhoneDefaultSource | 'manual' = wasOverridden
    ? 'manual'
    : (input.suggestedSource ?? 'manual');

  // ── Look up the dial code for the final country (needed for the write) ──

  const { data: dialRow, error: dialError } = await supabase
    .from('country_dial_codes')
    .select('dial_code')
    .eq('country_code', input.finalCountryCode.toUpperCase())
    .maybeSingle();

  if (dialError || !dialRow) {
    return {
      success: false,
      wasOverridden,
      validationPassed: true,
      error: `Unknown country code: ${input.finalCountryCode}`,
    };
  }

  const cleanLocalNumber = normalizePhoneDigits(input.finalLocalNumber);

  // ── Write to the correct identity store ───────────────────────────────────

  if (input.crewMemberId) {
    const { error } = await supabase
      .from('crew_members')
      .update({
        phone_country_code:              dialRow.dial_code,   // e.g. '+971' — matches migration 025 column semantics
        phone_number:                    cleanLocalNumber,
        phone_default_source:            sourceToStore,
        phone_default_source_updated_at: new Date().toISOString(),
      })
      .eq('id', input.crewMemberId);

    if (error) {
      return { success: false, wasOverridden, validationPassed: true, error: error.message };
    }
  } else if (input.guestToken) {
    const { error } = await supabase
      .from('guest_phone_country_prefs')
      .upsert({
        guest_token:  input.guestToken,
        country_code: input.finalCountryCode.toUpperCase(),
        source:       sourceToStore,
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'guest_token' });

    if (error) {
      return { success: false, wasOverridden, validationPassed: true, error: error.message };
    }
  } else {
    return {
      success: false,
      wasOverridden,
      validationPassed: true,
      error: 'persistPhoneSelection requires either crewMemberId or guestToken',
    };
  }

  // ── Log the outcome ────────────────────────────────────────────────────────

  const { error: logError } = await supabase.from('phone_country_selection_log').insert({
    crew_member_id:         input.crewMemberId ?? null,
    guest_token:            input.guestToken ?? null,
    resolved_source:        wasOverridden ? 'manual_override' : (input.suggestedSource ?? 'none'),
    resolved_country_code:  input.suggestedCountryCode ?? null,
    nationality_used:       input.nationalityCountry ?? null,
    vessel_location_used:   input.vesselLocationCountry ?? null,
    was_overridden:         wasOverridden,
    final_country_code:     input.finalCountryCode.toUpperCase(),
    validation_passed:      true,
  });

  if (logError) {
    console.error('[persistPhoneSelection] log insert failed:', logError.message);
  }

  return { success: true, wasOverridden, validationPassed: true };
}

// ─── Guest → authenticated user migration ──────────────────────────────────────

/**
 * Mirrors migrateGuestLanguagePref — call once after a guest completes
 * signup/login to carry their preferred country code over.
 */
export async function migrateGuestPhonePref(
  guestToken: string,
  newCrewMemberId: string,
  supabase?: SupabaseClient,
): Promise<void> {
  const client = getClient(supabase);

  const { data: guestPref, error: fetchError } = await client
    .from('guest_phone_country_prefs')
    .select('country_code, source')
    .eq('guest_token', guestToken)
    .maybeSingle();

  if (fetchError || !guestPref) return;

  const { data: dialRow } = await client
    .from('country_dial_codes')
    .select('dial_code')
    .eq('country_code', guestPref.country_code)
    .maybeSingle();

  if (!dialRow) return;

  await client
    .from('crew_members')
    .update({
      phone_country_code:              dialRow.dial_code,
      phone_default_source:            guestPref.source,
      phone_default_source_updated_at: new Date().toISOString(),
    })
    .eq('id', newCrewMemberId);

  await client
    .from('guest_phone_country_prefs')
    .delete()
    .eq('guest_token', guestToken);
}
