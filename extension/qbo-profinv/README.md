# Polaris — Attach Prof Inv to Sales Order (Chrome extension)

QuickBooks Online's API cannot see Sales Orders, so Polaris cannot attach the
generated "Prof Inv NNNN-YY Client" PDF to them server-side. This extension
closes the gap **from the browser**: on a Sales Order page it shows an
**Attach Prof Inv** button that fetches the matching PDF from Polaris and hands
it to the page's own attachment control — QuickBooks itself performs the upload
inside the signed-in user's session. No QuickBooks credentials are stored or
seen by the extension.

## One-time setup (admin)

1. Create the shared access token (any long random string) and set it as a
   Worker secret:  `wrangler secret put POLARIS_EXT_TOKEN`
   (then deploy is NOT needed — secrets apply immediately).

## Install (each team member)

1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder (`extension/qbo-profinv`).
3. Right-click the extension icon → **Options** → paste the Polaris URL
   (pre-filled) and the access token → Save.

## Use

1. Open a Sales Order in QuickBooks Online.
2. Click the teal **Attach Prof Inv** button (bottom-right).
3. The extension looks up the Prof Inv for the order's customer (newest first),
   fetches the PDF from Polaris, and drops it into the attachment box.
4. Check the Attachments list shows the file, then **Save** the Sales Order.

## Notes / troubleshooting

- "No Prof Inv found" → the quotation hasn't been marked **Accepted** yet
  (that's what generates the document), or the customer name differs.
- "Could not find the attachment box" → scroll the Sales Order's Attachments
  section into view and click again (QuickBooks renders it lazily).
- This drives QuickBooks' own UI, so a QuickBooks redesign can break the
  button until the selectors are updated — that's the accepted trade-off of
  this approach. Report breakage to IT; it's usually a small fix.
