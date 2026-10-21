/**
 * Permit / document version filtering.
 *
 * Fixes SD-0073: the Permits screen listed both the expired and the renewed
 * version of the same document, which made it look like the document was
 * still expired even after it had already been renewed.
 *
 * `getVisiblePermitDocuments` groups document rows that represent the same
 * logical document (same document type + same vessel/entity) and keeps only
 * the most recent version. If that latest version has itself expired (i.e.
 * no renewal has happened yet), it stays visible so it can still be tracked
 * and followed up — only strictly superseded (older) versions are hidden.
 *
 * Pass the raw array returned by the permits/documents query through this
 * function before mapping it to UI rows, e.g.:
 *
 *   const visible = getVisiblePermitDocuments(rows);
 */

export interface PermitDocumentLike {
  id: string;
  /** e.g. "exit_entry", "sanitation" — a PermitType key, or any document category key. */
  document_type?: string | null;
  type?: string | null;
  /** The vessel / entity the document belongs to. */
  vessel_id?: string | null;
  yacht_id?: string | null;
  entity_id?: string | null;
  /** Expiry date, ISO string, or null for documents that don't expire. */
  expiry_date?: string | null;
  expires_at?: string | null;
  /** When this version was issued / created. */
  issued_at?: string | null;
  issue_date?: string | null;
  created_at?: string | null;
  status?: string | null;
}

function groupKey(doc: PermitDocumentLike): string {
  const type = doc.document_type ?? doc.type ?? "unknown";
  const entity = doc.vessel_id ?? doc.yacht_id ?? doc.entity_id ?? "unknown";
  return `${type}::${entity}`;
}

function versionTimestamp(doc: PermitDocumentLike): number {
  const raw =
    doc.expiry_date ?? doc.expires_at ?? doc.issued_at ?? doc.issue_date ?? doc.created_at ?? null;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** True if the document's current status/expiry marks it as expired. Exposed so the
 *  UI can still show a "needs renewal" indicator on the single visible row. */
export function isDocumentExpired(doc: PermitDocumentLike): boolean {
  if (doc.status) return doc.status.toLowerCase() === "expired";
  const expiry = doc.expiry_date ?? doc.expires_at ?? null;
  if (!expiry) return false;
  return new Date(expiry).getTime() < Date.now();
}

/**
 * Collapse a flat list of permit/document rows down to the latest version per
 * (document type, vessel) pair.
 *
 * - If the newest version of a document is still valid (or expiring soon),
 *   every older/expired version of the same document is dropped.
 * - If the newest version of a document has itself expired (no renewal has
 *   happened yet), it is kept so it still shows up for follow-up — only rows
 *   older than it are dropped.
 *
 * The original relative order of the kept rows is preserved.
 */
export function getVisiblePermitDocuments<T extends PermitDocumentLike>(docs: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const doc of docs) {
    const key = groupKey(doc);
    const list = groups.get(key);
    if (list) list.push(doc);
    else groups.set(key, [doc]);
  }

  const keptIds = new Set<string>();
  for (const group of groups.values()) {
    const latest = [...group].sort((a, b) => versionTimestamp(b) - versionTimestamp(a))[0];
    keptIds.add(latest.id);
  }

  return docs.filter((d) => keptIds.has(d.id));
}
