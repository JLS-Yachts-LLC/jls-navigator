# POLARIS – UI READABILITY STANDARDS
## Applies To: All Pages — Dashboard, Widgets, Cards, Modules, Pop-ups, Tables

**Instruction Type:** Global UI Standard  
**Scope:** ORBIT, Polaris Dashboard, and all platform modules  
**Authority:** Captain Mike Fetton, Managing Director — JLS Yachts LLC  
**Status:** Mandatory — apply immediately across all builds

---

## The Problem

The current dashboard and module views are not easily readable. Font sizes are too small and text colours are too light. This creates friction for operational users who need to act on information quickly and without strain.

**Goal:** Make the platform clear, professional, and effortless to read — so users can quickly understand information and take action without confusion.

---

## 1. Font Size

Apply these minimum sizes universally across all pages, components, and states:

| Text Type | Minimum Size |
|---|---|
| Body text | `16px` |
| Headings and titles | `22px` |
| Widget numbers and key metrics | `28px` |
| Small text (timestamps, labels, secondary info) | `14px` |

> No exceptions. These are floor values — increase where hierarchy demands it.

---

## 2. Text Colour

| Role | Colour Value | Usage |
|---|---|---|
| Primary text | `#1A1A1A` or `#0F172A` | All main content — body copy, headings, values |
| Secondary text | `#4B5563` | Supporting labels, metadata, secondary info |

- Use darker text for all primary content
- **Do not use light gray text on white backgrounds**
- If a colour produces a contrast ratio below 4.5:1 against its background, it must be replaced

---

## 3. Contrast

- Minimum contrast ratio: **4.5:1** (WCAG AA standard)
- This applies to all text rendered on any background — white, card, modal, table row, or coloured badge
- Ensure strong contrast in both light and dark mode if applicable

---

## 4. Widgets & Cards

- Numbers and labels must be **bold** and highly visible
- Use clear icons with text labels — never icon alone
- **Do not rely on colour alone to communicate status** — always pair colour with a label or icon
- Widget metric values must use the 28px minimum and render in primary text colour

---

## 5. Readability Rule

> Every screen must be readable at a glance. A user should not need to strain to read any information.

This is a platform-wide standard, not a design preference. Any component that requires the user to squint, lean in, or increase browser zoom has failed this standard and must be corrected before shipping.

---

## 6. Testing Requirements

Before marking any page or component as complete:

- [ ] Test on desktop display (1280px minimum width)
- [ ] Test on tablet display (768px minimum width)
- [ ] Verify readability in light mode
- [ ] Verify readability in dark mode (if applicable)
- [ ] Confirm all text meets the minimum font sizes above
- [ ] Confirm all text meets the 4.5:1 contrast ratio minimum

---

## CSS Token Reference

Add or update the following tokens in your global stylesheet / Tailwind config:

```css
/* Typography scale */
--text-xs:   14px;   /* timestamps, labels, secondary info */
--text-base: 16px;   /* all body text */
--text-lg:   18px;   /* emphasis body */
--text-xl:   22px;   /* headings, titles */
--text-2xl:  28px;   /* widget numbers, key metrics */

/* Text colours */
--color-text-primary:   #1A1A1A;   /* or #0F172A — use consistently */
--color-text-secondary: #4B5563;
--color-text-disabled:  #9CA3AF;   /* only for truly inactive elements */

/* Contrast floor */
/* All text: minimum 4.5:1 against background (WCAG AA) */
```


```css
/* Tailwind equivalents */
text-base    →  16px body
text-xl      →  use for headings (22px via custom config)
text-2xl     →  use for widget numbers (28px via custom config)
text-gray-900  →  #111827 (primary — acceptable)
text-gray-600  →  #4B5563 (secondary)

/* AVOID */
text-gray-400  →  #9CA3AF  ← too light on white — banned for primary content
text-gray-300  →  #D1D5DB  ← banned entirely for text
```

---

## Current Dashboard — Known Issues (from 22 June screenshot)

The following issues were identified in the live dashboard screenshot and must be corrected:

| Issue | Location | Fix Required |
|---|---|---|
| LEO briefing text renders in light gray | LEO intelligence panel | Change to `#1A1A1A` / `#0F172A` |
| Body paragraphs in LEO panel appear ~13–14px | LEO briefing paragraphs | Increase to minimum `16px` |
| "Ask Leo" input area text appears undersized | Ask Leo input bar | Increase to `16px` minimum |
| Secondary card text (LEAN SIGNAL, OPS HEALTH, ATTENTION) appears too light | Status cards at bottom of LEO panel | Darken to `#4B5563` minimum |
| Widget labels (ACTIVE VESSELS, CRITICAL PERMITS, etc.) appear ~11px | Top stat widgets | Increase to `14px` minimum |

---

## Scope of Application

This standard applies to **every** page and component in the platform:

- Captain Dashboard
- ORBIT Dashboard and all request views
- Crew Management module
- Visa & Permit module
- Documents module
- Admin Panel
- All modals, drawers, tooltips, and pop-ups
- Tables (all rows, headers, pagination)
- Forms (labels, inputs, validation messages)
- Navigation (primary nav, breadcrumbs, tab bars)
