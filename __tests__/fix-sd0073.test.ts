import { describe, it, expect } from "vitest";
import {
  getVisiblePermitDocuments,
  isDocumentExpired,
  type PermitDocumentLike,
} from "@/lib/permit-document-versions";

// All test rows use the TEST_ prefix / clearly synthetic ids. This module is
// a pure in-memory utility, so no Supabase writes happen and no cleanup is
// required — the "data" here never leaves this test file.

describe("SD-0073: hide superseded expired permit versions", () => {
  it("keeps only the renewed version when a document has been renewed", () => {
    const rows: PermitDocumentLike[] = [
      {
        id: "TEST_doc_v1_expired",
        document_type: "exit_entry",
        vessel_id: "TEST_vessel_1",
        status: "expired",
        expiry_date: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "TEST_doc_v2_renewed",
        document_type: "exit_entry",
        vessel_id: "TEST_vessel_1",
        status: "active",
        expiry_date: "2027-01-01T00:00:00.000Z",
      },
    ];

    const visible = getVisiblePermitDocuments(rows);

    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("TEST_doc_v2_renewed");
  });

  it("keeps an expired document visible when it has not been renewed", () => {
    const rows: PermitDocumentLike[] = [
      {
        id: "TEST_doc_only_expired",
        document_type: "sanitation",
        vessel_id: "TEST_vessel_2",
        status: "expired",
        expiry_date: "2026-01-01T00:00:00.000Z",
      },
    ];

    const visible = getVisiblePermitDocuments(rows);

    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("TEST_doc_only_expired");
    expect(isDocumentExpired(visible[0])).toBe(true);
  });

  it("keeps the most recent of 3+ versions and drops the older ones", () => {
    const rows: PermitDocumentLike[] = [
      {
        id: "TEST_doc_v1",
        document_type: "gate_pass",
        vessel_id: "TEST_vessel_3",
        status: "expired",
        expiry_date: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "TEST_doc_v2",
        document_type: "gate_pass",
        vessel_id: "TEST_vessel_3",
        status: "expired",
        expiry_date: "2025-01-01T00:00:00.000Z",
      },
      {
        id: "TEST_doc_v3_latest",
        document_type: "gate_pass",
        vessel_id: "TEST_vessel_3",
        status: "active",
        expiry_date: "2027-06-01T00:00:00.000Z",
      },
    ];

    const visible = getVisiblePermitDocuments(rows);

    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("TEST_doc_v3_latest");
  });

  it("does not mix up documents of different types or different vessels", () => {
    const rows: PermitDocumentLike[] = [
      { id: "TEST_a_v1", document_type: "tdra", vessel_id: "TEST_vessel_A", status: "expired", expiry_date: "2026-01-01T00:00:00.000Z" },
      { id: "TEST_a_v2", document_type: "tdra", vessel_id: "TEST_vessel_A", status: "active", expiry_date: "2027-01-01T00:00:00.000Z" },
      { id: "TEST_b_v1", document_type: "tdra", vessel_id: "TEST_vessel_B", status: "expired", expiry_date: "2026-01-01T00:00:00.000Z" },
      { id: "TEST_c_v1", document_type: "dma", vessel_id: "TEST_vessel_A", status: "expired", expiry_date: "2026-06-01T00:00:00.000Z" },
    ];

    const visible = getVisiblePermitDocuments(rows);
    const visibleIds = visible.map((d) => d.id).sort();

    // vessel A / tdra -> only the renewed v2; vessel B / tdra -> its only (still expired, unrenewed) row;
    // vessel A / dma -> its own, unrelated group, unaffected.
    expect(visibleIds).toEqual(["TEST_a_v2", "TEST_b_v1", "TEST_c_v1"].sort());
  });

  it("preserves the original relative order of the kept rows", () => {
    const rows: PermitDocumentLike[] = [
      { id: "TEST_keep_1", document_type: "navigation_license", vessel_id: "TEST_vessel_X", status: "active", expiry_date: "2027-01-01T00:00:00.000Z" },
      { id: "TEST_drop_1", document_type: "navigation_license", vessel_id: "TEST_vessel_Y", status: "expired", expiry_date: "2024-01-01T00:00:00.000Z" },
      { id: "TEST_keep_2", document_type: "navigation_license", vessel_id: "TEST_vessel_Y", status: "active", expiry_date: "2028-01-01T00:00:00.000Z" },
    ];

    const visible = getVisiblePermitDocuments(rows);

    expect(visible.map((d) => d.id)).toEqual(["TEST_keep_1", "TEST_keep_2"]);
  });
});
