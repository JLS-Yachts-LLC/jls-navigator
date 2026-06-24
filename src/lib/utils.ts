import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date as dd/mm/yyyy to match the UAE immigration portal.
 * Accepts a Date, an ISO string, or a yyyy-mm-dd string; returns "—" for empty
 * and the original string unchanged if it isn't a recognisable date.
 */
export function toDMY(value: unknown): string {
  if (value == null || value === "") return "—";
  const s = String(value);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // yyyy-mm-dd[...]
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return s;
}
