/**
 * Who may call the ShipSync server endpoints. The old rule was "any signed-in account".
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "../../../components/logistics/__tests__/fake-backend";

const be = new FakeBackend();
let m: typeof import("../access.server");

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  m = await import("../access.server");
});
after(async () => { await be.stop(); });
beforeEach(() => {
  be.reset();
  be.users.set("tok-admin", { id: "U-admin", email: "admin@jls.com" });
  be.users.set("tok-staff", { id: "U-staff", email: "staff@jls.com" });
  be.users.set("tok-nobody", { id: "U-nobody", email: "nobody@jls.com" });
  be.users.set("tok-driver", { id: "U-driver", email: "ali@jls.com" });
  be.users.set("tok-captain", { id: "U-captain", email: "cap@yacht.com" });
  be.rows("user_profiles").push({ user_id: "U-admin", roles: { name: "global_admin" } });
  be.rows("user_profiles").push({ user_id: "U-staff", department: "Logistics", roles: { name: "jls_staff" } });
  be.rows("user_profiles").push({ user_id: "U-nobody", department: "Marketing", roles: { name: "jls_staff" } });
  be.rows("department_permissions").push({ department: "Logistics", module_slug: "shipsync", can_view: true, can_create: false, can_edit: false });
  be.rows("shipsync_drivers").push({ id: "D1", user_id: "U-driver", email: "ali@jls.com", active: true });
  be.rows("shipsync_delivery_notes").push({ id: "N-mine", driver_id: "D1" }, { id: "N-other", driver_id: "D2" });
  be.rows("captain_accounts").push({ id: "C1", user_id: "U-captain", active: true });
});

const req = (token?: string) => new Request("http://x/api/shipsync/note-pdf", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
const status = async (p: Promise<import("../access.server").ShipSyncAccess>) => { const r = await p; return r.ok ? 200 : r.response.status; };

test("no token, or a token that isn't valid, is 401", async () => {
  assert.equal(await status(m.authorizeShipSync(req())), 401);
  assert.equal(await status(m.authorizeShipSync(req("garbage"))), 401);
});

test("a global admin is allowed, at any level", async () => {
  assert.equal(await status(m.authorizeShipSync(req("tok-admin"), { level: "edit" })), 200);
});

test("staff with ShipSync access are allowed at the level they hold, and refused above it", async () => {
  assert.equal(await status(m.authorizeShipSync(req("tok-staff"))), 200);
  assert.equal(await status(m.authorizeShipSync(req("tok-staff"), { level: "edit" })), 403, "view access can't run the SharePoint sync");
});

test("a signed-in account with no ShipSync access is refused (this used to be allowed)", async () => {
  assert.equal(await status(m.authorizeShipSync(req("tok-nobody"))), 403);
  assert.equal(await status(m.authorizeShipSync(req("tok-nobody"), { driverOk: true, noteId: "N-mine" })), 403);
});

test("a driver may act on their OWN delivery note, only where drivers are allowed", async () => {
  assert.equal(await status(m.authorizeShipSync(req("tok-driver"), { driverOk: true, noteId: "N-mine" })), 200);
  assert.equal(await status(m.authorizeShipSync(req("tok-driver"), { driverOk: true, noteId: "N-other" })), 403, "someone else's run");
  assert.equal(await status(m.authorizeShipSync(req("tok-driver"), { driverOk: true, noteId: "N-missing" })), 403);
  assert.equal(await status(m.authorizeShipSync(req("tok-driver"), { driverOk: false, noteId: "N-mine" })), 403, "e.g. the SharePoint sync");
  assert.equal(await status(m.authorizeShipSync(req("tok-driver"))), 403, "a route that takes no driver");
});

test("a driver is found by email when their login isn't linked, but a retired driver is not a driver", async () => {
  be.users.set("tok-d2", { id: "U-new", email: "bob@jls.com" });
  be.rows("shipsync_drivers").push({ id: "D3", user_id: null, email: "bob@jls.com", active: true });
  be.rows("shipsync_delivery_notes").push({ id: "N-bob", driver_id: "D3" });
  assert.equal(await status(m.authorizeShipSync(req("tok-d2"), { driverOk: true, noteId: "N-bob" })), 200);
  be.rows("shipsync_drivers").find((d) => d.id === "D3")!.active = false;
  assert.equal(await status(m.authorizeShipSync(req("tok-d2"), { driverOk: true, noteId: "N-bob" })), 403);
});

test("a client-portal captain is refused, even one that also carries staff access", async () => {
  assert.equal(await status(m.authorizeShipSync(req("tok-captain"), { driverOk: true, noteId: "N-mine" })), 403);
  be.rows("user_profiles").push({ user_id: "U-captain", roles: { name: "global_admin" } });
  assert.equal(await status(m.authorizeShipSync(req("tok-captain"))), 403);
});
