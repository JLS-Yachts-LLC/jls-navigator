/**
 * Filters shared by the visa export endpoint, the export review dialog and the
 * on-screen list, so a generated CSV/PDF matches exactly what staff were looking
 * at when they pressed the button.
 *
 * Validity (active / expired / all) and the report year live in the export
 * handler — those carry report-specific rules. Everything here is a plain
 * pass-through of the dashboard's own filter controls.
 */

export type ExportFilterOpts = {
  /** Applied-date range (yyyy-mm-dd), matching the From / To controls. */
  from?: string | null;
  to?: string | null;
  /** Free-text search box. */
  q?: string | null;
  /** Pipeline status chip (draft / submitted / approved / …). */
  status?: string | null;
};

export type FilterableVisa = {
  status?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  given_name?: string | null;
  surname?: string | null;
  passport_number?: string | null;
  visa_number?: string | null;
  nationality?: string | null;
  country_code?: string | null;
  application_notes?: string | null;
  yachts?: { vessel_name?: string | null } | null;
};

/** The date the list shows in "Applied" — what the range filter works on. */
export function appliedDate(r: FilterableVisa): string {
  return String(r.submitted_at ?? r.created_at ?? "").slice(0, 10);
}

export function matchesExportFilters(r: FilterableVisa, o: ExportFilterOpts): boolean {
  if (o.status && String(r.status ?? "") !== o.status) return false;

  const day = appliedDate(r);
  if (o.from && day && day < o.from) return false;
  if (o.to && day && day > o.to) return false;

  const q = (o.q ?? "").trim().toLowerCase();
  if (q) {
    const hay = [
      [r.given_name, r.surname].filter(Boolean).join(" "),
      r.application_notes?.split("\n")[0],
      r.passport_number, r.visa_number, r.nationality, r.country_code,
      r.yachts?.vessel_name,
    ].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** Read the filter params off an export request URL. */
export function exportFiltersFromUrl(url: URL): ExportFilterOpts {
  const g = (k: string) => url.searchParams.get(k) || null;
  return { from: g("from"), to: g("to"), q: g("q"), status: g("status") };
}

/** Query string for the export endpoints — prefixed with "&" when non-empty. */
export function exportFilterParams(o: ExportFilterOpts): string {
  const p = new URLSearchParams();
  if (o.from) p.set("from", o.from);
  if (o.to) p.set("to", o.to);
  if (o.q?.trim()) p.set("q", o.q.trim());
  if (o.status) p.set("status", o.status);
  const s = p.toString();
  return s ? `&${s}` : "";
}

/** Human summary of the filters in force, for the review dialog / report header. */
export function describeExportFilters(o: ExportFilterOpts): string[] {
  const out: string[] = [];
  if (o.status) out.push(`status ${o.status.replace(/_/g, " ")}`);
  if (o.from && o.to) out.push(`applied ${o.from} → ${o.to}`);
  else if (o.from) out.push(`applied from ${o.from}`);
  else if (o.to) out.push(`applied up to ${o.to}`);
  if (o.q?.trim()) out.push(`matching "${o.q.trim()}"`);
  return out;
}
