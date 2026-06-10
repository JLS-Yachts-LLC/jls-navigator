// Polaris — UAE Crew Visa — 10-step process flow data

export interface ProcessStep {
  step:        number
  title:       string
  description: string
  who:         'vessel' | 'team' | 'immigration' | 'crew'
  timing?:     string
}

export const UAE_PROCESS_STEPS: ProcessStep[] = [
  {
    step: 1,
    title: 'Initiate application',
    description: 'Vessel manager opens a new visa application in Polaris, selects the crew member and confirms the passport to be used.',
    who: 'vessel',
  },
  {
    step: 2,
    title: 'Complete application fields',
    description: 'Entry type, visa duration, and sponsor details are filled in. Country-specific fields are validated before proceeding.',
    who: 'vessel',
  },
  {
    step: 3,
    title: 'Upload required documents',
    description: 'Colour passport copy (all pages), white-background passport photo, and crew contract are uploaded to Supabase Storage.',
    who: 'vessel',
  },
  {
    step: 4,
    title: 'Compliance check',
    description: 'Polaris runs automated compliance rules — passport validity (6-month minimum), photo background, and document completeness. Blocking issues must be resolved before submission.',
    who: 'vessel',
    timing: 'Instant',
  },
  {
    step: 5,
    title: 'Submit to our Port & Agency Team',
    description: 'Application is submitted. Our Port & Agency Team receives a notification and takes ownership of the request.',
    who: 'vessel',
    timing: 'Immediate',
  },
  {
    step: 6,
    title: 'Team review & UAE immigration submission',
    description: 'Our Port & Agency Team reviews the application, validates documents, and submits to UAE General Directorate of Residency and Foreigners Affairs (GDRFA).',
    who: 'team',
    timing: '1–2 working days',
  },
  {
    step: 7,
    title: 'UAE immigration processing',
    description: 'GDRFA processes the application. Additional information may be requested via our Port & Agency Team.',
    who: 'immigration',
    timing: '1–3 working days',
  },
  {
    step: 8,
    title: 'Approval & visa issuance',
    description: 'Visa is approved. Our Port & Agency Team uploads the visa document to Polaris and updates the application status to Approved.',
    who: 'team',
  },
  {
    step: 9,
    title: 'Crew travels to UAE',
    description: 'Crew member travels with the approved visa. The UAE visa MUST be approved before the crew member boards any travel.',
    who: 'crew',
  },
  {
    step: 10,
    title: 'Seaport immigration sign-on',
    description: 'On arrival in UAE waters, crew must complete seaport immigration sign-on. A sign-on task is auto-created in Polaris when the visa is approved.',
    who: 'crew',
    timing: 'On arrival',
  },
]

export const UAE_KEY_RULES = [
  'Visa must be approved before crew travels — no exceptions.',
  'Minimum processing time is 1–2 working days. Same-day is not possible.',
  'Passport must be valid for at least 6 months from the application date.',
  'Seaport immigration sign-on is mandatory on arrival in UAE waters.',
  'Seaport immigration sign-off is mandatory before crew departs the UAE.',
  'Do not book flights until visa approval is confirmed in Polaris.',
]

export const UAE_PROCESSING_TIMES: { type: string; timing: string; notes: string }[] = [
  { type: 'Standard',       timing: '3–5 working days', notes: 'Normal processing via GDRFA' },
  { type: 'Express',        timing: '1–2 working days', notes: 'Subject to availability — contact our Port & Agency Team' },
  { type: 'Same-day',       timing: 'Not available',    notes: 'Cannot be guaranteed under any circumstances' },
  { type: 'Weekend / PH',   timing: 'Add 1–2 days',     notes: 'GDRFA does not process on UAE public holidays' },
]
