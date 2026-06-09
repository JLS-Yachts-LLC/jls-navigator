import { useAuth } from "@/lib/auth";

/**
 * Recognised team members. When one of these is the signed-in user, a small
 * "working on it" overlay appears at the top-right of the app.
 *
 * ⚠️ Match is by email (case-insensitive). Confirm/adjust the addresses below.
 */
const TEAM: { email: string; name: string }[] = [
  { email: "m.peeters@jlsyachts.com", name: "Matt Peeters" },
  // TODO: confirm your own work email — best-guess from the jlsyachts.com pattern:
  { email: "m.fetton@jlsyachts.com", name: "Mike Fetton" },
];

export function WorkingIndicator() {
  const { user } = useAuth();

  const email = user?.email?.toLowerCase();
  const match = email ? TEAM.find((t) => t.email.toLowerCase() === email) : undefined;

  if (!match) return null;

  return (
    <div className="fixed right-4 top-3 z-50 flex items-center gap-2 rounded-full border border-[#C9A84C]/40 bg-[#0f1f3d]/90 py-1.5 pl-2.5 pr-3.5 shadow-lg backdrop-blur-sm">
      {/* Pulsing live dot */}
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="text-[11px] font-medium tracking-wide text-slate-200">
        <span className="font-semibold text-[#C9A84C]">{match.name}</span> is working on it
      </span>
    </div>
  );
}
