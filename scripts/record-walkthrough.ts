/**
 * Records the submission walkthrough: one real run, from a CSV with two
 * mistakes to the reconciled run and the dashboard.
 * Spec: docs/superpowers/specs/2026-09-29-walkthrough-video-design.md.
 *
 *   pnpm build && (cd frontend && pnpm exec next start -p 3100)
 *   pnpm exec tsx scripts/record-walkthrough.ts --network testnet
 *   pnpm exec tsx scripts/record-walkthrough.ts --network mainnet --confirm-mainnet
 *   (--scale 1.5 if the rehearsal measures too few frames)
 *
 * Writes video/takes/<run name>/: frames/, events.json, cap-*.png, title.png.
 * Render it with scripts/render-walkthrough.ts.
 */
import { chromium, type Page } from "playwright";
import sharp from "sharp";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { erc20Abi, type Address, type Hex } from "viem";
import { tokensForChain } from "@ledgerline/core";
import { demoWallet, defaultRpc, WALLET_ANNOUNCE, type DemoNetwork } from "./lib/demo-wallet.js";
import { startCapture } from "./lib/screencast.js";
import { POINTER_SETUP } from "./lib/overlay.js";
import { assertTake, type TakeEvents } from "./lib/take.js";
import { pause, renderOverlays, TakeRecorder } from "./lib/take-recorder.js";
import { assertChain, runNameAt, shortfalls, walkthroughCsv } from "./lib/walkthrough.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };

const network = arg("--network") as DemoNetwork | undefined;
if (network !== "testnet" && network !== "mainnet") throw new Error("--network must be testnet or mainnet");
if (network === "mainnet" && !process.argv.includes("--confirm-mainnet")) {
  console.error("A mainnet take pays real money. Add --confirm-mainnet to record it.");
  process.exit(1);
}
const BASE = arg("--base") ?? "http://localhost:3100";
const SCALE = Number(arg("--scale") ?? 2);
const key = process.env.PRIVATE_KEY as Hex | undefined;
const recipient = process.env.DEMO_RECIPIENT as Address | undefined;
if (!key || !recipient) throw new Error("PRIVATE_KEY and DEMO_RECIPIENT must be set in .env");

// ── Before any browser: the right chain, and enough in the wallet ─────────
const wallet = demoWallet(network, key, defaultRpc(network));
assertChain(await wallet.client.getChainId(), network);
const T = tokensForChain(wallet.chain.id);
const read = (token: Address) => wallet.client.readContract({
  address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet.account.address],
});
const short = shortfalls({
  USDC: await read(T.USDC as Address), EURC: await read(T.EURC as Address), cirBTC: await read(T.cirBTC as Address),
});
if (short.length) {
  console.error(`Not enough in ${wallet.account.address}:\n  ${short.join("\n  ")}`);
  process.exit(1);
}

const started = new Date();
const date = started.toISOString().slice(0, 10);
mkdirSync("video/takes", { recursive: true });
const runName = runNameAt(started, readdirSync("video/takes"));
const dir = join("video/takes", runName);
mkdirSync(join(dir, "frames"), { recursive: true });
console.log(`${runName}: pays 0.02 USDC, 0.01 EURC and 0.0000001 cirBTC on Arc ${network} to ${recipient}, plus the fee.`);

const events: TakeEvents = {
  version: 1, network, runName, date, view: { width: 1920, height: 1080, scale: SCALE },
  begin: 0, end: 0, frames: [], waits: [], focuses: [], captions: [],
};

// Without the flag, the screencast sends frames at CSS-pixel size whatever the
// context's deviceScaleFactor: 1920x1080 at scale 2, measured 2026-09-29.
const browser = await chromium.launch({ args: [`--force-device-scale-factor=${SCALE}`] });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 }, deviceScaleFactor: SCALE, colorScheme: "light",
  reducedMotion: "no-preference", permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: true,
});
await context.addCookies([{ name: "theme", value: "light", domain: new URL(BASE).hostname, path: "/" }]);
await context.exposeFunction("__demoWallet", wallet.answer);
await context.addInitScript({ content: WALLET_ANNOUNCE });
await context.addInitScript({ content: POINTER_SETUP });
const page: Page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const rec = new TakeRecorder(page, events);
const n = `?n=${network}`;

