/**
 * JLS Yachts company details as printed on corporate documents — ONE place, so
 * letterheads, signing pages and client emails all say the same thing.
 * Source: the controlled QMS template (Standard Tariff Sheet JLS-QMS-64-2025,
 * last updated May 2026). Safe for the browser (no secrets, no artwork).
 */
export const JLS_COMPANY = {
  legalName: "JLS YACHTS LLC",
  tagline: "A Family of Excellence",
  address: "C1, Marina View, Mina Rashid, P.O. Box 341766, Dubai, United Arab Emirates",
  phone: "+971 (0)4 331 3555",
  email: "info@jlsyachts.com",
  websites: ["www.jlsyachts.com", "www.superyachtme.com"],
} as const;

/** The contact line exactly as the template prints it. */
export const JLS_CONTACT_LINE = [JLS_COMPANY.phone, JLS_COMPANY.email, ...JLS_COMPANY.websites].join(" | ");

/** Hosted logo for emails (email clients won't show inline/data images). */
export const JLS_EMAIL_LOGO_URL = "https://polaris.jlsyachts.com/email/jlsyachts-logo.png";

/** Template colours (Standard Tariff Sheet): table header blue + section navy. */
export const JLS_COLORS = {
  blue: "#0070C0",
  navy: "#0B2A5B",
} as const;
