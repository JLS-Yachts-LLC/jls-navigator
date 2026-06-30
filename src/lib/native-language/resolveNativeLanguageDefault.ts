/**
 * resolveNativeLanguageDefault
 *
 * Implements the four-tier priority chain for defaulting the Native
 * Language field on the Visa Application form:
 *
 *   1. Passport-derived language   (highest priority — verified document data)
 *   2. Last used selection         (authenticated profile or guest cookie)
 *   3. Nationality-derived language (configurable country_language_map)
 *   4. No default                  (placeholder + Popular Languages shown)
 *
 * IMPORTANT — manual override protection:
 *   If the user has previously SAVED a value manually (source = 'manual'),
 *   that takes precedence on subsequent loads of the SAME application —
 *   the resolver never silently replaces a value the user chose themselves.
 *   This function is for INITIAL default resolution only; once a field has
 *   a saved value attached to a specific application, the form layer should
 *   short-circuit and use the saved value directly without calling this.
 *
 * Every resolution is logged via logSelectionResolution() for analytics.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LanguageSource = 'passport' | 'last_used' | 'nationality' | 'none';

export interface ResolvedDefault {
  languageCode: string | null;
  source:       LanguageSource;
  /** Diagnostic detail — which country drove the inference, if any */
  detail?: {
    passportCountry?:    string;
    nationalityCountry?: string;
  };
}

export interface ResolveInput {
  /** Passport country, ISO 3166-1 alpha-2, if a passport has been uploaded and OCR'd successfully */
  passportIssuingCountry?: string | null;

  /** Nationality selected elsewhere in the form, ISO 3166-1 alpha-2 */
  nationalityCountry?: string | null;

  /** Authenticated user ID — if present, last-used lookup hits user_profiles */
  userId?: string | null;

  /** Guest token from cookie — used only if userId is absent */
  guestToken?: string | null;

  /** Optional — pass an existing Supabase client to avoid creating a new one per call */
  supabase?: SupabaseClient;
}

// ─── Supabase client ──────────────────────────────────────────────────────────

function getClient(existing?: SupabaseClient): SupabaseClient {
  if (existing) return existing;
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // server-side only — never expose to client
  );
}

// ─── Tier 1: Passport-derived ─────────────────────────────────────────────────

async function resolveFromPassport(
  supabase: SupabaseClient,
  passportIssuingCountry: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('country_language_map')
    .select('language_code')
    .eq('country_code', passportIssuingCountry.toUpperCase())
    .eq('is_primary', true)
    .maybeSingle();

  if (error) {
    console.error('[resolveNativeLanguageDefault] passport lookup failed:', error.message);
    return null;
  }

  return data?.language_code ?? null;
}

// ─── Tier 2: Last used ────────────────────────────────────────────────────────

async function resolveFromLastUsed(
  supabase: SupabaseClient,
  userId: string | null,
  guestToken: string | null,
): Promise<string | null> {
  if (userId) {
    // user_profiles uses user_id as primary key (not id)
    const { data, error } = await supabase
      .from('user_profiles')
      .select('last_native_language')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[resolveNativeLanguageDefault] user last-used lookup failed:', error.message);
      return null;
    }

    return data?.last_native_language ?? null;
  }

  if (guestToken) {
    const { data, error } = await supabase
      .from('guest_native_language_prefs')
      .select('language_code')
      .eq('guest_token', guestToken)
      .maybeSingle();

    if (error) {
      console.error('[resolveNativeLanguageDefault] guest last-used lookup failed:', error.message);
      return null;
    }

    return data?.language_code ?? null;
  }

  return null;
}

// ─── Tier 3: Nationality-derived ─────────────────────────────────────────────

async function resolveFromNationality(
  supabase: SupabaseClient,
  nationalityCountry: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('country_language_map')
    .select('language_code')
    .eq('country_code', nationalityCountry.toUpperCase())
    .eq('is_primary', true)
    .maybeSingle();

  if (error) {
    console.error('[resolveNativeLanguageDefault] nationality lookup failed:', error.message);
    return null;
  }

  return data?.language_code ?? null;
}

// ─── Analytics logging ────────────────────────────────────────────────────────

interface LogParams {
  userId?:             string | null;
  guestToken?:         string | null;
  applicationId?:      string | null;
  resolvedSource:      LanguageSource | 'manual_override';
  resolvedLanguage:    string | null;
  passportCountry?:    string | null;
  nationalityCountry?: string | null;
}

export async function logSelectionResolution(
  params: LogParams,
  supabase?: SupabaseClient,
): Promise<void> {
  const client = getClient(supabase);

  const { error } = await client.from('native_language_selection_log').insert({
    user_id:             params.userId ?? null,
    guest_token:         params.guestToken ?? null,
    application_id:      params.applicationId ?? null,
    resolved_source:     params.resolvedSource,
    resolved_language:   params.resolvedLanguage,
    passport_country:    params.passportCountry ?? null,
    nationality_country: params.nationalityCountry ?? null,
  });

  if (error) {
    // Logging failures should never block the form — fail silently to console only.
    console.error('[logSelectionResolution] insert failed:', error.message);
  }
}

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolves the default native language using the documented priority chain.
 * Pure read — never writes to last_native_language or the log. Callers
 * should invoke logSelectionResolution() separately once the form has
 * rendered, so the log reflects what the user actually SAW, not just what
 * was computed.
 */
export async function resolveNativeLanguageDefault(
  input: ResolveInput,
): Promise<ResolvedDefault> {
  const supabase = getClient(input.supabase);

  // ── Tier 1: Passport ─────────────────────────────────────────────────────
  if (input.passportIssuingCountry) {
    const lang = await resolveFromPassport(supabase, input.passportIssuingCountry);
    if (lang) {
      return {
        languageCode: lang,
        source:       'passport',
        detail:       { passportCountry: input.passportIssuingCountry },
      };
    }
    // Passport country had no mapping — fall through rather than returning
    // none, since passport presence doesn't guarantee a mapping exists.
  }

  // ── Tier 2: Last used ────────────────────────────────────────────────────
  if (input.userId || input.guestToken) {
    const lang = await resolveFromLastUsed(supabase, input.userId ?? null, input.guestToken ?? null);
    if (lang) {
      return { languageCode: lang, source: 'last_used' };
    }
  }

  // ── Tier 3: Nationality ──────────────────────────────────────────────────
  if (input.nationalityCountry) {
    const lang = await resolveFromNationality(supabase, input.nationalityCountry);
    if (lang) {
      return {
        languageCode: lang,
        source:       'nationality',
        detail:       { nationalityCountry: input.nationalityCountry },
      };
    }
  }

  // ── Tier 4: No default ───────────────────────────────────────────────────
  return { languageCode: null, source: 'none' };
}
