# POLARIS_VISA_HANDBOOK.md
> Companion spec — Polaris platform · Visa Module · Handbook Integration
> v1.0 — June 2026

---

## 1. Overview

The Crew Visa Guideline Handbook is produced and maintained by our Port & Agency Team.
It is the authoritative reference for crew visa requirements across all countries the platform supports.

**Live URL:**
```
https://online.fliphtml5.com/SuperyachtMiddleEast/oytr/index.html#p=1
```

This link must always open in a new tab. Never embed or reproduce handbook content inside
the platform — always direct users to the live document.

---

## 2. Usage Rules

1. **Never name the company** in user-facing copy — always "our Port & Agency Team".
2. The handbook link renders only on the **country info page** (`/dashboard/visa/info/[countryCode]`).
3. It must **not** appear inside the application wizard or on crew profile pages.
4. It applies to **all 7 countries** in scope: UAE, Oman, Maldives, KSA, Qatar, Bahrain, Egypt.
5. The link opens in a new tab with `rel="noopener noreferrer"`.

---

## 3. Leo System Prompt Rule

When Leo directs a user to seek help with visa requirements or procedures, use:

> "Contact our Port & Agency Team for guidance."

Never name the company (JLS Yachts / Superyacht Middle East) in Leo's output.

---

## 4. Contact Details

| Channel | Detail                      |
|---------|-----------------------------|
| Email   | support@jlsyachts.com       |
| Phone   | +971 4 331 3555             |

These appear in `lib/visa/contacts.ts` — import from there, never hardcode inline.

---

## 5. Country Info Page Integration

The country info page at `/dashboard/visa/info/[countryCode]` must include:

```tsx
import HandbookLink from '@/components/visa/HandbookLink'

// Inside the page component:
<HandbookLink countryCode={countryCode} />
```

Position: below the country overview text, above the document checklist.

---

## 6. HandbookLink Component

Location: `components/visa/HandbookLink.tsx`

Specification:
- Cyan left border (`#00C4CC`), dark panel background (`#0D1520`)
- Label: `Resources — Our Port & Agency Team`
- Book icon (left) + external link icon (right)
- Font: Space Grotesk, 12px, `color: #00C4CC`
- Hover state: background shifts to `#0F2030`
- `target="_blank"` with `rel="noopener noreferrer"`
- Accepts optional `countryCode` prop (reserved for future per-country deep-links)

---

*Polaris / Leo — Internal · Confidential · v1.0 — June 2026*
