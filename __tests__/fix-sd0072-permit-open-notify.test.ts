import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Requires service-role access to bypass RLS and to create/delete test auth
// users. Uses the same env var names as the rest of the test suite.
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const hasCreds = !!SUPABASE_URL && !!SERVICE_ROLE_KEY;
const admin = hasCreds ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const staffEmail = `TEST_permit_notify_staff_${runId}@example.com`;
const clientEmail = `TEST_permit_notify_client_${runId}@example.com`;

let staffUserId: string | null = null;
let clientUserId: string | null = null;
let permitId: string | null = null;

(hasCreds ? describe : describe.skip)("SD-0072: permit portal-access notification trigger", () => {
  it("creates a notification on first open and suppresses it on repeat opens", async () => {
    if (!admin) throw new Error("no admin client");

    // --- set up two synthetic auth users: the staff member who shared the
    //     permit, and the portal user who opens it.
    const { data: staffAuth, error: staffErr } = await admin.auth.admin.createUser({
      email: staffEmail, email_confirm: true, password: "TEST_pw_12345!",
    });
    expect(staffErr).toBeNull();
    staffUserId = staffAuth!.user!.id;

    const { data: clientAuth, error: clientErr } = await admin.auth.admin.createUser({
      email: clientEmail, email_confirm: true, password: "TEST_pw_12345!",
    });
    expect(clientErr).toBeNull();
    clientUserId = clientAuth!.user!.id;

    // --- create a synthetic permit, shared by the staff user.
    const { data: permit, error: permitErr } = await admin
      .from("permits")
      .insert({
        permit_type: "cruising_mothership",
        permit_number: `TEST_PERMIT_${runId}`,
        holder_name: "TEST_ Cohesion",
        status: "active",
        created_by: staffUserId,
        email_sent_by: staffUserId,
        email_sent_at: new Date().toISOString(),
      })
      .select()
      .single();
    expect(permitErr).toBeNull();
    permitId = permit!.id;

    // --- first access: the client opens the shared link for the first time.
    const { error: firstAccessErr } = await admin.from("portal_document_access").insert({
      user_id: clientUserId,
      source_table: "permits",
      source_id: permitId,
      storage_ref: `TEST/permits/${permitId}/cruising-permit.pdf`,
      outcome: "viewed",
    });
    expect(firstAccessErr).toBeNull();

    // Give the AFTER INSERT trigger a beat to run (synchronous in Postgres,
    // but PostgREST round-trips can lag slightly in some test harnesses).
    await new Promise((r) => setTimeout(r, 300));

    const { data: firstNotifs, error: firstNotifsErr } = await admin
      .from("notifications")
      .select("*")
      .eq("user_id", staffUserId)
      .eq("type", "permit_portal_opened")
      .contains("metadata", { permit_id: permitId });
    expect(firstNotifsErr).toBeNull();
    expect(firstNotifs?.length).toBe(1);
    expect(firstNotifs![0].body).toContain("viewed");

    // --- second access (download): should NOT create a second notification.
    const { error: secondAccessErr } = await admin.from("portal_document_access").insert({
      user_id: clientUserId,
      source_table: "permits",
      source_id: permitId,
      storage_ref: `TEST/permits/${permitId}/cruising-permit.pdf`,
      outcome: "downloaded",
    });
    expect(secondAccessErr).toBeNull();

    await new Promise((r) => setTimeout(r, 300));

    const { data: secondNotifs, error: secondNotifsErr } = await admin
      .from("notifications")
      .select("*")
      .eq("user_id", staffUserId)
      .eq("type", "permit_portal_opened")
      .contains("metadata", { permit_id: permitId });
    expect(secondNotifsErr).toBeNull();
    expect(secondNotifs?.length).toBe(1); // still just the one, from the first open
  });

  afterAll(async () => {
    if (!admin) return;
    try {
      if (permitId) {
        await admin.from("notifications").delete().contains("metadata", { permit_id: permitId });
        await admin.from("portal_document_access").delete().eq("source_table", "permits").eq("source_id", permitId);
        await admin.from("permits").delete().eq("id", permitId);
      }
    } finally {
      if (staffUserId) await admin.auth.admin.deleteUser(staffUserId).catch(() => {});
      if (clientUserId) await admin.auth.admin.deleteUser(clientUserId).catch(() => {});
    }
  });
});
