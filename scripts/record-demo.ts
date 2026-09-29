/**
 * Records the home page's demo: one real run on Arc testnet, driven in a
 * browser from the sample CSV to the recipient's verified receipt.
 *
 *   pnpm build
 *   (cd frontend && pnpm exec next start -p 3100)
 *   pnpm exec tsx scripts/record-demo.ts                       # every layout and theme
 *   pnpm exec tsx scripts/record-demo.ts --layout wide --theme dark
 *   (--keep-frames keeps the raw frames, to debug a take;
 *    --out <dir> writes somewhere other than frontend/public/demo)
 *
 * Writes frontend/public/demo/run-<layout>-<theme>.mp4 and .jpg, and prints
 * each run's transaction, chapter starts and poster time for
 * docs/notes/2026-09-28-demo-video.md and frontend/lib/demo-run.ts. Every take is a real run: 0.10 USDC, 0.10 EURC and
 * 0.00001 cirBTC of testnet funds, plus the fee.
 *
 * Testnet only: the video is labelled "Arc testnet" on the home page, so
 * recording it anywhere else would make the label a lie.
 *
 * The wallet is a stand-in announced over EIP-6963 as "Demo wallet". It never
 * imitates a real wallet's UI, and the key never enters the page: every
 * request crosses to Node, where PRIVATE_KEY signs exactly what the app asked
 * for. Fees are passed through untouched, so the floor execute.ts sets is the
 * one the chain sees — and a fee under it is refused here rather than sent to
 * be silently dropped.
 */
import { type Hex } from "viem";
import { arcTestnet } from "viem/chains";
import { chromium, type Locator, type Page } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAMPLE_CSV } from "../frontend/lib/sample-csv.js";
import { buildTimeline } from "./lib/timeline.js";
import { demoWallet, defaultRpc, WALLET_ANNOUNCE } from "./lib/demo-wallet.js";
import { startCapture, type Frame } from "./lib/screencast.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BASE = arg("--base") ?? "http://localhost:3100";
const picked = arg("--theme");
if (picked !== undefined && picked !== "light" && picked !== "dark") {
  throw new Error(`--theme must be "light" or "dark", got "${picked}"`);
}
const THEMES: ("light" | "dark")[] = picked ? [picked] : ["light", "dark"];
const OUT = arg("--out") ?? "frontend/public/demo";

interface Shape { view: { width: number; height: number }; scale: number }
/**
 * wide: 16:9 in the app's desktop layout — sidebar, the Review grid, the run
 * summary beside each step — for the full-width tape on a desktop, where it
 * plays at about 90% of its real size.
 * phone: 4:5 in the phone layout, one card per line, for screens under
 * 1024px, where a desktop layout scaled down would be unreadable.
 */
const SHAPES = {
  wide: { view: { width: 1280, height: 720 }, scale: 1.5 },
  phone: { view: { width: 420, height: 525 }, scale: 2 },
} satisfies Record<string, Shape>;
type Layout = keyof typeof SHAPES;
const layoutArg = arg("--layout");
if (layoutArg !== undefined && !(layoutArg in SHAPES)) {
  throw new Error(`--layout must be "wide" or "phone", got "${layoutArg}"`);
}
const LAYOUTS = (layoutArg ? [layoutArg] : Object.keys(SHAPES)) as Layout[];
const key = process.env.PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error("PRIVATE_KEY is not set in .env");
const wallet = demoWallet("testnet", key, defaultRpc("testnet"));
const chainClient = wallet.client;
const sent = wallet.sent;

/**
 * Runs in the page: the caption strip burned into the home demo. Plain
 * JavaScript in a string, because tsx rewrites a function body with helpers
 * (`__name`) that do not exist in the page. The wallet is WALLET_ANNOUNCE.
 */
const PAGE_SETUP = String.raw`(() => {
  window.__caption = (step, text) => {
    let bar = document.getElementById("demo-caption");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "demo-caption";
      bar.setAttribute("aria-hidden", "true");
      bar.innerHTML = '<span class="demo-step"></span><span class="demo-text"></span>';
      const style = document.createElement("style");
      style.textContent = [
        "#demo-caption { position: fixed; inset: auto 0 0 0; z-index: 2147483647;",
        "  display: flex; align-items: center; gap: 10px; padding: 10px 16px; box-sizing: border-box;",
        "  min-height: 66px;",
        "  background: var(--ink); color: var(--tape);",
        "  font-family: var(--font-sans), system-ui, sans-serif; font-size: 15px; line-height: 1.35; }",
        "#demo-caption .demo-step { flex: none; padding: 1px 6px; background: var(--highlight); color: #161616;",
        "  font-family: var(--font-mono), ui-monospace, monospace; font-size: 12px; font-weight: 700;",
        "  letter-spacing: 0.08em; text-transform: uppercase; }",
        "@media (min-width: 1024px) {",
        "  #demo-caption { justify-content: center; gap: 14px; min-height: 72px; font-size: 19px; }",
        "  #demo-caption .demo-step { font-size: 14px; padding: 2px 8px; } }",
      ].join("\n");
      document.head.append(style);
      document.body.append(bar);
    }
    bar.querySelector(".demo-step").textContent = step;
    bar.querySelector(".demo-text").textContent = text;
  };
})();`;

