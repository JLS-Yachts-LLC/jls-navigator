# Publishing to Microsoft Edge Add-ons (unlisted) — step-by-step

One-time effort ≈ 15 minutes + Microsoft's review (typically 1–3 business days).
Once live, installs are one click from Polaris and **updates push automatically**
to everyone — no more re-downloading zips when QuickBooks changes their UI.

## 1. Register (free)

1. Go to https://partner.microsoft.com/dashboard/microsoftedge/overview
2. Sign in with the company Microsoft account (any M365 account works).
3. Complete the free "Microsoft Edge program" registration (no fee).

## 2. Create the submission

1. **Create new extension** → upload the package:
   `D:\Github\jls-navigator\public\downloads\qbo-profinv.zip`
2. **Availability → Visibility: Hidden** ← this is the "unlisted" setting; only
   people with the direct link can install it.
3. **Properties:**
   - Category: **Productivity**
   - Privacy policy URL: `https://jls-navigator.m-peeters-4a0.workers.dev/extension-privacy.html`
   - Website: `https://jls-navigator.m-peeters-4a0.workers.dev`
4. **Store listing** (copy-paste below):
   - Store logo: `extension/store-assets/store-logo-300.png`
   - At least one screenshot is required — take one of a QuickBooks Sales Order
     page showing the teal "Attach Prof Inv" button (1280×800 works well).

### Display name
Polaris — Attach Prof Inv to Sales Order

### Short description
Adds an "Attach Prof Inv" button to QuickBooks Online Sales Orders that attaches the matching Polaris-generated Pro-Forma PDF using your own signed-in session.

### Detailed description
Internal business tool for JLS Yachts staff.

QuickBooks Online's API cannot address Sales Orders, so this extension closes the gap from the browser: on a Sales Order page it shows an "Attach Prof Inv" button that fetches the matching Pro-Forma PDF from the company's Polaris platform and hands it to QuickBooks' own attachment control — QuickBooks itself performs the upload inside your signed-in session.

- No QuickBooks credentials are read, stored, or transmitted.
- Runs only on qbo.intuit.com; communicates only with the company's Polaris server.
- Requires a company access token (Polaris → Finance → QB Extension).

## 3. Submit & wait for review

Certification usually completes within 1–3 business days. You'll get an email;
the listing then has a URL like:
`https://microsoftedge.microsoft.com/addons/detail/<id>`

## 4. Tell Claude the listing URL

The Polaris **Finance → QB Extension** tab will then be switched from the zip
download to a one-click **"Get it for Edge"** install button, and future updates
are published from Partner Center (upload new zip → auto-updates everyone).
