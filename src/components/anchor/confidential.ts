/**
 * Anchor → Confidential: documents, templates and signatories only admins and
 * people with the "Anchor — Confidential" permission can see.
 *
 * The database enforces it (migration 20261015140000_anchor_confidential.sql):
 * confidential rows are invisible to everyone else, and so are files stored
 * under "confidential/" in the esign-documents and signatures buckets. These
 * helpers just decide whether to show the tab and where to put new files.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/** Storage path for a new file: confidential ones live under "confidential/". */
export const confidentialPath = (confidential: boolean | null | undefined, path: string) =>
  confidential ? `confidential/${path}` : path;

/** Whether the signed-in user may see Anchor's confidential area (null while checking). */
export function useCanSeeAnchorConfidential(): boolean | null {
  const { user } = useAuth();
  const [can, setCan] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user?.id) { setCan(false); return; }
    let alive = true;
    void (supabase as any).rpc("can_see_anchor_confidential", { p_user_id: user.id })
      .then(({ data }: any) => { if (alive) setCan(data === true); }, () => { if (alive) setCan(false); });
    return () => { alive = false; };
  }, [user?.id]);
  return can;
}
