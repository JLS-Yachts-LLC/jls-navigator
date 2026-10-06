// Orbit field app offline layer (src/lib/orbit-offline) — end-to-end check.
// Drives the real supabase-js through the offline layer against a fake PostgREST + Storage:
// a whole offline shift (Attend, comments, photo, checklist, Done), the send when signal
// returns, conflicts with the office, weak-signal duplicates and pre-loaded rows.
// Run:  npx tsx scripts/test-orbit-offline.ts
import { createClient } from "@supabase/supabase-js";
import { createOfflineLayer } from "../src/lib/orbit-offline/offline-fetch";
import { memoryStore } from "../src/lib/orbit-offline/store";
import { parseFilters, matchAll, parseOrder, sortRows } from "../src/lib/orbit-offline/postgrest";
import { randomUUID } from "node:crypto";

const URL_ = "https://proj.supabase.co";
let failures = 0;
const ok = (cond: unknown, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) failures++; };

// ── fake server ──
type Row = Record<string, any>;
const db: Record<string, Row[]> = {
  orbit2_projects: [
    { id: "p1", title: "Polish hull", status: "Scheduled/Assigned", assigned_team: ["Kasam"], schedule_date: "2026-10-07" },
    { id: "p2", title: "Fit fender", status: "Working On It", assigned_team: ["Kasam", "Rehman"], schedule_date: "2026-10-06" },
    { id: "p3", title: "Other crew", status: "Scheduled/Assigned", assigned_team: ["Anish"], schedule_date: "2026-10-05" },
  ],
  orbit2_attendance: [],
  orbit2_notes: [{ id: "n0", project_id: "p1", kind: "team_comment", body: "Old note", created_at: "2026-10-01T08:00:00Z" }],
  orbit2_files: [],
  orbit2_boat_checklist: [{ id: "c1", boat_id: "b1", template_id: "t1", checked: false }],
};
const UNIQUE: Record<string, string[]> = { orbit2_boat_checklist: ["boat_id", "template_id"] };
const storage = new Map<string, Blob>();
const net = { online: true, arriveThenFail: false, requests: [] as string[] };

