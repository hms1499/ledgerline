# Walkthrough Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reproducible 2½-minute submission video of one real Ledgerline run on Arc mainnet, from a CSV with mistakes to the reconciled run and dashboard, with a camera that zooms to what the viewer should read.

**Architecture:** Two scripts. `record-walkthrough.ts` drives the app in Chromium with the shared demo wallet and writes a *take*: 3840×2160 screencast frames plus an `events.json` of focus, caption and wait events, and caption images rendered by Chromium in the site's own fonts. `render-walkthrough.ts` reads only the take: a pure render plan maps every 1/30 s of output to a source frame, a camera crop and a caption; `sharp` crops and scales, ffmpeg encodes H.264 and mixes the music. Everything that decides anything is a pure function under `scripts/lib/` with a vitest file beside it.

**Tech Stack:** TypeScript run by tsx, Playwright 1.62.1 (Chromium, CDP screencast), viem 2, `@ledgerline/core` (`tokensForChain`), sharp 0.35.4, ffmpeg 8.1 (libx264, AAC, `loudnorm`), vitest 2.

**Spec:** `docs/superpowers/specs/2026-09-29-walkthrough-video-design.md`. Read it first; Task 0 corrects its §5 caption bullet.

## Global Constraints

- Mainnet only with `--network mainnet --confirm-mainnet`; without the second flag the script exits before a browser opens.
- Per take: 0.02 USDC, 0.01 EURC, 0.0000001 cirBTC to `DEMO_RECIPIENT`, plus the fee. A take refuses to start unless the wallet holds that plus 0.02 USDC for fees.
- Run names `video-<YYYY-MM-DD>-t<n>`, never `mainnet-2026-09`.
- The demo wallet refuses any `maxFeePerGas` (or `gasPrice`) under 25 Gwei and any `from` that is not its own address.
- Viewport 1920×1080 CSS px, device scale 2 (1.5 only if the rehearsal measures too few frames); zoom capped at the device scale; output 1920×1080, 30 fps, H.264 CRF 18 yuv420p, AAC 192k, `+faststart`.
- Camera moves ease in and out over 0.7 s; a focus is framed with 48 CSS px of padding.
- Captions: at most 80 characters of text, plain language (no "manifest", "anchor", "salt", "merkle", "preflight", "commit…", "root", "run label").
- Music: faded in 1 s, out 2 s, `loudnorm=I=-14:TP=-1.5:LRA=11`; looped if shorter than the video.
- Pure modules under `scripts/lib/` import neither `sharp` nor `playwright`, so CI runs their tests with no browser and no native image library.
- `video/` is gitignored. Nothing under it is committed.
- The pointer overlay imitates no wallet and no operating system.
- Commit after each task; never push. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Any task that changes a `package.json` or `pnpm-lock.yaml` is verified by `pnpm install --frozen-lockfile` on a clean checkout (`git archive`, see memory) before merge.

## Review Focus

1. **A focus on an element that is off screen or not laid out** (null box, or no overlap with the viewport): the recorder must stop with the element's name, never frame empty space — Task 4, "refuses a focus outside the viewport".
2. **A move that starts before the last one finished** (two focuses under 0.7 s apart): the camera continues from where it is, with no jump — Task 3, "an interrupted move starts where the camera is".
3. **Music shorter than the video, or a path that does not exist**: the track loops to length; a missing file fails before any frame is rendered — Task 7, "music loops" and "missing music".
4. **A mainnet take on the wrong RPC or with too little in the wallet**: it stops before a browser opens and names what is short — Task 5, "wrong chain" and "shortfalls".
5. **A testnet take rendered as the final video**: the title card names the take's own network — Task 6, "title names the take's network".

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `scripts/lib/demo-wallet.ts` | create | The EIP-6963 stand-in's announcement and its Node-side signer, for either network; the fee and sender guard |
| `scripts/lib/demo-wallet.test.ts` | create | Guard and chain tests |
| `scripts/lib/screencast.ts` | create | CDP screencast to JPEG files (moved from `record-demo.ts`) |
| `scripts/record-demo.ts` | modify | Uses the two modules above; gains `--out` |
| `scripts/lib/timeline.ts` | modify | Adds `frameAt` and `total` |
| `scripts/lib/timeline.test.ts` | modify | Tests for both |
| `scripts/lib/camera.ts` | create | `cameraAt`, `framing`, `cropFor`, easing |
| `scripts/lib/camera.test.ts` | create | Camera tests |
| `scripts/lib/take.ts` | create | Take types, validation, `visibleRect`, `unionRect` |
| `scripts/lib/take.test.ts` | create | Take tests |
| `scripts/lib/walkthrough.ts` | create | The take's CSV, spend, shortfalls, run name, chain check, caption copy |
| `scripts/lib/walkthrough.test.ts` | create | Tests for all of it |
| `scripts/lib/overlay.ts` | create | Caption and title HTML, the pointer's in-page script, date text |
| `scripts/lib/overlay.test.ts` | create | Escaping, length, network label, script parses |
| `scripts/lib/take-recorder.ts` | create | Playwright side: focus/caption/wait logging, pointer moves, overlay rendering |
| `scripts/record-walkthrough.ts` | create | The ten scenes |
| `scripts/lib/render-plan.ts` | create | Output frame schedule, sheet frames, ffmpeg audio arguments |
| `scripts/lib/render-plan.test.ts` | create | Schedule and audio tests |
| `scripts/render-walkthrough.ts` | create | sharp crop + ffmpeg encode + contact sheet |
| `package.json`, `pnpm-lock.yaml` | modify | `sharp` 0.35.4 as a root devDependency |
| `.gitignore` | modify | `video/` |
| `docs/superpowers/specs/2026-09-29-walkthrough-video-design.md` | modify | §5 captions rendered by Chromium |
| `docs/notes/2026-09-29-walkthrough-video.md` | create (Task 9) | The mainnet take, measured |

---

### Task 0: Correct the spec's caption bullet

The spec says captions are "drawn as SVG … SVG keeps the site's fonts". The site's fonts are Atkinson Hyperlegible and Martian Mono through `next/font` (`frontend/app/layout.tsx:3`), and neither is installed on the machine (`fc-list` finds none) `[measured]`, so SVG rasterised by sharp would fall back to system fonts.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-walkthrough-video-design.md` (§5, the "Captions after the camera" bullet)

- [ ] **Step 1: Replace the bullet**

Replace the whole "**Captions after the camera.**" bullet with:

```markdown
- **Captions after the camera.** A lower third in the tape style — a mono
  step chip and one line of text — composited after the crop, so zooming
  never scales it. Each caption, and the title card, is rendered by Chromium
  at the end of the take from a page of the running app, so it uses the
  site's own fonts and tokens, and saved as a PNG in the take. The site's
  fonts come from `next/font` and are not installed on the machine
  `[measured]`, so SVG rasterised by sharp would fall back to system fonts;
  the local ffmpeg has no `drawtext` filter `[measured]`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-walkthrough-video-design.md
git commit -m "docs(spec): walkthrough captions are rendered by Chromium, in the site's fonts

The site's fonts come from next/font and are not installed on the
machine, so SVG rasterised by sharp would fall back to system fonts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: One demo wallet for both recordings

**Files:**
- Create: `scripts/lib/demo-wallet.ts`, `scripts/lib/demo-wallet.test.ts`, `scripts/lib/screencast.ts`
- Modify: `scripts/record-demo.ts`

**Interfaces:**
- Produces: `type DemoNetwork = "testnet" | "mainnet"`; `FEE_FLOOR: bigint`; `interface TxRequest`; `refusal(tx: TxRequest, wallet: Hex): string | undefined`; `demoWallet(network, key: Hex, rpcUrl: string): { account, chain, client: PublicClient, sent: Hex[], answer(method: string, params: unknown[]): Promise<unknown> }`; `WALLET_ANNOUNCE: string` (init script); `defaultRpc(network): string`.
- Produces: `interface Frame { file: string; at: number }`; `startCapture(page: Page, dir: string, shape: { width: number; height: number; scale: number }, quality?: number): Promise<{ frames: Frame[]; stop(): Promise<unknown> }>`.

- [ ] **Step 1: Write the failing tests**

`scripts/lib/demo-wallet.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseGwei, toHex, type Hex } from "viem";
import { demoWallet, refusal } from "./demo-wallet.js";

// Anvil's first key: public, holds nothing anywhere that matters.
const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const ME = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Hex;

describe("refusal — what the demo wallet will not sign", () => {
  it("refuses a fee under 25 Gwei, which Arc drops without a word", () => {
    expect(refusal({ maxFeePerGas: toHex(parseGwei("24")) }, ME)).toMatch(/under 25 Gwei/);
    expect(refusal({ gasPrice: toHex(parseGwei("20")) }, ME)).toMatch(/under 25 Gwei/);
  });

  it("refuses a transaction with no fee at all", () => {
    expect(refusal({}, ME)).toMatch(/fee of none/);
  });

  it("refuses to send from any address but its own, whatever the case", () => {
    expect(refusal({ from: "0x0000000000000000000000000000000000000001", maxFeePerGas: toHex(parseGwei("30")) }, ME))
      .toMatch(/asked to send from/);
    expect(refusal({ from: ME.toLowerCase() as Hex, maxFeePerGas: toHex(parseGwei("30")) }, ME)).toBeUndefined();
  });

  it("signs at the floor and above", () => {
    expect(refusal({ maxFeePerGas: toHex(parseGwei("25")) }, ME)).toBeUndefined();
  });
});

