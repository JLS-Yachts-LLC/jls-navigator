import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getCapturedLog } from "@/lib/action-log";
import { fileToBase64 } from "@/lib/file-to-base64";
import { Lightbulb, Bug, Sparkles, X, Loader2, Upload, CheckCircle2, ExternalLink, Camera } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tab = "bug" | "feature";

export function FeedbackWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("bug");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // Capture the screen via the browser and attach it as the screenshot. The
  // browser shows a picker (choose "This tab"/window); we grab a single frame.
  async function takeScreenshot() {
    const md = navigator.mediaDevices as any;
    if (!md?.getDisplayMedia) { toast.error("Screenshot capture isn't supported here — use Attach instead."); return; }
    setCapturing(true);
    try {
      const stream: MediaStream = await md.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      await new Promise((r) => setTimeout(r, 250)); // let dimensions settle
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
      if (blob) { setFile(new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" })); toast.success("Screenshot captured"); }
    } catch (e: any) {
      if (e?.name !== "NotAllowedError" && e?.name !== "AbortError") toast.error("Could not capture screenshot");
    } finally { setCapturing(false); }
  }
  const [done, setDone] = useState(false);

  function reset() {
    setTitle(""); setMessage(""); setFile(null); setDone(false); setTab("bug");
  }

  async function submit() {
    if (!message.trim()) { toast.error("Please add a short description"); return; }
    setBusy(true);
    try {
      let screenshotUrl: string | null = null;
      if (file && tab === "bug") {
        const ext = file.name.split(".").pop() || "png";
        const path = `feedback/${user?.id ?? "anon"}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("permit-documents").upload(path, file, { upsert: true });
        if (!upErr) screenshotUrl = supabase.storage.from("permit-documents").getPublicUrl(path).data.publicUrl;
      }
      const log = tab === "bug" ? getCapturedLog() : null;
      const { data: row, error } = await (supabase as any).from("feedback").insert({
        type: tab,
        title: title.trim() || null,
        message: message.trim(),
        screenshot_url: screenshotUrl,
        log,
        created_by: user?.id ?? null,
        created_by_email: user?.email ?? null,
      }).select("id").single();
      if (error) throw error;
      // Email IT support (best-effort; bugs always, features too).
      fetch("/api/feedback/notify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: row?.id }),
      }).catch(() => {});
      setDone(true);
      toast.success(tab === "bug" ? "Bug report sent — thank you!" : "Feature request submitted!");
    } catch (e: any) {
      toast.error(e.message ?? "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        title="Report a bug or suggest a feature"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-amber-400 transition"
      >
        <Lightbulb className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div onClick={() => setOpen(false)} className="fixed inset-0 z-[950] flex items-start justify-center bg-black/50 p-4 pt-[8vh]">
          <div onClick={(e) => e.stopPropagation()} className="w-[min(560px,100%)] rounded-xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <Lightbulb className="h-4 w-4 text-amber-400" /> Feedback
              </h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            {done ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                <p className="font-display font-semibold">Thank you!</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Your {tab === "bug" ? "bug report" : "feature request"} has been logged{tab === "bug" ? " and sent to IT support" : ""}.
                </p>
                <div className="flex gap-2">
                  <button onClick={reset} className="rounded-lg border border-border px-3 py-1.5 text-sm">Submit another</button>
                  <Link to={"/feedback" as any} onClick={() => setOpen(false)} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">View all requests</Link>
                </div>
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div className="mt-3 flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
                  {([["bug", "Report a Bug", Bug], ["feature", "Feature Request", Sparkles]] as const).map(([k, label, Icon]) => (
                    <button key={k} onClick={() => setTab(k)}
                      className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[12.5px] font-medium transition",
                        tab === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  {tab === "feature" && (
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. New coffee machine)"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" />
                  )}
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                    placeholder={tab === "bug" ? "What went wrong? What were you doing?" : "Describe your idea — staff can upvote it."}
                    className="min-h-[100px] w-full rounded-md border border-border bg-background p-3 text-sm" />

                  {tab === "bug" && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <label className="flex flex-1 min-w-[180px] cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:border-primary/50">
                          <Upload className="h-4 w-4" />
                          {file ? <span className="truncate text-foreground">{file.name}</span> : "Attach a screenshot (optional)"}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                        </label>
                        <button type="button" onClick={takeScreenshot} disabled={capturing}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2.5 text-sm font-medium hover:border-primary/50 disabled:opacity-60">
                          {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Take screenshot
                        </button>
                      </div>
                      {file && (
                        <div className="flex items-center gap-2">
                          <img src={URL.createObjectURL(file)} alt="" className="h-16 rounded border border-border object-cover" />
                          <button type="button" onClick={() => setFile(null)} className="text-[12px] text-muted-foreground hover:text-destructive">Remove</button>
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        A short activity log (recent actions + any error) is attached automatically to help us diagnose it.
                      </p>
                    </>
                  )}
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-3.5 py-2 text-sm">Cancel</button>
                  <button onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit
                  </button>
                </div>
                <Link to={"/feedback" as any} onClick={() => setOpen(false)} className="mt-3 flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3 w-3" /> View all feedback &amp; feature requests
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
