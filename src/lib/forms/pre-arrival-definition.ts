/**
 * "Pre-Arrival / Cruising Permit Information" — the digital version of the JLS
 * Yachts PDF of the same name, sent to a yacht before it enters UAE waters.
 *
 * Transcribed field-for-field from the PDF (2 pages) so the digital form and the
 * paper original ask for exactly the same things. Section and field order follow
 * the PDF, which is what the yacht's captain or agent will be reading alongside.
 *
 * This is the seed for the `forms.definition` column — the renderer is generic, so
 * changing the form is a data edit, not a code change.
 */

export type FormFieldType =
  | 'text' | 'textarea' | 'number' | 'date' | 'email' | 'tel' | 'select' | 'checkbox'

export interface FormField {
  key: string
  label: string
  type: FormFieldType
  required?: boolean
  options?: string[]
  help?: string
  /** Layout hint: 'full' spans both columns. */
  width?: 'half' | 'full'
}

export interface FormSection {
  key: string
  title: string
  description?: string
  /** A table the yacht adds rows to (tenders, jet skis…). */
  repeatable?: boolean
  fields: FormField[]
}

const EMIRATES = [
  'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah',
]

const FUEL_TYPES = ['Diesel', 'Petrol / Gasoline', 'Electric', 'Hybrid', 'Other']

export const PRE_ARRIVAL_SECTIONS: FormSection[] = [
  {
    key: 'arrival',
    title: 'Arrival Information',
    fields: [
      { key: 'arrival_date', label: 'Arrival Date', type: 'date', required: true },
      { key: 'last_port_of_call', label: 'Last Port of Call', type: 'text', required: true },
      { key: 'arrival_emirate', label: 'Arrival Emirate', type: 'select', options: EMIRATES, required: true },
      { key: 'arrival_port', label: 'Arrival Port', type: 'text', required: true },
    ],
  },
  {
    key: 'vessel',
    title: 'Vessel Particulars',
    fields: [
      { key: 'vessel_name', label: 'Vessel Name', type: 'text', required: true },
      { key: 'imo_no', label: 'IMO No.', type: 'text' },
      { key: 'vessel_type', label: 'Vessel Type', type: 'text', required: true },
      { key: 'official_no', label: 'Official No.', type: 'text' },
      { key: 'flag', label: 'Flag', type: 'text', required: true },
      { key: 'port_of_registry', label: 'Port of Registry', type: 'text', required: true },
    ],
  },
  {
    key: 'department_heads',
    title: 'Department Heads',
    description: 'The people we will deal with directly while the vessel is in country.',
    fields: [
      { key: 'captain_name', label: "Captain's Name", type: 'text', required: true },
      { key: 'captain_email', label: "Captain's Email Address", type: 'email', required: true },
      { key: 'purser_name', label: 'Purser / Stew Name', type: 'text' },
      { key: 'purser_email', label: 'Purser / Stew Email Address', type: 'email' },
      { key: 'chief_engineer_name', label: 'Chief Engineer / Officer Name', type: 'text' },
      { key: 'chief_engineer_email', label: 'Chief Engineer / Officer Email Address', type: 'email' },
    ],
  },
  {
    key: 'dimensions',
    title: 'Dimensions & Specification',
    fields: [
      { key: 'gross_tonnage', label: 'Gross Tonnage', type: 'number', required: true },
      { key: 'net_tonnage', label: 'Net Tonnage', type: 'number' },
      { key: 'length_overall_m', label: 'Length Overall (m)', type: 'number', required: true },
      { key: 'breadth_m', label: 'Breadth (m)', type: 'number', required: true },
      { key: 'draught_m', label: 'Draught (m)', type: 'number', required: true },
      { key: 'air_draft_m', label: 'Air Draft (m)', type: 'number' },
      { key: 'max_air_draft_m', label: 'Max Air Draft (m)', type: 'number', help: 'Must be accurate — used for bridge and berth clearance.' },
      { key: 'beam_m', label: 'Beam (m)', type: 'number' },
      { key: 'max_forward_draft_m', label: 'Max Forward Draft (m)', type: 'number' },
      { key: 'max_stern_draft_m', label: 'Max Stern Draft (m)', type: 'number' },
      { key: 'dead_weight', label: 'Dead Weight', type: 'number' },
      { key: 'summer_dead_weight', label: 'Summer Dead Weight', type: 'number' },
      { key: 'displacement_tn', label: 'Displacement (tn)', type: 'number' },
      { key: 'main_propulsion_power_kw', label: 'Engine Main Propulsion Power (kW)', type: 'number' },
      { key: 'generators_power_kw', label: 'Sum of all generators power in the vessel (kW)', type: 'number' },
      { key: 'hull_identification_number', label: 'Hull Identification Number', type: 'text' },
      { key: 'engine_serial_number', label: 'Engine Serial Number', type: 'text' },
      { key: 'fuel_type', label: 'Fuel Type', type: 'select', options: FUEL_TYPES },
    ],
  },
  {
    key: 'radio',
    title: 'Radio and Communications',
    fields: [
      { key: 'radio_call_sign', label: 'Radio Call Sign', type: 'text', required: true },
      { key: 'radio_frequency', label: 'Frequency', type: 'text' },
      { key: 'radio_equipment_model', label: 'Equipment Model', type: 'text' },
      { key: 'radio_manufacturer', label: 'Manufacturer', type: 'text' },
      { key: 'radio_serial_no', label: 'Serial No.', type: 'text' },
      { key: 'mmsi', label: 'MMSI', type: 'text', required: true },
    ],
  },
  {
    key: 'manning',
    title: 'Manning and Capacity',
    fields: [
      { key: 'max_crew', label: 'Max. No. of Crew', type: 'number', required: true },
      { key: 'max_guests', label: 'Max. No. of Guests', type: 'number', required: true },
    ],
  },
  {
    key: 'owner',
    title: "Owner's Details",
    fields: [
      { key: 'owner_name', label: "Owner's Name", type: 'text', required: true },
      { key: 'owner_nationality', label: "Owner's Nationality", type: 'text' },
      { key: 'owner_address', label: "Owner's Address", type: 'textarea', width: 'full' },
    ],
  },
  {
    key: 'billing',
    title: 'Billing Information',
    fields: [
      { key: 'billing_company', label: 'Company Name', type: 'text', required: true },
      { key: 'billing_contact_person', label: 'Contact Person', type: 'text', required: true },
      { key: 'billing_email', label: 'Email Address', type: 'email', required: true },
      { key: 'billing_contact_no', label: 'Contact No.', type: 'tel', required: true },
      { key: 'billing_address', label: 'Billing Address', type: 'textarea', width: 'full' },
    ],
  },
  {
    key: 'tenders',
    title: 'Lifeboats, Tenders and other Appurtenances',
    description: 'Including jet skis and water toys. Add a row for each craft.',
    repeatable: true,
    fields: [
      { key: 'manufacturer_model', label: 'Manufacturer Name and Model No.', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'length_m', label: 'Length (m)', type: 'number' },
      { key: 'serial_no', label: 'ID / Serial No.', type: 'text' },
      { key: 'craft_color', label: 'Craft Color', type: 'text' },
      { key: 'fuel_type', label: 'Fuel Type', type: 'select', options: FUEL_TYPES },
      { key: 'year_of_build', label: 'Year of Build', type: 'number' },
    ],
  },
]