/** Time spent waiting on the network, played back faster than it happened. */
const fastForward: { from: number; to: number }[] = [];
async function waiting<T>(work: Promise<T>): Promise<T> {
  const from = Date.now() / 1000;
  try { return await work; } finally { fastForward.push({ from, to: Date.now() / 1000 }); }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Scrolls until `target` sits just under the fixed top bar. */
async function scrollTo(target: Locator) {
  await target.first().evaluate((el) => window.scrollTo({
    top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth",
  }));
  await pause(900);
}

async function record(layout: Layout, theme: "light" | "dark") {
  const shape = SHAPES[layout];
  const wide = layout === "wide";
  const work = mkdtempSync(join(tmpdir(), `ledgerline-demo-${theme}-`));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: shape.view, deviceScaleFactor: shape.scale, colorScheme: theme, reducedMotion: "no-preference",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const host = new URL(BASE).hostname;
  await context.addCookies([{ name: "theme", value: theme, domain: host, path: "/" }]);
  await context.exposeFunction("__demoWallet", wallet.answer);
  await context.addInitScript({ content: WALLET_ANNOUNCE });
  await context.addInitScript({ content: PAGE_SETUP });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));

  /** Every caption, on the wall clock: the video's chapters come from these. */
  const marks: { label: string; at: number }[] = [];
  const caption = (step: string, text: string) => {
    marks.push({ label: step, at: Date.now() / 1000 });
    return page.evaluate(([s, t]) => (window as unknown as { __caption(a: string, b: string): void }).__caption(s, t), [step, text]);
  };

  const shot = (name: string) => page.screenshot({ path: join(work, `${name}.png`) });

  await page.goto(`${BASE}/new?n=testnet`);
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: /Connect|Demo wallet/ }).first().waitFor();
  await caption("1 · Upload", "A list of invoices, one line per payment");
  await pause(300);
  const capture = await startCapture(page, work, { ...shape.view, scale: shape.scale });
  const begin = Date.now() / 1000;

  // ── Upload ──────────────────────────────────────────────────────────────
  await pause(1200);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const name = page.getByRole("textbox", { name: "Run name" });
  await name.fill("");
  await name.pressSequentially(`Demo ${stamp}`, { delay: 35 });
  await pause(400);
  await scrollTo(page.getByText("Run name", { exact: true }));
  await pause(500);
  await page.locator("input[type=file]").setInputFiles({
    name: "invoices.csv", mimeType: "text/csv", buffer: Buffer.from(SAMPLE_CSV + "\n"),
  });
  await shot("1-upload");

  // ── Review ──────────────────────────────────────────────────────────────
  await caption("2 · Review", "Read and checked in this browser. Nothing is uploaded.");
  await page.getByText("INV-BTC-003").first().waitFor();
  if (wide) {
    // The grid shows every line at once.
    await pause(2600);
  } else {
    await pause(1600);
    await scrollTo(page.getByText("Line 3 · INV-EU-002"));
    await pause(700);
    await scrollTo(page.getByText("Line 4 · INV-BTC-003"));
    await pause(700);
  }
  await shot("2-review");
  const connectBtn = page.getByRole("button", { name: "Connect a wallet to continue" });
  await connectBtn.scrollIntoViewIfNeeded();
  await pause(500);
  await connectBtn.click();
  const demo = page.getByRole("button", { name: /Demo wallet/ });
  if (await demo.isVisible({ timeout: 1500 }).catch(() => false)) await demo.click();
  const checkBtn = page.getByRole("button", { name: "Check it against the chain" });
  await waiting(checkBtn.waitFor({ timeout: 30_000 }));
  if (wide) await scrollTo(page.getByRole("heading", { name: "Can this wallet pay it?" }));
  await checkBtn.scrollIntoViewIfNeeded();
  await pause(900);
  await shot("2b-connected");
  await checkBtn.click();

  // ── Check ───────────────────────────────────────────────────────────────
  await caption("3 · Check", "Every payment is tried against the chain before money moves");
  const signCheck = page.getByRole("button", { name: "Sign and check the run" });
  await signCheck.waitFor();
  await scrollTo(page.getByRole("heading", { name: "Check the run before any money moves" }));
  await pause(1300);
  await signCheck.scrollIntoViewIfNeeded();
  await pause(400);
  await signCheck.click();
  const toSend = page.getByRole("button", { name: "Sign and send the payment" });
  await waiting(toSend.waitFor({ timeout: 60_000 }));
  await scrollTo(page.getByRole("heading", { name: "Every payment would go through" }));
  await pause(1100);
  // The poster: the payer's side, every payment checked (home polish §3.1).
  marks.push({ label: "poster", at: Date.now() / 1000 });
  await pause(1100);
  await shot("3-check");
  await toSend.scrollIntoViewIfNeeded();
  await pause(500);
  await toSend.click();

  // ── Pay ─────────────────────────────────────────────────────────────────
  await caption("4 · Pay", "One transaction pays all three, each carrying its invoice");
  const pay = page.getByRole("button", { name: /^Sign and pay 3 invoices$/ });
  await pay.waitFor();
  await scrollTo(page.getByRole("heading", { name: "Ready to send" }));
  await pause(1200);
  await pay.scrollIntoViewIfNeeded();
  await pause(500);
  await pay.click();
  await waiting(page.getByRole("heading", { name: "Paid, with a receipt" }).waitFor({ timeout: 180_000 }));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await caption("4 · Paid", "Recorded on chain. Each recipient gets a receipt link.");
  await pause(2000);
  await shot("4-paid");

  const copy = page.getByRole("button", { name: "Copy link" }).first();
  await copy.scrollIntoViewIfNeeded();
  await pause(700);
  await copy.click();
  await pause(900);
  const receiptUrl = await page.evaluate(() => navigator.clipboard.readText());
  if (!receiptUrl.includes("/r/0x")) throw new Error(`unexpected receipt link: ${receiptUrl}`);

  // ── Receipt ─────────────────────────────────────────────────────────────
  const receipt = new URL(receiptUrl);
  await page.goto(`${BASE}${receipt.pathname}${receipt.search}`);
  await caption("5 · Receipt", "The recipient's browser checks it against the chain");
  await waiting(page.getByText("Verified", { exact: true }).first().waitFor({ timeout: 60_000 }));
  await pause(1200);
  await shot("5-receipt");
  const verified = page.getByText("Verified", { exact: true }).first();
  await verified.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await pause(2400);
  await shot("5b-verified");

  await capture.stop();
  const end = Date.now() / 1000;
  await browser.close();

  if (errors.length) console.warn(`[${layout}-${theme}] console errors:\n  ${errors.join("\n  ")}`);
  const txHash = sent.at(-1)!;
  encode(`${layout}-${theme}`, shape, capture.frames, begin, end, work, marks);
  console.log(`[${layout}-${theme}] tx ${txHash}\n[${layout}-${theme}] receipt ${receipt.pathname}${receipt.search}`);
  if (process.argv.includes("--keep-frames")) console.log(`[${layout}-${theme}] frames in ${work}`);
  else rmSync(work, { recursive: true, force: true });
  return txHash;
}

