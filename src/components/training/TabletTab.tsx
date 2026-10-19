import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MonitorSmartphone, Unlink } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cleanUrl, type TrainingKioskSettings } from "@/lib/training-kiosk";

// Training Institute → Tablet: pair the training room tablet (it shows a code at
// /training-kiosk), set its Google review link, rename or unpair it.
// Same pairing as the Port Ops wall; needs training edit to change anything.

type Tablet = {
  id: string;
  name: string | null;
  settings: TrainingKioskSettings;
  paired_at: string | null;
  paired_by_name: string | null;
  last_seen_at: string | null;
};

const online = (lastSeen: string | null) => !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 3 * 60_000;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

export function TabletTab({ initialCode }: { initialCode?: string }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [tablets, setTablets] = useState<Tablet[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState(initialCode ?? "");
  const [name, setName] = useState("Training room tablet");
  const [reviewUrl, setReviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [unpair, setUnpair] = useState<Tablet | null>(null);

  const api = async (method: string, body?: unknown) => {
    const res = await fetch("/api/training-kiosk/admin", {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
    return data;
  };

  const reload = async () => {
    try { setTablets((await api("GET")).displays); setLoadError(null); }
    catch (e) { setLoadError((e as Error).message); }
  };
  useEffect(() => {
    if (!token) return;
    void reload();
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { if (initialCode) setCode(initialCode); }, [initialCode]);

  const kioskUrl = typeof window !== "undefined" ? `${window.location.origin}/training-kiosk` : "/training-kiosk";

  const pair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reviewUrl.trim() && !cleanUrl(reviewUrl)) { toast.error("The review link must be a full https:// link."); return; }
    setBusy(true);
    try {
      await api("POST", { code, name, settings: reviewUrl.trim() ? { reviewUrl: reviewUrl.trim() } : {} });
      toast.success(`${name} is paired — the tablet switches over in a few seconds.`);
      setCode(""); setReviewUrl("");
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (t: Tablet, patch: { name?: string; settings?: TrainingKioskSettings }) => {
    if (patch.settings?.reviewUrl && !cleanUrl(patch.settings.reviewUrl)) { toast.error("The review link must be a full https:// link."); return; }
    try {
      await api("PATCH", { id: t.id, ...patch });
      toast.success("Saved — the tablet picks it up within a minute.");
      await reload();
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="h-full overflow-auto px-6 py-5">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-[15px] font-semibold"><MonitorSmartphone className="h-4 w-4" /> Pair the training room tablet</div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            On the tablet, open <span className="font-mono text-foreground">{kioskUrl}</span> in the browser (add it to the home screen for full screen).
            It shows a 6-character code. Enter that code here. Students then use the tablet to sign in to today's sessions, see the course calendar and leave a Google review.
            It never shows anyone's name or number.
          </p>
          <form onSubmit={pair} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Code on the tablet</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC 123" maxLength={8} className="font-mono tracking-widest" />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Google review link (optional)</Label>
              <Input value={reviewUrl} onChange={(e) => setReviewUrl(e.target.value)} placeholder="https://g.page/r/…/review" />
              <p className="text-[12px] text-muted-foreground">
                From Google Business Profile → "Ask for reviews". Without one, the tablet uses the link from Communications → Reviews once Google is connected, and hides the review page until then.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy || !code.trim() || !name.trim()}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Pair tablet
              </Button>
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-[15px] font-semibold">Paired tablets</div>
          {loadError && <p className="mt-2 text-[13px] text-destructive">{loadError}</p>}
          {!tablets && !loadError && <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted-foreground" />}
          {tablets?.length === 0 && <p className="mt-2 text-[13px] text-muted-foreground">None yet.</p>}
          <div className="mt-3 space-y-3">
            {tablets?.map((t) => <TabletRow key={t.id} tablet={t} onSave={save} onUnpair={() => setUnpair(t)} />)}
          </div>
        </div>
      </div>

      <AlertDialog open={!!unpair} onOpenChange={(o) => !o && setUnpair(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpair {unpair?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The tablet goes back to showing a pairing code. Attendance already recorded is kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              const t = unpair; setUnpair(null);
              if (!t) return;
              try { await api("DELETE", { id: t.id }); toast.success("Unpaired"); await reload(); }
              catch (err) { toast.error((err as Error).message); }
            }}>Unpair</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TabletRow({ tablet, onSave, onUnpair }: {
  tablet: Tablet; onSave: (t: Tablet, patch: { name?: string; settings?: TrainingKioskSettings }) => void; onUnpair: () => void;
}) {
  const [name, setName] = useState(tablet.name ?? "");
  const [reviewUrl, setReviewUrl] = useState(tablet.settings.reviewUrl ?? "");
  const [title, setTitle] = useState(tablet.settings.title ?? "");
  const dirty = name !== (tablet.name ?? "") || reviewUrl !== (tablet.settings.reviewUrl ?? "") || title !== (tablet.settings.title ?? "");
  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${online(tablet.last_seen_at) ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
          <span className="font-medium">{tablet.name}</span>
          <span className="text-[12px] text-muted-foreground">
            {online(tablet.last_seen_at) ? "Online" : `Last seen ${when(tablet.last_seen_at)}`} · paired {when(tablet.paired_at)}{tablet.paired_by_name ? ` by ${tablet.paired_by_name}` : ""}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onUnpair}><Unlink className="mr-1.5 h-3.5 w-3.5" /> Unpair</Button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
        <div className="space-y-1.5"><Label>Heading on the tablet</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Welcome" maxLength={80} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Google review link</Label><Input value={reviewUrl} onChange={(e) => setReviewUrl(e.target.value)} placeholder="https://g.page/r/…/review" /></div>
      </div>
      {dirty && (
        <Button size="sm" className="mt-3" onClick={() => onSave(tablet, {
          name, settings: { ...(reviewUrl.trim() ? { reviewUrl: reviewUrl.trim() } : {}), ...(title.trim() ? { title: title.trim() } : {}) },
        })}>Save</Button>
      )}
    </div>
  );
}
