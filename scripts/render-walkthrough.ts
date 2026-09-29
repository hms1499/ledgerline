/**
 * Renders a take into the submission video.
 *
 *   pnpm exec tsx scripts/render-walkthrough.ts video/takes/<run name> [--music <file>]
 *
 * Writes video/ledgerline-walkthrough.mp4 (1920×1080, 30 fps, H.264 + AAC)
 * and video/ledgerline-walkthrough-sheet.jpg, one frame per focus.
 * Spec: docs/superpowers/specs/2026-09-29-walkthrough-video-design.md §5.
 */
import sharp from "sharp";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertTake } from "./lib/take.js";
import { audioArgs, renderPlan, type Planned } from "./lib/render-plan.js";

const dir = process.argv[2];
if (!dir || dir.startsWith("--")) throw new Error("usage: render-walkthrough.ts <take folder> [--music <file>]");
const i = process.argv.indexOf("--music");
const music = i >= 0 ? process.argv[i + 1] : undefined;

const take = assertTake(JSON.parse(readFileSync(join(dir, "events.json"), "utf8")));
if (!take.title) throw new Error("the take has no title card; it was not recorded to the end");
const W = 1920, H = 1080, FPS = 30;
const want = { width: Math.round(take.view.width * take.view.scale), height: Math.round(take.view.height * take.view.scale) };
const got = await sharp(join(dir, take.frames[0]!.file)).metadata();
if (got.width !== want.width || got.height !== want.height) {
  throw new Error(`the take's frames are ${got.width}x${got.height}, but it says ${want.width}x${want.height}; re-record it`);
}
const plan = renderPlan(take, { fps: FPS, titleSeconds: 4, waitSpeed: 4 });
// Before any frame: a missing music file stops here, not after minutes of rendering.
const audio = audioArgs(music, plan.seconds, existsSync);

const title = await sharp(join(dir, take.title)).resize(W, H).removeAlpha().raw().toBuffer();
const captions = await Promise.all(take.captions.map(async (c) => {
  if (!c.image) throw new Error(`caption "${c.text}" has no image`);
  const file = join(dir, c.image);
  const { width = 0, height = 0 } = await sharp(file).metadata();
  return { input: file, left: Math.round((W - width) / 2), top: H - 56 - height };
}));

mkdirSync("video", { recursive: true });
const out = "video/ledgerline-walkthrough.mp4";
const ff = spawn("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
  ...audio,
  "-map", "0:v", "-map", "[a]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
], { stdio: ["pipe", "inherit", "inherit"] });
const done = new Promise<void>((ok, fail) => ff.on("close", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)))));

const keyOf = (f: Planned) => (f.kind === "title" ? "title" : `${f.source}:${f.crop.left},${f.crop.top},${f.crop.width}:${f.caption ?? "-"}`);
let lastKey = "";
let last = title;
const sheetFrames = new Map<number, Buffer>();
for (let k = 0; k < plan.frames.length; k++) {
  const f = plan.frames[k]!;
  const key = keyOf(f);
  if (key !== lastKey) {
    last = f.kind === "title" ? title : await sharp(join(dir, take.frames[f.source]!.file))
      .extract(f.crop).resize(W, H, { kernel: "lanczos3" })
      .composite(f.caption === undefined ? [] : [captions[f.caption]!])
      .removeAlpha().raw().toBuffer();
    lastKey = key;
  }
  if (plan.sheet.includes(k)) sheetFrames.set(k, last);
  if (!ff.stdin.write(last)) await new Promise((r) => ff.stdin.once("drain", r));
  if (k % (FPS * 10) === 0) console.log(`rendered ${(k / FPS).toFixed(0)} s of ${plan.seconds.toFixed(0)} s`);
}
ff.stdin.end();
await done;

const tiles = [...sheetFrames.values()];
const cols = 4, tw = 480, th = 270, rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: cols * tw, height: Math.max(1, rows) * th, channels: 3, background: "#121211" } })
  .composite(await Promise.all(tiles.map(async (buf, n) => ({
    input: await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).resize(tw, th).png().toBuffer(),
    left: (n % cols) * tw, top: Math.floor(n / cols) * th,
  }))))
  .jpeg({ quality: 85 }).toFile("video/ledgerline-walkthrough-sheet.jpg");
console.log(`${out}: ${plan.seconds.toFixed(1)} s, ${plan.frames.length} frames, ${tiles.length} focuses on the sheet`);
