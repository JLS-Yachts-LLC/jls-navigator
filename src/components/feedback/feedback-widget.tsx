import { storageRef } from "@/lib/signed-url";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getCapturedLog } from "@/lib/action-log";
import { fileToBase64 } from "@/lib/file-to-base64";
import { Lightbulb, Bug, Sparkles, X, Loader2, Upload, CheckCircle2, ExternalLink, Camera, FileText, Video } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tab = "bug" | "feature";

/** Attachments accepted for review — screenshots plus documents (PDF / Word /
 *  Excel / text), so a spec or a marked-up doc can be sent, not just an image. */
const ACCEPT = [
  "image/*", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".rtf", ".odt", ".msg", ".eml",
].join(",");
const MAX_MB = 25;
/** Stop a recording before it can exceed the upload limit, rather than binning
 *  the clip afterwards. Also cap the length — a 10-minute clip is never needed
 *  to show a bug, and the byte cap alone would allow one at a low bitrate. */
const REC_MAX_BYTES = 24 * 1024 * 1024;
const REC_MAX_SECS = 5 * 60;
const REC_BITRATE = 800_000;

export function FeedbackWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("bug");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [recSecs, setRecSecs] = useState(0);
  // While recording, the dialog collapses to a floating pill so it isn't sitting
  // on top of the very thing being recorded.
  const [minimised, setMinimised] = useState(false);

  const isImage = !!file?.type.startsWith("image/");
  const isVideo = !!file?.type.startsWith("video/");

  // Preview URL for image/video attachments — created once per file and revoked
  // on change so we don't leak blob URLs on every render.
  const previewUrl = useMemo(
    () => (file && (file.type.startsWith("image/") || file.type.startsWith("video/")) ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Tick the elapsed-time readout while recording, and stop at the length cap.
  useEffect(() => {
    if (!recorder) return;
    const t = setInterval(() => setRecSecs((s) => {
      const next = s + 1;
      if (next >= REC_MAX_SECS && recorder.state !== "inactive") {
        toast.info(`Recording stopped at ${REC_MAX_SECS / 60} minutes — the clip has been attached.`);
        recorder.stop();
      }
      return next;
    }), 1000);
    return () => clearInterval(t);
  }, [recorder]);

  // Never leave the screen-share running if the dialog is dismissed mid-recording.
  useEffect(() => {
    if (!open && recorder && recorder.state !== "inactive") recorder.stop();
  }, [open, recorder]);

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

  /**
   * Record the screen (browser tab) to a video the reviewer can play back —
   * far more useful than a still for reproducing an intermittent bug. The
   * browser's own picker chooses what to share; stopping the share (or pressing
   * Stop) ends the recording and attaches it. Comments go in the description as
   * usual, so the report is "video + what you were doing".
   */
  async function startRecording() {
    const md = navigator.mediaDevices as any;
    if (!md?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      toast.error("Screen recording isn't supported in this browser — attach a screenshot or document instead.");
      return;
    }
    try {
      // No displaySurface hint — that one restricted the picker to browser tabs,
      // so "Entire Screen" and "Window" were never offered. Let the user choose.
      const stream: MediaStream = await md.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      // Pick the first container the browser can actually encode.
      const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]
        .find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: REC_BITRATE } : undefined);
      const chunks: Blob[] = [];
      let bytes = 0;
      rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        chunks.push(e.data);
        bytes += e.data.size;
        // Stop ourselves at the cap so the footage so far is kept and attached.
        if (bytes >= REC_MAX_BYTES && rec.state !== "inactive") {
          toast.info(`Recording stopped at ${MAX_MB} MB — the clip so far has been attached.`);
          rec.stop();
        }
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecorder(null);
        setMinimised(false); // the pill goes with it, however the share ended
        const type = mime.split(";")[0] || "video/webm";
        const blob = new Blob(chunks, { type });
        const ext = type.includes("mp4") ? "mp4" : "webm";
        if (!blob.size) {
          toast.error("Nothing was captured — try again and pick a screen, window or tab to share.");
          return;
        }
        setFile(new File([blob], `screen-recording-${Date.now()}.${ext}`, { type }));
        toast.success("Recording attached — add your comments below.");
      };
      // Ending the share from the browser's own bar should stop us too.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => { if (rec.state !== "inactive") rec.stop(); });
      rec.start(1000);
      setRecSecs(0);
      setRecorder(rec);
      // Hide the dialog while recording so the app underneath is visible and
      // clickable — otherwise the bug can't be reproduced on camera.
      setMinimised(true);
    } catch (e: any) {
      if (e?.name !== "NotAllowedError" && e?.name !== "AbortError") toast.error("Could not start the recording");
    }
  }

  function stopRecording() {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setMinimised(false); // bring the form back so the clip can be described
  }

  // Manual pick — accept documents as well as images, with a size guard.
  function pickFile(f: File | null) {
    if (f && f.size > MAX_MB * 1024 * 1024) {
      toast.error(`“${f.name}” is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_MB} MB.`);
      return;
    }
    setFile(f);
  }

  const [done, setDone] = useState(false);

  function reset() {
    setTitle(""); setMessage(""); setFile(null); setDone(false); setTab("bug");
  }

  async function submit() {
    if (!message.trim()) { toast.error("Please add a short description"); return; }
    setBusy(true);
    try {
      // Attachment (screenshot, screen recording or document) — allowed on both
      // tabs now, so a feature request can carry a spec document too.
      let screenshotUrl: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "png";
        const path = `feedback/${user?.id ?? "anon"}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("permit-documents")
          .upload(path, file, { upsert: true, contentType: file.type || undefined });
        if (upErr) throw new Error(`Attachment upload failed: ${upErr.message}`);
        screenshotUrl = storageRef("permit-documents", path);
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

      {/* Recording in progress: the dialog is out of the way, so all that shows
          is a small pill the user can stop from. Everything typed is kept. */}
      {open && minimised && (
        <div className="fixed bottom-5 right-5 z-[960] flex items-center gap-2 rounded-full border border-red-500/40 bg-card/95 py-2 pl-3 pr-2 shadow-2xl backdrop-blur">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="font-display text-[13px] font-semibold text-red-400">
            Recording {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
          </span>
          <span className="hidden text-[12px] text-muted-foreground sm:inline">— reproduce the issue now</span>
          <button type="button" onClick={stopRecording}
            className="ml-1 rounded-full bg-red-500/15 px-3 py-1 text-[13px] font-semibold text-red-400 hover:bg-red-500/25">
            Stop
          </button>
        </div>
      )}

      {open && !minimised && (
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

                  {/* Attachment — screenshot, screen recording, or any document */}
                  <div className="flex flex-wrap gap-2">
                    <label className="flex flex-1 min-w-[180px] cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:border-primary/50">
                      <Upload className="h-4 w-4 shrink-0" />
                      {file ? <span className="truncate text-foreground">{file.name}</span> : "Attach a file (image, PDF, Word…)"}
                      <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                    </label>
                    {tab === "bug" && !recorder && (
                      <>
                        <button type="button" onClick={takeScreenshot} disabled={capturing}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2.5 text-sm font-medium hover:border-primary/50 disabled:opacity-60">
                          {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Screenshot
                        </button>
                        <button type="button" onClick={startRecording}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2.5 text-sm font-medium hover:border-primary/50">
                          <Video className="h-4 w-4" /> Record screen
                        </button>
                      </>
                    )}
                    {recorder && !minimised && (
                      <button type="button" onClick={stopRecording}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/20">
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                        Stop recording · {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
                      </button>
                    )}
                  </div>

                  {recorder && (
                    <p className="text-[11px] text-red-400/90">
                      Recording — reproduce the issue now, then press <strong>Stop recording</strong> (or end the share from your browser's bar) and describe it above.
                    </p>
                  )}

                  {/* Attachment preview */}
                  {file && !recorder && (
                    <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/20 p-2">
                      {isImage && previewUrl ? (
                        <img src={previewUrl} alt="" className="h-16 rounded border border-border object-cover" />
                      ) : isVideo && previewUrl ? (
                        <video src={previewUrl} controls className="h-28 rounded border border-border" />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10">
                          <FileText className="h-5 w-5 text-primary/80" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium">{file.name}</div>
                        <div className="text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</div>
                      </div>
                      <button type="button" onClick={() => setFile(null)} className="text-[12px] text-muted-foreground hover:text-destructive">Remove</button>
                    </div>
                  )}

                  {tab === "bug" && (
                    <p className="text-[11px] text-muted-foreground">
                      A short activity log (recent actions + any error) is attached automatically to help us diagnose it.
                    </p>
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
