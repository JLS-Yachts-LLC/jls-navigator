/**
 * The JLS email signature, as staff use it in Outlook — for emails Polaris sends
 * on someone's behalf (Orbit 2 bunkering requests and replies, to start with).
 *
 * The name block is the sender's own: name from Polaris, position and mobile
 * from their Team Directory entry (staff_profiles, matched by email). The
 * artwork is hosted under /email/signature/ — email clients won't show inline
 * or data images. Safe for the browser (no secrets).
 */

const ASSETS = "https://polaris.jlsyachts.com/email/signature";

/** The three offices, as the signature prints them. */
const OFFICES = [
  {
    logo: "sy-me.png", alt: "Superyacht Middle East",
    lines: ["Marina View, Bldg. C1, Mina Rashid,", "P.O. Box 341766, Dubai, UAE", "+971 4 331 3555"],
    email: "info@jlsyachts.com",
  },
  {
    logo: "sy-ksa.png", alt: "Superyacht Saudi Arabia",
    lines: ["Office 3, 5400, Ismail Bin Katheer Street,", "Al Basateen District, 23717,", "Jeddah, KSA.", "+966 53 930 0339"],
    email: "info.ksa@jlsyachts.com",
  },
  {
    logo: "sy-mv.png", alt: "Superyacht Maldives",
    lines: ["2B 2Fl., M. Faamudheyrige Orchid,", "20136 Magu, Male, Maldives", "+960 777 7312"],
    email: "info.maldives@jlsyachts.com",
  },
] as const;

/** Event banner under the signature; it drops off by itself once the show is over. */
const BANNER = {
  img: "adibs.png", alt: "Join us at ADIBS 2026 — 19–22 November, Marina Hall, ADNEC Centre Abu Dhabi — Stand D036",
  href: "https://adibs.ae", width: 602, height: 228, until: "2026-11-22",
};

export type SignatureSender = {
  name: string;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT = "font-family:Arial,Helvetica,sans-serif";
const LINK = "color:#0563C1;text-decoration:underline";

export function jlsSignatureHtml(sender: SignatureSender, now: Date = new Date()): string {
  const who = [
    `<div style="font-weight:bold">${esc(sender.name)}</div>`,
    sender.position ? `<div>${esc(sender.position)}</div>` : "",
    sender.email ? `<div style="margin-top:6px"><a href="mailto:${esc(sender.email)}" style="color:#000;text-decoration:none">${esc(sender.email)}</a></div>` : "",
    sender.phone ? `<div>${esc(sender.phone)}</div>` : "",
  ].join("");

  const offices = OFFICES.map((o) => `
        <td valign="top" style="padding:0 14px 0 0;${FONT};font-size:12px;line-height:1.35;color:#000">
          <img src="${ASSETS}/${o.logo}" width="182" height="42" alt="${esc(o.alt)}" style="display:block;border:0;margin-bottom:6px"/>
          ${o.lines.map((l) => esc(l)).join("<br/>")}<br/>
          <a href="mailto:${o.email}" style="${LINK}">${o.email}</a><br/>
          <a href="https://www.superyachtme.com" style="${LINK}">www.superyachtme.com</a>
        </td>`).join("");

  const banner = now.toISOString().slice(0, 10) <= BANNER.until
    ? `<tr><td colspan="2" style="padding-top:2px">
         <a href="${BANNER.href}"><img src="${ASSETS}/${BANNER.img}" width="${BANNER.width}" height="${BANNER.height}" alt="${esc(BANNER.alt)}" style="display:block;border:0;max-width:100%;height:auto"/></a>
       </td></tr>`
    : "";

  return `
    <div style="${FONT};font-size:14px;line-height:1.4;color:#000;margin-top:18px">${who}</div>
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border-collapse:collapse">
      <tr>
        <td valign="top" style="padding:0 14px 6px 0">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="top"><img src="${ASSETS}/20years.png" width="248" height="134" alt="20 Years — JLS Yacht Services" style="display:block;border:0"/></td>
            <td valign="top" style="padding-left:2px"><img src="${ASSETS}/badges.png" width="206" height="58" alt="Captains Recommended Service · AYSS · GCS" style="display:block;border:0"/></td>
          </tr></table>
        </td>
        <td valign="top">
          <table cellpadding="0" cellspacing="0" border="0"><tr>${offices}
          </tr></table>
        </td>
      </tr>
      ${banner}
    </table>`;
}
