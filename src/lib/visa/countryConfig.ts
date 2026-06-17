// Polaris — Visa Module — Country Configuration
// All country-specific fields and validation rules live here.
// Components NEVER hardcode country logic — they read this config.

export type FieldType = 'text' | 'date' | 'select' | 'boolean' | 'document'

export interface VisaField {
  key:       string
  label:     string
  type:      FieldType
  required:  boolean
  options?:  string[]
  helpText?: string
}

export interface CountryVisaConfig {
  countryCode:       string
  countryName:       string
  flag:              string   // emoji flag
  requiredDocuments: string[]
  fields:            VisaField[]
  validationRules:   string[]
}

export const SUPPORTED_COUNTRIES = ['AE','OM','MV','SA','QA','BH','EG'] as const
export type CountryCode = typeof SUPPORTED_COUNTRIES[number]

export const COUNTRY_CONFIGS: Record<CountryCode, CountryVisaConfig> = {
  AE: {
    countryCode: 'AE',
    countryName: 'UAE',
    flag: '🇦🇪',
    requiredDocuments: [
      'Passport copy (colour, all pages)',
      'Passport photo (white background)',
      'Crew contract or employment letter',
    ],
    fields: [
      { key: 'vessel_name', label: 'Vessel Name', type: 'text', required: true,
        helpText: 'The vessel this visa is allocated to — used on all documents throughout the process' },
    ],
    validationRules: [
      'Passport must be valid for at least 6 months from application date',
      'Passport photo must be on a white background',
      'Crew must enter the UAE within 30 days of visa issuance or the visa expires',
      'Visa validity (180 days) runs from the date of first entry, not from issuance',
    ],
  },
  OM: {
    countryCode: 'OM',
    countryName: 'Oman',
    flag: '🇴🇲',
    requiredDocuments: [
      'Passport copy (colour)',
      'Passport photo',
      'Bank statement (last 3 months)',
      'Hotel / vessel itinerary',
    ],
    fields: [
      { key: 'entry_type',    label: 'Entry Type',    type: 'select', required: true,
        options: ['Tourist', 'Crew', 'Transit'] },
      { key: 'port_of_entry', label: 'Port of Entry', type: 'text',   required: true },
      { key: 'vessel_name',   label: 'Vessel Name',   type: 'text',   required: true },
    ],
    validationRules: [
      'Passport must be valid for at least 6 months',
      'Bank statement must be dated within 90 days of application',
    ],
  },
  MV: {
    countryCode: 'MV',
    countryName: 'Maldives',
    flag: '🇲🇻',
    requiredDocuments: [
      'Passport copy',
      'Passport photo',
      'Confirmed return ticket or vessel schedule',
      'Yellow fever certificate (if applicable)',
    ],
    fields: [
      { key: 'arrival_date',   label: 'Expected Arrival Date',           type: 'date',    required: true },
      { key: 'vessel_details', label: 'Vessel Details',                  type: 'text',    required: true },
      { key: 'yellow_fever',   label: 'Yellow Fever Certificate Required', type: 'boolean', required: false },
    ],
    validationRules: [
      'Passport must be valid for at least 6 months',
      'Crew must have confirmed return/onward travel or vessel schedule',
    ],
  },
  SA: {
    countryCode: 'SA',
    countryName: 'Saudi Arabia',
    flag: '🇸🇦',
    requiredDocuments: [
      'Passport copy (all pages)',
      'Passport photo (white background, no glasses)',
      'Employment contract',
      'Medical certificate',
      'Vaccination record (including COVID, Meningitis)',
    ],
    fields: [
      { key: 'visa_type',     label: 'Visa Type',               type: 'select', required: true,
        options: ['Work Visa', 'Crew Visa', 'Transit'] },
      { key: 'sponsor_id',    label: 'Saudi Sponsor ID',        type: 'text',   required: true },
      { key: 'port_of_entry', label: 'Port of Entry',           type: 'text',   required: true },
      { key: 'medical_cert',  label: 'Medical Certificate Date', type: 'date',   required: true },
    ],
    validationRules: [
      'Passport must have at least 2 blank visa pages',
      'Passport must be valid for at least 6 months',
      'Medical certificate must be dated within 3 months of application',
      'Meningitis vaccination required for all crew',
    ],
  },
  QA: {
    countryCode: 'QA',
    countryName: 'Qatar',
    flag: '🇶🇦',
    requiredDocuments: [
      'Passport copy',
      'Passport photo',
      'Crew letter / employment contract',
      'Vessel clearance documentation',
    ],
    fields: [
      { key: 'entry_type',    label: 'Entry Type',       type: 'select', required: true,
        options: ['Single Entry', 'Multiple Entry'] },
      { key: 'vessel_flag',   label: 'Vessel Flag State', type: 'text',   required: true },
      { key: 'port_of_entry', label: 'Port of Entry',    type: 'text',   required: true },
    ],
    validationRules: [
      'Passport must be valid for at least 6 months',
      'Vessel must have current clearance documentation',
    ],
  },
  BH: {
    countryCode: 'BH',
    countryName: 'Bahrain',
    flag: '🇧🇭',
    requiredDocuments: [
      'Passport copy',
      'Passport photo',
      'Crew contract',
    ],
    fields: [
      { key: 'entry_type',   label: 'Entry Type',       type: 'select', required: true,
        options: ['Single Entry', 'Multiple Entry', 'Transit'] },
      { key: 'vessel_name',  label: 'Vessel Name',      type: 'text',   required: true },
      { key: 'arrival_date', label: 'Expected Arrival', type: 'date',   required: true },
    ],
    validationRules: [
      'Passport must be valid for at least 6 months',
    ],
  },
  EG: {
    countryCode: 'EG',
    countryName: 'Egypt',
    flag: '🇪🇬',
    requiredDocuments: [
      'Passport copy',
      'Passport photo',
      'Crew list (signed by captain)',
      'Vessel documents',
    ],
    fields: [
      { key: 'visa_type',     label: 'Visa Type',     type: 'select', required: true,
        options: ['Crew Visa', 'Tourist', 'Transit'] },
      { key: 'port_of_entry', label: 'Port of Entry', type: 'text',   required: true },
      { key: 'vessel_name',   label: 'Vessel Name',   type: 'text',   required: true },
      { key: 'duration',      label: 'Duration',      type: 'select', required: true,
        options: ['30 days', '90 days'] },
    ],
    validationRules: [
      'Passport must be valid for at least 6 months',
      'Crew list must be signed and dated by the captain',
    ],
  },
}
