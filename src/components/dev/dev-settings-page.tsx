import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useDevAccess, useDevUsers, useGrantDevRole, useRevokeDevRole } from "@/lib/dev-access";
import {
  useFeatureFlags, useSetFlagStage, useCreateFeatureFlag, useDeleteFeatureFlag,
  STAGE_META, type FeatureFlag, type FlagStage,
} from "@/lib/release-flags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Rocket, ShieldOff, Plus, Trash2, UserPlus, Loader2, CheckCircle2, Star, Wrench } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STAGE_ORDER: FlagStage[] = ["live", "beta", "dev"];
const STAGE_ICON: Record<FlagStage, React.ReactNode> = {
  live: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  beta: <Star className="h-3.5 w-3.5 fill-current text-sky-400" />,
  dev: <Wrench className="h-3.5 w-3.5 text-amber-400" />,
};
const STAGE_PILL: Record<FlagStage, string> = {
  live: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
  beta: "border-sky-500/30 bg-sky-500/15 text-sky-400",
  dev: "border-amber-500/30 bg-amber-500/15 text-amber-400",
};
const fmt = (d: string | null) => d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

function useProfiles() {
  return useQuery({
    queryKey: ["profiles-min"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await fetchAllRows(() => (supabase as any).from("profiles").select("id, display_name"));
      return (data ?? []) as { id: string; display_name: string | null }[];
    },
  });
}

export function DevSettingsPage() {
  const devAccess = useDevAccess();
  if (!devAccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <ShieldOff className="h-10 w-10 text-muted-foreground/40" />
        <p className="font-display text-base font-semibold">Dev Settings is restricted</p>
        <p className="max-w-sm text-sm text-muted-foreground">You need the Dev role or admin access to manage feature staging.</p>
      </div>
    );
  }
  return <DevSettingsContent />;
}

function DevSettingsContent() {
  const { data: flags = [], isLoading } = useFeatureFlags();
  const [addOpen, setAddOpen] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<FlagStage, FeatureFlag[]> = { live: [], beta: [], dev: [] };
    for (const f of flags) g[f.stage]?.push(f);
    return g;
  }, [flags]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Polaris / Settings</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <Rocket className="h-5 w-5 text-primary" /> Dev Settings
          </h1>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-4xl space-y-6">
          <DevAccessSection />

          <div>
            <div className="mb-1 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold">Feature Staging</h2>
                <p className="text-sm text-muted-foreground">Control which features are visible to end users. Promote each feature through the pipeline.</p>
              </div>
              <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add Feature</Button>
            </div>

            {/* Legend */}
            <div className="mb-4 flex flex-wrap gap-2">
              {STAGE_ORDER.map((s) => (
                <span key={s} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium", STAGE_PILL[s])}>
                  {STAGE_ICON[s]} {STAGE_META[s].label} — {STAGE_META[s].description}
                </span>
              ))}
            </div>

            {isLoading ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-6">
                {STAGE_ORDER.map((stage) => (
                  <div key={stage}>
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {STAGE_ICON[stage]} {STAGE_META[stage].label}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{grouped[stage].length}</span>
                    </div>
                    {grouped[stage].length === 0 ? (
                      <p className="px-1 py-2 text-sm text-muted-foreground/70">No features at this stage.</p>
                    ) : (
                      <div className="space-y-2">
                        {grouped[stage].map((f) => <FlagCard key={f.id} flag={f} />)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddFeatureDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function FlagCard({ flag }: { flag: FeatureFlag }) {
  const setStage = useSetFlagStage();
  const del = useDeleteFeatureFlag();
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">{flag.icon ?? "🚀"}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{flag.name}</span>
            <code className="rounded bg-muted px-1.5 py-px font-mono text-[10.5px] text-muted-foreground">{flag.key}</code>
          </div>
          {flag.description && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{flag.description}</p>}
          {(flag.stage === "beta" || flag.stage === "live") && flag.released_at && (
            <p className="mt-1 text-[10.5px] text-muted-foreground/70">{STAGE_META[flag.stage].label} · {fmt(flag.released_at)}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Stage selector */}
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
            {STAGE_ORDER.slice().reverse().map((s) => (
              <button
                key={s}
                disabled={setStage.isPending}
                onClick={() => { if (s !== flag.stage) setStage.mutate({ id: flag.id, stage: s }); }}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                  s === flag.stage ? cn("border", STAGE_PILL[s]) : "text-muted-foreground hover:text-foreground",
                )}
              >
                {STAGE_ICON[s]} {STAGE_META[s].label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => setConfirmDel(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{flag.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The feature flag will be deleted. Any nav item using <code>{flag.key}</code> will become visible to everyone again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => del.mutate(flag.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddFeatureDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateFeatureFlag();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("🚀");
  const derived = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  async function submit() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    try {
      await create.mutateAsync({ key: key.trim() || derived, name, description, icon });
      toast.success("Feature added (Dev Only)");
      setName(""); setKey(""); setDescription(""); setIcon("🚀");
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message ?? "Could not add feature"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Feature</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-[64px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Icon</Label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 4))} className="h-9 text-center text-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Display name <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business Strategy" className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Key</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder={derived || "auto-from-name"} className="h-9 font-mono text-sm" />
            <p className="text-[11px] text-muted-foreground">Used by the sidebar/feature gate. Leave blank to use <code>{derived || "…"}</code>.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this feature does" className="min-h-[64px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending} className="gap-1.5">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Add Feature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DevAccessSection() {
  const { data: devUsers = [] } = useDevUsers();
  const { data: profiles = [] } = useProfiles();
  const grant = useGrantDevRole();
  const revoke = useRevokeDevRole();
  const [pickOpen, setPickOpen] = useState(false);
  const [pick, setPick] = useState("");

  const nameOf = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p.display_name ?? ""]));
    return (id: string) => m.get(id) || `${id.slice(0, 8)}…`;
  }, [profiles]);

  const devIds = new Set(devUsers.map((d) => d.user_id));
  const candidates = profiles.filter((p) => !devIds.has(p.id) && p.display_name).sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? ""));

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold"><ShieldOff className="h-4 w-4 text-primary rotate-180" /> Dev Access</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Users with the Dev role can preview dev-stage features without being app admins.</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPickOpen(true)}><UserPlus className="h-3.5 w-3.5" /> Add person</Button>
      </div>

      <div className="mt-4">
        {devUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users have the Dev role yet.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {devUsers.map((d) => (
              <div key={d.user_id} className="flex items-center gap-3 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                  {nameOf(d.user_id).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{nameOf(d.user_id)}</div>
                  {fmt(d.granted_at) && <div className="text-[11px] text-muted-foreground">since {fmt(d.granted_at)}</div>}
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => revoke.mutate(d.user_id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Grant Dev role</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label className="text-xs">Person</Label>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="mt-1.5 h-9"><SelectValue placeholder="Select a user…" /></SelectTrigger>
              <SelectContent>
                {candidates.length === 0
                  ? <div className="px-2 py-1.5 text-sm text-muted-foreground">No more users to add</div>
                  : candidates.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickOpen(false)}>Cancel</Button>
            <Button disabled={!pick || grant.isPending} className="gap-1.5"
              onClick={async () => {
                try { await grant.mutateAsync({ userId: pick }); toast.success("Dev role granted"); setPick(""); setPickOpen(false); }
                catch (e: any) { toast.error(e.message ?? "Could not grant role"); }
              }}>
              {grant.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