describe("demoWallet — one network per recording", () => {
  it("answers with its own address and its network's chain id", async () => {
    const w = demoWallet("mainnet", KEY, "http://127.0.0.1:1");
    expect(await w.answer("eth_requestAccounts", [])).toEqual([ME]);
    expect(await w.answer("eth_chainId", [])).toBe(toHex(5042));
  });

  it("refuses to switch to any other chain", async () => {
    const w = demoWallet("testnet", KEY, "http://127.0.0.1:1");
    await expect(w.answer("wallet_switchEthereumChain", [{ chainId: toHex(5042) }])).rejects.toThrow(/testnet only/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run --dir scripts lib/demo-wallet`
Expected: FAIL, `Failed to resolve import "./demo-wallet.js"`.

- [ ] **Step 3: Create `scripts/lib/demo-wallet.ts`**

```ts
/**
 * The recordings' wallet: announced to the page over EIP-6963 as "Demo
 * wallet", with every request crossing to Node, where the key signs exactly
 * what the app asked for. It draws no UI, so nothing imitates a real wallet.
 * Shared by record-demo.ts and record-walkthrough.ts: it is the code that
 * refuses a fee Arc would drop, and two copies of it could drift.
 */
import { createPublicClient, createWalletClient, http, parseGwei, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc, arcTestnet } from "viem/chains";

export type DemoNetwork = "testnet" | "mainnet";

/** execute.ts floors at 25 Gwei; under 20 the mempool drops a transaction
 *  without a word. Anything under the floor means something upstream broke. */
export const FEE_FLOOR = parseGwei("25");

export interface TxRequest {
  from?: Hex; to?: Hex; data?: Hex; value?: Hex; gas?: Hex; nonce?: Hex;
  maxFeePerGas?: Hex; maxPriorityFeePerGas?: Hex; gasPrice?: Hex;
}

export function defaultRpc(network: DemoNetwork): string {
  return network === "mainnet"
    ? process.env.ARC_MAINNET_RPC || "https://rpc.mainnet.arc.io"
    : process.env.ARC_TESTNET_RPC || "https://arc-testnet.drpc.org";
}

/** Why the demo wallet refuses to send this, or undefined when it may. */
export function refusal(tx: TxRequest, wallet: Hex): string | undefined {
  if (tx.from && tx.from.toLowerCase() !== wallet.toLowerCase()) {
    return `asked to send from ${tx.from}, but the demo wallet is ${wallet}`;
  }
  const maxFee = tx.maxFeePerGas ?? tx.gasPrice;
  if (!maxFee || BigInt(maxFee) < FEE_FLOOR) {
    return `refusing a fee of ${maxFee ?? "none"}: under 25 Gwei Arc drops it silently`;
  }
  return undefined;
}

export function demoWallet(network: DemoNetwork, key: Hex, rpcUrl: string) {
  const chain = network === "mainnet" ? arc : arcTestnet;
  const account = privateKeyToAccount(key);
  const transport = http(rpcUrl);
  const client = createPublicClient({ chain, transport });
  const signer = createWalletClient({ account, chain, transport });
  const sent: Hex[] = [];

  /** The wallet side of every EIP-1193 request the page makes. */
  async function answer(method: string, params: unknown[]): Promise<unknown> {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return toHex(chain.id);
      case "wallet_switchEthereumChain": {
        const want = Number((params[0] as { chainId: string }).chainId);
        if (want !== chain.id) throw new Error(`Demo wallet is on Arc ${network} only, asked for ${want}`);
        return null;
      }
      case "wallet_revokePermissions":
        return null;
      case "personal_sign":
        return account.signMessage({ message: { raw: params[0] as Hex } });
      case "eth_sendTransaction": {
        const tx = params[0] as TxRequest;
        const no = refusal(tx, account.address);
        if (no) throw new Error(no);
        const maxFee = (tx.maxFeePerGas ?? tx.gasPrice)!;
        const hash = await signer.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : undefined,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
          nonce: tx.nonce ? Number(tx.nonce) : undefined,
          maxFeePerGas: BigInt(maxFee),
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : undefined,
        });
        sent.push(hash);
        return hash;
      }
      default:
        return client.request({ method, params } as never);
    }
  }

  return { account, chain, client, sent, answer };
}

/**
 * Runs in the page: announces the Demo wallet. Plain JavaScript in a string,
 * because tsx rewrites a function body with helpers (`__name`) that do not
 * exist in the page.
 */
export const WALLET_ANNOUNCE = String.raw`(() => {
  const provider = {
    request: ({ method, params }) => window.__demoWallet(method, params ?? []),
    on() {},
    removeListener() {},
  };
  const icon = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#161616"/>' +
    '<text x="16" y="23" font-size="20" text-anchor="middle" fill="#FDFDFA">✱</text></svg>');
  const detail = Object.freeze({
    info: { uuid: "3f1c6e2a-demo-wallet", name: "Demo wallet", rdns: "local.ledgerline.demo", icon },
    provider,
  });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();`;
```

- [ ] **Step 4: Create `scripts/lib/screencast.ts`**

```ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";

export interface Frame { file: string; at: number }

/** CDP screencast, not Playwright's recordVideo: that one encodes realtime
 *  VP8 at 1 Mbit/s, which smears 13px table figures. These are the page's own
 *  device pixels, timed by the browser, encoded once at the end. */
export async function startCapture(
  page: Page, dir: string, shape: { width: number; height: number; scale: number }, quality = 95,
) {
  const frames: Frame[] = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, at: metadata.timestamp ?? Date.now() / 1000 });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg", quality,
    maxWidth: shape.width * shape.scale, maxHeight: shape.height * shape.scale, everyNthFrame: 1,
  });
  return { frames, stop: () => cdp.send("Page.stopScreencast") };
}
```

- [ ] **Step 5: Point `record-demo.ts` at both modules and add `--out`**

In `scripts/record-demo.ts`:
- Delete `FEE_FLOOR`, `key`/`account`/`rpc`/`chainClient`/`signer`, `sent`, `TxRequest`, `answer`, the wallet half of `PAGE_SETUP`, `interface Frame` and `startCapture`.
- Add after the imports:

```ts
import { demoWallet, defaultRpc, WALLET_ANNOUNCE } from "./lib/demo-wallet.js";
import { startCapture, type Frame } from "./lib/screencast.js";
```

- Replace the wallet setup with:

```ts
const key = process.env.PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error("PRIVATE_KEY is not set in .env");
const wallet = demoWallet("testnet", key, defaultRpc("testnet"));
const chainClient = wallet.client;
const sent = wallet.sent;
```

- `PAGE_SETUP` keeps only the `window.__caption = …` function, wrapped in its own `(() => { … })();`.
- In `record()`: `await context.exposeFunction("__demoWallet", wallet.answer);` then `await context.addInitScript({ content: WALLET_ANNOUNCE });` then `await context.addInitScript({ content: PAGE_SETUP });`.
- `startCapture(page, work, { ...shape.view, scale: shape.scale })`.
- Replace `const OUT = "frontend/public/demo";` with `const OUT = arg("--out") ?? "frontend/public/demo";` and add `--out <dir>` to the header comment's usage lines.
- Remove now-unused imports (`createPublicClient`, `createWalletClient`, `http`, `parseGwei`, `toHex`, `privateKeyToAccount`, `arcTestnet` if unused after the chain check — keep `arcTestnet` for `chainId !== arcTestnet.id`).

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run --dir scripts`
Expected: PASS, demo-wallet 6 tests and timeline 3.

- [ ] **Step 7: Prove `record-demo.ts` still records (testnet, spends test funds only)**

```bash
pnpm build
(cd frontend && pnpm exec next start -p 3100) &
pnpm exec tsx scripts/record-demo.ts --layout wide --theme light --out video/record-demo-check
```

Expected: `[wide-light] block … status success`, and `video/record-demo-check/run-wide-light.mp4` plays the five chapters. `git status` shows no change under `frontend/public/demo/`. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/demo-wallet.ts scripts/lib/demo-wallet.test.ts scripts/lib/screencast.ts scripts/record-demo.ts
git commit -m "refactor(scripts): one demo wallet and one screencast for every recording

The wallet stand-in and its fee guard move out of record-demo.ts so the
walkthrough can use the same code, for either network. record-demo.ts
gains --out, so checking it never overwrites the home page's videos.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The timeline answers "which frame is on screen at output time t"

**Files:**
- Modify: `scripts/lib/timeline.ts`, `scripts/lib/timeline.test.ts`

**Interfaces:**
- Produces: `buildTimeline(...)` now also returns `total: number` (output seconds) and `frameAt(t: number): number` (index of the frame on screen at output time `t`; 0 before the start, the last index after the end).

- [ ] **Step 1: Write the failing tests** (append to `scripts/lib/timeline.test.ts`)

```ts
describe("frameAt — the frame on screen at a moment of the video", () => {
  const frames = [{ at: 0 }, { at: 1 }, { at: 2 }];

  it("holds each frame until the next one's start", () => {
    const tl = buildTimeline(frames, 3, () => 1);
    expect(tl.total).toBe(3);
    expect([tl.frameAt(0), tl.frameAt(0.5), tl.frameAt(1), tl.frameAt(2.9)]).toEqual([0, 0, 1, 2]);
  });

  it("clamps outside the video", () => {
    const tl = buildTimeline(frames, 3, () => 1);
    expect(tl.frameAt(-1)).toBe(0);
    expect(tl.frameAt(99)).toBe(2);
  });

  it("follows a wait played faster", () => {
    const tl = buildTimeline(frames, 3, (t) => (t >= 1 && t < 2 ? 4 : 1));
    expect(tl.total).toBeCloseTo(2.25);
    expect(tl.frameAt(1.1)).toBe(1);
    expect(tl.frameAt(1.3)).toBe(2);
  });
});
```

