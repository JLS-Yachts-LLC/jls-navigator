/**
 * Test runner: bundles each src/**\/*.test.ts with esbuild (resolving the "@/" alias,
 * and giving import.meta.env the empty object Vite would) and runs the result with
 * Node's built-in test runner. No extra dependencies.
 *
 *   npm test                 run everything
 *   npm test -- logistics    only test files whose path contains "logistics"
 */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, mkdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const out = join(root, ".test-build");
const filter = process.argv[2] ?? "";

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "node_modules" || n.startsWith(".")) return [];
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".test.ts") ? [p] : [];
  });
}

const files = walk(join(root, "src")).filter((f) => relative(root, f).includes(filter));
if (files.length === 0) { console.error("No test files found."); process.exit(1); }

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({
  entryPoints: files, outdir: out, outbase: join(root, "src"), bundle: true, platform: "node", format: "esm",
  target: "node20", logLevel: "error", sourcemap: "inline",
  define: { "import.meta.env": "{}" },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

const built = files.map((f) => join(out, relative(join(root, "src"), f)).replace(/\.ts$/, ".js"));
const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...built], { stdio: "inherit" });
rmSync(out, { recursive: true, force: true });
process.exit(r.status ?? 1);