await page.goto(`${BASE}/${n}`);
await page.evaluate(() => document.fonts.ready);
await rec.placePointer();
const capture = await startCapture(page, join(dir, "frames"), { width: 1920, height: 1080, scale: SCALE }, 90);
events.begin = Date.now() / 1000;

// ── 1 · Home (about 8 s) ──────────────────────────────────────────────────
rec.caption("home");
await pause(1200);
await rec.focus(page.getByRole("heading", { level: 1 }), "the headline", 1.6);
await pause(3000);
rec.caption("tokens");
await rec.focus(page.locator(".pays-in"), "the token strip", 1.8);
await pause(3000);
rec.wide();
await pause(1000);
await rec.click(page.getByRole("link", { name: "Create a payout run" }));

// ── 2 · Upload (about 10 s) ───────────────────────────────────────────────
await page.waitForURL(/\/new/);
await rec.placePointer();
rec.caption("upload");
const runField = page.getByRole("textbox", { name: "Run name" });
await runField.waitFor();
await pause(1200);
await rec.click(runField);
await runField.fill("");
await runField.pressSequentially(runName, { delay: 45 });
await rec.focus(runField, "the run name", 1.8);
await pause(2000);
await rec.focus(page.getByText("Drop a CSV, or click to choose one"), "the drop zone", 1.5);
await pause(2500);
await page.locator("input[type=file]").first().setInputFiles({
  name: "payouts.csv", mimeType: "text/csv", buffer: Buffer.from(walkthroughCsv(recipient)),
});

// ── 3 · Review: fix the token (about 20 s) ────────────────────────────────
rec.caption("review");
const card = page.locator(".fix-card").filter({ hasText: "USD" }).first();
await card.waitFor();
rec.wide();
await pause(2500);
await rec.focus(page.getByRole("grid", { name: "The file" }), "the file as a table", 1.3);
await pause(3000);
await card.scrollIntoViewIfNeeded();
await rec.focus(card, "the token problem");
await pause(3000);
await rec.click(card.getByRole("button", { name: "USDC", exact: true }));
rec.caption("fixed");
await pause(800);
const fixedRow = page.getByRole("row").filter({ hasText: "INV-V-002" });
await fixedRow.scrollIntoViewIfNeeded();
await rec.focus(fixedRow, "the fixed line", 1.6);
await pause(3000);

// ── 4 · Fund: connect, see EURC short, the Safe block, trim the line (about 18 s)
rec.wide();
await rec.click(page.getByRole("button", { name: "Connect a wallet to continue" }));
const demo = page.getByRole("button", { name: /Demo wallet/ });
if (await demo.isVisible({ timeout: 1500 }).catch(() => false)) await rec.click(demo);
rec.caption("funding");
const funding = page.locator("section.funding");
await rec.waiting(funding.getByText("short by").first().waitFor({ timeout: 30_000 }));
await funding.scrollIntoViewIfNeeded();
await pause(600);
await rec.focus(funding.locator("li.funding-short").first(), "the short token", 1.6);
await pause(3000);
rec.caption("safe");
await rec.focus(page.locator(".treasury-topup"), "the Safe treasury block", 1.5);
await pause(5000);
rec.caption("trim");
const eurRow = page.getByRole("row").filter({ hasText: "INV-V-003" });
await rec.click(eurRow.getByRole("gridcell").nth(3), { double: true });
const editor = page.getByRole("textbox", { name: /^Line \d+, amount$/i });
await editor.fill("");
await editor.pressSequentially("0.01", { delay: 120 });
await editor.press("Enter");
await pause(600);
await rec.focus(eurRow, "the trimmed line", 1.6);
await pause(2500);
const checkBtn = page.getByRole("button", { name: "Check it against the chain" });
await rec.waiting(checkBtn.waitFor({ timeout: 30_000 }));
await funding.scrollIntoViewIfNeeded();
await pause(500);
await rec.focus(funding, "every token covered", 1.4);
await pause(3000);