(Keep the file's existing imports; add `describe` if missing.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run --dir scripts lib/timeline`
Expected: FAIL, `tl.frameAt is not a function`.

- [ ] **Step 3: Implement** — in `buildTimeline`, change the return type to `{ durations: number[]; total: number; outputTime(t: number): number; frameAt(t: number): number }` and add to the returned object:

```ts
    total: clock,
    frameAt(t) {
      let i = 0;
      for (let j = 0; j < starts.length; j++) if (starts[j]! <= t) i = j;
      return i;
    },
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --dir scripts lib/timeline`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/timeline.ts scripts/lib/timeline.test.ts
git commit -m "feat(scripts): the timeline says which frame is on screen at a moment of the video

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The camera

**Files:**
- Create: `scripts/lib/camera.ts`, `scripts/lib/camera.test.ts`

**Interfaces:**
- Produces: `interface Rect { x; y; width; height }` (viewport CSS px); `interface View { width; height }`; `interface Camera { cx; cy; scale }`; `interface Focus { at: number; rect: Rect | null; zoom?: number }` (`rect: null` is the wide shot); `PAD = 48`; `MOVE = 0.7`; `easeInOut(u)`; `wideShot(view)`; `framing(rect, view, maxZoom, zoom?)`; `cameraAt(t, focuses, view, maxZoom)`; `interface Crop { left; top; width; height }` (device px, integers); `cropFor(cam, view, deviceScale)`.

- [ ] **Step 1: Write the failing tests** — `scripts/lib/camera.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { cameraAt, cropFor, easeInOut, framing, MOVE, type Focus } from "./camera.js";

const VIEW = { width: 1920, height: 1080 };
const MID = { x: 800, y: 400, width: 320, height: 200 };

describe("easeInOut", () => {
  it("starts at 0, ends at 1, crosses 0.5 at half time, never goes back", () => {
    expect([easeInOut(0), easeInOut(0.5), easeInOut(1)]).toEqual([0, 0.5, 1]);
    for (let u = 0; u < 1; u += 0.05) expect(easeInOut(u + 0.05)).toBeGreaterThanOrEqual(easeInOut(u));
  });
});

describe("framing", () => {
  it("centres a small element at the zoom cap", () => {
    expect(framing(MID, VIEW, 2)).toEqual({ cx: 960, cy: 500, scale: 2 });
  });

  it("zooms a wide element only as far as it fits, with padding", () => {
    const f = framing({ x: 100, y: 300, width: 1600, height: 200 }, VIEW, 2);
    expect(f.scale).toBeCloseTo(1920 / (1600 + 96));
  });

  it("honours an asked-for zoom, never past the cap and never under 1", () => {
    expect(framing(MID, VIEW, 2, 1.3).scale).toBe(1.3);
    expect(framing(MID, VIEW, 2, 3).scale).toBe(2);
    expect(framing(MID, VIEW, 2, 0.5).scale).toBe(1);
  });

  it("never shows past the frame's edge", () => {
    expect(framing({ x: 0, y: 0, width: 100, height: 50 }, VIEW, 2)).toEqual({ cx: 480, cy: 270, scale: 2 });
    expect(framing({ x: 1900, y: 1060, width: 20, height: 20 }, VIEW, 2)).toEqual({ cx: 1440, cy: 810, scale: 2 });
  });

  it("frames the whole view for the wide shot", () => {
    expect(framing(null, VIEW, 2)).toEqual({ cx: 960, cy: 540, scale: 1 });
  });
});

describe("cameraAt", () => {
  const focuses: Focus[] = [{ at: 1, rect: MID }];

  it("is the wide shot before the first focus", () => {
    expect(cameraAt(0.5, focuses, VIEW, 2)).toEqual({ cx: 960, cy: 540, scale: 1 });
  });

  it("arrives at the framing once the move is over, and holds it", () => {
    expect(cameraAt(1 + MOVE, focuses, VIEW, 2)).toEqual({ cx: 960, cy: 500, scale: 2 });
    expect(cameraAt(10, focuses, VIEW, 2)).toEqual({ cx: 960, cy: 500, scale: 2 });
  });

  it("zooms evenly: halfway through the move is halfway in log scale", () => {
    const c = cameraAt(1 + MOVE / 2, focuses, VIEW, 2);
    expect(c.scale).toBeCloseTo(Math.SQRT2);
    expect(c.cy).toBeCloseTo(520);
  });

  it("an interrupted move starts where the camera is", () => {
    const f: Focus[] = [{ at: 0, rect: MID }, { at: 0.3, rect: { x: 1500, y: 800, width: 200, height: 100 } }];
    const before = cameraAt(0.2999, f, VIEW, 2);
    const after = cameraAt(0.3, f, VIEW, 2);
    expect(Math.abs(after.cx - before.cx)).toBeLessThan(1);
    expect(Math.abs(after.cy - before.cy)).toBeLessThan(1);
    expect(Math.abs(after.scale - before.scale)).toBeLessThan(0.01);
  });

  it("goes back to the wide shot on a focus with no element", () => {
    const f: Focus[] = [{ at: 0, rect: MID }, { at: 2, rect: null }];
    expect(cameraAt(2 + MOVE, f, VIEW, 2)).toEqual({ cx: 960, cy: 540, scale: 1 });
  });
});

describe("cropFor", () => {
  it("is the camera's window in device pixels, 16:9, inside the frame", () => {
    expect(cropFor({ cx: 960, cy: 540, scale: 2 }, VIEW, 2)).toEqual({ left: 960, top: 540, width: 1920, height: 1080 });
    expect(cropFor({ cx: 960, cy: 540, scale: 1 }, VIEW, 2)).toEqual({ left: 0, top: 0, width: 3840, height: 2160 });
  });

  it("stays whole pixels and in bounds at an awkward scale", () => {
    const c = cropFor({ cx: 1500, cy: 900, scale: 1.37 }, VIEW, 1.5);
    for (const v of Object.values(c)) expect(Number.isInteger(v)).toBe(true);
    expect(c.left + c.width).toBeLessThanOrEqual(2880);
    expect(c.top + c.height).toBeLessThanOrEqual(1620);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run --dir scripts lib/camera`
Expected: FAIL, `Failed to resolve import "./camera.js"`.

- [ ] **Step 3: Implement** — `scripts/lib/camera.ts`

```ts
/**
 * The video's camera, decided after the recording: where it looks and how
 * close, at every moment. Coordinates are the page's CSS pixels in the
 * viewport, as Playwright's boundingBox reports them; the render turns a
 * camera into a crop of the device-pixel frame.
 */
export interface Rect { x: number; y: number; width: number; height: number }
export interface View { width: number; height: number }
export interface Camera { cx: number; cy: number; scale: number }
/** A moment the script asked the camera to look at something. `rect: null`
 *  is the wide shot. */
export interface Focus { at: number; rect: Rect | null; zoom?: number }
export interface Crop { left: number; top: number; width: number; height: number }

export const PAD = 48;
export const MOVE = 0.7;

export const easeInOut = (u: number): number =>
  u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;

export const wideShot = (view: View): Camera => ({ cx: view.width / 2, cy: view.height / 2, scale: 1 });

function clamp(c: Camera, view: View): Camera {
  const scale = Math.max(1, c.scale);
  const hw = view.width / (2 * scale);
  const hh = view.height / (2 * scale);
  return {
    scale,
    cx: Math.min(Math.max(c.cx, hw), view.width - hw),
    cy: Math.min(Math.max(c.cy, hh), view.height - hh),
  };
}

export function framing(rect: Rect | null, view: View, maxZoom: number, zoom?: number): Camera {
  if (!rect) return wideShot(view);
  const fit = Math.min(view.width / (rect.width + 2 * PAD), view.height / (rect.height + 2 * PAD));
  const scale = Math.min(maxZoom, Math.max(1, zoom ?? fit));
  return clamp({ cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, scale }, view);
}

/** Position eases linearly; scale eases in log space, so a zoom feels even. */
function between(a: Camera, b: Camera, u: number, view: View): Camera {
  const e = easeInOut(u);
  if (e <= 0) return clamp(a, view);
  if (e >= 1) return clamp(b, view);
  return clamp({
    cx: a.cx + (b.cx - a.cx) * e,
    cy: a.cy + (b.cy - a.cy) * e,
    scale: Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * e),
  }, view);
}

const progress = (t: number, at: number) => Math.min(1, Math.max(0, (t - at) / MOVE));

/** `focuses` sorted by `at`. A move that starts before the last one finished
 *  starts from wherever the camera is, so nothing jumps. */
export function cameraAt(t: number, focuses: readonly Focus[], view: View, maxZoom: number): Camera {
  let start = wideShot(view);
  let target = start;
  let since = -Infinity;
  for (const f of focuses) {
    if (f.at > t) break;
    start = between(start, target, progress(f.at, since), view);
    target = framing(f.rect, view, maxZoom, f.zoom);
    since = f.at;
  }
  return since === -Infinity ? start : between(start, target, progress(t, since), view);
}

export function cropFor(cam: Camera, view: View, deviceScale: number): Crop {
  const W = Math.round(view.width * deviceScale);
  const H = Math.round(view.height * deviceScale);
  const width = Math.min(W, Math.round(W / cam.scale));
  const height = Math.min(H, Math.round((width * H) / W));
  const left = Math.min(W - width, Math.max(0, Math.round((cam.cx - view.width / (2 * cam.scale)) * deviceScale)));
  const top = Math.min(H - height, Math.max(0, Math.round((cam.cy - view.height / (2 * cam.scale)) * deviceScale)));
  return { left, top, width, height };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --dir scripts lib/camera`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/camera.ts scripts/lib/camera.test.ts
git commit -m "feat(scripts): a camera that frames what the viewer should read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: A take, and what a take may contain

**Files:**
- Create: `scripts/lib/take.ts`, `scripts/lib/take.test.ts`

**Interfaces:**
- Consumes: `Rect`, `View` from `./camera.js`; `DemoNetwork` from `./demo-wallet.js`.
- Produces: `interface TakeEvents { version: 1; network: DemoNetwork; runName: string; date: string /* YYYY-MM-DD */; txHash?: string; view: { width; height; scale }; begin: number; end: number; frames: { file: string; at: number }[] /* file relative to the take */; waits: { from: number; to: number }[]; focuses: { at: number; rect: Rect | null; zoom?: number; label: string }[]; captions: { at: number; step: string; text: string; image?: string }[]; title?: string /* PNG file */ }`; `assertTake(value: unknown): TakeEvents`; `visibleRect(box: Rect | null, view: View, label: string): Rect`; `unionRect(rects: Rect[]): Rect`.

- [ ] **Step 1: Write the failing tests** — `scripts/lib/take.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { assertTake, unionRect, visibleRect, type TakeEvents } from "./take.js";

const VIEW = { width: 1920, height: 1080 };
const take = (over: Partial<TakeEvents> = {}): TakeEvents => ({
  version: 1, network: "testnet", runName: "video-2026-09-29-t1", date: "2026-09-29",
  view: { width: 1920, height: 1080, scale: 2 }, begin: 10, end: 20,
  frames: [{ file: "frames/f00000.jpg", at: 10 }, { file: "frames/f00001.jpg", at: 11 }],
  waits: [], focuses: [], captions: [], ...over,
});

describe("visibleRect", () => {
  it("refuses a focus outside the viewport, naming it", () => {
    expect(() => visibleRect(null, VIEW, "the drop zone")).toThrow(/the drop zone/);
    expect(() => visibleRect({ x: 0, y: 1200, width: 100, height: 40 }, VIEW, "Pay button")).toThrow(/Pay button/);
  });

  it("clips a box that runs past the edge to what is on screen", () => {
    expect(visibleRect({ x: -20, y: 1000, width: 200, height: 200 }, VIEW, "x"))
      .toEqual({ x: 0, y: 1000, width: 180, height: 80 });
  });
});

describe("unionRect", () => {
  it("is the smallest box holding them all", () => {
    expect(unionRect([{ x: 10, y: 20, width: 100, height: 10 }, { x: 50, y: 5, width: 10, height: 100 }]))
      .toEqual({ x: 10, y: 5, width: 100, height: 100 });
  });
});

describe("assertTake", () => {
  it("accepts a well-formed take", () => {
    expect(assertTake(JSON.parse(JSON.stringify(take()))).runName).toBe("video-2026-09-29-t1");
  });

  it("rejects a take with no frames, frames out of order, or an end before its start", () => {
    expect(() => assertTake(take({ frames: [] }))).toThrow(/no frames/);
    expect(() => assertTake(take({ frames: [{ file: "a", at: 12 }, { file: "b", at: 11 }] }))).toThrow(/order/);
    expect(() => assertTake(take({ end: 5 }))).toThrow(/end/);
  });

  it("rejects a network it cannot label", () => {
    expect(() => assertTake({ ...take(), network: "sepolia" })).toThrow(/network/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run --dir scripts lib/take`
Expected: FAIL, `Failed to resolve import "./take.js"`.

- [ ] **Step 3: Implement** — `scripts/lib/take.ts`

```ts
/**
 * A take: one recording's frames and everything the script said about them.
 * The render reads only this, so a take can be re-rendered any number of
 * times without another payment.
 */
import type { Rect, View } from "./camera.js";
import type { DemoNetwork } from "./demo-wallet.js";

export interface TakeEvents {
  version: 1;
  network: DemoNetwork;
  runName: string;
  /** YYYY-MM-DD, the day it was recorded. */
  date: string;
  txHash?: string;
  view: { width: number; height: number; scale: number };
  begin: number;
  end: number;
  /** `file` relative to the take's folder. */
  frames: { file: string; at: number }[];
  waits: { from: number; to: number }[];
  focuses: { at: number; rect: Rect | null; zoom?: number; label: string }[];
  captions: { at: number; step: string; text: string; image?: string }[];
  /** The title card's PNG, relative to the take's folder. */
  title?: string;
}

export function assertTake(value: unknown): TakeEvents {
  const t = value as TakeEvents;
  if (t?.version !== 1) throw new Error("not a take: version is not 1");
  if (t.network !== "testnet" && t.network !== "mainnet") throw new Error(`a take's network must be testnet or mainnet, got ${String(t.network)}`);
  if (!Array.isArray(t.frames) || t.frames.length === 0) throw new Error("the take has no frames");
  for (let i = 1; i < t.frames.length; i++) {
    if (t.frames[i]!.at < t.frames[i - 1]!.at) throw new Error(`frames out of order at ${i}`);
  }
  if (!(t.end > t.begin)) throw new Error(`the take's end (${t.end}) is not after its begin (${t.begin})`);
  return t;
}

