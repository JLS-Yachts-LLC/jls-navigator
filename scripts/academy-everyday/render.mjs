// node scripts/academy-everyday/render.mjs <art module> <out dir> [filter] [--stills t1,t2]
// Renders a module's PICTURES (SVG → PNG) and ANIMATIONS (frames → H.264 MP4, 720p, 25 fps).
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { frameSvg } from "../academy-cyber/animations.mjs";

const [mod, out, filter, flag, list] = process.argv.slice(2);
if (!mod || !out) throw new Error("Usage: render.mjs <art module> <out dir> [filter] [--stills t1,t2]");
const { PICTURES = {}, ANIMATIONS = {} } = await import(pathToFileURL(resolve(mod)).href);
mkdirSync(out, { recursive: true });
const want = (n) => !filter || filter === "all" || n.includes(filter);

for (const [name, make] of Object.entries(PICTURES)) {
  if (!want(name) || flag === "--stills") continue;
  await sharp(Buffer.from(make())).png({ compressionLevel: 9 }).toFile(join(out, name));
  console.log("✓", name);
}
for (const [name, { seconds, frame }] of Object.entries(ANIMATIONS)) {
  if (!want(name)) continue;
  if (flag === "--stills") {
    for (const t of list.split(",").map(Number)) await sharp(Buffer.from(frameSvg(frame(t)))).png().toFile(join(out, `${name.replace(".mp4", "")}-t${t}.png`));
    console.log("stills", name); continue;
  }
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", "1280x720", "-r", "25", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(out, name)], { stdio: ["pipe", "inherit", "inherit"] });
  const total = Math.round(seconds * 25);
  for (let i = 0; i < total; i++) {
    const buf = await sharp(Buffer.from(frameSvg(frame(i / 25)))).ensureAlpha().raw().toBuffer();
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg exited ${c}`)))));
  console.log("✓", name, `${total} frames`);
}
