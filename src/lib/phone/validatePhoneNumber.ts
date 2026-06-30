/**
 * validatePhoneNumber — pure phone validation + formatting helpers.
 *
 * No DB calls, no React. Shared by PhoneNumberField (client, live validation)
 * and persistPhoneSelection (server, authoritative re-check). Rules come from
 * the country_dial_codes table (min/max length + optional local_format_regex),
 * passed in as a CountryValidationRule.
 */

export interface CountryValidationRule {
  countryCode: string;
  dialCode: string;
  minLength: number;
  maxLength: number;
  localFormatRegex?: string | null;
}

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
}

/** Strip everything except digits (the canonical storage form for a local number). */
export function normalizePhoneDigits(input: string): string {
  return (input ?? '').replace(/\D+/g, '');
}

/**
 * Validate a local number against a country's length + optional regex rule.
 * With no rule yet (country not chosen), a non-empty number is treated as
 * provisionally valid so the field doesn't error before a country is picked.
 */
export function validatePhoneNumber(
  localNumber: string,
  rule: CountryValidationRule | null,
): PhoneValidationResult {
  const digits = normalizePhoneDigits(localNumber);
  if (!digits) return { isValid: false, error: 'Enter a phone number' };
  if (!rule) return { isValid: true };

  if (digits.length < rule.minLength || digits.length > rule.maxLength) {
    const range =
      rule.minLength === rule.maxLength
        ? `${rule.minLength} digits`
        : `${rule.minLength}–${rule.maxLength} digits`;
    return { isValid: false, error: `${rule.countryCode} numbers must be ${range}` };
  }

  if (rule.localFormatRegex) {
    let re: RegExp | null = null;
    try {
      re = new RegExp(rule.localFormatRegex);
    } catch {
      re = null; // a bad regex in the table must never hard-block a save
    }
    if (re && !re.test(digits)) {
      return { isValid: false, error: `Not a valid ${rule.countryCode} mobile number` };
    }
  }

  return { isValid: true };
}

/** Light-touch display grouping (groups of 3). Storage stays digits-only. */
export function formatPhoneForDisplay(localNumber: string, _countryCode?: string): string {
  return normalizePhoneDigits(localNumber).replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

/** Full international form, e.g. ('+971', '502747733') -> '+971502747733'. */
export function computeFullInternationalNumber(dialCode: string, localNumber: string): string {
  const digits = normalizePhoneDigits(localNumber);
  const dc = !dialCode ? '' : dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
  return `${dc}${digits}`;
}
