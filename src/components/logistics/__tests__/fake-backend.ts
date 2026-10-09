/**
 * A tiny in-memory stand-in for Supabase (PostgREST tables + storage + RPC) that the
 * REAL supabase-js client talks to over HTTP — so tests run the app's actual
 * data code, not a mock of it, and can inject failures (a dropped connection, a
 * rejected upload) at the network boundary where they really happen.
 *
 * Supports just what the logistics code uses: insert / select / update / delete
 * with eq, neq, ilike, in, is, gt filters (including `col->>key` JSON paths),
 * order, limit, `.single()` / `.maybeSingle()`, storage uploads, and a few RPCs.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

type Row = Record<string, any>;

export type FaultRule = {
  /** matched against `METHOD /path` */
  match: RegExp;
  /** how many matching requests to fail (default: all) */
  times?: number;
  /** alternatively: decide by which matching request this is (1 = the first) */
  when?: (nth: number) => boolean;
  /** (internal) how many matching requests have been seen */
  seen?: number;
  /** "drop" = kill the connection (a network failure); a number = respond with that HTTP status */
  fault: "drop" | number;
};

export class FakeBackend {
  tables = new Map<string, Row[]>();
  uploads: { path: string; bytes: number; type: string; partType: string }[] = [];
  /** files the "bucket" can serve back (key: bucket/path) */
  files = new Map<string, Buffer>();
  requests: string[] = [];
  faults: FaultRule[] = [];
  rpcs = new Map<string, (args: any) => unknown>();
  /** bearer token -> the user it belongs to (answers GET /auth/v1/user) */
  users = new Map<string, { id: string; email: string }>();
  private server!: http.Server;
  url = "";
  private seq = 0;

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  async stop(): Promise<void> {
    this.server.closeAllConnections?.();
    await new Promise<void>((r) => this.server.close(() => r()));
  }
  reset(): void {
    this.tables.clear(); this.users.clear(); this.files.clear(); this.uploads = []; this.requests = []; this.faults = [];
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const u = new URL(req.url ?? "/", this.url);
    const key = `${req.method} ${u.pathname}`;
    this.requests.push(key);

    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);

