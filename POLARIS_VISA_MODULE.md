# Polaris — Visa Module
> Drop this into Claude Code. Build exactly what is described. No assumptions beyond what is written.

---

## 1. What This Module Does

The Visa module manages crew visa applications across multiple countries from within the Polaris platform. It is built on three principles:

1. **Enter once** — crew data is captured once and reused for every future application.
2. **Single master profile** — one crew record per person, matched on Full Name + Date of Birth.
3. **Permission-based access** — satellite offices only see the vessels and crew assigned to them.

---

## 2. Supported Countries

These are the only countries in scope. No others.

| Code | Country      | Default |
|------|--------------|---------|
| `AE` | UAE          | ✅ Yes  |
| `OM` | Oman         | No      |
| `MV` | Maldives     | No      |
| `SA` | Saudi Arabia | No      |
| `QA` | Qatar        | No      |
| `BH` | Bahrain      | No      |
| `EG` | Egypt        | No      |

When creating a new visa application, **UAE is pre-selected by default**. The user can change it before proceeding.

---

## 3. Database Schema

### 3.1 Core Tables

```sql
-- Master crew profile — one record per person
CREATE TABLE crew_members (
  crew_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        TEXT NOT NULL,
  date_of_birth    DATE NOT NULL,
  email            TEXT,
  phone            TEXT,
  position         TEXT,                        -- e.g. Captain, Chef, Deckhand
  multiple_passports BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),

  -- Uniqueness: match on name + DOB, not nationality
  CONSTRAINT crew_unique UNIQUE (full_name, date_of_birth)
);

-- One row per passport — a crew member can have multiple
CREATE TABLE crew_passports (
  passport_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id          UUID NOT NULL REFERENCES crew_members(crew_id) ON DELETE CASCADE,
  nationality      TEXT NOT NULL,               -- ISO 3166-1 alpha-2
  passport_number  TEXT NOT NULL,
  issue_date       DATE NOT NULL,
  expiry_date      DATE NOT NULL,
  issuing_country  TEXT NOT NULL,
  is_primary       BOOLEAN DEFAULT false,        -- primary/default passport
  document_url     TEXT,                         -- stored in Supabase Storage
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Vessels
CREATE TABLE vessels (
  vessel_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_name      TEXT NOT NULL,
  flag_state       TEXT,
  imo_number       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Crew assigned to a vessel (many-to-many)
CREATE TABLE vessel_crew (
  vessel_id        UUID REFERENCES vessels(vessel_id) ON DELETE CASCADE,
  crew_id          UUID REFERENCES crew_members(crew_id) ON DELETE CASCADE,
  role             TEXT,
  joined_at        DATE,
  active           BOOLEAN DEFAULT true,
  PRIMARY KEY (vessel_id, crew_id)
);

-- Visa applications
CREATE TABLE visa_applications (
  application_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id          UUID NOT NULL REFERENCES crew_members(crew_id),
  vessel_id        UUID REFERENCES vessels(vessel_id),
  country_code     TEXT NOT NULL,               -- AE, OM, MV, SA, QA, BH, EG
  passport_id      UUID NOT NULL REFERENCES crew_passports(passport_id),
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN (
                       'draft','pending_docs','submitted',
                       'approved','rejected','cancelled','expired'
                     )),
  applied_at       TIMESTAMPTZ,
  approved_at      TIMESTAMPTZ,
  visa_expiry      DATE,
  visa_number      TEXT,
  visa_document_url TEXT,
  notes            TEXT,
  submitted_by     UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Country-specific field values (flexible key-value for extra fields per country)
CREATE TABLE visa_application_fields (
  field_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   UUID NOT NULL REFERENCES visa_applications(application_id) ON DELETE CASCADE,
  field_key        TEXT NOT NULL,               -- e.g. "sponsor_name", "entry_type"
  field_value      TEXT,
  document_url     TEXT
);

-- Compliance alerts
CREATE TABLE compliance_alerts (
  alert_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id          UUID REFERENCES crew_members(crew_id),
  passport_id      UUID REFERENCES crew_passports(passport_id),
  application_id   UUID REFERENCES visa_applications(application_id),
  alert_type       TEXT NOT NULL CHECK (alert_type IN (
                     'passport_expiry','visa_expiry',
                     'missing_document','compliance_block'
                   )),
  message          TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('info','warn','critical')),
  due_date         DATE,
  resolved         BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 Satellite Office Access Control

```sql
-- Offices / satellite locations
CREATE TABLE offices (
  office_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,               -- e.g. "Saudi Arabia Office"
  country_code     TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Which vessels an office can access
CREATE TABLE office_vessel_access (
  office_id        UUID REFERENCES offices(office_id) ON DELETE CASCADE,
  vessel_id        UUID REFERENCES vessels(vessel_id) ON DELETE CASCADE,
  granted_by       UUID REFERENCES auth.users(id),
  granted_at       TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (office_id, vessel_id)
);

-- Which platform users belong to which office
CREATE TABLE office_members (
  office_id        UUID REFERENCES offices(office_id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('admin','operator','read_only')),
  PRIMARY KEY (office_id, user_id)
);
```

### 3.3 Row-Level Security

```sql
-- Enable RLS on all tables
ALTER TABLE crew_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_passports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE visa_applications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE visa_application_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_alerts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_vessel_access  ENABLE ROW LEVEL SECURITY;

-- Crew member access: user must belong to an office
-- that has access to a vessel the crew member is assigned to
CREATE POLICY "crew_access" ON crew_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vessel_crew vc
      JOIN office_vessel_access ova ON ova.vessel_id = vc.vessel_id
      JOIN office_members om ON om.office_id = ova.office_id
      WHERE vc.crew_id = crew_members.crew_id
        AND om.user_id = auth.uid()
    )
  );

