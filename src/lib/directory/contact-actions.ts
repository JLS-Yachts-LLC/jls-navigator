// One-click contact helpers for the Team Directory (POLARIS_TEAM_DIRECTORY.md §8).
// All links open native apps on mobile (tel:, wa.me, msteams:).

/** Strip everything except digits and a leading + for tel:/wa.me links. */
function cleanPhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/[^0-9]/g, "");
}

export function telHref(mobile?: string | null): string | null {
  if (!mobile?.trim()) return null;
  return `tel:${cleanPhone(mobile)}`;
}

export function mailtoHref(email?: string | null): string | null {
  if (!email?.trim()) return null;
  return `mailto:${email.trim()}`;
}

// wa.me wants digits only, no leading "+".
export function whatsappHref(number?: string | null): string | null {
  if (!number?.trim()) return null;
  const digits = cleanPhone(number).replace(/^\+/, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export function teamsHref(upn?: string | null): string | null {
  if (!upn?.trim()) return null;
  return `msteams:/l/chat/0/0?users=${encodeURIComponent(upn.trim())}`;
}

/** Up to two initials for the avatar fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
