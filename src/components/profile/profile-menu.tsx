/**
 * The avatar in the top bar: who you are signed in as, a way to edit that, and
 * a way to sign out.
 *
 * Shared by both shells — the classic top bar and the Beta one — so the two
 * cannot drift, and so a picture set in one shows in the other.
 *
 * Avatars live in `permit-documents/staff-avatars/`. That bucket is private and
 * readable by staff only, which is exactly the audience for a staff photo, and
 * it avoids a new bucket with new policies for one small feature.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { storageRef, useSignedUrl } from "@/lib/signed-url";
import { compressImageToMaxKB } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, LogOut, UserRound, Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";

const AVATAR_PREFIX = "staff-avatars";

export function initialsOf(name: string | null, email: string | null): string {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || source.slice(0, 2).toUpperCase();
  }
  return (email ?? "U").slice(0, 2).toUpperCase();
}

/** The signed-in person's name and picture, kept fresh after an edit. */
export function useMyProfile() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!user?.id) { setDisplayName(null); setAvatarUrl(null); return; }
    void (supabase as any)
      .from("user_profiles").select("display_name, avatar_url").eq("user_id", user.id).maybeSingle()
      .then(({ data }: any) => {
        if (!alive || !data) return;
        setDisplayName(data.display_name ?? null);
        setAvatarUrl(data.avatar_url ?? null);
      });
    return () => { alive = false; };
  }, [user?.id]);

  return { displayName, avatarUrl, setDisplayName, setAvatarUrl, email: user?.email ?? null };
}

/** Round avatar that shows the picture when there is one, initials otherwise. */
export function ProfileAvatar({ avatarUrl, initials, size = 30, className, style }: {
  avatarUrl: string | null; initials: string; size?: number;
  className?: string; style?: React.CSSProperties;
}) {
  const resolved = useSignedUrl(avatarUrl);
  const [failed, setFailed] = useState(false);
  const box: React.CSSProperties = {
    width: size, height: size, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: Math.max(10, Math.round(size * 0.4)), fontWeight: 600,
    overflow: "hidden", flexShrink: 0, ...style,
  };
  if (resolved && !failed) {
    return (
      <img
        src={resolved} alt="" style={{ ...box, objectFit: "cover" }} className={className}
        onError={() => setFailed(true)}
      />
    );
  }
  return <div style={box} className={className}>{initials}</div>;
}

/**
 * Change your own name and picture. Saving goes through /api/me/profile —
 * user_profiles is admin-write under RLS, so the browser cannot update even its
 * own row directly.
 */
export function EditProfileDialog({ open, onClose, profile }: {
  open: boolean;
  onClose: () => void;
  profile: ReturnType<typeof useMyProfile>;
}) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.displayName ?? "");
  const [avatar, setAvatar] = useState<string | null>(profile.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) { setName(profile.displayName ?? ""); setAvatar(profile.avatarUrl); }
  }, [open, profile.displayName, profile.avatarUrl]);

  async function pickImage(file: File | null) {
    if (!file || !user?.id) return;
    setUploading(true);
    try {
      // A phone photo is several megabytes and this renders at 30px — shrink it
      // on the way up rather than storing a camera original.
      const { file: shrunk } = await compressImageToMaxKB(file, 300);
      const ext = (shrunk.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
      const path = `${AVATAR_PREFIX}/${user.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("permit-documents").upload(path, shrunk, { upsert: true, contentType: shrunk.type });
      if (error) throw new Error(error.message);
      setAvatar(storageRef("permit-documents", path));
      toast.success("Picture ready — save to apply it");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not use that image");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    if (!name.trim()) { toast.error("Your name cannot be empty"); return; }
    setBusy(true);
    try {
      const { data: { session } } = await (supabase as any).auth.getSession();
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ display_name: name.trim(), avatar_url: avatar }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Save failed (${res.status})`);
      profile.setDisplayName(body.display_name ?? name.trim());
      profile.setAvatarUrl(body.avatar_url ?? null);
      toast.success("Profile updated");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Your profile</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <ProfileAvatar
              avatarUrl={avatar}
              initials={initialsOf(name, profile.email)}
              size={64}
              style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
            />
            <div className="flex flex-col gap-1.5">
              <Button
                type="button" variant="outline" size="sm" className="gap-1.5"
                disabled={uploading} onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                {avatar ? "Change picture" : "Add a picture"}
              </Button>
              {avatar && (
                <button
                  type="button" onClick={() => setAvatar(null)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              )}
              <input
                ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => void pickImage(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="How your name appears across the app"
              onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
            />
            <p className="text-[11px] text-muted-foreground">
              This is the name shown on tickets, assignments and everywhere else in Polaris.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={profile.email ?? ""} disabled />
            <p className="text-[11px] text-muted-foreground">
              Your sign-in address — an administrator changes this.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy || uploading} className="gap-1.5">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The avatar button plus its menu. `renderTrigger` lets each shell keep its own
 * avatar styling — the Beta bar's gold ring, the classic bar's primary tint —
 * while the menu itself stays identical.
 */
export function ProfileMenu({ renderTrigger }: {
  renderTrigger: (args: { avatarUrl: string | null; initials: string; name: string }) => React.ReactNode;
}) {
  const { signOut } = useAuth();
  const profile = useMyProfile();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape — the menu is a plain popover rather
  // than a portalled one, so it must clean up after itself.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = profile.displayName ?? profile.email ?? "";
  const initials = initialsOf(profile.displayName, profile.email);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={name}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex" }}
      >
        {renderTrigger({ avatarUrl: profile.avatarUrl, initials, name })}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center gap-3 border-b border-border/70 px-3 py-3">
            <ProfileAvatar
              avatarUrl={profile.avatarUrl} initials={initials} size={36}
              style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{profile.displayName ?? "—"}</div>
              <div className="truncate text-[11px] text-muted-foreground">{profile.email}</div>
            </div>
          </div>

          <button
            role="menuitem"
            onClick={() => { setOpen(false); setEditOpen(true); }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-accent"
          >
            <UserRound className="h-4 w-4 text-muted-foreground" /> Edit profile
          </button>
          <button
            role="menuitem"
            onClick={() => { setOpen(false); void signOut(); }}
            className="flex w-full items-center gap-2 border-t border-border/70 px-3 py-2.5 text-left text-sm text-destructive transition hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}

      <EditProfileDialog open={editOpen} onClose={() => setEditOpen(false)} profile={profile} />
    </div>
  );
}