/** What of an element is on screen. A focus on nothing would frame empty
 *  space for seconds, so it stops the take instead. */
export function visibleRect(box: Rect | null, view: View, label: string): Rect {
  if (!box) throw new Error(`cannot focus ${label}: it has no box on the page`);
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const right = Math.min(view.width, box.x + box.width);
  const bottom = Math.min(view.height, box.y + box.height);
  if (right <= x || bottom <= y) throw new Error(`cannot focus ${label}: it is outside the viewport`);
  return { x, y, width: right - x, height: bottom - y };
}

export function unionRect(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --dir scripts lib/take`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/take.ts scripts/lib/take.test.ts
git commit -m "feat(scripts): a take records what the script said about its frames

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The walkthrough's data: its file, its spend, its guard, its words

**Files:**
- Create: `scripts/lib/walkthrough.ts`, `scripts/lib/walkthrough.test.ts`

**Interfaces:**
- Consumes: `DemoNetwork` from `./demo-wallet.js`.
- Produces: `SPEND: { USDC: bigint; EURC: bigint; cirBTC: bigint }` (base units per take); `FEE_BUFFER_USDC: bigint`; `walkthroughCsv(recipient: string): string`; `shortfalls(held: { USDC: bigint; EURC: bigint; cirBTC: bigint }): string[]`; `nextRunName(date: string, taken: readonly string[]): string`; `assertChain(chainId: number, network: DemoNetwork): void`; `CAPTIONS: Record<CaptionKey, readonly [step: string, text: string]>` with keys `home | tokens | upload | review | fixed | funding | safe | trim | check | pay | paid | receipt | checks | run | matched | dashboard`.

- [ ] **Step 1: Write the failing tests** — `scripts/lib/walkthrough.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { assertChain, CAPTIONS, FEE_BUFFER_USDC, nextRunName, shortfalls, SPEND, walkthroughCsv } from "./walkthrough.js";

const R = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

describe("walkthroughCsv", () => {
  it("has the two mistakes the video fixes, and pays the spend once they are fixed", () => {
    expect(walkthroughCsv(R)).toBe([
      "invoiceId,token,to,amount",
      `INV-V-001,USDC,${R},0.01`,
      `INV-V-002,USD,${R},0.01`,
      `INV-V-003,EURC,${R},25`,
      `INV-V-004,cirBTC,${R},0.0000001`,
    ].join("\n") + "\n");
    expect(SPEND).toEqual({ USDC: 20_000n, EURC: 10_000n, cirBTC: 10n });
  });
});

describe("shortfalls", () => {
  it("names each token the wallet cannot cover, fees counted in USDC", () => {
    const enough = { USDC: SPEND.USDC + FEE_BUFFER_USDC, EURC: SPEND.EURC, cirBTC: SPEND.cirBTC };
    expect(shortfalls(enough)).toEqual([]);
    expect(shortfalls({ ...enough, USDC: SPEND.USDC })).toEqual(["USDC: holds 0.02, needs 0.04 including fees"]);
    expect(shortfalls({ ...enough, cirBTC: 9n })).toEqual(["cirBTC: holds 0.00000009, needs 0.0000001"]);
  });
});

describe("nextRunName", () => {
  it("numbers the day's takes, never reusing a name", () => {
    expect(nextRunName("2026-09-29", [])).toBe("video-2026-09-29-t1");
    expect(nextRunName("2026-09-29", ["video-2026-09-29-t1", "video-2026-09-29-t3", "video-2026-09-28-t7"]))
      .toBe("video-2026-09-29-t4");
  });
});

describe("assertChain", () => {
  it("stops a take whose RPC is on the wrong chain", () => {
    expect(() => assertChain(5042, "mainnet")).not.toThrow();
    expect(() => assertChain(5042002, "mainnet")).toThrow(/wrong chain/);
    expect(() => assertChain(5042, "testnet")).toThrow(/wrong chain/);
  });
});

describe("CAPTIONS", () => {
  const JARGON = /\b(manifests?|anchor\w*|salt|merkle|preflight|commit\w*|root|run label)\b/i;
  it("each fits one line and speaks plainly", () => {
    for (const [key, [step, text]] of Object.entries(CAPTIONS)) {
      expect(text.length, key).toBeLessThanOrEqual(80);
      expect(step.length, key).toBeLessThanOrEqual(14);
      expect(text, key).not.toMatch(JARGON);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run --dir scripts lib/walkthrough`
Expected: FAIL, `Failed to resolve import "./walkthrough.js"`.

- [ ] **Step 3: Implement** — `scripts/lib/walkthrough.ts`

```ts
/**
 * The walkthrough's fixed data: the file it uploads, what one take spends,
 * what stops a take before it starts, and the words on screen.
 * Spec: docs/superpowers/specs/2026-09-29-walkthrough-video-design.md §2–§3.
 */
import type { DemoNetwork } from "./demo-wallet.js";

/** What one take pays, in each token's base units (USDC and EURC 6
 *  decimals, cirBTC 8), once the file's two mistakes are fixed. */
export const SPEND = { USDC: 20_000n, EURC: 10_000n, cirBTC: 10n } as const;
/** Kept back in USDC for fees: a run costs about 0.007 USDC on Arc. */
export const FEE_BUFFER_USDC = 20_000n;

const DECIMALS = { USDC: 6, EURC: 6, cirBTC: 8 } as const;
type Symbol = keyof typeof DECIMALS;

const figure = (v: bigint, d: number) => {
  const base = 10n ** BigInt(d);
  const frac = (v % base).toString().padStart(d, "0").replace(/0+$/, "");
  return `${v / base}${frac ? `.${frac}` : ""}`;
};

/** `USD` is an unknown token the Review step offers to fix; `25` EURC is
 *  more than the wallet holds, which brings up the Safe treasury block. */
export function walkthroughCsv(recipient: string): string {
  return [
    "invoiceId,token,to,amount",
    `INV-V-001,USDC,${recipient},0.01`,
    `INV-V-002,USD,${recipient},0.01`,
    `INV-V-003,EURC,${recipient},25`,
    `INV-V-004,cirBTC,${recipient},0.0000001`,
  ].join("\n") + "\n";
}

export function shortfalls(held: Record<Symbol, bigint>): string[] {
  const need: Record<Symbol, bigint> = { USDC: SPEND.USDC + FEE_BUFFER_USDC, EURC: SPEND.EURC, cirBTC: SPEND.cirBTC };
  return (Object.keys(need) as Symbol[])
    .filter((s) => held[s] < need[s])
    .map((s) => `${s}: holds ${figure(held[s], DECIMALS[s])}, needs ${figure(need[s], DECIMALS[s])}${s === "USDC" ? " including fees" : ""}`);
}

export function nextRunName(date: string, taken: readonly string[]): string {
  const prefix = `video-${date}-t`;
  const used = taken.filter((n) => n.startsWith(prefix)).map((n) => Number(n.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${Math.max(0, ...used) + 1}`;
}

const CHAIN: Record<DemoNetwork, number> = { mainnet: 5042, testnet: 5042002 };

export function assertChain(chainId: number, network: DemoNetwork): void {
  if (chainId !== CHAIN[network]) {
    throw new Error(`wrong chain: the RPC reports ${chainId}, Arc ${network} is ${CHAIN[network]}`);
  }
}

export const CAPTIONS = {
  home: ["Ledgerline", "Pay a list of invoices on Arc in one transaction"],
  tokens: ["Ledgerline", "USDC, EURC and cirBTC, each payment carrying its invoice"],
  upload: ["1 · Upload", "A payout list as CSV: one line per invoice"],
  review: ["2 · Review", "Mistakes are found in your browser and fixed in place"],
  fixed: ["2 · Review", "One click, and the line names a real token"],
  funding: ["3 · Fund", "Before anything is signed: can this wallet pay it?"],
  safe: ["3 · Fund", "Paying from a Safe? It says exactly what to send, and where"],
  trim: ["3 · Fund", "Or change the line. Every token is now covered"],
  check: ["4 · Check", "Every payment is tried against Arc before money moves"],
  pay: ["5 · Pay", "One transaction pays every invoice, in three tokens"],
  paid: ["5 · Pay", "Paid, with a receipt link for each recipient"],
  receipt: ["6 · Receipt", "The recipient's browser checks the payment against the chain"],
  checks: ["6 · Receipt", "Six checks. None of them asks Ledgerline anything"],
  run: ["7 · Reconcile", "The payer's saved file matches what was recorded on chain"],
  matched: ["7 · Reconcile", "Every invoice matched to the payment that settled it"],
  dashboard: ["8 · Dashboard", "What needs you, and what each token paid this month"],
} as const satisfies Record<string, readonly [string, string]>;
export type CaptionKey = keyof typeof CAPTIONS;
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --dir scripts lib/walkthrough`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/walkthrough.ts scripts/lib/walkthrough.test.ts
git commit -m "feat(scripts): the walkthrough's file, spend, guard and captions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: What is drawn over the page: captions, the title card, the pointer

**Files:**
- Create: `scripts/lib/overlay.ts`, `scripts/lib/overlay.test.ts`

**Interfaces:**
- Consumes: `DemoNetwork`.
- Produces: `escapeHtml(s)`; `dateText(iso: string): string` ("29 Sep 2026"); `OVERLAY_CSS: string`; `captionHtml(step: string, text: string): string` (root element `.vid-cap`); `titleHtml(network: DemoNetwork, isoDate: string): string` (root `.vid-title`); `POINTER_SETUP: string` (init script defining `window.__pointerTo(x, y)`, `window.__pointerPlace(x, y)`, `window.__pointerRipple(x, y)`); `centre(box: Rect): { x: number; y: number }`.

- [ ] **Step 1: Write the failing tests** — `scripts/lib/overlay.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { captionHtml, centre, dateText, escapeHtml, POINTER_SETUP, titleHtml } from "./overlay.js";

describe("captionHtml", () => {
  it("escapes what it is given", () => {
    expect(captionHtml("1 · Upload", "a <b> & c")).toContain("a &lt;b&gt; &amp; c");
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
  });

  it("refuses a caption too long for one line", () => {
    expect(() => captionHtml("x", "y".repeat(81))).toThrow(/80/);
  });
});

describe("titleHtml", () => {
  it("title names the take's network and its day, spelled out", () => {
    expect(titleHtml("testnet", "2026-09-29")).toContain("Recorded on Arc testnet · 29 Sep 2026");
    expect(titleHtml("mainnet", "2026-10-05")).toContain("Recorded on Arc mainnet · 5 Oct 2026");
  });
});

describe("dateText", () => {
  it("does not depend on the runtime's locale data", () => {
    expect(dateText("2026-01-01")).toBe("1 Jan 2026");
  });
});

describe("the pointer", () => {
  it("is valid page script that names no wallet", () => {
    expect(() => new Function(POINTER_SETUP)).not.toThrow();
    expect(POINTER_SETUP).not.toMatch(/metamask|rabby|coinbase|phantom/i);
  });

  it("aims at the middle of a box", () => {
    expect(centre({ x: 10, y: 20, width: 100, height: 40 })).toEqual({ x: 60, y: 40 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run --dir scripts lib/overlay`
Expected: FAIL, `Failed to resolve import "./overlay.js"`.

- [ ] **Step 3: Implement** — `scripts/lib/overlay.ts`

```ts
/**
 * What the walkthrough draws over the app. Captions and the title card are
 * HTML rendered by Chromium from a page of the running app, so they use the
 * site's fonts and tokens (spec §5); the pointer is drawn in the page while
 * recording, so the camera zooms it with everything else.
 */
import type { Rect } from "./camera.js";
import type { DemoNetwork } from "./demo-wallet.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Spelled out rather than formatted: ICU versions disagree (see paidAtText). */
export function dateText(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}

export const OVERLAY_CSS = `
#vid-stage { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; pointer-events: none; }
#vid-stage.is-title { background: var(--desk); }
.vid-cap { display: flex; align-items: center; gap: 18px; max-width: 1500px; padding: 18px 28px;
  background: var(--ink); color: var(--tape); font-family: var(--font-sans), system-ui, sans-serif;
  font-size: 34px; line-height: 1.3; }
.vid-cap .step { flex: none; padding: 4px 12px; background: var(--highlight); color: var(--on-highlight);
  font-family: var(--font-mono), ui-monospace, monospace; font-size: 22px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; }
.vid-title { width: 1200px; padding: 64px 72px; background: var(--tape); color: var(--ink); }
.vid-title .mark { font-family: var(--font-mono), ui-monospace, monospace; font-size: 30px; font-weight: 700; letter-spacing: 0.12em; }
.vid-title h1 { margin: 36px 0 20px; font-family: var(--font-sans), system-ui, sans-serif; font-size: 76px; line-height: 1.05; }
.vid-title p { margin: 0; font-family: var(--font-sans), system-ui, sans-serif; font-size: 32px; color: var(--ink-soft); }
.vid-title .foot { margin-top: 48px; padding-top: 20px; border-top: 1.5px dashed var(--ink);
  font-family: var(--font-mono), ui-monospace, monospace; font-size: 22px; letter-spacing: 0.06em; text-transform: uppercase; }
`;

export function captionHtml(step: string, text: string): string {
  if (text.length > 80) throw new Error(`a caption holds at most 80 characters, got ${text.length}: "${text}"`);
  return `<div class="vid-cap"><span class="step">${escapeHtml(step)}</span><span>${escapeHtml(text)}</span></div>`;
}

export function titleHtml(network: DemoNetwork, isoDate: string): string {
  return `<div class="vid-title"><div class="mark">✱ LEDGERLINE</div>`
    + `<h1>A payment that carries its own invoice</h1>`
    + `<p>Batched stablecoin payouts on Arc, reconcilable by payer and recipient without trusting each other.</p>`
    + `<div class="foot">Recorded on Arc ${network} · ${dateText(isoDate)}</div></div>`;
}

export const centre = (box: Rect) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** Plain JavaScript in a string, for addInitScript (see WALLET_ANNOUNCE). */
export const POINTER_SETUP = String.raw`(() => {
  const ensure = () => {
    let p = document.getElementById("vid-pointer");
    if (p) return p;
    p = document.createElement("div");
    p.id = "vid-pointer";
    p.setAttribute("aria-hidden", "true");
    p.innerHTML = '<svg width="30" height="30" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 16.5 L13 25 L16.5 23.5 L13 15 L21 15 Z" fill="#161616" stroke="#FDFDFA" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const style = document.createElement("style");
    style.textContent = "#vid-pointer{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}"
      + "#vid-pointer.moving{transition:transform .6s cubic-bezier(.65,0,.35,1)}"
      + ".vid-ripple{position:fixed;z-index:2147483645;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid #FFE45C;animation:vid-ripple .5s ease-out forwards}"
      + "@keyframes vid-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}";
    document.head.append(style);
    document.body.append(p);
    return p;
  };
  const at = (p, x, y) => { p.style.transform = "translate(" + (x - 4) + "px," + (y - 2) + "px)"; };
  window.__pointerTo = (x, y) => { const p = ensure(); p.classList.add("moving"); at(p, x, y); };
  window.__pointerPlace = (x, y) => { const p = ensure(); p.classList.remove("moving"); at(p, x, y); };
  window.__pointerRipple = (x, y) => {
    const r = document.createElement("div");
    r.className = "vid-ripple";
    r.style.left = x + "px";
    r.style.top = y + "px";
    document.body.append(r);
    setTimeout(() => r.remove(), 600);
  };
})();`;
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --dir scripts lib/overlay`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/overlay.ts scripts/lib/overlay.test.ts
git commit -m "feat(scripts): captions, the title card and a pointer for the walkthrough

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The render: plan, crop, encode, music

**Files:**
- Create: `scripts/lib/render-plan.ts`, `scripts/lib/render-plan.test.ts`, `scripts/render-walkthrough.ts`
- Modify: `package.json` (devDependency `sharp`), `pnpm-lock.yaml`, `.gitignore`

**Interfaces:**
- Consumes: `buildTimeline` (Task 2), `cameraAt`, `cropFor`, `MOVE`, `Crop` (Task 3), `TakeEvents`, `assertTake` (Task 4).
- Produces: `interface RenderOptions { fps: number; titleSeconds: number; waitSpeed: number }`; `type Planned = { kind: "title" } | { kind: "shot"; source: number; crop: Crop; caption: number | undefined }`; `renderPlan(take: TakeEvents, o: RenderOptions): { frames: Planned[]; seconds: number; sheet: number[] }`; `audioArgs(music: string | undefined, seconds: number, exists: (path: string) => boolean): string[]` (ffmpeg inputs and `-filter_complex` for the audio, labelled `[a]`; throws when `music` is given and does not exist); `maxZoomFor(scale: number): number`.

- [ ] **Step 1: Write the failing tests** — `scripts/lib/render-plan.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { audioArgs, maxZoomFor, renderPlan } from "./render-plan.js";
import type { TakeEvents } from "./take.js";

const take: TakeEvents = {
  version: 1, network: "testnet", runName: "video-2026-09-29-t1", date: "2026-09-29",
  view: { width: 1920, height: 1080, scale: 2 }, begin: 100, end: 104,
  frames: [{ file: "a", at: 100 }, { file: "b", at: 101 }, { file: "c", at: 102 }],
  waits: [{ from: 102, to: 104 }],
  focuses: [{ at: 101, rect: { x: 800, y: 400, width: 320, height: 200 }, label: "x" }],
  captions: [{ at: 100, step: "1 · Upload", text: "a" }, { at: 102, step: "2 · Review", text: "b" }],
};
const O = { fps: 10, titleSeconds: 1, waitSpeed: 4 };

describe("renderPlan", () => {
  const plan = renderPlan(take, O);

  it("opens on the title card, then plays the take with waits sped up", () => {
    expect(plan.seconds).toBeCloseTo(1 + 2 + 0.5);
    expect(plan.frames.length).toBe(35);
    expect(plan.frames.slice(0, 10).every((f) => f.kind === "title")).toBe(true);
    expect(plan.frames[10]).toMatchObject({ kind: "shot", source: 0, caption: 0 });
  });

  it("puts each caption up from its moment until the next", () => {
    const at = (s: number) => plan.frames[Math.round(s * O.fps)]!;
    expect(at(1 + 1.5)).toMatchObject({ caption: 0 });
    expect(at(1 + 2.2)).toMatchObject({ caption: 1, source: 2 });
  });

  it("has arrived at the focus once the move is over", () => {
    const f = plan.frames[Math.round((1 + 1 + 0.8) * O.fps)]!;
    expect(f).toMatchObject({ kind: "shot", crop: { left: 960, top: 460, width: 1920, height: 1080 } });
  });

  it("samples the contact sheet once per focus, after the camera arrives", () => {
    expect(plan.sheet).toEqual([Math.round((1 + 1 + 0.7 + 0.3) * O.fps)]);
  });
});

describe("maxZoomFor", () => {
  it("never zooms past the frame's own pixels", () => {
    expect([maxZoomFor(2), maxZoomFor(1.5), maxZoomFor(3)]).toEqual([2, 1.5, 2]);
  });
});

describe("audioArgs", () => {
  it("music loops to length, fades in and out, and is levelled for YouTube", () => {
    const a = audioArgs("song.mp3", 145, () => true);
    expect(a.slice(0, 4)).toEqual(["-stream_loop", "-1", "-i", "song.mp3"]);
    expect(a.at(-1)).toBe("[1:a]atrim=0:145,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1,afade=t=out:st=143:d=2,loudnorm=I=-14:TP=-1.5:LRA=11[a]");
  });

  it("gives a silent track when there is no music, so every upload has the same shape", () => {
    const a = audioArgs(undefined, 145, () => true);
    expect(a.slice(0, 4)).toEqual(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]);
    expect(a.at(-1)).toBe("[1:a]atrim=0:145,asetpts=PTS-STARTPTS[a]");
  });

  it("missing music fails before any frame is rendered", () => {
    expect(() => audioArgs("nope.mp3", 145, () => false)).toThrow(/no music file at nope.mp3/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run --dir scripts lib/render-plan`
Expected: FAIL, `Failed to resolve import "./render-plan.js"`.

- [ ] **Step 3: Implement** — `scripts/lib/render-plan.ts`

```ts
/**
 * The render, decided before a pixel moves: for every 1/fps of the video,
 * which source frame, which crop and which caption. Driven by the output
 * clock, not the screencast's: the screencast sends a frame only when the
 * page changes, so a zoom over a still page has one frame to work with.
 */
import { buildTimeline } from "./timeline.js";
import { cameraAt, cropFor, MOVE, type Crop } from "./camera.js";
import type { TakeEvents } from "./take.js";

export interface RenderOptions { fps: number; titleSeconds: number; waitSpeed: number }
export type Planned =
  | { kind: "title" }
  | { kind: "shot"; source: number; crop: Crop; caption: number | undefined };

export const maxZoomFor = (scale: number) => Math.min(2, scale);

export function renderPlan(take: TakeEvents, o: RenderOptions) {
  const inWait = (t: number) => take.waits.some((w) => t >= w.from && t < w.to);
  const tl = buildTimeline(take.frames, take.end, (t) => (inWait(t) ? o.waitSpeed : 1));
  const view = { width: take.view.width, height: take.view.height };
  const maxZoom = maxZoomFor(take.view.scale);
  const focuses = take.focuses.map((f) => ({ at: tl.outputTime(f.at), rect: f.rect, zoom: f.zoom }));
  const captionsAt = take.captions.map((c) => tl.outputTime(c.at));

  const seconds = o.titleSeconds + tl.total;
  const count = Math.round(seconds * o.fps);
  const frames: Planned[] = [];
  for (let k = 0; k < count; k++) {
    const T = k / o.fps;
    if (T < o.titleSeconds) { frames.push({ kind: "title" }); continue; }
    const t = T - o.titleSeconds;
    let caption: number | undefined;
    captionsAt.forEach((at, i) => { if (at <= t) caption = i; });
    frames.push({
      kind: "shot",
      source: tl.frameAt(t),
      crop: cropFor(cameraAt(t, focuses, view, maxZoom), view, take.view.scale),
      caption,
    });
  }
  const sheet = focuses
    .filter((f) => f.rect)
    .map((f) => Math.min(count - 1, Math.round((o.titleSeconds + f.at + MOVE + 0.3) * o.fps)));
  return { frames, seconds, sheet };
}

/** ffmpeg inputs and the audio filter, labelled [a]. Input 0 is the video. */
export function audioArgs(music: string | undefined, seconds: number, exists: (path: string) => boolean): string[] {
  if (music && !exists(music)) throw new Error(`no music file at ${music}`);
  const s = Number(seconds.toFixed(3));
  if (!music) {
    return ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-filter_complex", `[1:a]atrim=0:${s},asetpts=PTS-STARTPTS[a]`];
  }
  return ["-stream_loop", "-1", "-i", music,
    "-filter_complex",
    `[1:a]atrim=0:${s},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1,afade=t=out:st=${Number((s - 2).toFixed(3))}:d=2,loudnorm=I=-14:TP=-1.5:LRA=11[a]`];
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --dir scripts lib/render-plan`
Expected: PASS, 8 tests. If "has arrived at the focus" disagrees on `top`, recompute from `framing` (cy 500 at scale 2 → top = (500 − 270) × 2 = 460) before touching the code.

- [ ] **Step 5: Add sharp and ignore `video/`**

```bash
pnpm add -D -w sharp@0.35.4
printf '\n# ── walkthrough takes and renders (large, local) ─────────\nvideo/\n' >> .gitignore
pnpm install --frozen-lockfile
```

Expected: the last command prints `Done` with no `ERR_PNPM_OUTDATED_LOCKFILE`.

- [ ] **Step 6: Create `scripts/render-walkthrough.ts`**

```ts
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
```

- [ ] **Step 7: Run all scripts tests and the suite**

Run: `pnpm test`
Expected: every package green, and `--dir scripts` now reports demo-wallet, timeline, camera, take, walkthrough, overlay and render-plan.

- [ ] **Step 8: Verify the lockfile on a clean checkout** (see memory `clean-checkout-via-git-archive`)

Commit first (Step 9), then `git archive` the branch into the scratchpad, copy the two pinned submodules, and run `pnpm install --frozen-lockfile && pnpm test` there. Expected: install `Done`, tests green (two `public-assets` tests skip without `.git`).

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/render-plan.ts scripts/lib/render-plan.test.ts scripts/render-walkthrough.ts package.json pnpm-lock.yaml .gitignore
git commit -m "feat(scripts): render a take into the walkthrough video

The render follows the output clock at 30 fps, so a zoom over a still
page is as smooth as one over a moving page. sharp crops the 4K frame
to the camera and scales it to 1080p; captions go on after the crop, so
they never zoom. Music loops to length, fades, and is levelled to -14
LUFS; without it the track is silent, so every upload has one shape.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Record the walkthrough, rehearsed on testnet

**Files:**
- Create: `scripts/lib/take-recorder.ts`, `scripts/record-walkthrough.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `class TakeRecorder` with `constructor(page: Page, events: TakeEvents)`, `focus(target: Locator | Locator[], label: string, zoom?: number): Promise<void>`, `wide(): void`, `caption(key: CaptionKey): void`, `waiting<T>(work: Promise<T>): Promise<T>`, `click(target: Locator, opts?: { double?: boolean }): Promise<void>`, `placePointer(): Promise<void>`; `renderOverlays(browser: Browser, base: string, take: TakeEvents, dir: string): Promise<void>`.

- [ ] **Step 1: Create `scripts/lib/take-recorder.ts`**

```ts
/**
 * The Playwright side of a take: it logs what the camera should look at and
 * what the captions say, moves the pointer before each real click, and at the
 * end renders the captions and title card in the site's own fonts.
 */
import type { Browser, Locator, Page } from "playwright";
import { join } from "node:path";
import type { Rect } from "./camera.js";
import { centre, captionHtml, OVERLAY_CSS, titleHtml } from "./overlay.js";
import { unionRect, visibleRect, type TakeEvents } from "./take.js";
import { CAPTIONS, type CaptionKey } from "./walkthrough.js";

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;

export class TakeRecorder {
  private pointer = { x: -100, y: -100 };
  constructor(private page: Page, readonly events: TakeEvents) {}

  /** Waits for smooth scrolling to stop, so the box logged is the box shown. */
  private async settle() {
    let last = await this.page.evaluate(() => window.scrollY);
    for (let i = 0; i < 20; i++) {
      await pause(100);
      const y = await this.page.evaluate(() => window.scrollY);
      if (y === last) return;
      last = y;
    }
  }

  async focus(target: Locator | Locator[], label: string, zoom?: number) {
    await this.settle();
    const view = { width: this.events.view.width, height: this.events.view.height };
    const boxes: Rect[] = [];
    for (const t of Array.isArray(target) ? target : [target]) {
      boxes.push(visibleRect(await t.first().boundingBox(), view, label));
    }
    this.events.focuses.push({ at: now(), rect: unionRect(boxes), zoom, label });
  }

  wide() {
    this.events.focuses.push({ at: now(), rect: null, label: "wide" });
  }

  caption(key: CaptionKey) {
    const [step, text] = CAPTIONS[key];
    this.events.captions.push({ at: now(), step, text });
  }

  async waiting<T>(work: Promise<T>): Promise<T> {
    const from = now();
    try { return await work; } finally { this.events.waits.push({ from, to: now() }); }
  }

  /** After a navigation the pointer is new; put it back where it was. */
  async placePointer() {
    await this.page.evaluate(([x, y]) => (window as unknown as { __pointerPlace(a: number, b: number): void }).__pointerPlace(x!, y!),
      [this.pointer.x, this.pointer.y]);
  }

  async click(target: Locator, opts: { double?: boolean } = {}) {
    const el = target.first();
    await el.scrollIntoViewIfNeeded();
    await this.settle();
    const box = await el.boundingBox();
    if (!box) throw new Error("cannot click an element with no box");
    const { x, y } = centre(box);
    await this.page.evaluate(([a, b]) => (window as unknown as { __pointerTo(a: number, b: number): void }).__pointerTo(a!, b!), [x, y]);
    this.pointer = { x, y };
    await pause(650);
    await this.page.evaluate(([a, b]) => (window as unknown as { __pointerRipple(a: number, b: number): void }).__pointerRipple(a!, b!), [x, y]);
    if (opts.double) await el.dblclick(); else await el.click();
  }
}

/** Captions and the title card, rendered from a page of the running app so
 *  they use its fonts and tokens. Written into the take and named in it. */
export async function renderOverlays(browser: Browser, base: string, take: TakeEvents, dir: string) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: "light" });
  await context.addCookies([{ name: "theme", value: "light", domain: new URL(base).hostname, path: "/" }]);
  const page = await context.newPage();
  await page.goto(`${base}/?n=${take.network}`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((css) => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    const stage = document.createElement("div");
    stage.id = "vid-stage";
    document.body.append(stage);
  }, OVERLAY_CSS);
  const stage = page.locator("#vid-stage");

  for (const [n, c] of take.captions.entries()) {
    await stage.evaluate((el, html) => { el.className = ""; el.innerHTML = html; }, captionHtml(c.step, c.text));
    await page.evaluate(() => document.fonts.ready);
    c.image = `cap-${String(n).padStart(2, "0")}.png`;
    await page.locator(".vid-cap").screenshot({ path: join(dir, c.image) });
  }
  await stage.evaluate((el, html) => { el.className = "is-title"; el.innerHTML = html; }, titleHtml(take.network, take.date));
  await page.evaluate(() => document.fonts.ready);
  take.title = "title.png";
  await page.screenshot({ path: join(dir, take.title) });
  await context.close();
}
```

- [ ] **Step 2: Create `scripts/record-walkthrough.ts`**

```ts
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
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { erc20Abi, type Address, type Hex } from "viem";
import { tokensForChain } from "@ledgerline/core";
import { demoWallet, defaultRpc, WALLET_ANNOUNCE, type DemoNetwork } from "./lib/demo-wallet.js";
import { startCapture } from "./lib/screencast.js";
import { POINTER_SETUP } from "./lib/overlay.js";
import { assertTake, type TakeEvents } from "./lib/take.js";
import { pause, renderOverlays, TakeRecorder } from "./lib/take-recorder.js";
import { assertChain, nextRunName, shortfalls, walkthroughCsv } from "./lib/walkthrough.js";

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
const read = (token: Address) => wallet.client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet.account.address] });
const short = shortfalls({ USDC: await read(T.USDC as Address), EURC: await read(T.EURC as Address), cirBTC: await read(T.cirBTC as Address) });
if (short.length) { console.error(`Not enough in ${wallet.account.address}:\n  ${short.join("\n  ")}`); process.exit(1); }

const date = new Date().toISOString().slice(0, 10);
mkdirSync("video/takes", { recursive: true });
const runName = nextRunName(date, readdirSync("video/takes"));
const dir = join("video/takes", runName);
mkdirSync(join(dir, "frames"), { recursive: true });
console.log(`${runName}: pays 0.02 USDC, 0.01 EURC and 0.0000001 cirBTC on Arc ${network} to ${recipient}, plus the fee.`);

const events: TakeEvents = {
  version: 1, network, runName, date, view: { width: 1920, height: 1080, scale: SCALE },
  begin: 0, end: 0, frames: [], waits: [], focuses: [], captions: [],
};

const browser = await chromium.launch();
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

// ── 1 · Home ──────────────────────────────────────────────────────────────
rec.caption("home");
await pause(800);
await rec.focus(page.getByRole("heading", { level: 1 }), "the headline", 1.6);
await pause(2600);
rec.caption("tokens");
await rec.focus(page.locator(".pays-in"), "the token strip", 1.8);
await pause(2600);
rec.wide();
await pause(900);
await rec.click(page.getByRole("link", { name: "Create a payout run" }));

// ── 2 · Upload ────────────────────────────────────────────────────────────
await page.waitForURL(/\/new/);
await rec.placePointer();
rec.caption("upload");
const runField = page.getByRole("textbox", { name: "Run name" });
await runField.waitFor();
await rec.click(runField);
await runField.fill("");
await runField.pressSequentially(runName, { delay: 30 });
await rec.focus(page.getByText("Drop a CSV, or click to choose one"), "the drop zone", 1.5);
await pause(1200);
await page.locator("input[type=file]").first().setInputFiles({
  name: "payouts.csv", mimeType: "text/csv", buffer: Buffer.from(walkthroughCsv(recipient)),
});

// ── 3 · Review: fix the token ─────────────────────────────────────────────
rec.caption("review");
const card = page.locator(".fix-card").filter({ hasText: "USD" }).first();
await card.waitFor();
rec.wide();
await pause(1500);
await rec.focus(card, "the token problem");
await pause(2200);
await rec.click(card.getByRole("button", { name: "USDC", exact: true }));
rec.caption("fixed");
await pause(600);
await rec.focus(page.getByRole("row").filter({ hasText: "INV-V-002" }), "the fixed line", 1.6);
await pause(2200);

// ── 4 · Fund: connect, see EURC short, the Safe block, trim the line ─────
rec.wide();
await rec.click(page.getByRole("button", { name: "Connect a wallet to continue" }));
const demo = page.getByRole("button", { name: /Demo wallet/ });
if (await demo.isVisible({ timeout: 1500 }).catch(() => false)) await rec.click(demo);
rec.caption("funding");
const funding = page.locator("section.funding");
await rec.waiting(funding.getByText("short by").first().waitFor({ timeout: 30_000 }));
await funding.scrollIntoViewIfNeeded();
await rec.focus(funding.locator("li.funding-short").first(), "the short token", 1.6);
await pause(2400);
rec.caption("safe");
await rec.focus(page.locator(".treasury-topup"), "the Safe treasury block", 1.5);
await pause(3200);
rec.caption("trim");
const eurRow = page.getByRole("row").filter({ hasText: "INV-V-003" });
await rec.click(eurRow.getByRole("gridcell").nth(3), { double: true });
const editor = page.getByRole("textbox", { name: /^Line \d+, amount$/i });
await editor.fill("0.01");
await editor.press("Enter");
await pause(500);
await rec.focus(eurRow, "the trimmed line", 1.6);
await pause(1600);
const checkBtn = page.getByRole("button", { name: "Check it against the chain" });
await rec.waiting(checkBtn.waitFor({ timeout: 30_000 }));
await rec.focus(funding, "every token covered", 1.4);
await pause(2000);

// ── 5 · Check ─────────────────────────────────────────────────────────────
rec.wide();
await rec.click(checkBtn);
rec.caption("check");
const signCheck = page.getByRole("button", { name: "Sign and check the run" });
await signCheck.waitFor();
await pause(900);
await rec.click(signCheck);
const toSend = page.getByRole("button", { name: "Sign and send the payment" });
await rec.waiting(toSend.waitFor({ timeout: 60_000 }));
const verdict = page.getByRole("heading", { name: "Every payment would go through" });
await verdict.scrollIntoViewIfNeeded();
await rec.focus(verdict, "the check's verdict", 1.6);
await pause(2600);

// ── 6 · Pay ───────────────────────────────────────────────────────────────
rec.wide();
await rec.click(toSend);
rec.caption("pay");
const pay = page.getByRole("button", { name: /^Sign and pay 4 invoices$/ });
await pay.waitFor();
await pause(1000);
await rec.click(pay);
const paid = page.getByRole("heading", { name: "Paid, with a receipt" });
await rec.waiting(paid.waitFor({ timeout: 180_000 }));
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
rec.caption("paid");
await rec.focus(paid, "the result", 1.6);
await pause(2400);
const [download] = await Promise.all([
  page.waitForEvent("download"),
  rec.click(page.getByRole("button", { name: "Download the run file" })),
]);
const runFile = join(dir, "run-file.json");
await download.saveAs(runFile);
const copy = page.getByRole("button", { name: "Copy link" }).first();
await rec.focus(copy, "the receipt links", 1.5);
await pause(1500);
await rec.click(copy);
await pause(700);
const receiptUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
if (!receiptUrl.pathname.startsWith("/r/0x")) throw new Error(`unexpected receipt link: ${receiptUrl}`);
events.txHash = wallet.sent.at(-1);
const runHref = await page.getByRole("link", { name: "Open this run" }).getAttribute("href");

// ── 7 · The recipient's receipt ───────────────────────────────────────────
rec.wide();
await page.goto(`${BASE}${receiptUrl.pathname}${receiptUrl.search}`);
await rec.placePointer();
rec.caption("receipt");
await rec.waiting(page.getByText("Verified", { exact: true }).first().waitFor({ timeout: 60_000 }));
await pause(900);
await rec.focus(page.getByText("Verified", { exact: true }).first(), "the verdict", 1.8);
await pause(2000);
rec.caption("checks");
const rungs = page.locator("ol.ladder li.rung");
await rungs.first().scrollIntoViewIfNeeded();
for (let r = 0; r < 6; r++) {
  await rec.focus(rungs.nth(r), `check ${r + 1}`, 2);
  await pause(1300);
}

// ── 8 · Reconcile ─────────────────────────────────────────────────────────
rec.wide();
await page.goto(`${BASE}${runHref}`);
await rec.placePointer();
rec.caption("run");
await rec.waiting(page.getByText("Reading without the run file").waitFor({ timeout: 60_000 }));
await pause(1000);
await page.locator('input[type=file][accept=".json"]').setInputFiles(runFile);
const matches = page.getByText("This run file matches the recorded list");
await rec.waiting(matches.waitFor({ timeout: 60_000 }));
await rec.focus(matches, "the file check", 1.6);
await pause(2600);
rec.caption("matched");
await rec.focus(page.locator(".ant-table").first(), "the matched table", 1.3);
await pause(2800);
await rec.focus(page.getByText("Complete", { exact: true }).first(), "completeness", 1.8);
await pause(1800);

// ── 9 · Dashboard ─────────────────────────────────────────────────────────
rec.wide();
await page.goto(`${BASE}/dashboard${n}`);
await rec.placePointer();
rec.caption("dashboard");
await rec.waiting(page.getByText("Needs you").first().waitFor({ timeout: 30_000 }));
await pause(1500);
await rec.focus(page.getByText("Needs you").first().locator("xpath=ancestor::*[contains(@class,'tape')][1]"), "Needs you", 1.5);
await pause(2400);
await rec.focus([page.locator(".wallet-head"), page.locator(".stat-tile").filter({ hasText: /USDC|EURC|cirBTC/ })], "the wallet's tokens", 1.4);
await pause(3000);
rec.wide();
await pause(1500);

await capture.stop();
events.end = Date.now() / 1000;
events.frames = capture.frames.filter((f) => f.at >= events.begin - 0.05).map((f) => ({ file: join("frames", f.file.split("/").pop()!), at: f.at }));
await renderOverlays(browser, BASE, events, dir);
await browser.close();

writeFileSync(join(dir, "events.json"), JSON.stringify(assertTake(events), null, 2));
const seconds = events.end - events.begin;
console.log(`${dir}: ${events.frames.length} frames over ${seconds.toFixed(1)} s (${(events.frames.length / seconds).toFixed(1)} fps), tx ${events.txHash}`);
if (errors.length) console.warn(`page errors:\n  ${errors.join("\n  ")}`);
const receipt = await wallet.client.getTransactionReceipt({ hash: events.txHash as Hex });
console.log(`block ${receipt.blockNumber} status ${receipt.status}`);
if (receipt.status !== "success") process.exit(1);
```

- [ ] **Step 3: Rehearse on testnet**

```bash
pnpm build
(cd frontend && pnpm exec next start -p 3100) &
pnpm exec tsx scripts/record-walkthrough.ts --network testnet
```

Expected: `video/takes/video-<today>-t1: … frames over … s (… fps), tx 0x…` and `status success`. If a selector times out, open the scene's page by hand in Playwright MCP against the same server, read the real accessible name, fix the locator in the script, and rerun (each rerun is a new testnet take with the next run name). If the printed fps is under 8, rerun with `--scale 1.5`.

- [ ] **Step 4: Render the rehearsal and look at it**

```bash
pnpm exec tsx scripts/render-walkthrough.ts video/takes/video-<today>-t<n>
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate -show_entries format=duration -of compact video/ledgerline-walkthrough.mp4
```

Expected ffprobe: `h264`, `1920`, `1080`, `30/1`; `aac`; duration between 130 and 160. Read `video/ledgerline-walkthrough-sheet.jpg` with the Read tool: every tile shows the element its focus names, text sharp, caption readable and unclipped, the title card says "Recorded on Arc testnet". Watch the mp4 once end to end for jumps. Adjust `pause` lengths or zoom levels in the script and re-render (no new take needed for zoom; a new take for timing).

- [ ] **Step 5: Run the suite and commit**

Run: `pnpm test` — expected green.

```bash
git add scripts/lib/take-recorder.ts scripts/record-walkthrough.ts
git commit -m "feat(scripts): record the walkthrough, one real run from a flawed CSV to the dashboard

Rehearsed on Arc testnet: <n> frames at <fps> fps over <s> s, tx <hash>,
rendered to 1920x1080 at 30 fps, <duration> s.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Fill the figures from Steps 3–4.)

---

### Task 9: The mainnet take

**Stop before Step 1 and ask the maintainer**: confirm the mainnet take now, and ask for the music file's path (or none).

**Files:**
- Create: `docs/notes/2026-09-29-walkthrough-video.md` (use the take's actual date in the file name)

- [ ] **Step 1: Record on mainnet**

```bash
pnpm exec tsx scripts/record-walkthrough.ts --network mainnet --confirm-mainnet
```

Expected: the spend line, then `status success`. If it exits on `Not enough in …`, stop and report the shortfall; do not top up.

- [ ] **Step 2: Check the transaction on chain**

```bash
cast receipt --rpc-url https://rpc.mainnet.arc.io <tx> --json | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["status"], r["from"], r["to"], len(r["logs"]), int(r["gasUsed"],16))'
```

Expected: status `0x1`, `from` = `0x595558b91dfaa97840f2f00bf6728a74b8e6de17`, `to` = `0x522faf9a91c41c443c66765030741e4ace147d0` (Multicall3From). Then read every non-system `Transfer` log's `from` (topic 1) and confirm it is the payer.

- [ ] **Step 3: Render with the music**

```bash
pnpm exec tsx scripts/render-walkthrough.ts video/takes/<mainnet run name> --music <file>
```

Then the same `ffprobe` and contact-sheet check as Task 8 Step 4; the title card must read "Recorded on Arc mainnet". Measure loudness: `ffmpeg -i video/ledgerline-walkthrough.mp4 -af ebur128 -f null - 2>&1 | grep "I:" | tail -1` — expected about −14 LUFS.

- [ ] **Step 4: Write the note** — `docs/notes/<date>-walkthrough-video.md`, in the shape of `docs/notes/2026-09-28-demo-video.md`: the take's run name, transaction, block, gas, `maxFeePerGas`, what was paid to whom, frames and fps, the output's duration and loudness, each tagged `[measured]`; the wallet's balances after the take; what the video does not show (a real wallet's prompts, like the home demo).

- [ ] **Step 5: Commit**

```bash
git add docs/notes/<date>-walkthrough-video.md
git commit -m "docs(notes): the walkthrough video's mainnet take, measured

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand over** — tell the maintainer where the mp4 and the sheet are, the duration, and that uploading to YouTube and the BUIDL page is theirs.
