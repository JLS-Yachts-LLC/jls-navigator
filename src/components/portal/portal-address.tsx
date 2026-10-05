/**
 * The client's own portal address (<slug>.polaris.jlsyachts.com) on the portal
 * side: their vessel's branding on the sign-in page, and a guard that sends a
 * user who signs in at another client's address to their own.
 *
 * Branding only — RLS decides what anyone can see, at any address.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Anchor, ExternalLink, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Brand { branded: boolean; vessel?: string | null; logo?: string | null; image?: string | null }

let brandPromise: Promise<Brand> | null = null;
function loadBrand(): Promise<Brand> {
  brandPromise ??= fetch("/api/portal/brand").then((r) => (r.ok ? r.json() : { branded: false })).catch(() => ({ branded: false }));
  return brandPromise;
}

export function usePortalBrand(): Brand | null {
  const [brand, setBrand] = useState<Brand | null>(null);
  useEffect(() => { void loadBrand().then(setBrand); }, []);
  return brand;
}

/** On a client address: the vessel's logo and name. Elsewhere: the usual brand. */
export function PortalBrandHeader({ fallback }: { fallback: ReactNode }) {
  const brand = usePortalBrand();
  if (!brand?.branded) return <>{fallback}</>;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {brand.logo ? (
        <div className="flex h-20 w-48 items-center justify-center">
          <img src={brand.logo} alt={`${brand.vessel ?? "Vessel"} logo`} className="max-h-full max-w-full object-contain" />
        </div>
      ) : brand.image ? (
        <img src={brand.image} alt="" className="h-20 w-32 rounded-xl object-cover" />
      ) : (
        <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/15"><Anchor className="h-7 w-7 text-primary" /></div>
      )}
      <div>
        <div className="text-lg font-bold">{brand.vessel}</div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Client Portal · JLS Yachts</div>
      </div>
    </div>
  );
}

/** True when the page is open on a client address (not the main Polaris one). */
export function onClientAddress(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return /^[a-z0-9-]+\.polaris\.jlsyachts\.com$/.test(host);
}

/**
 * After sign-in on a client address: is this the user's own? Returns where
 * they belong when it isn't. On the main address everyone is welcome.
 */
export async function checkPortalAddress(): Promise<{ matches: boolean; home: string; vessel: string } | null> {
  if (!onClientAddress()) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  try {
    const res = await fetch("/api/portal/address", { headers: { Authorization: `Bearer ${session.access_token}` } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export function WrongAddressScreen({ home, onSignOut }: { home: string; onSignOut: () => void }) {
  const brand = usePortalBrand();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h1 className="text-xl font-bold">This is {brand?.vessel ?? "another vessel"}'s portal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account belongs to a different vessel. Please sign in at your own portal address.
        </p>
        <a href={home} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
          <ExternalLink className="h-4 w-4" /> Go to my portal
        </a>
        <button onClick={onSignOut} className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
}