// ── 5 · Check (about 15 s) ────────────────────────────────────────────────
rec.wide();
await rec.click(checkBtn);
rec.caption("check");
const signCheck = page.getByRole("button", { name: "Sign and check the run" });
await signCheck.waitFor();
const checkHead = page.getByRole("heading", { name: "Check the run before any money moves" });
await checkHead.scrollIntoViewIfNeeded();
await pause(800);
await rec.focus(checkHead, "what the check does", 1.5);
await pause(2500);
await rec.click(signCheck);
const toSend = page.getByRole("button", { name: "Sign and send the payment" });
await rec.waiting(toSend.waitFor({ timeout: 60_000 }));
const verdict = page.getByRole("heading", { name: "Every payment would go through" });
await verdict.scrollIntoViewIfNeeded();
await pause(500);
await rec.focus(verdict, "the check's verdict", 1.6);
await pause(3000);
await rec.focus([verdict, page.getByText("INV-V-004", { exact: true }).filter({ visible: true }).last()], "every line checked", 1.3);
await pause(3000);

// ── 6 · Pay (about 15 s) ──────────────────────────────────────────────────
rec.wide();
await rec.click(toSend);
rec.caption("pay");
const pay = page.getByRole("button", { name: /^Sign and pay 4 invoices$/ });
await pay.waitFor();
const ready = page.getByRole("heading", { name: "Ready to send" });
await ready.scrollIntoViewIfNeeded();
await pause(600);
await rec.focus(ready, "ready to send", 1.5);
await pause(2500);
await rec.click(pay);
const paid = page.getByRole("heading", { name: "Paid, with a receipt" });
await rec.waiting(paid.waitFor({ timeout: 180_000 }));
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
rec.caption("paid");
await pause(600);
await rec.focus(paid, "the result", 1.6);
await pause(3000);
const [download] = await Promise.all([
  page.waitForEvent("download"),
  rec.click(page.getByRole("button", { name: "Download the run file" })),
]);
const runFile = join(dir, "run-file.json");
await download.saveAs(runFile);
await pause(800);
const copy = page.getByRole("button", { name: "Copy link" }).first();
await copy.scrollIntoViewIfNeeded();
await pause(400);
await rec.focus([page.getByText("INV-V-001", { exact: true }).filter({ visible: true }).first(), page.getByRole("button", { name: "Copy link" }).last()], "the receipt links", 1.4);
await pause(3000);
await rec.click(copy);
await pause(700);
const receiptUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
if (!receiptUrl.pathname.startsWith("/r/0x")) throw new Error(`unexpected receipt link: ${receiptUrl}`);
events.txHash = wallet.sent.at(-1);
const runHref = await page.getByRole("link", { name: "Open this run" }).getAttribute("href");
if (!runHref) throw new Error("the result has no link to its run");

// ── 7 · The recipient's receipt (about 20 s) ──────────────────────────────
rec.wide();
await page.goto(`${BASE}${receiptUrl.pathname}${receiptUrl.search}`);
await rec.placePointer();
rec.caption("receipt");
await rec.waiting(page.getByText("Verified", { exact: true }).first().waitFor({ timeout: 60_000 }));
await rec.loaded();
await pause(1000);
await rec.focus([page.getByText("INV-V-001").first(), page.locator("p.amount").first()], "the invoice and its amount", 1.6);
await pause(2500);
await rec.focus(page.getByText("Verified", { exact: true }).first(), "the verdict", 1.8);
await pause(2500);
rec.caption("checks");
const ladder = page.locator("ol.ladder").first();
await ladder.scrollIntoViewIfNeeded();
await pause(400);
await rec.focus(ladder, "the six checks", 1.5);
await pause(4500);
await rec.focus(page.locator("ol.ladder li.rung").nth(2), "the payment belongs to this invoice", 2);
await pause(3000);
await rec.focus(page.locator("ol.ladder li.rung").nth(3), "real USDC, not a lookalike", 2);
await pause(3000);