-- Platform owners bypass RLS (set via Supabase custom claims)
-- role = 'platform_owner' gets service role access
```

---

## 4. Country-Specific Field Configuration

Each country has its own required fields and documents. Define this in code as a config object — do not hardcode per-country logic into components.

```ts
// lib/visa/countryConfig.ts

export type FieldType = 'text' | 'date' | 'select' | 'boolean' | 'document';

export interface VisaField {
  key:         string;
  label:       string;
  type:        FieldType;
  required:    boolean;
  options?:    string[];           // for select fields
  helpText?:   string;
}

export interface CountryVisaConfig {
  countryCode:       string;
  countryName:       string;
  requiredDocuments: string[];     // document labels the user must upload
  fields:            VisaField[];  // country-specific form fields
  validationRules:   string[];     // plain-English rules checked before submit
}

export const COUNTRY_CONFIGS: Record<string, CountryVisaConfig> = {
  AE: {
    countryCode: 'AE',
    countryName: 'UAE',
    requiredDocuments: [
      'Passport copy (colour, all pages)',
      'Passport photo (white background)',
      'Crew contract or employment letter',
    ],
    fields: [
      { key: 'entry_type',    label: 'Entry Type',    type: 'select',  required: true,
        options: ['Single Entry', 'Multiple Entry'] },
      { key: 'visa_duration', label: 'Visa Duration', type: 'select',  required: true,
        options: ['30 days', '60 days', '90 days'] },
      { key: 'sponsor_name',  label: 'Sponsor Name',  type: 'text',    required: true,
        helpText: 'Name of UAE sponsor / vessel owner or company' },
    ],
    validationRules: [
      'Passport must be valid for at least 6 months from application date',
      'Passport photo must be on a white background',
    ],
  },

  OM: {
    countryCode: 'OM',
    countryName: 'Oman',
    requiredDocuments: [
      'Passport copy (colour)',
      'Passport photo',
      'Bank statement (last 3 months)',
      'Hotel / vessel itinerary',
    ],
    fields: [
      { key: 'entry_type',    label: 'Entry Type',    type: 'select',  required: true,
        options: ['Tourist', 'Crew', 'Transit'] },
      { key: 'port_of_entry', label: 'Port of Entry', type: 'text',    required: true },
      { key: 'vessel_name',   label: 'Vessel Name',   type: 'text',    required: true },
    ],
    validationRules: [
      'Passport must be valid for at least 6 months',
      'Bank statement must be dated within 90 days of application',
    ],
  },

  MV: {
    countryCode: 'MV',
    countryName: 'Maldives',
    requiredDocuments: [
      'Passport copy',
      'Passport photo',
      'Confirmed return ticket or vessel schedule',
      'Yellow fever certificate (if applicable)',
    ],
    fields: [
      { key: 'arrival_date',   label: 'Expected Arrival Date', type: 'date',    required: true },
      { key: 'vessel_details', label: 'Vessel Details',        type: 'text',    required: true },
      { key: 'yellow_fever',   label: 'Yellow Fever Certificate Required',
        type: 'boolean', required: false },
    ],
    validationRules: [
      'Passport must be valid for at least 6 months',
      'Crew must have confirmed return/onward travel or vessel schedule',
    ],
  },

  SA: {
    countryCode: 'SA',
    countryName: 'Saudi Arabia',
    requiredDocuments: [
      'Passport copy (all pages)',
      'Passport photo (white background, no glasses)',
      'Employment contract',
      'Medical certificate',
      'Vaccination record (including COVID, Meningitis)',
    ],
    fields: [
      { key: 'visa_type',       label: 'Visa Type',         type: 'select', required: true,
        options: ['Work Visa', 'Crew Visa', 'Transit'] },
      { key: 'sponsor_id',      label: 'Saudi Sponsor ID',  type: 'text',   required: true },
      { key: 'port_of_entry',   label: 'Port of Entry',     type: 'text',   required: true },
      { key: 'medical_cert',    label: 'Medical Certificate Date', type: 'date', required: true },
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
    requiredDocuments: [
      'Passport copy',
      'Passport photo',
      'Crew letter / employment contract',
      'Vessel clearance documentation',
    ],
    fields: [
      { key: 'entry_type',    label: 'Entry Type',    type: 'select', required: true,
        options: ['Single Entry', 'Multiple Entry'] },
      { key: 'vessel_flag',   label: 'Vessel Flag State', type: 'text', required: true },
      { key: 'port_of_entry', label: 'Port of Entry',     type: 'text', required: true },
    ],
    validationRules: [
      'Passport must be valid for at least 6 months',
      'Vessel must have current clearance documentation',
    ],
  },

  BH: {
    countryCode: 'BH',
    countryName: 'Bahrain',
    requiredDocuments: [
      'Passport copy',
      'Passport photo',
      'Crew contract',
    ],
    fields: [
      { key: 'entry_type',    label: 'Entry Type',    type: 'select', required: true,
        options: ['Single Entry', 'Multiple Entry', 'Transit'] },
      { key: 'vessel_name',   label: 'Vessel Name',   type: 'text',   required: true },
      { key: 'arrival_date',  label: 'Expected Arrival', type: 'date', required: true },
    ],
    validationRules: [
      'Passport must be valid for at least 6 months',
    ],
  },

  EG: {
    countryCode: 'EG',
    countryName: 'Egypt',
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
};
```

---

## 5. Crew Profile — Enter Once Logic

### 5.1 Matching Rule

Before creating a new crew record, always check for an existing match:

```ts
// lib/visa/crewMatching.ts

export async function findOrPromptCrewMatch(
  fullName: string,
  dateOfBirth: string   // ISO date string
): Promise<CrewMember | null> {
  const { data } = await supabase
    .from('crew_members')
    .select('*')
    .ilike('full_name', fullName.trim())
    .eq('date_of_birth', dateOfBirth);

  return data?.[0] ?? null;
}
```

**UI behaviour when a match is found:**
- Show a confirmation card: "We found an existing profile for [Name] — DOB [date]. Use this profile?"
- If confirmed → load existing profile and passports. Do not create a duplicate.
- If rejected → allow creation of new profile (capture a reason note for audit).

**Do not match on nationality alone.** Crew hold multiple passports. Nationality is not a unique identifier.

### 5.2 Multiple Passport Flow

When creating or editing a crew profile, always ask:

> "Does this person hold more than one passport?"

- If **Yes** → show "Add passport" repeater. Capture all passports. Allow user to mark one as primary.
- If **No** → show single passport form.

Each passport entry captures:
- Nationality
- Passport number
- Issue date
- Expiry date
- Issuing country
- Document upload (scan/photo)

When creating a visa application, the user must **explicitly select which passport to use** for that application. Do not assume the primary passport is always correct — different countries may require travel under a specific nationality.

---

## 6. New Visa Application — Step Flow

Build this as a multi-step form. Each step must validate before proceeding to the next.

```
Step 1 → Select Country          (default: UAE)
Step 2 → Find or Create Crew     (match on Name + DOB)
Step 3 → Select Passport         (choose which passport for this application)
Step 4 → Country-Specific Fields (render from COUNTRY_CONFIGS[countryCode].fields)
Step 5 → Document Upload         (render from COUNTRY_CONFIGS[countryCode].requiredDocuments)
Step 6 → Compliance Check        (run validation rules before allowing submit)
Step 7 → Review & Submit
```

### Step 6 — Compliance Check Detail

Before the user can submit, run all `validationRules` for the selected country plus these global checks:

```ts
export function runComplianceChecks(
  passport: CrewPassport,
  countryCode: string,
  applicationDate: Date = new Date()
): ComplianceResult[] {

  const results: ComplianceResult[] = [];
  const sixMonthsFromNow = addMonths(applicationDate, 6);

  // Global: passport expiry
  if (new Date(passport.expiry_date) < sixMonthsFromNow) {
    results.push({
      type:     'passport_expiry',
      severity: 'critical',
      message:  `Passport expires ${passport.expiry_date} — must be valid for at least 6 months from application date. Application cannot proceed.`,
      blocks:   true,
    });
  }

  // Country-specific rules from config
  const config = COUNTRY_CONFIGS[countryCode];
  config.validationRules.forEach(rule => {
    results.push({
      type:     'compliance_block',
      severity: 'warn',
      message:  rule,
      blocks:   false,    // warn but don't hard-block (operator can override with note)
    });
  });

  return results;
}
```

**Blocking vs warning:**
- `blocks: true` → the Submit button is disabled. The user cannot proceed until the issue is resolved.
- `blocks: false` → a warning is shown. The user must acknowledge it but can still submit.

---

## 7. Automated Compliance Monitoring

Run these checks on a scheduled job (daily, server-side) and write results to `compliance_alerts`.

```ts
// lib/visa/complianceMonitor.ts

export async function runDailyComplianceChecks() {
  const today = new Date();
  const sixMonthsOut = addMonths(today, 6);
  const thirtyDaysOut = addDays(today, 30);

  // 1. Passport expiry — flag any passport expiring within 6 months
  const { data: expiringPassports } = await supabase
    .from('crew_passports')
    .select('*, crew_members(full_name)')
    .lte('expiry_date', sixMonthsOut.toISOString().split('T')[0])
    .gte('expiry_date', today.toISOString().split('T')[0]);

  for (const p of expiringPassports ?? []) {
    await upsertAlert({
      crew_id:     p.crew_id,
      passport_id: p.passport_id,
      alert_type:  'passport_expiry',
      severity:    daysUntil(p.expiry_date) <= 30 ? 'critical' : 'warn',
      message:     `Passport ${p.passport_number} for ${p.crew_members.full_name} expires ${p.expiry_date}`,
      due_date:    p.expiry_date,
    });
  }

  // 2. Visa expiry — flag any visa expiring within 30 days
  const { data: expiringVisas } = await supabase
    .from('visa_applications')
    .select('*, crew_members(full_name)')
    .eq('status', 'approved')
    .lte('visa_expiry', thirtyDaysOut.toISOString().split('T')[0])
    .gte('visa_expiry', today.toISOString().split('T')[0]);

  for (const v of expiringVisas ?? []) {
    await upsertAlert({
      crew_id:        v.crew_id,
      application_id: v.application_id,
      alert_type:     'visa_expiry',
      severity:       daysUntil(v.visa_expiry) <= 7 ? 'critical' : 'warn',
      message:        `${v.country_code} visa for ${v.crew_members.full_name} expires ${v.visa_expiry}`,
      due_date:       v.visa_expiry,
    });
  }

  // 3. Missing documents — applications in 'pending_docs' status for > 3 days
  const { data: staleDocs } = await supabase
    .from('visa_applications')
    .select('*, crew_members(full_name)')
    .eq('status', 'pending_docs')
    .lte('updated_at', subDays(today, 3).toISOString());

  for (const a of staleDocs ?? []) {
    await upsertAlert({
      crew_id:        a.crew_id,
      application_id: a.application_id,
      alert_type:     'missing_document',
      severity:       'warn',
      message:        `Documents pending for ${a.crew_members.full_name} (${a.country_code} visa) — stale for 3+ days`,
      due_date:       null,
    });
  }
}
```

---

## 8. Satellite Office Access Model

An admin grants an office access to specific vessels. Users in that office can then see crew and visa data only for those vessels.

### 8.1 Granting Access (Admin UI)

```
Admin panel → Offices → [Select Office] → Vessel Access → Add Vessel
```

This writes a row to `office_vessel_access`. No other mechanism should grant vessel access.

### 8.2 What Office Users Can See

Once access is granted, users in that office can:
- View crew profiles assigned to their accessible vessels
- View and create visa applications for those crew members
- Upload documents for those applications
- See compliance alerts for those crew members

Office users **cannot**:
- See crew assigned to vessels they do not have access to
- Access other offices' data
- Grant vessel access to other offices (admin only)
- Delete crew profiles (admin only)

### 8.3 Permission Matrix

| Action                        | platform_owner | office_admin | office_operator | read_only |
|-------------------------------|:--------------:|:------------:|:---------------:|:---------:|
| View crew profiles            | ✅             | ✅ (vessel-scoped) | ✅ (vessel-scoped) | ✅ |
| Create / edit crew profile    | ✅             | ✅           | ✅              | ❌        |
| Create visa application       | ✅             | ✅           | ✅              | ❌        |
| Upload documents              | ✅             | ✅           | ✅              | ❌        |
| Submit visa application       | ✅             | ✅           | ✅              | ❌        |
| Grant vessel access to office | ✅             | ❌           | ❌              | ❌        |
| Delete crew profile           | ✅             | ❌           | ❌              | ❌        |
| View compliance alerts        | ✅             | ✅           | ✅              | ✅        |
| Resolve compliance alerts     | ✅             | ✅           | ❌              | ❌        |

---

## 9. Leo Integration

Leo surfaces visa compliance alerts at login. Add the following to the context assembly in `lib/leo/assembleContext.ts`:

```ts
// Add to fetchLeoContext()
const visaAlerts = await supabase
  .from('compliance_alerts')
  .select('*, crew_members(full_name), crew_passports(passport_number, expiry_date)')
  .eq('resolved', false)
  .in('severity', ['warn', 'critical'])
  .order('due_date', { ascending: true })
  .limit(5);

// Add to LeoContext payload
visa_compliance: (visaAlerts.data ?? []).map(a => ({
  type:     a.alert_type,
  severity: a.severity,
  message:  a.message,
  due_date: a.due_date,
  crew:     a.crew_members?.full_name ?? null,
}))
```

**Add to Leo system prompt** (in `buildSystemPrompt`):

```
VISA & COMPLIANCE ALERTS:
If visa_compliance contains any critical items, surface the most urgent one in the briefing.
Name the crew member and the expiry date. Be specific.
Example: "Ahmed Al Rashidi's UAE visa expires in 4 days — renewal has not been initiated."
Do not list every alert. Prioritise critical over warn. One alert maximum in the briefing prose.
```

---

## 10. File Structure for This Module

```
components/
  visa/
    NewApplicationWizard.tsx    # 7-step form (section 6)
    StepCountrySelect.tsx       # Step 1
    StepCrewSearch.tsx          # Step 2 — search + match logic
    StepPassportSelect.tsx      # Step 3
    StepCountryFields.tsx       # Step 4 — dynamic from countryConfig
    StepDocumentUpload.tsx      # Step 5
    StepComplianceCheck.tsx     # Step 6
    StepReviewSubmit.tsx        # Step 7
    CrewProfileCard.tsx         # Reusable crew summary card
    PassportBadge.tsx           # Compact passport display (nationality flag + expiry)
    ComplianceAlertBanner.tsx   # Alert display with severity styling
    MultiPassportForm.tsx       # Add/edit multiple passports on a crew profile

app/
  dashboard/
    visa/
      page.tsx                  # Visa dashboard — list of applications + alerts
      new/
        page.tsx                # Wizard entry point
      crew/
        [crewId]/
          page.tsx              # Individual crew profile + passport list + application history
      offices/
        page.tsx                # Admin: manage offices and vessel access

lib/
  visa/
    countryConfig.ts            # COUNTRY_CONFIGS object (section 4)
    crewMatching.ts             # findOrPromptCrewMatch (section 5.1)
    complianceChecks.ts         # runComplianceChecks (section 6)
    complianceMonitor.ts        # runDailyComplianceChecks (section 7)

app/
  api/
    visa/
      compliance/
        route.ts                # POST — runs compliance check for an application
      monitor/
        route.ts                # POST — daily cron trigger for complianceMonitor
```

---

## 11. Key Rules for Claude Code

1. **Never create a duplicate crew profile.** Always run `findOrPromptCrewMatch` before inserting into `crew_members`.
2. **Never match crew on nationality alone.** The match key is always `full_name + date_of_birth`.
3. **Always ask about multiple passports** on crew profile creation. Never assume one passport.
4. **Passport selection is per-application.** Never auto-select the primary passport silently — always make the user confirm which passport is being used for the specific country.
5. **UAE is always the default country** on new application creation.
6. **Country fields are config-driven.** Never hardcode country-specific form fields into components. Always read from `COUNTRY_CONFIGS`.
7. **Blocking compliance failures disable the Submit button.** Non-blocking failures show a warning the user must acknowledge.
8. **Satellite offices are vessel-scoped.** An office user who can see a vessel sees all crew on that vessel. Nothing else.
9. **All document uploads go to Supabase Storage.** Store the public URL in the relevant `document_url` column. Never store file data in the database.
10. **Leo gets visa compliance context.** Any unresolved critical alert must be available to Leo's briefing engine at login.

---

*Polaris — Visa Module Spec v1.0 — June 2026 — Internal / Confidential*
