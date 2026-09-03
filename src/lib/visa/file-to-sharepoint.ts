/**
 * Filing an issued visa into its crew member's SharePoint folder.
 *
 * This exists because the same "attach the visa, then file it" flow is offered
 * from two places — the quick-attach on the Immigration dashboard and the attach
 * on a visa's own page — and the two copies drifted: one reported a filing
 * failure, the other discarded it. That is SD-0021. A visa would attach in
 * Polaris, the crew folder would be created in SharePoint, the upload would fail,
 * and the person filing it was told only "Visa attached".
 *
 * So the result is RETURNED rather than thrown, and it is never a bare boolean —
 * a caller cannot accidentally swallow the reason. `reportVisaFiling` gives both
 * callers the same message, and a failure is written to the application so it
 * outlives the toast and unfiled visas can be found later.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type FilingResult =
  | { ok: true; webUrl: string | null }
  | { ok: false; error: string };

export interface FilingRequest {
  /** The application being filed, so a failure can be recorded against it. */
  applicationId: string;
  vesselName: string | null;
  crewName: string;
  /** The file as picked, used for its name and content type. */
  file: File;
  /** Same base64 payload the upload was built from. */
  base64: string;
}

/**
 * Upload the visa into `Yacht / {vessel} / Crew Documents / {crew}` and record
 * the outcome on the application. Never throws: filing is secondary to the visa
 * itself being saved, but the outcome must always be known.
 */
export async function fileVisaToSharePoint(req: FilingRequest): Promise<FilingResult> {
  let result: FilingResult;
  try {
    const { uploadCrewDocToSharePoint } = await import("@/lib/visa-sharepoint.server");
    const res = await (uploadCrewDocToSharePoint as any)({
      data: {
        vesselName: req.vesselName,
        crewName: req.crewName,
        fileName: `Visa - ${req.file.name}`,
        contentType: req.file.type,
        base64: req.base64,
      },
    });
    result = { ok: true, webUrl: (res?.webUrl as string | null) ?? null };
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : "unknown error" };
  }

  // Persist the outcome. The visa is already saved either way, so a failure to
  // record must not turn into a second error in front of the user.
  try {
    await (supabase as any).from("visa_applications").update({
      sharepoint_filed_at: result.ok ? new Date().toISOString() : null,
      sharepoint_error: result.ok ? null : result.error.slice(0, 500),
    }).eq("id", req.applicationId);
  } catch { /* the toast still tells them; nothing else depends on this */ }

  return result;
}

/** The same message from both attach flows. */
export function reportVisaFiling(result: FilingResult): void {
  if (result.ok) {
    toast.success("Filed in the SharePoint crew folder");
  } else {
    toast.warning(`Visa saved, but SharePoint filing failed — file it manually. ${result.error}`, {
      duration: 12000,
    });
  }
}