async function server(input: any, init: any = {}): Promise<Response> {
  const url = typeof input === "string" ? input : input.url;
  const method = (init.method ?? "GET").toUpperCase();
  net.requests.push(`${method} ${url.replace(URL_, "")}`);
  if (!net.online) throw new TypeError("Failed to fetch");
  const u = new URL(url);
  const headers = new Headers(init.headers);
  const prefer = headers.get("prefer") ?? "";
  const respond = (body: any, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const result = await (async () => {
    if (u.pathname === "/rest/v1/rpc/orbit2_is_admin") return respond(false);
    const tm = /^\/rest\/v1\/(\w+)$/.exec(u.pathname);
    if (tm) {
      const t = tm[1]; const rows = (db[t] ??= []);
      const { filters } = parseFilters(u.searchParams);
      if (method === "GET") {
        let out = rows.filter((r) => matchAll(r, filters) === true);
        const ord = parseOrder(u.searchParams); if (ord) out = sortRows(out, ord);
        if ((headers.get("accept") ?? "").includes("pgrst.object")) return out.length === 1 ? respond(out[0]) : respond({ message: "not one row" }, 406);
        return respond(out);
      }
      const body = init.body ? JSON.parse(init.body) : null;
      if (method === "POST") {
        const items = Array.isArray(body) ? body : [body];
        const upsert = /merge-duplicates/.test(prefer);
        const keys = (u.searchParams.get("on_conflict") ?? "").split(",").filter(Boolean);
        const out: Row[] = [];
        for (const it of items) {
          if (upsert && keys.length) {
            const ex = rows.find((r) => keys.every((k) => r[k] === it[k]));
            if (ex) { Object.assign(ex, it); out.push(ex); continue; }
          } else if (it.id && rows.some((r) => r.id === it.id)) {
            return respond({ code: "23505", message: "duplicate key value violates unique constraint" }, 409);
          }
          const row = { id: randomUUID(), created_at: new Date("2026-10-07T14:30:00Z").toISOString(), ...(t === "orbit2_attendance" ? { attended_at: "2026-10-07T14:30:00.000Z" } : {}), ...it };
          rows.push(row); out.push(row);
        }
        return /representation/.test(prefer) ? respond(out, 201) : new Response(null, { status: 201 });
      }
      if (method === "PATCH") {
        const hit = rows.filter((r) => matchAll(r, filters) === true);
        hit.forEach((r) => Object.assign(r, body));
        return /representation/.test(prefer) ? respond(hit) : new Response(null, { status: 204 });
      }
      if (method === "DELETE") { db[t] = rows.filter((r) => matchAll(r, filters) !== true); return new Response(null, { status: 204 }); }
    }
    const sign = /^\/storage\/v1\/object\/sign\/(.+)$/.exec(u.pathname);
    if (sign && method === "POST") return respond({ signedURL: `/object/sign/${sign[1]}?token=real` });
    const up = /^\/storage\/v1\/object\/(.+)$/.exec(u.pathname);
    if (up && method === "POST") {
      const key = decodeURIComponent(up[1]);
      if (storage.has(key)) return respond({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }, 400);
      const fd = init.body as FormData;
      const file = fd.get("") as Blob;
      storage.set(key, file);
      return respond({ Key: key, Id: randomUUID() });
    }
    return respond({ message: "not found " + u.pathname }, 404);
  })();
  if (net.arriveThenFail) { net.arriveThenFail = false; throw new TypeError("Failed to fetch (timed out after arriving)"); }
  return result;
}

// ── wiring ──
let userId = "user-kasam";
let clock = new Date("2026-10-07T09:10:00Z");
const store = memoryStore();
let synced = 0;
const layer = createOfflineLayer({
  baseFetch: server as any,
  supabaseUrl: URL_,
  store,
  currentUserId: () => userId,
  getAccessToken: async () => "token-1",
  forcedOffline: () => false,
  uuid: () => randomUUID(),
  now: () => clock,
  onChange: () => {},
  onSynced: () => { synced++; },
});
const sb = createClient(URL_, "anon-key", { global: { fetch: layer.fetch }, accessToken: async () => "token-1", realtime: { transport: class { constructor() {} } as any } }) as any;

const FIELD = ["Scheduled/Assigned", "Re-assigned", "Working On It"];
const loadList = () => sb.from("orbit2_projects").select("*").contains("assigned_team", ["Kasam"]).in("status", FIELD).order("schedule_date", { ascending: true });
const loadAtt = (pid: string) => sb.from("orbit2_attendance").select("*").eq("project_id", pid).order("attended_at");
const loadNotes = (pid: string) => sb.from("orbit2_notes").select("*").eq("project_id", pid).order("created_at", { ascending: false });

async function main() {
  // 1. Online
  let r = await loadList();
  ok(!r.error && r.data.length === 2 && r.data[0].id === "p2", "online: list loads (2 jobs, ordered)");
  await loadNotes("p1");
  await sb.from("orbit2_boat_checklist").select("*").eq("boat_id", "b1");
  await sb.rpc("orbit2_is_admin");

  // 2. Signal drops
  net.online = false;
  r = await loadList();
  ok(!r.error && r.data.length === 2, "offline: list served from the phone");
  ok(layer.isOffline(), "offline detected after a failed request");
  const rpc = await sb.rpc("orbit2_is_admin");
  ok(!rpc.error && rpc.data === false, "offline: rpc answered from the phone");

  // 3. Attend p1 offline (the field app's exact calls)
  const st = await sb.from("orbit2_projects").update({ status: "Working On It" }).eq("id", "p1").in("status", FIELD).select("id");
  ok(!st.error && st.data?.length === 1 && st.data[0].id === "p1", "offline: guarded status update reports success");
  const att0 = await loadAtt("p1"); // never loaded online
  ok(!!att0.error && att0.error.code === "OFFLINE", "offline: an unopened list says so (no outbox entries yet)");
  const ins = await sb.from("orbit2_attendance").insert({ project_id: "p1", person: "Kasam", user_id: userId });
  ok(!ins.error, "offline: attend insert queued");
  let att = await loadAtt("p1");
  ok(!att.error && att.data.length === 1 && att.data[0].person === "Kasam" && att.data[0].attended_at === "2026-10-07T09:10:00.000Z" && !!att.data[0].id,
    "offline: attendance shows my row, with the phone's time and an id");
  await sb.from("orbit2_notes").insert({ project_id: "p1", kind: "team_comment", author: "Kasam", body: "Attended", created_by: userId });
  r = await loadList();
  ok(r.data.find((x: any) => x.id === "p1")?.status === "Working On It", "offline: list shows the job as Working On It");

  // 4. Comment + photo
  clock = new Date("2026-10-07T09:40:00Z");
  await sb.from("orbit2_notes").insert({ project_id: "p1", kind: "team_comment", author: "Kasam", body: "Hull done one side", created_by: userId });
  const notes = await loadNotes("p1");
  ok(notes.data.length === 3 && notes.data[0].body === "Hull done one side" && notes.data[2].body === "Old note", "offline: comments show newest first, old note kept");
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
  const upl = await sb.storage.from("orbit-documents").upload("orbit2/field/x-photo.jpg", blob, { contentType: "image/jpeg", upsert: false });
  ok(!upl.error && upl.data?.path === "orbit2/field/x-photo.jpg", "offline: photo upload queued");
  await sb.from("orbit2_files").insert({ project_id: "p1", slot: "image", file_name: "x-photo.jpg", storage_ref: "orbit-documents:orbit2/field/x-photo.jpg", uploaded_by: userId });
  const signed = await sb.storage.from("orbit-documents").createSignedUrl("orbit2/field/x-photo.jpg", 3600);
  ok(!signed.error && /object\/sign\/orbit-documents\/orbit2\/field\/x-photo\.jpg\?token=offline/.test(signed.data.signedUrl), "offline: photo gets a link the service worker can answer");

  // 5. Checklist tick (upsert on boat_id,template_id)
  await sb.from("orbit2_boat_checklist").upsert({ boat_id: "b1", template_id: "t1", checked: true, checked_by: "Kasam" }, { onConflict: "boat_id,template_id" });
  await sb.from("orbit2_boat_checklist").upsert({ boat_id: "b1", template_id: "t2", checked: true, checked_by: "Kasam" }, { onConflict: "boat_id,template_id" });
  const cl = await sb.from("orbit2_boat_checklist").select("*").eq("boat_id", "b1");
  ok(cl.data.length === 2 && cl.data.find((x: any) => x.template_id === "t1").checked === true && cl.data.find((x: any) => x.template_id === "t1").id === "c1",
    "offline: checklist ticks merge into the saved list, existing row keeps its id");

  // 6. Done
  clock = new Date("2026-10-07T11:05:00Z");
  att = await loadAtt("p1");
  const mine = att.data[0];
  await sb.from("orbit2_attendance").update({ done_at: clock.toISOString() }).eq("id", mine.id);
  att = await loadAtt("p1");
  ok(att.data[0].done_at === "2026-10-07T11:05:00.000Z", "offline: Done shows on the attendance row");
  await sb.from("orbit2_projects").update({ status: "Complete" }).eq("id", "p1");
  r = await loadList();
  ok(r.data.length === 1 && r.data[0].id === "p2", "offline: completed job leaves My jobs");
  ok((await layer.pending()) === 10, `outbox holds the 10 changes (has ${await layer.pending()})`);

  // 7. A change the office will beat: p2 status guarded on Working On It, office sets On Hold first
  await sb.from("orbit2_projects").update({ status: "Complete" }).eq("id", "p2").eq("status", "Working On It");
  db.orbit2_projects.find((x) => x.id === "p2")!.status = "On Hold";

  // 8. Another user on the same phone sees nothing of Kasam's
  userId = "user-rehman";
  const other = await loadList();
  ok(!!other.error && other.error.code === "OFFLINE", "another user on the phone: Kasam's saved jobs are not shown");
  userId = "user-kasam";

  // 9. Signal returns — send the outbox
  net.online = true;
  layer.markUp();
  const flushFrom = net.requests.length;
  const res = await layer.flush();
  ok(res.sent === 10 && res.left === 0, `flush: sent ${res.sent}, left ${res.left}`);
  const p1 = db.orbit2_projects.find((x) => x.id === "p1")!;
  ok(p1.status === "Complete" && p1.work_completed_at === "2026-10-07T11:05:00.000Z", "server: job p1 complete, with the time Done was pressed");
  const sAtt = db.orbit2_attendance.find((x) => x.project_id === "p1")!;
  ok(sAtt && sAtt.attended_at === "2026-10-07T09:10:00.000Z" && sAtt.done_at === "2026-10-07T11:05:00.000Z", "server: attend and done times are the phone's times");
  ok(db.orbit2_notes.filter((n) => n.project_id === "p1").length === 3, "server: both comments arrived");
  ok(storage.has("orbit-documents/orbit2/field/x-photo.jpg") && (storage.get("orbit-documents/orbit2/field/x-photo.jpg") as Blob).size === 4, "server: the photo arrived intact");
  ok(db.orbit2_files.length === 1, "server: photo record arrived");
  ok(db.orbit2_boat_checklist.length === 2 && db.orbit2_boat_checklist.find((x) => x.template_id === "t1")!.id === "c1", "server: checklist upserts merged, existing row id unchanged");
  const box = await store.outbox();
  ok(box.length === 1 && box[0].state === "skipped" && /office/.test(box[0].error ?? ""), "conflict: the office's change wins and the skipped change is kept for review");
  ok(db.orbit2_projects.find((x) => x.id === "p2")!.status === "On Hold", "conflict: server keeps On Hold");
  ok(synced === 1, "the app is told to reload after sending");

  // 10. Order is kept: requests sent in the order made
  const sentOrder = net.requests.slice(flushFrom).map((x) => x.split("?")[0]);
  console.log("      sent:", sentOrder.join(" | "));
  ok(sentOrder[0].startsWith("PATCH /rest/v1/orbit2_projects") && sentOrder[1].startsWith("POST /rest/v1/orbit2_attendance"), "outbox sent in the order things were done");

  // 11. A send that arrived but timed out is not duplicated
  await store.remove(box[0].seq!);
  net.arriveThenFail = true;
  const before = db.orbit2_notes.length;
  const dup = await sb.from("orbit2_notes").insert({ project_id: "p2", kind: "team_comment", author: "Kasam", body: "Weak signal note", created_by: userId });
  ok(!dup.error && db.orbit2_notes.length === before + 1 && (await layer.pending()) === 1, "weak signal: note arrived, app carried on, copy queued");
  layer.markUp();
  const res2 = await layer.flush();
  ok(res2.left === 0 && db.orbit2_notes.length === before + 1, "weak signal: the queued copy was recognised as already sent (no duplicate)");

  // 12. Online with nothing waiting — straight through, nothing queued
  const live = await sb.from("orbit2_notes").insert({ project_id: "p2", kind: "team_comment", author: "Kasam", body: "Live", created_by: userId });
  ok(!live.error && (await layer.pending()) === 0, "online: changes go straight to the server");


  // 13. Pre-loaded rows answer a job never opened with signal
  db.orbit2_checklist_forms = [{ id: "f1", active: true, regime: "rya", name: "RYA" }];
  await sb.from("orbit2_notes").select("*").in("project_id", ["p1", "p2"]);
  await sb.from("orbit2_checklist_forms").select("*").eq("active", true);
  net.online = false;
  const p2notes = await sb.from("orbit2_notes").select("*").eq("project_id", "p2").eq("kind", "team_comment").order("created_at");
  ok(!p2notes.error && p2notes.data.length === 2 && p2notes.data.every((n: any) => n.project_id === "p2"), "rows: a job never opened answers from pre-loaded rows (" + (p2notes.data?.length ?? p2notes.error?.message) + ")");
  const one = await sb.from("orbit2_checklist_forms").select("*").eq("active", true).eq("id", "f1").limit(1).maybeSingle();
  ok(!one.error && one.data?.id === "f1", "rows: maybeSingle finds the one row");
  const none = await sb.from("orbit2_checklist_forms").select("*").eq("active", true).eq("id", "nope").limit(1).maybeSingle();
  ok(!none.error && none.data === null, "rows: maybeSingle with no row gives null, no error");
  await sb.from("orbit2_notes").insert({ project_id: "p2", kind: "team_comment", author: "Kasam", body: "Offline on p2", created_by: userId });
  const p2b = await sb.from("orbit2_notes").select("*").eq("project_id", "p2").eq("kind", "team_comment").order("created_at");
  ok(p2b.data.length === 3 && p2b.data.some((n: any) => n.body === "Offline on p2") && p2b.data.map((n: any) => n.created_at).join() === [...p2b.data.map((n: any) => n.created_at)].sort().join(), "rows: an offline comment joins the pre-loaded ones, sorted by time");
  net.online = true; layer.markUp(); await layer.flush();
  // The office deletes a note; the next pre-load forgets it on the phone.
  const victim = db.orbit2_notes.find((n) => n.body === "Live")!;
  db.orbit2_notes = db.orbit2_notes.filter((n) => n !== victim);
  await sb.from("orbit2_notes").select("*").in("project_id", ["p1", "p2"]);
  net.online = false; layer.markDown();
  const p2c = await sb.from("orbit2_notes").select("*").eq("project_id", "p2").eq("kind", "team_comment").order("created_at");
  ok(!p2c.data.some((n: any) => n.body === "Live") && p2c.data.length === 2, "rows: a row the server no longer has is dropped from the phone");
  net.online = true; layer.markUp();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
