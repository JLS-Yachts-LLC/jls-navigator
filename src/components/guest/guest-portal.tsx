/**
 * The guest page (/guest) — for outside people JLS has given a guest login.
 *
 * A guest sees only the Training files and folders a member of staff has shared
 * with them (or with a guest group they're in). Everything comes from /api/guest,
 * which checks each request against the guest's live shares; the guest's own
 * login can read nothing from the database directly.
 *
 * Read           — browse, open, download.
 * Read & write   — also upload files, add folders, rename and replace inside a
 *                  shared folder, and remove what a guest added.
 *
 * The invite email is a password-set link that lands here (#type=recovery).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, CheckCircle2, ChevronRight, Download, File as FileIcon, Folder, FolderPlus, Loader2,
  LogOut, Mail, MoreHorizontal, Pencil, RefreshCw, Shield, Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PolarisMark } from "@/components/brand/PolarisMark";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PERMISSION_LABEL, type SharePermission } from "@/lib/guest/shares";
import "@/components/polaris-ui/tokens.css";

type Stage = "loading" | "signed-out" | "reset-password" | "link-expired" | "not-guest" | "ready";

type HomeItem = {
  type: "folder" | "document"; id: string; name: string; permission: SharePermission;
  sharedBy: string | null; sharedAt: string; expiresAt: string | null;
};
type FolderView = {
  folder: { id: string; name: string };
  permission: SharePermission;
  isShareRoot: boolean;
  crumbs: { id: string; name: string }[];
  folders: { id: string; name: string; guestAdded: boolean }[];
  documents: { id: string; name: string; createdAt: string; guestAdded: boolean }[];
};

// Read once, before the Supabase client consumes the URL hash.
const LANDED_WITH = typeof window === "undefined" ? null : (() => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (params.get("error") || params.get("error_code")) return "link-expired" as const;
  if (params.get("type") === "recovery") return "recovery" as const;
  return null;
})();

const inputCls =
  "w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-[15px] text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50";

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

async function guestFetch(path: string, init: RequestInit = {}): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ""}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error ?? `Request failed (${res.status})`), { status: res.status });
  return body;
}
const postJson = (body: unknown) =>
  guestFetch("/api/guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function PrimaryButton({ className, disabled, onClick, children, type }: {
  className?: string; disabled?: boolean; onClick?: () => void; children: React.ReactNode; type?: "button" | "submit";
}) {
  return (
    <button type={type ?? "button"} disabled={disabled} onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition",
        "hover:opacity-90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50", className,
      )}>
      {children}
    </button>
  );
}

function GhostButton({ onClick, children, disabled }: { onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground transition hover:bg-card disabled:opacity-50">
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</label>;
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <PolarisMark size={34} title="" />
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-wide text-foreground">JLS YACHTS</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Shared documents</div>
      </div>
    </div>
  );
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-8"><Brand /></div>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 p-6 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)] sm:p-8">{children}</div>
      <p className="mt-6 max-w-md text-center text-[11px] leading-relaxed text-muted-foreground/70">
        Guest access · you can see only the documents JLS Yachts has shared with you.
      </p>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{children}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
export function GuestPortal() {
  const [stage, setStage] = useState<Stage>("loading");
  const [email, setEmail] = useState("");
  const [resetHandled, setResetHandled] = useState(false);

  const bootstrap = useCallback(async () => {
    if (LANDED_WITH === "link-expired" && !resetHandled) {
      window.history.replaceState(null, "", window.location.pathname);
      setStage("link-expired"); return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setStage("signed-out"); return; }
    setEmail(session.user.email ?? "");
    if (LANDED_WITH === "recovery" && !resetHandled) { setStage("reset-password"); return; }
    const { data: isGuest } = await (supabase as any).rpc("is_portal_guest");
    setStage(isGuest === true ? "ready" : "not-guest");
  }, [resetHandled]);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setStage("signed-out");
  }, []);

  return (
    <div className="pds pds-embed dark min-h-screen bg-background text-foreground" style={{ colorScheme: "dark" }}>
      {stage === "loading" && (
        <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}
      {stage === "signed-out" && <LoginScreen onSignedIn={bootstrap} />}
      {stage === "reset-password" && (
        <SetPasswordScreen email={email} onSignOut={signOut}
          onDone={() => { window.history.replaceState(null, "", window.location.pathname); setResetHandled(true); }} />
      )}
      {stage === "link-expired" && (
        <AuthFrame>
          <h1 className="text-xl font-bold">That link has expired</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Password links only work for a short time and only once. Use “Forgot your password?” on the sign-in page to get a new one,
            or ask your contact at JLS Yachts to re-send your invitation.
          </p>
          <PrimaryButton onClick={() => { setResetHandled(true); setStage("signed-out"); }} className="mt-6 w-full">Back to sign in</PrimaryButton>
        </AuthFrame>
      )}
      {stage === "not-guest" && (
        <AuthFrame>
          <h1 className="text-xl font-bold">No guest access</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            <span className="text-foreground">{email}</span> isn't an active guest login. If you work at JLS Yachts, use the
            normal Polaris sign-in; otherwise ask your contact at JLS Yachts to check your invitation.
          </p>
          <PrimaryButton onClick={signOut} className="mt-6 w-full"><LogOut className="h-4 w-4" /> Sign out</PrimaryButton>
        </AuthFrame>
      )}
      {stage === "ready" && <SharedBrowser email={email} onSignOut={signOut} />}
    </div>
  );
}

// ── Auth screens ─────────────────────────────────────────────────────────────
function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState<"off" | "form" | "sent">("off");

  if (forgot !== "off") {
    return (
      <AuthFrame>
        <h1 className="text-xl font-bold">Reset your password</h1>
        {forgot === "sent" ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              If <span className="text-foreground">{email.trim()}</span> has a guest login, we've emailed it a link to choose a new
              password. It works for a short time only. Nothing arrived? Check junk, or contact JLS Yachts.
            </p>
            <PrimaryButton onClick={() => setForgot("off")} className="mt-6 w-full">Back to sign in</PrimaryButton>
          </>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true);
            await fetch("/api/guest/forgot-password", {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }),
            }).catch(() => null);
            setBusy(false); setForgot("sent");
          }}>
            <p className="text-sm text-muted-foreground">Enter the email you sign in with and we'll send you a reset link.</p>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <PrimaryButton type="submit" disabled={busy} className="w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send reset link
            </PrimaryButton>
            <button type="button" onClick={() => setForgot("off")} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">Back to sign in</button>
          </form>
        )}
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">Guest sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to see the documents shared with you.</p>
      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        setBusy(false);
        if (error) { setError(error.message === "User is banned" ? "This guest login has been deactivated." : error.message); return; }
        onSignedIn();
      }}>
        <div>
          <FieldLabel>Email</FieldLabel>
          <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Password</FieldLabel>
          <input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrimaryButton type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Sign in
        </PrimaryButton>
        <button type="button" onClick={() => { setError(null); setForgot("form"); }}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground">Forgot your password?</button>
      </form>
    </AuthFrame>
  );
}

function SetPasswordScreen({ email, onDone, onSignOut }: { email: string; onDone: () => void; onSignOut: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">Choose your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">{email}</p>
      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < 10) { setError("Use at least 10 characters."); return; }
        if (password !== confirm) { setError("The two passwords don't match."); return; }
        setBusy(true); setError(null);
        const { error } = await supabase.auth.updateUser({ password });
        setBusy(false);
        if (error) { setError(error.message); return; }
        onDone();
      }}>
        <div>
          <FieldLabel>New password</FieldLabel>
          <input className={inputCls} type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Type it again</FieldLabel>
          <input className={inputCls} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrimaryButton type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save and continue
        </PrimaryButton>
      </form>
      <button onClick={onSignOut} className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground">Cancel and sign out</button>
    </AuthFrame>
  );
}

// ── The shared-documents browser ─────────────────────────────────────────────
function PermissionBadge({ p }: { p: SharePermission }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
      p === "read_write" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground",
    )}>
      {PERMISSION_LABEL[p]}
    </span>
  );
}

function SharedBrowser({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [home, setHome] = useState<{ me: { displayName: string | null }; items: HomeItem[] } | null>(null);
  const [view, setView] = useState<FolderView | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (folderId) setView(await guestFetch(`/api/guest?op=folder&id=${encodeURIComponent(folderId)}`));
      else { setHome(await guestFetch("/api/guest?op=home")); setView(null); }
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 403 && !folderId) { onSignOut(); return; }
      setError(e instanceof Error ? e.message : "Could not load");
    } finally { setLoading(false); }
  }, [folderId, onSignOut]);
  useEffect(() => { void load(); }, [load]);

  const canWrite = view?.permission === "read_write";

  /** Opened in a tab made synchronously, so the browser doesn't block it as a pop-up. */
  async function openDoc(id: string, download = false) {
    const tab = download ? null : window.open("", "_blank");
    try {
      const { url } = await guestFetch(`/api/guest?op=open&id=${encodeURIComponent(id)}${download ? "&download=1" : ""}`);
      if (tab) tab.location.href = url; else window.location.assign(url);
    } catch (e) {
      tab?.close();
      toast.error(e instanceof Error ? e.message : "Could not open the file");
    }
  }

  async function uploadFiles(files: File[]) {
    if (!view || !files.length) return;
    setBusy(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`);
    try {
      // A batch at a time — the server takes up to 20 per request.
      let added = 0;
      const failed: string[] = [];
      for (let i = 0; i < files.length; i += 20) {
        const form = new FormData();
        form.set("op", "upload");
        form.set("folderId", view.folder.id);
        for (const f of files.slice(i, i + 20)) form.append("file", f);
        const r = await guestFetch("/api/guest", { method: "POST", body: form });
        added += r.added ?? 0;
        failed.push(...(r.failed ?? []));
      }
      if (added) toast.success(`${added} file${added === 1 ? "" : "s"} uploaded`);
      if (failed.length) toast.error(failed.length === 1 ? failed[0] : `${failed.length} files failed`, { description: failed.slice(0, 4).join("\n") });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(null); }
  }

  async function act(label: string, fn: () => Promise<unknown>, done: string) {
    setBusy(label);
    try { await fn(); toast.success(done); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "That didn't work"); }
    finally { setBusy(null); }
  }

  const newFolder = () => {
    const name = window.prompt("New folder name");
    if (!name?.trim() || !view) return;
    void act("Creating folder…", () => postJson({ op: "mkdir", parentId: view.folder.id, name }), `Folder “${name.trim()}” created`);
  };
  const renameItem = (type: "folder" | "document", id: string, current: string) => {
    const name = window.prompt("Rename to", current);
    if (!name?.trim() || name.trim() === current) return;
    void act("Renaming…", () => postJson({ op: "rename", type, id, name }), "Renamed");
  };
  const removeItem = (type: "folder" | "document", id: string, name: string) => {
    if (!window.confirm(`Remove “${name}”? This can't be undone.`)) return;
    void act("Removing…", () => postJson({ op: "remove", type, id }), "Removed");
  };

  const displayName = home?.me.displayName;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-10">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 py-4">
        <Brand />
        <div className="flex items-center gap-3">
          <span className="hidden text-right text-xs text-muted-foreground sm:block">
            {displayName && <span className="block text-sm text-foreground">{displayName}</span>}
            {email}
          </span>
          <GhostButton onClick={onSignOut}><LogOut className="h-4 w-4" /> Sign out</GhostButton>
        </div>
      </header>

      {/* Where we are */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
          <button onClick={() => setFolderId(null)}
            className={cn("hover:underline", folderId ? "text-primary" : "font-semibold text-foreground")}>
            Shared with you
          </button>
          {view?.crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <button onClick={() => setFolderId(c.id)}
                className={cn("max-w-[220px] truncate hover:underline", i === view.crumbs.length - 1 ? "font-semibold text-foreground" : "text-primary")}>
                {c.name}
              </button>
            </span>
          ))}
          {view && <span className="ml-2"><PermissionBadge p={view.permission} /></span>}
        </nav>
        {view && canWrite && (
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void uploadFiles(f); }} />
            <GhostButton onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload className="h-4 w-4" /> Upload files</GhostButton>
            <GhostButton onClick={newFolder} disabled={!!busy}><FolderPlus className="h-4 w-4" /> New folder</GhostButton>
          </div>
        )}
      </div>
      <input ref={replaceRef} type="file" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        const id = replaceTarget.current;
        if (!f || !id) return;
        const form = new FormData();
        form.set("op", "replace"); form.set("docId", id); form.set("file", f);
        void act("Replacing…", () => guestFetch("/api/guest", { method: "POST", body: form }), "File replaced");
      }} />

      {busy && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {busy}</div>
      )}

      <div
        className="relative mt-4 flex-1 rounded-2xl border border-border bg-card/60 p-2 sm:p-3"
        onDragOver={(e) => { if (canWrite) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!canWrite) return;
          e.preventDefault(); setDragOver(false);
          void uploadFiles(Array.from(e.dataTransfer.files ?? []));
        }}
      >
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="mt-4 flex justify-center gap-2">
              {folderId && <GhostButton onClick={() => setFolderId(null)}><ArrowLeft className="h-4 w-4" /> Back</GhostButton>}
              <GhostButton onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Try again</GhostButton>
            </div>
          </div>
        ) : !view ? (
          (home?.items.length ?? 0) === 0 ? (
            <div className="py-16 text-center">
              <Folder className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nothing has been shared with you yet.</p>
              <p className="mt-1 text-xs text-muted-foreground/70">When JLS Yachts shares a file or folder with you, it appears here.</p>
            </div>
          ) : (
            <ul>
              {home!.items.map((it) => (
                <li key={`${it.type}:${it.id}`}>
                  <button onClick={() => (it.type === "folder" ? setFolderId(it.id) : void openDoc(it.id))}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-background/40">
                    {it.type === "folder"
                      ? <Folder className="h-5 w-5 shrink-0 text-amber-300" />
                      : <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{it.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Shared{it.sharedBy ? ` by ${it.sharedBy}` : ""} · {fmtDate(it.sharedAt)}
                        {it.expiresAt ? ` · until ${fmtDate(it.expiresAt)}` : ""}
                      </span>
                    </span>
                    <PermissionBadge p={it.permission} />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : view.folders.length === 0 && view.documents.length === 0 ? (
          <div className="py-16 text-center">
            <Folder className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">This folder is empty.</p>
            {canWrite && <p className="mt-1 text-xs text-muted-foreground/70">Drag files here, or use Upload files.</p>}
          </div>
        ) : (
          <ul>
            {view.folders.map((f) => (
              <li key={f.id} className="group flex items-center gap-1 rounded-xl transition hover:bg-background/40">
                <button onClick={() => setFolderId(f.id)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left">
                  <Folder className="h-5 w-5 shrink-0 text-amber-300" />
                  <span className="truncate text-sm font-medium text-foreground">{f.name}</span>
                </button>
                {canWrite && (
                  <RowMenu>
                    <DropdownMenuItem onClick={() => renameItem("folder", f.id, f.name)}><Pencil className="mr-2 h-4 w-4" /> Rename</DropdownMenuItem>
                    {f.guestAdded && (
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => removeItem("folder", f.id, f.name)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Remove
                      </DropdownMenuItem>
                    )}
                  </RowMenu>
                )}
              </li>
            ))}
            {view.documents.map((d) => (
              <li key={d.id} className="group flex items-center gap-1 rounded-xl transition hover:bg-background/40">
                <button onClick={() => void openDoc(d.id)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left">
                  <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{d.name}</span>
                    <span className="block text-xs text-muted-foreground">Added {fmtDate(d.createdAt)}{d.guestAdded ? " · by a guest" : ""}</span>
                  </span>
                </button>
                <RowMenu>
                  <DropdownMenuItem onClick={() => void openDoc(d.id, true)}><Download className="mr-2 h-4 w-4" /> Download</DropdownMenuItem>
                  {canWrite && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => renameItem("document", d.id, d.name)}><Pencil className="mr-2 h-4 w-4" /> Rename</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { replaceTarget.current = d.id; replaceRef.current?.click(); }}>
                        <Upload className="mr-2 h-4 w-4" /> Replace with a new version
                      </DropdownMenuItem>
                      {d.guestAdded && (
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => removeItem("document", d.id, d.name)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Remove
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </RowMenu>
              </li>
            ))}
          </ul>
        )}

        {dragOver && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-black/60">
            <Upload className="h-7 w-7 text-primary" />
            <span className="text-sm">Drop to upload to “{view?.folder.name}”</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RowMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button title="More" className="mr-2 rounded-md p-1.5 text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