    for (const f of this.faults) {
      if (!f.match.test(key)) continue;
      f.seen = (f.seen ?? 0) + 1;
      if (f.when ? f.when(f.seen) : f.times == null || f.times > 0) {
        if (!f.when && f.times != null) f.times--;
        if (f.fault === "drop") { req.socket.destroy(); return; }
        res.writeHead(f.fault, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "injected fault", code: String(f.fault) }));
        return;
      }
    }

    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    if (req.method === "OPTIONS") return send(204, undefined);

    try {
      // ── auth ──
      if (u.pathname === "/auth/v1/user" && req.method === "GET") {
        const tok = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
        const usr = this.users.get(tok);
        if (!usr) return send(401, { message: "invalid JWT", code: 401 });
        return send(200, { id: usr.id, email: usr.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
      }

      // ── storage: signing and download ──
      const signMany = u.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)$/);
      if (signMany && req.method === "POST") {
        const { paths } = JSON.parse(raw.toString());
        return send(200, (paths as string[]).map((p) => ({ path: p, signedURL: `/object/sign/${signMany[1]}/${p}?token=T`, error: null })));
      }
      const signOne = u.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
      if (signOne && req.method === "POST") return send(200, { signedURL: `/object/sign/${signOne[1]}/${signOne[2]}?token=T` });
      const dl = u.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/);
      if (dl && req.method === "GET") {
        const f = this.files.get(`${dl[1]}/${decodeURIComponent(dl[2])}`);
        if (!f) return send(404, { message: "Object not found", error: "not_found", statusCode: "404" });
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(f);
        return;
      }

      // ── storage ──
      const up = u.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
      if (up && (req.method === "POST" || req.method === "PUT")) {
        // supabase-js sends a blob as multipart; the stored type is the file part's own Content-Type
        const part = raw.toString("latin1").match(/name=""[^\r\n]*\r\nContent-Type: ([^\r\n]+)/i);
        this.uploads.push({ path: `${up[1]}/${decodeURIComponent(up[2])}`, bytes: raw.length, type: String(req.headers["content-type"] ?? ""), partType: part?.[1] ?? "" });
        return send(200, { Key: `${up[1]}/${up[2]}`, Id: "x" });
      }

      // ── rpc ──
      const rpc = u.pathname.match(/^\/rest\/v1\/rpc\/(.+)$/);
      if (rpc) {
        const fn = this.rpcs.get(rpc[1]);
        if (!fn) return send(404, { message: `no rpc ${rpc[1]}`, code: "PGRST202" });
        return send(200, fn(raw.length ? JSON.parse(raw.toString()) : {}));
      }

      // ── tables ──
      const t = u.pathname.match(/^\/rest\/v1\/([^/]+)$/);
      if (!t) return send(404, { message: "not found" });
      const table = t[1];
      const wantsObject = String(req.headers.accept ?? "").includes("vnd.pgrst.object");

      if (req.method === "POST") {
        const body = JSON.parse(raw.toString() || "[]");
        const list: Row[] = Array.isArray(body) ? body : [body];
        const made: Row[] = [];
        for (const r of list) {
          const row = { id: `id-${++this.seq}`, created_at: new Date().toISOString(), ...r };
          if (this.rows(table).some((x) => x.id === row.id)) return send(409, { message: "duplicate key value", code: "23505" });
          this.rows(table).push(row);
          made.push(row);
        }
        return send(201, wantsObject ? made[0] : made);
      }

      const matched = this.filter(this.rows(table), u.searchParams);

      if (req.method === "PATCH") {
        const patch = JSON.parse(raw.toString());
        for (const r of matched) Object.assign(r, patch);
        return send(200, wantsObject ? matched[0] ?? null : matched);
      }
      if (req.method === "DELETE") {
        const ids = new Set(matched.map((r) => r.id));
        this.tables.set(table, this.rows(table).filter((r) => !ids.has(r.id)));
        return send(200, matched);
      }
      if (req.method === "GET" || req.method === "HEAD") {
        let out = matched;
        const order = u.searchParams.get("order");
        if (order) {
          const [col, dir] = order.split(",")[0].split(".");
          out = [...out].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1));
        }
        const limit = Number(u.searchParams.get("limit") ?? 0);
        if (limit) out = out.slice(0, limit);
        const range = { "content-range": out.length ? `0-${out.length - 1}/${matched.length}` : `*/${matched.length}` };
        if (req.method === "HEAD") { res.writeHead(200, { "content-type": "application/json", ...range }); res.end(); return; }
        if (wantsObject) {
          if (out.length !== 1) return send(406, { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" });
          return send(200, out[0], range);
        }
        return send(200, out, range);
      }
      send(405, { message: "method" });
    } catch (e) {
      send(500, { message: String((e as Error).message) });
    }
  }

  private pick(row: Row, col: string): unknown {
    if (!col.includes("->")) return row[col];
    const [head, ...rest] = col.split(/->>?/);
    let v: any = row[head];
    for (const k of rest) v = v == null ? undefined : v[k];
    return v;
  }

  private filter(rows: Row[], params: URLSearchParams): Row[] {
    const reserved = new Set(["select", "order", "limit", "offset", "columns", "on_conflict"]);
    let out = rows;
    for (const [col, expr] of params.entries()) {
      if (reserved.has(col)) continue;
      const dot = expr.indexOf(".");
      const op = expr.slice(0, dot), val = expr.slice(dot + 1);
      out = out.filter((r) => {
        const v = this.pick(r, col);
        switch (op) {
          case "eq": return String(v) === val;
          case "neq": return String(v) !== val;
          case "gt": return Number(v) > Number(val);
          case "is": return val === "null" ? v == null : String(v) === val;
          case "in": return val.slice(1, -1).split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(v));
          case "ilike": {
            // PostgREST sends * for %, and \ escapes the next character.
            const re = "^" + val.replace(/\\(.)/g, "\u0000$1").split("").map((ch, i, a) => (a[i - 1] === "\u0000" ? ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : ch === "*" || ch === "%" ? ".*" : ch === "\u0000" ? "" : ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))).join("") + "$";
            return new RegExp(re, "i").test(String(v ?? ""));
          }
          default: return true;
        }
      });
    }
    return out;
  }
}