// ── 8 · Reconcile (about 15 s) ────────────────────────────────────────────
rec.wide();
await page.goto(`${BASE}${runHref}`);
await rec.placePointer();
rec.caption("withoutFile");
const without = page.getByText("Reading without the run file");
await rec.waiting(without.waitFor({ timeout: 60_000 }));
await rec.loaded();
await pause(1200);
await rec.focus(without, "reading without the run file", 1.5);
await pause(2500);
await page.locator('input[type=file][accept=".json"]').setInputFiles(runFile);
rec.caption("run");
const matches = page.getByText("This run file matches the recorded list");
await rec.waiting(matches.waitFor({ timeout: 60_000 }));
await rec.loaded();
await matches.scrollIntoViewIfNeeded();
await pause(400);
await rec.focus(matches, "the file check", 1.6);
await pause(3000);
rec.caption("matched");
await page.locator(".ant-table").first().scrollIntoViewIfNeeded();
await pause(400);
await rec.focus(page.locator(".ant-table").first(), "the matched table", 1.3);
await pause(4500);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await pause(600);
await rec.focus(page.getByText("Complete", { exact: true }).first(), "completeness", 1.8);
await pause(2500);

// ── 9 · Dashboard (about 12 s) ────────────────────────────────────────────
rec.wide();
await page.goto(`${BASE}/dashboard${n}`);
await rec.placePointer();
rec.caption("dashboard");
await rec.waiting(page.getByText("Needs you").first().waitFor({ timeout: 30_000 }));
await rec.loaded();
await pause(1500);
await rec.focus(page.getByText("Needs you").first().locator("xpath=ancestor::*[contains(@class,'tape')][1]"), "Needs you", 1.5);
await pause(3000);
await rec.focus([page.locator(".wallet-head"), page.locator(".stat-tile").filter({ hasText: /USDC|EURC|cirBTC/ })], "the wallet's tokens", 1.4);
await pause(4000);
const recent = page.getByText("Recent runs").first().locator("xpath=ancestor::*[contains(@class,'tape')][1]");
await recent.scrollIntoViewIfNeeded();
await pause(500);
await rec.focus(recent, "recent runs", 1.4);
await pause(3000);
rec.wide();
await pause(3000);

await capture.stop();
events.end = Date.now() / 1000;
const first = capture.frames[0];
const size = first ? await sharp(first.file).metadata() : undefined;
if (size?.width !== 1920 * SCALE || size?.height !== 1080 * SCALE) {
  throw new Error(`frames are ${size?.width}x${size?.height}, not ${1920 * SCALE}x${1080 * SCALE}: the camera would have nothing to zoom into`);
}
if (capture.adjusted.length) {
  const missing = capture.adjusted.filter((a) => a.stamp === undefined).length;
  console.log(`${capture.adjusted.length} frame times held in order (${missing} had no timestamp); first: ${JSON.stringify(capture.adjusted.slice(0, 3))}`);
}
events.frames = capture.frames
  .filter((f) => f.at >= events.begin - 0.05)
  .map((f) => ({ file: join("frames", basename(f.file)), at: f.at }));
await renderOverlays(browser, BASE, events, dir);
await browser.close();

writeFileSync(join(dir, "events.json"), JSON.stringify(assertTake(events), null, 2));
const seconds = events.end - events.begin;
console.log(`${dir}: ${events.frames.length} frames over ${seconds.toFixed(1)} s (${(events.frames.length / seconds).toFixed(1)} fps), tx ${events.txHash}`);
if (errors.length) console.warn(`page errors:\n  ${errors.join("\n  ")}`);
const receipt = await wallet.client.getTransactionReceipt({ hash: events.txHash as Hex });
console.log(`block ${receipt.blockNumber} status ${receipt.status}`);
if (receipt.status !== "success") process.exit(1);
