/**
 * A photo field's value that survives the page being reloaded (see "Drafts" in
 * logistics-offline.ts). Re-reads when `key` changes — e.g. a different boat's handover.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDraftFile, loadDraftFile, saveDraftFile } from "./logistics-offline";

export function usePersistedFile(key: string): [File | null, (f: File | null) => void] {
  const [file, setFile] = useState<File | null>(null);
  const keyRef = useRef(key);
  const touched = useRef(false);

  useEffect(() => {
    keyRef.current = key;
    touched.current = false;
    setFile(null);
    let on = true;
    // A photo taken before the saved one has finished loading wins — never overwrite the newer with the older.
    void loadDraftFile(key).then((f) => { if (on && f && !touched.current) setFile(f); }).catch(() => { /* no storage: just no restore */ });
    return () => { on = false; };
  }, [key]);

  const set = useCallback((f: File | null) => {
    touched.current = true;
    setFile(f);
    const k = keyRef.current;
    void (f ? saveDraftFile(k, f) : deleteDraftFile(k)).catch(() => { /* keeping a copy is best effort */ });
  }, []);

  return [file, set];
}