/**
 * The document checklist from page 2 of the PDF. Tracked as tick-boxes so the
 * yacht can confirm what they are sending and we can see what is outstanding —
 * the PDF only ever listed them as bullets.
 */
export const PRE_ARRIVAL_DOCUMENTS: FormSection[] = [
  {
    key: 'docs_yacht',
    title: 'Documents required — Yacht',
    fields: [
      'Registry Certificate',
      'Class Certificate (if applicable)',
      "Ship's Radio Station License",
      'Sanitation Certificate',
      'Protection & Indemnity — Insurance',
      'Hull & Machinery — Insurance',
      'Minimum Safe Manning Certificate (if applicable)',
      'Alternatively, any document that reflects the yacht’s crew and passenger capacity',
      'Continuous Synopsis Record (CSR)',
      'Safety Management Certificate (SMC)',
      'Applicable Statutory Certificates as required or requested by authorities',
    ].map((label, i) => ({ key: `doc_yacht_${i + 1}`, label, type: 'checkbox' as const, width: 'full' as const })),
  },
  {
    key: 'docs_tenders',
    title: 'Documents required — Lifeboats, Tenders and Other Appurtenances',
    fields: [
      'Registry Certificate (if individually registered)',
      'Particulars / Specification Sheet',
      'Invoice / Bill of Sale (any proof of ownership)',
      'Insurance',
      'Record of Lifeboats, Tenders and Other Appurtenances Certificate (issued by flag state)',
      'Alternatively, any document proving the lifeboats, tenders and other appurtenances belong to the yacht',
    ].map((label, i) => ({ key: `doc_tender_${i + 1}`, label, type: 'checkbox' as const, width: 'full' as const })),
  },
]

export const PRE_ARRIVAL_DEFINITION: FormSection[] = [...PRE_ARRIVAL_SECTIONS, ...PRE_ARRIVAL_DOCUMENTS]