/** Frames to H.264. Each frame lasts until the next one arrived; waits on the
 *  network play at WAIT_SPEED, so the video shows that the chain answered
 *  without making anyone watch a spinner. */
const WAIT_SPEED = 4;
function encode(
  name: string, { view, scale }: Shape, frames: Frame[], begin: number, end: number, dir: string,
  marks: { label: string; at: number }[],
) {
  const kept = frames.filter((f) => f.at >= begin - 0.05);
  const inWait = (t: number) => fastForward.some((w) => t >= w.from && t < w.to);
  const timeline = buildTimeline(kept, end, (t) => (inWait(t) ? WAIT_SPEED : 1));
  const lines: string[] = [];
  kept.forEach((f, i) => lines.push(`file '${f.file}'`, `duration ${timeline.durations[i]!.toFixed(4)}`));
  // The concat demuxer ignores the last duration unless the file repeats.
  lines.push(`file '${kept.at(-1)!.file}'`);
  const list = join(dir, "frames.txt");
  writeFileSync(list, lines.join("\n"));

  mkdirSync(OUT, { recursive: true });
  const mp4 = join(OUT, `run-${name}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", `fps=30,scale=${view.width * scale}:${view.height * scale}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-tune", "stillimage",
    "-movflags", "+faststart", "-an", mp4,
  ]);

  // One chapter per step number: "4 · Paid" is still the Pay chapter.
  const firstOfStep = new Map<string, number>();
  for (const m of marks) {
    const n = /^(\d) ·/.exec(m.label)?.[1];
    if (n && !firstOfStep.has(n)) firstOfStep.set(n, timeline.outputTime(m.at));
  }
  const chapters = [...firstOfStep.values()];
  const posterMark = marks.find((m) => m.label === "poster");
  if (!posterMark) throw new Error(`[${name}] the Check step never marked its poster`);
  const posterAt = timeline.outputTime(posterMark.at);

  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", posterAt.toFixed(3), "-i", mp4,
    "-frames:v", "1", "-q:v", "3", join(OUT, `run-${name}.jpg`),
  ]);
  console.log(`[${name}] chapters ${chapters.map((c) => c.toFixed(3)).join(" ")} · poster ${posterAt.toFixed(1)}`);
}

const chainId = await chainClient.getChainId();
if (chainId !== arcTestnet.id) throw new Error(`RPC reports chain ${chainId}, expected Arc testnet ${arcTestnet.id}`);

for (const layout of LAYOUTS) {
  for (const theme of THEMES) {
    fastForward.length = 0;
    const tx = await record(layout, theme);
    const r = await chainClient.getTransactionReceipt({ hash: tx });
    if (r.status !== "success") throw new Error(`[${layout}-${theme}] ${tx} has status ${r.status}`);
    console.log(`[${layout}-${theme}] block ${r.blockNumber} status ${r.status}`);
  }
}
