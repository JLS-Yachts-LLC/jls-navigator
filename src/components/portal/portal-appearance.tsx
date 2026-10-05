/**
 * Appearance — the client picks their portal look (Bridge, Midnight, Private
 * Office). The choice applies at once and is saved to their account, so it
 * follows them to any device. In staff preview it changes the view only.
 */
import { createContext, useContext, useState } from "react";
import { Check, Palette, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PORTAL_THEMES, ensureThemeFonts, savePortalTheme, type PortalTheme } from "@/lib/portal/portal-theme";

type ThemeCtx = { theme: PortalTheme; setTheme: (t: PortalTheme) => void; preview: boolean };
export const PortalThemeContext = createContext<ThemeCtx>({ theme: "bridge", setTheme: () => {}, preview: false });

export function AppearanceButton() {
  const { theme, setTheme, preview } = useContext(PortalThemeContext);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const choose = (t: PortalTheme) => {
    ensureThemeFonts(t);
    setTheme(t);
    setSaved(false);
    if (!preview) void savePortalTheme(t).then(() => setSaved(true));
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
              className="mx-3 mb-2 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground">
        <Palette className="h-3.5 w-3.5" /> Appearance
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
             onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-lg rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Appearance</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose how your portal looks.{preview ? " (Preview only — not saved for the client.)" : " It's saved to your account, on every device."}
            </p>
            <div role="radiogroup" aria-label="Portal theme" className="mt-4 grid gap-3 sm:grid-cols-3">
              {PORTAL_THEMES.map((t) => (
                <button key={t.value} type="button" role="radio" aria-checked={theme === t.value} onClick={() => choose(t.value)}
                        className={cn("overflow-hidden rounded-2xl border text-left transition",
                          theme === t.value ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50")}>
                  <div className="relative h-20" style={{ background: t.swatch[0] }}>
                    <div className="absolute left-3 top-3 h-2 w-14 rounded-full" style={{ background: t.swatch[2], opacity: 0.85 }} />
                    <div className="absolute left-3 top-7 h-2 w-9 rounded-full" style={{ background: t.swatch[2], opacity: 0.4 }} />
                    <div className="absolute bottom-3 left-3 h-5 w-16 rounded-md" style={{ background: t.swatch[1] }} />
                    {theme === t.value && (
                      <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black"><Check className="h-4 w-4" /></span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-semibold">{t.label}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t.blurb}</div>
                  </div>
                </button>
              ))}
            </div>
            {saved && <p className="mt-3 text-xs text-muted-foreground">Saved.</p>}
          </div>
        </div>
      )}
    </>
  );
}
