// node scripts/academy-crew/render-animations.mjs <course folder> <out dir> [name filter] [--stills t1,t2,…]
// Same pipeline as the cyber and AV/IT courses: SVG frames → raw RGBA (sharp) → ffmpeg, H.264
// 720p 25 fps with faststart so the player can start before the file has loaded.
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [course, out, filter, flag, list] = process.argv.slice(2);
if (!course || !out) throw new Error("Usage: render-animations.mjs <course folder> <out dir> [name filter] [--stills 1,5,9]");
const { ANIMATIONS, frameSvg } = await import(`./${course}/animations.mjs`);
mkdirSync(out, { recursive: true });
const FPS = 25;

for (const [name, { seconds, frame }] of Object.entries(ANIMATIONS)) {
  if (filter && filter !== "all" && !name.includes(filter)) continue;
  if (flag === "--stills") {
    for (const t of list.split(",").map(Number)) {
      await sharp(Buffer.from(frameSvg(frame(t)))).png().toFile(join(out, `${name.replace(".mp4", "")}-t${t}.png`));
    }
    console.log("stills", name);
    continue;
  }
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", "1280x720", "-r", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(out, name)], { stdio: ["pipe", "inherit", "inherit"] });
  const total = Math.round(seconds * FPS);
  for (let i = 0; i < total; i++) {
    const buf = await sharp(Buffer.from(frameSvg(frame(i / FPS)))).ensureAlpha().raw().toBuffer();
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg exited ${c}`)))));
  console.log("✓", name, `${total} frames`);
}
