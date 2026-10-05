/**
 * The Polaris star in email headers.
 *
 * Email clients don't render inline SVG and Gmail strips data: images, so emails
 * show a hosted PNG of the star (public/email/polaris-star.png, built from
 * src/components/brand/polaris-star.ts by scripts/make-favicons.mjs) — the same
 * star as the browser tab, the logins and the app's top bar.
 *
 * The address is the public brand domain on purpose, not the current host: an
 * email is read long after it was sent, from anywhere, so the image must live
 * somewhere permanent and public — including emails sent from a dev machine.
 */
export const EMAIL_STAR_URL = "https://polaris.jlsyachts.com/email/polaris-star.png";

/**
 * The star image on its own. Decorative (alt=""), because every header that
 * uses it already names the sender in text beside it — and when images are
 * blocked, an empty alt shows nothing rather than stray words in the header.
 */
export function emailStar(size = 28): string {
  return `<img src="${EMAIL_STAR_URL}" width="${size}" height="${size}" alt="" `
    + `style="display:block;border:0;outline:none;text-decoration:none;width:${size}px;height:${size}px;">`;
}

/**
 * The star beside a header's existing title. A table rather than flexbox,
 * because Outlook on Windows renders email with Word, which ignores flexbox
 * and would stack the star above the title.
 */
export function emailBrandLockup(titleHtml: string, size = 28): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>`
    + `<td style="padding:0 10px 0 0;vertical-align:middle;line-height:0;">${emailStar(size)}</td>`
    + `<td style="vertical-align:middle;">${titleHtml}</td>`
    + `</tr></table>`;
}
