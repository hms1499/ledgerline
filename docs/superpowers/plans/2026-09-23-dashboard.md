# Redesign Part 2 — `/dashboard` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/dashboard` placeholder with the payer's overview: per-token totals and the five most recent runs, every figure re-read from the chain by txHash on each visit.

**Architecture:** Two pure functions in core (`summarizeRun`, `totalsByToken`) turn one receipt's logs into per-token paid amounts, built on the existing `joinPayments`. A web module (`readRuns`) fetches each recorded run's receipt with bounded concurrency and a timeout, and a pure view module turns the results into copy. `Dashboard.tsx` only composes these; it decides nothing itself.

**Tech Stack:** TypeScript, viem, vitest 2, Next.js 16 App Router, antd 6, the part-1 grid (`Grid`, `Col`) and wallet provider (`useWallet`).

**Spec:** `docs/superpowers/specs/2026-09-23-dashboard-design.md`

## Global Constraints

- Chain reads by **known txHash only**. No `eth_getLogs`, no history search (spec §2, `CLAUDE.md`).
- Totals come from **emitted `Transfer` values** joined to memos (`joinPayments`), never from requested amounts. The system emitter `0xffff…fFfE` is ignored (it already is, in `decodeTransferLogs`).
- **One figure per token.** No fiat and no grand total.
- All amounts are `bigint`. Formatting uses `formatAmount(value, decimals)` from `apps/web/lib/chain.ts`. `decimals` and `symbol` are always read from the chain.
- **A partial total is never shown as complete.** Figures render only when every read has settled.
- Tiles for every token in `tokensForChain(net.chain.id)`, in the order USDC, EURC, cirBTC; zero shows `0`.
- Concurrency **4**, timeout **10 000 ms** per receipt read.
- Recent runs table shows **5** rows; "All runs →" goes to `/runs`. Every in-app link keeps `?n=` via `withNet` from `lib/nav.ts`.
- User-visible copy passes `apps/web/test/plain-language.test.ts`. In particular, no "manifest", "anchor", "salt", "Merkle", "preflight", "commit", "root" or "run label".
- Web tests import `@ledgerline/core` from its build: after changing core, run `pnpm --filter @ledgerline/core build` before `apps/web` tests.
- Commit after every task in the repo's `type(scope): sentence` style, with two `-m` flags: the subject, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **A read for one wallet finishes after the payer switched account or network.** Expected: its result is discarded and never shown under the new wallet. Pinned in Task 5 (the effect's cancelled flag), checked in Task 6.
2. **The same txHash appears twice in history, or with different case.** Expected: counted once. `history.ts` already dedupes case-insensitively on record. `readRuns` dedupes again before reading (Task 3 test).
3. **A run paid by a different address than the connected wallet** (a history entry from another account on a shared browser). Expected: contributes nothing to this wallet's totals. Pinned in Task 1 (`summarizeRun` ignores other payers).
4. **Every read fails** (RPC down). Expected: the tiles show "—", not `0`, and a warning offers Retry. Pinned in Task 4 (`coverageView` for all-missing), checked in Task 6.
5. **A token whose metadata cannot be read.** Expected: the raw integer and a short address, never a guessed decimal. Pinned in Task 4 (`amountText` fallback).

---

## File Structure

```
packages/core/
  src/summary.ts                 CREATE  summarizeRun, totalsByToken
  src/index.ts                   MODIFY  export * from "./summary.js"
  test/summary.test.ts           CREATE
  test/fixtures/testnet-usdc-eurc.json  CREATE (captured, Task 1)
scripts/
  capture-receipt.ts             CREATE  receipt logs → fixture JSON
apps/web/
  lib/token-meta.ts              CREATE  readTokenMeta (moved from CreateRun)
  lib/run-reads.ts               CREATE  readRuns, describeCoverage, RunRead
  lib/dashboard-view.ts          CREATE  coverageView, RUN_STATUS, amountText, paidLine
  app/(app)/new/CreateRun.tsx    MODIFY  import readTokenMeta from lib
  app/(app)/new/StepUpload.tsx   MODIFY  import readTokenMeta from lib
  app/(app)/dashboard/page.tsx   MODIFY  render <Dashboard />
  app/(app)/dashboard/Dashboard.tsx CREATE
  app/globals.css                MODIFY  stat tile rules
  test/run-reads.test.ts         CREATE
  test/dashboard-view.test.ts    CREATE
  test/plain-language.test.ts    MODIFY  cover dashboard copy
docs/superpowers/specs/2026-09-23-dashboard-design.md  MODIFY (Task 1: four spec corrections, see Task 1 Step 0)
```

---

### Task 1: Per-run and per-token totals in core, pinned on real receipts

**Files:**
- Create: `scripts/capture-receipt.ts`, `packages/core/src/summary.ts`, `packages/core/test/summary.test.ts`, `packages/core/test/fixtures/testnet-usdc-eurc.json`
- Modify: `packages/core/src/index.ts`, `docs/superpowers/specs/2026-09-23-dashboard-design.md`

**Interfaces:**
- Consumes: `joinPayments(logs: RawLog[]): { payments: PaymentRecord[]; unlinkedMemoIds: Hex[] }` from `packages/core/src/join.ts`; `PaymentRecord { payer; token; value: bigint; identityBroken: boolean; … }`; `RawLog`, `Address` from `types.ts`.
- Produces:
  - `interface TokenPaid { value: bigint; payments: number }`
  - `interface RunSummary { paid: Map<Address, TokenPaid>; payments: number; identityBroken: number }` (keys checksummed)
  - `summarizeRun(logs: RawLog[], payer: Address): RunSummary`
  - `interface TokenTotal { token: Address; value: bigint; payments: number; runs: number }`
  - `totalsByToken(summaries: RunSummary[], tokens: Address[]): TokenTotal[]`

- [ ] **Step 0: Correct the spec where measurement disagreed with it**

Make four edits in `docs/superpowers/specs/2026-09-23-dashboard-design.md`:

1. §4.1: replace the `RunSummary` block's `paid` line and add `TokenPaid`. The tiles need a payment count *per token*, and a single `payments` number cannot give that:

```ts
export interface TokenPaid { value: bigint; payments: number }

export interface RunSummary {
  /** Per token (checksummed): emitted value and count, clean payments from `payer` only. */
  paid: Map<Address, TokenPaid>;
  payments: number;                    // clean payments counted, all tokens
  /** Payments whose memo sender ≠ transfer.from. Counted here, never summed. */
  identityBroken: number;
}
```

2. §4.2: replace the paragraph starting "Totals sum the `summary` of `read` **and** `attention` runs" with:

```markdown
- Totals sum the `summary` of `read` **and** `attention` runs. An attention
  run's clean payments still count; only its broken ones are left out.
- **Covered** runs are `read`, `attention` and `reverted`. A reverted run
  moved no money, so its zero is exact, not a gap. **Missing** runs are
  `not_found` and `unreadable`. They lower the coverage count.
```

3. §3.3: in the "Some not read" bullet, replace "It carries a **Retry** button that re-reads every run not in a `read` or `attention` state, in one action." with "It carries a **Retry** button that reads every recorded run again, in one action. Receipts do not change once final, so re-reading the ones already read costs a few calls and saves merging two result sets."

4. §6.1: replace the sentence about `scripts/capture-fixture.ts` gaining an RPC argument with: "It is captured with a new `scripts/capture-receipt.ts`, which reads one receipt's logs from a given RPC. `capture-fixture.ts` builds a synthetic trace and is left as it is."

- [ ] **Step 1: Write the capture script**

```ts
// scripts/capture-receipt.ts
// Usage: npx tsx scripts/capture-receipt.ts <rpc> <txHash> <out.json> "<description>"
import { writeFileSync } from "node:fs";

const [rpc, txHash, out, description] = process.argv.slice(2);
if (!rpc || !txHash || !out || !description) {
  throw new Error('usage: capture-receipt.ts <rpc> <txHash> <out.json> "<description>"');
}

const res = await fetch(rpc, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
});
const body = await res.json();
if (body.error) throw new Error(`receipt failed: ${JSON.stringify(body.error)}`);
if (!body.result) throw new Error(`no receipt for ${txHash}`);
if (body.result.status !== "0x1") throw new Error(`${txHash} did not succeed`);

// RawLog shape: logIndex as a number, exactly what the web maps a viem receipt to.
const logs = body.result.logs.map((l: { address: string; topics: string[]; data: string; logIndex: string }) => ({
  address: l.address, topics: l.topics, data: l.data, logIndex: Number.parseInt(l.logIndex, 16),
}));

writeFileSync(out, JSON.stringify({ description, txHash, from: body.result.from, logs }, null, 2) + "\n");
console.log(`captured ${logs.length} logs from ${txHash}`);
```

- [ ] **Step 2: Capture the testnet USDC + EURC run**

Run from the repo root:

```bash
npx tsx scripts/capture-receipt.ts https://rpc.testnet.arc.io \
  0x0914b2ee684e1b84dd1227a21899335098cb9ecdcd7dee7366f1e9b159a13de0 \
  packages/core/test/fixtures/testnet-usdc-eurc.json \
  "0.1 USDC + 0.1 EURC in one run, Arc testnet: USDC emits a second Transfer from the system emitter, EURC does not"
```

Expected: `captured 8 logs from 0x0914…`. The file's `from` is `0x595558b91dfaa97840f2f00bf6728a74b8e6de17`. Its logs include one Transfer from `0xffff…fffe`, one from `0x3600…0000` (USDC) and one from `0x89b5…d72a` (EURC testnet).

- [ ] **Step 3: Write the failing tests**

```ts
// packages/core/test/summary.test.ts
import { describe, it, expect } from "vitest";
import { summarizeRun, totalsByToken, type RunSummary } from "../src/summary.js";
import type { Address, RawLog } from "../src/types.js";
import mainnet from "./fixtures/mainnet-2pay.json" with { type: "json" };
import testnet from "./fixtures/testnet-usdc-eurc.json" with { type: "json" };

const USDC = "0x3600000000000000000000000000000000000000" as Address;
const EURC_T = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address;
const CIRBTC_T = "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF" as Address;
const MAINNET_PAYER = "0x1111111111111111111111111111111111111111" as Address;
const TESTNET_PAYER = testnet.from as Address;

const mainnetLogs = mainnet.logs as unknown as RawLog[];
const testnetLogs = testnet.logs as unknown as RawLog[];

describe("summarizeRun — what one run paid, from its own logs", () => {
  it("counts USDC once despite the system emitter's second Transfer", () => {
    const s = summarizeRun(mainnetLogs, MAINNET_PAYER);
    expect(s.paid.get(USDC)).toEqual({ value: 3_500_000n, payments: 2 });
    expect(s.payments).toBe(2);
    expect(s.identityBroken).toBe(0);
  });

  it("in one transaction, neither doubles USDC nor halves EURC", () => {
    const s = summarizeRun(testnetLogs, TESTNET_PAYER);
    expect(s.paid.get(USDC)).toEqual({ value: 100_000n, payments: 1 });
    expect(s.paid.get(EURC_T)).toEqual({ value: 100_000n, payments: 1 });
    expect(s.payments).toBe(2);
  });

  it("matches the payer whatever its case", () => {
    const s = summarizeRun(testnetLogs, TESTNET_PAYER.toUpperCase().replace("0X", "0x") as Address);
    expect(s.payments).toBe(2);
  });

  it("ignores a run paid by someone else", () => {
    const s = summarizeRun(mainnetLogs, "0x2222222222222222222222222222222222222222");
    expect(s.paid.size).toBe(0);
    expect(s.payments).toBe(0);
  });

  it("returns nothing for logs without payments", () => {
    const s = summarizeRun([], MAINNET_PAYER);
    expect(s).toEqual({ paid: new Map(), payments: 0, identityBroken: 0 });
  });
});

describe("totalsByToken — the tiles", () => {
  const run = (entries: [Address, bigint, number][], broken = 0): RunSummary => ({
    paid: new Map(entries.map(([t, value, payments]) => [t, { value, payments }])),
    payments: entries.reduce((n, [, , p]) => n + p, 0),
    identityBroken: broken,
  });

  it("lists every token in the order given, zero when never paid", () => {
    const totals = totalsByToken([run([[USDC, 5n, 1]])], [USDC, EURC_T, CIRBTC_T]);
    expect(totals.map((t) => t.token)).toEqual([USDC, EURC_T, CIRBTC_T]);
    expect(totals[1]).toEqual({ token: EURC_T, value: 0n, payments: 0, runs: 0 });
    expect(totals[2]).toEqual({ token: CIRBTC_T, value: 0n, payments: 0, runs: 0 });
  });

  it("sums values and payments, and counts a run once per token it paid", () => {
    const totals = totalsByToken(
      [run([[USDC, 5n, 2], [EURC_T, 7n, 1]]), run([[USDC, 1n, 1]]), run([])],
      [USDC, EURC_T],
    );
    expect(totals[0]).toEqual({ token: USDC, value: 6n, payments: 3, runs: 2 });
    expect(totals[1]).toEqual({ token: EURC_T, value: 7n, payments: 1, runs: 1 });
  });

  it("matches tokens given in any case", () => {
    const totals = totalsByToken([run([[EURC_T, 7n, 1]])], [EURC_T.toLowerCase() as Address]);
    expect(totals[0]!.value).toBe(7n);
    expect(totals[0]!.token).toBe(EURC_T);
  });

  it("totals a real mainnet run", () => {
    const [usdc] = totalsByToken([summarizeRun(mainnetLogs, MAINNET_PAYER)], [USDC]);
    expect(usdc).toEqual({ token: USDC, value: 3_500_000n, payments: 2, runs: 1 });
  });
});
```

- [ ] **Step 4: Run them to watch them fail**

Run: `cd packages/core && npx vitest run test/summary.test.ts`
Expected: FAIL. `Cannot find module '../src/summary.js'` (or failed to load).

- [ ] **Step 5: Implement**

```ts
// packages/core/src/summary.ts
import { getAddress } from "viem";
import { joinPayments } from "./join.js";
import type { Address, RawLog } from "./types.js";

export interface TokenPaid { value: bigint; payments: number }

export interface RunSummary {
  /** Per token (checksummed): emitted value and count, clean payments from `payer` only. */
  paid: Map<Address, TokenPaid>;
  /** Clean payments counted, all tokens. */
  payments: number;
  /** Payments whose memo sender ≠ transfer.from. Counted here, never summed. */
  identityBroken: number;
}

/**
 * Pure. What one run paid, read from its own logs — the emitted Transfer
 * values joined to their memos, never the amounts that were asked for
 * (invariant 5). The system emitter's duplicate USDC Transfer never reaches
 * here: decodeTransferLogs drops it.
 *
 * A payment with a broken identity is counted but not summed: a total that
 * included it would state as paid something the chain says is inconsistent.
 */
export function summarizeRun(logs: RawLog[], payer: Address): RunSummary {
  const who = payer.toLowerCase();
  const paid = new Map<Address, TokenPaid>();
  let payments = 0;
  let identityBroken = 0;

  for (const p of joinPayments(logs).payments) {
    if (p.payer.toLowerCase() !== who) continue;
    if (p.identityBroken) { identityBroken++; continue; }
    const token = getAddress(p.token);
    const prev = paid.get(token) ?? { value: 0n, payments: 0 };
    paid.set(token, { value: prev.value + p.value, payments: prev.payments + 1 });
    payments++;
  }
  return { paid, payments, identityBroken };
}

export interface TokenTotal { token: Address; value: bigint; payments: number; runs: number }

/** Every token in `tokens` appears, in that order, zero when never paid.
 *  Tokens are never pooled: there is no total across them. */
export function totalsByToken(summaries: RunSummary[], tokens: Address[]): TokenTotal[] {
  return tokens.map((t) => {
    const token = getAddress(t);
    let value = 0n;
    let payments = 0;
    let runs = 0;
    for (const s of summaries) {
      const got = s.paid.get(token);
      if (!got) continue;
      value += got.value;
      payments += got.payments;
      runs++;
    }
    return { token, value, payments, runs };
  });
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./summary.js";
```

- [ ] **Step 6: Run the tests to watch them pass**

Run: `cd packages/core && npx vitest run test/summary.test.ts`
Expected: PASS (9 tests).

If the testnet assertions fail on value, read the fixture's two token Transfer `data` fields. Do not change the expected numbers to match: 0.1 of a 6-decimal token is `100000`. A different value means the fixture or the join is wrong, and that is a finding to debug.

- [ ] **Step 7: Full core suite and typecheck**

Run: `cd packages/core && npx vitest run && npx tsc --noEmit && pnpm build`
Expected: every core test passes; no type errors; the build succeeds (the web app imports the build).

- [ ] **Step 8: Commit**

```bash
git add scripts/capture-receipt.ts packages/core/src/summary.ts packages/core/src/index.ts \
  packages/core/test/summary.test.ts packages/core/test/fixtures/testnet-usdc-eurc.json \
  docs/superpowers/specs/2026-09-23-dashboard-design.md
git commit -m "feat(core): what a run paid per token, from its own logs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: One reader of token metadata

**Files:**
- Create: `apps/web/lib/token-meta.ts`
- Modify: `apps/web/app/(app)/new/CreateRun.tsx` (remove `erc20Abi` and `readTokenMeta`, lines ~27–52), `apps/web/app/(app)/new/StepUpload.tsx:8`

**Interfaces:**
- Produces: `readTokenMeta(rpc: string, chain: Chain, chainId: number): Promise<{ decimals: Record<string, number>; symbols: Record<string, string> }>`. Keys are lower-case token addresses, exactly as today.

This is a move with no behaviour change. The existing tests are the guard: there is no new test, because the function's only logic is two RPC reads.

- [ ] **Step 1: Create the module by moving the code**

Cut `erc20Abi` and `readTokenMeta` (with its doc comment) from `CreateRun.tsx` into:

```ts
// apps/web/lib/token-meta.ts
import { createPublicClient, http, type Address, type Chain } from "viem";
import { tokensForChain } from "@ledgerline/core";

const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/** Read every token's decimals and symbol from the chain. Nothing downstream
 *  may assume 6 or 8 — that assumption is how a payout ends up off by 10^12. */
export async function readTokenMeta(
  rpc: string, chain: Chain, chainId: number,
): Promise<{ decimals: Record<string, number>; symbols: Record<string, string> }> {
  const client = createPublicClient({ chain, transport: http(rpc) });
  const tokens = tokensForChain(chainId);
  const decimals: Record<string, number> = {};
  const symbols: Record<string, string> = {};
  await Promise.all(
    Object.values(tokens).map(async (address) => {
      const [d, s] = await Promise.all([
        client.readContract({ address: address as Address, abi: erc20Abi, functionName: "decimals" }),
        client.readContract({ address: address as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => ""),
      ]);
      decimals[(address as string).toLowerCase()] = Number(d);
      symbols[(address as string).toLowerCase()] = s as string;
    }),
  );
  return { decimals, symbols };
}
```

- [ ] **Step 2: Point the create flow at it**

In `CreateRun.tsx`:
- remove the now-unused `createPublicClient, http, type Address` from the `viem` import (delete the line if nothing else uses it);
- remove `tokensForChain` from the `@ledgerline/core` import if nothing else uses it.

Run `grep -n "createPublicClient\|tokensForChain\|Address" "apps/web/app/(app)/new/CreateRun.tsx"` to confirm what is still used.

In `StepUpload.tsx`, change line 8 to:

```ts
import type { RunDraft } from "./CreateRun";
import { readTokenMeta } from "@/lib/token-meta";
```

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all web tests pass (130).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/token-meta.ts "apps/web/app/(app)/new/CreateRun.tsx" "apps/web/app/(app)/new/StepUpload.tsx"
git commit -m "refactor(web): one reader of token decimals and symbols" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Read every recorded run, bounded and timed

**Files:**
- Create: `apps/web/lib/run-reads.ts`, `apps/web/test/run-reads.test.ts`

**Interfaces:**
- Consumes: `summarizeRun`, `RunSummary`, `RawLog`, `Address`, `Hex` from `@ledgerline/core` (Task 1); `NetworkView` from `lib/chain.ts`; `RunRecord` from `lib/history.ts`.
- Produces:
  - `type RunRead = { txHash: string; state: "read" | "attention"; summary: RunSummary } | { txHash: string; state: "not_found" | "reverted" } | { txHash: string; state: "unreadable"; reason: string }`
  - `interface ReceiptLike { status: "success" | "reverted"; logs: RawLog[] }`
  - `type GetReceipt = (txHash: Hex) => Promise<ReceiptLike | null>` (`null` = not found)
  - `interface ReadOptions { getReceipt?: GetReceipt; concurrency?: number; timeoutMs?: number }`
  - `readRuns(records: Pick<RunRecord, "txHash" | "payer">[], net: NetworkView, opts?: ReadOptions): Promise<RunRead[]>`, one per *distinct* txHash (case-insensitive, first occurrence kept), in input order
  - `interface Coverage { total: number; covered: number; missing: string[]; attention: string[] }`
  - `describeCoverage(reads: RunRead[]): Coverage`
  - `READ_CONCURRENCY = 4`, `READ_TIMEOUT_MS = 10_000`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/run-reads.test.ts
import { describe, it, expect } from "vitest";
import type { RawLog } from "@ledgerline/core";
import { readRuns, readRunsWith, describeCoverage, type GetReceipt, type RunRead } from "@/lib/run-reads";
import { networkFor } from "@/lib/chain";
import mainnet from "../../../packages/core/test/fixtures/mainnet-2pay.json" with { type: "json" };

const net = networkFor("testnet");
const PAYER = "0x1111111111111111111111111111111111111111";
const logs = mainnet.logs as unknown as RawLog[];
const rec = (txHash: string, payer = PAYER) => ({ txHash, payer });
const ok: GetReceipt = async () => ({ status: "success", logs });

describe("readRuns — one state per recorded run", () => {
  it("summarises a successful receipt", async () => {
    const [r] = await readRuns([rec("0xa")], net, { getReceipt: ok });
    expect(r!.state).toBe("read");
    expect(r!.state === "read" && r!.summary.payments).toBe(2);
  });

  it("maps a reverted receipt to reverted, and a missing one to not_found", async () => {
    const getReceipt: GetReceipt = async (h) => (h === "0xr" ? { status: "reverted", logs: [] } : null);
    const reads = await readRuns([rec("0xr"), rec("0xm")], net, { getReceipt });
    expect(reads.map((r) => r.state)).toEqual(["reverted", "not_found"]);
  });

  it("marks a run as needing attention when a payment's identity is broken", async () => {
    // No real receipt has a broken identity, so the summariser is injected.
    const reads = await readRunsWith(
      [rec("0xa")],
      async () => ({ status: "success", logs }),
      () => ({ paid: new Map(), payments: 0, identityBroken: 1 }),
    );
    expect(reads[0]!.state).toBe("attention");
  });

  it("turns a thrown error into unreadable with its message", async () => {
    const getReceipt: GetReceipt = async () => { throw new Error("rpc down"); };
    const [r] = await readRuns([rec("0xa")], net, { getReceipt });
    expect(r).toEqual({ txHash: "0xa", state: "unreadable", reason: "rpc down" });
  });

  it("gives up on a read that outlives the timeout", async () => {
    const getReceipt: GetReceipt = () => new Promise(() => {});
    const [r] = await readRuns([rec("0xa")], net, { getReceipt, timeoutMs: 20 });
    expect(r!.state).toBe("unreadable");
  });

  it("never has more than the allowed number of reads in flight", async () => {
    let live = 0;
    let peak = 0;
    const getReceipt: GetReceipt = async () => {
      live++; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return { status: "success", logs };
    };
    const records = Array.from({ length: 12 }, (_, i) => rec(`0x${i.toString(16)}`));
    const reads = await readRuns(records, net, { getReceipt, concurrency: 4 });
    expect(reads).toHaveLength(12);
    expect(peak).toBe(4);
  });

  it("keeps input order and reads a repeated hash once", async () => {
    const seen: string[] = [];
    const getReceipt: GetReceipt = async (h) => { seen.push(h); return { status: "success", logs }; };
    const reads = await readRuns([rec("0xB"), rec("0xa"), rec("0xb")], net, { getReceipt });
    expect(reads.map((r) => r.txHash)).toEqual(["0xB", "0xa"]);
    expect(seen).toHaveLength(2);
  });
});

describe("describeCoverage — how much of the history the totals stand on", () => {
  const read = (txHash: string): RunRead => ({ txHash, state: "read", summary: { paid: new Map(), payments: 0, identityBroken: 0 } });

  it("all read", () => {
    expect(describeCoverage([read("0x1"), read("0x2")])).toEqual({ total: 2, covered: 2, missing: [], attention: [] });
  });

  it("a reverted run is covered; not found and unreadable are missing", () => {
    const c = describeCoverage([
      read("0x1"), { txHash: "0x2", state: "reverted" },
      { txHash: "0x3", state: "not_found" }, { txHash: "0x4", state: "unreadable", reason: "x" },
    ]);
    expect(c).toEqual({ total: 4, covered: 2, missing: ["0x3", "0x4"], attention: [] });
  });

  it("none readable", () => {
    const c = describeCoverage([{ txHash: "0x1", state: "unreadable", reason: "x" }]);
    expect(c.covered).toBe(0);
    expect(c.missing).toEqual(["0x1"]);
  });

  it("an attention run is covered and listed", () => {
    const c = describeCoverage([{ txHash: "0x1", state: "attention", summary: { paid: new Map(), payments: 0, identityBroken: 1 } }]);
    expect(c).toEqual({ total: 1, covered: 1, missing: [], attention: ["0x1"] });
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd apps/web && npx vitest run test/run-reads.test.ts`
Expected: FAIL. `Cannot find module '@/lib/run-reads'`.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/run-reads.ts
import { createPublicClient, http, TransactionReceiptNotFoundError } from "viem";
import { summarizeRun, type Address, type Hex, type RawLog, type RunSummary } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import type { RunRecord } from "@/lib/history";

export const READ_CONCURRENCY = 4;
export const READ_TIMEOUT_MS = 10_000;

export type RunRead =
  | { txHash: string; state: "read" | "attention"; summary: RunSummary }
  | { txHash: string; state: "not_found" | "reverted" }
  | { txHash: string; state: "unreadable"; reason: string };

export interface ReceiptLike { status: "success" | "reverted"; logs: RawLog[] }
/** null means the node has no such transaction. */
export type GetReceipt = (txHash: Hex) => Promise<ReceiptLike | null>;
export interface ReadOptions { getReceipt?: GetReceipt; concurrency?: number; timeoutMs?: number }

type Summarize = (logs: RawLog[], payer: Address) => RunSummary;
type Rec = Pick<RunRecord, "txHash" | "payer">;

function receiptReader(net: NetworkView): GetReceipt {
  const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
  return async (hash) => {
    try {
      const r = await client.getTransactionReceipt({ hash });
      return {
        status: r.status,
        logs: r.logs.map((l, i) => ({
          address: l.address as Address, topics: l.topics as Hex[], data: l.data as Hex, logIndex: l.logIndex ?? i,
        })),
      };
    } catch (err) {
      if (err instanceof TransactionReceiptNotFoundError) return null;
      throw err;
    }
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`No answer from the network after ${ms / 1000}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Exported for tests: the pool, with the receipt reader and summariser injected. */
export async function readRunsWith(
  records: Rec[], getReceipt: GetReceipt, summarize: Summarize,
  concurrency = READ_CONCURRENCY, timeoutMs = READ_TIMEOUT_MS,
): Promise<RunRead[]> {
  // history.ts dedupes on record, but a read must not trust that.
  const seen = new Set<string>();
  const unique = records.filter((r) => {
    const k = r.txHash.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const out: RunRead[] = new Array(unique.length);
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const i = next++;
      const { txHash, payer } = unique[i]!;
      try {
        const receipt = await withTimeout(getReceipt(txHash as Hex), timeoutMs);
        if (!receipt) out[i] = { txHash, state: "not_found" };
        else if (receipt.status === "reverted") out[i] = { txHash, state: "reverted" };
        else {
          const summary = summarize(receipt.logs, payer as Address);
          out[i] = { txHash, state: summary.identityBroken > 0 ? "attention" : "read", summary };
        }
      } catch (err) {
        out[i] = { txHash, state: "unreadable", reason: err instanceof Error ? err.message : String(err) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out;
}

/** Each run's receipt, fetched by its known hash. Never searches history. */
export function readRuns(records: Rec[], net: NetworkView, opts: ReadOptions = {}): Promise<RunRead[]> {
  return readRunsWith(
    records, opts.getReceipt ?? receiptReader(net), summarizeRun,
    opts.concurrency ?? READ_CONCURRENCY, opts.timeoutMs ?? READ_TIMEOUT_MS,
  );
}

export interface Coverage { total: number; covered: number; missing: string[]; attention: string[] }

/** A reverted run moved nothing, so its zero is exact: covered, not missing. */
export function describeCoverage(reads: RunRead[]): Coverage {
  const missing = reads.filter((r) => r.state === "not_found" || r.state === "unreadable").map((r) => r.txHash);
  const attention = reads.filter((r) => r.state === "attention").map((r) => r.txHash);
  return { total: reads.length, covered: reads.length - missing.length, missing, attention };
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd apps/web && npx vitest run test/run-reads.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Full web suite and typecheck**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: clean; all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/run-reads.ts apps/web/test/run-reads.test.ts
git commit -m "feat(web): read every recorded run by its hash, four at a time" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The dashboard's words, as pure functions

**Files:**
- Create: `apps/web/lib/dashboard-view.ts`, `apps/web/test/dashboard-view.test.ts`
- Modify: `apps/web/test/plain-language.test.ts`

**Interfaces:**
- Consumes: `Coverage`, `RunRead["state"]` (Task 3); `formatAmount`, `short` from `lib/chain.ts`; `TokenPaid` from `@ledgerline/core` (Task 1).
- Produces:
  - `interface CoverageView { tone: "plain" | "warning"; text: string; retry: boolean; attentionNote?: string; tilesBlank: boolean }`
  - `coverageView(c: Coverage, networkName: string): CoverageView`
  - `RUN_STATUS: Record<RunRead["state"], { label: string; color: "success" | "warning" | "error" | "default" }>`
  - `interface TokenMeta { decimals?: number; symbol?: string }`
  - `amountText(value: bigint, token: string, meta: TokenMeta): string`
  - `paidLine(paid: Map<string, { value: bigint }>, order: string[], meta: Record<string, TokenMeta>): string`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/dashboard-view.test.ts
import { describe, it, expect } from "vitest";
import { coverageView, RUN_STATUS, amountText, paidLine } from "@/lib/dashboard-view";

describe("coverageView — the line under the tiles", () => {
  it("all read: plain text naming the network", () => {
    const v = coverageView({ total: 12, covered: 12, missing: [], attention: [] }, "testnet");
    expect(v).toMatchObject({ tone: "plain", retry: false, tilesBlank: false });
    expect(v.text).toBe("From 12 of 12 runs sent from this browser, read from Arc testnet.");
  });

  it("some missing: a warning with Retry, figures still shown", () => {
    const v = coverageView({ total: 12, covered: 11, missing: ["0x1"], attention: [] }, "testnet");
    expect(v).toMatchObject({ tone: "warning", retry: true, tilesBlank: false });
    expect(v.text).toBe("Totals cover 11 of 12 runs. 1 could not be read.");
  });

  it("none readable: the tiles go blank rather than claim zero", () => {
    const v = coverageView({ total: 3, covered: 0, missing: ["0x1", "0x2", "0x3"], attention: [] }, "mainnet");
    expect(v).toMatchObject({ tone: "warning", retry: true, tilesBlank: true });
    expect(v.text).toBe("None of the 3 runs could be read, so there are no totals to show.");
  });

  it("a run needing a look adds a note, in the singular and the plural", () => {
    expect(coverageView({ total: 2, covered: 2, missing: [], attention: ["0x1"] }, "testnet").attentionNote)
      .toBe("1 run has a payment that needs a look. It is left out of the totals.");
    expect(coverageView({ total: 3, covered: 3, missing: [], attention: ["0x1", "0x2"] }, "testnet").attentionNote)
      .toBe("2 runs have a payment that needs a look. They are left out of the totals.");
  });
});

describe("RUN_STATUS", () => {
  it("names every state", () => {
    expect(Object.keys(RUN_STATUS).sort()).toEqual(["attention", "not_found", "read", "reverted", "unreadable"]);
    expect(RUN_STATUS.attention.label).toBe("Needs a look");
  });
});

describe("amountText / paidLine", () => {
  const T1 = "0x3600000000000000000000000000000000000000";
  const T2 = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

  it("formats with the chain's decimals and symbol", () => {
    expect(amountText(100_000n, T1, { decimals: 6, symbol: "USDC" })).toBe("0.1 USDC");
  });

  it("never guesses decimals: raw integer and a short address", () => {
    expect(amountText(100_000n, T2, {})).toBe("100000 (0x89B5…D72a)");
  });

  it("lists a run's tokens in the tile order, skipping unpaid ones", () => {
    const paid = new Map([[T2, { value: 100_000n }], [T1, { value: 100_000n }]]);
    const meta = { [T1.toLowerCase()]: { decimals: 6, symbol: "USDC" }, [T2.toLowerCase()]: { decimals: 6, symbol: "EURC" } };
    expect(paidLine(paid, [T1, T2, "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF"], meta)).toBe("0.1 USDC · 0.1 EURC");
    expect(paidLine(new Map(), [T1], meta)).toBe("Nothing");
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd apps/web && npx vitest run test/dashboard-view.test.ts`
Expected: FAIL. `Cannot find module '@/lib/dashboard-view'`.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/dashboard-view.ts
import { formatAmount, short } from "@/lib/chain";
import type { Coverage, RunRead } from "@/lib/run-reads";

export interface CoverageView {
  tone: "plain" | "warning";
  text: string;
  retry: boolean;
  attentionNote?: string;
  /** No run could be read: a 0 on a tile would be a claim, so show "—". */
  tilesBlank: boolean;
}

const runs = (n: number) => `${n} run${n === 1 ? "" : "s"}`;

export function coverageView(c: Coverage, networkName: string): CoverageView {
  const attentionNote = c.attention.length === 0 ? undefined
    : c.attention.length === 1
      ? "1 run has a payment that needs a look. It is left out of the totals."
      : `${c.attention.length} runs have a payment that needs a look. They are left out of the totals.`;

  if (c.missing.length === 0) {
    return { tone: "plain", retry: false, tilesBlank: false, attentionNote,
      text: `From ${c.covered} of ${c.total} runs sent from this browser, read from Arc ${networkName}.` };
  }
  if (c.covered === 0) {
    return { tone: "warning", retry: true, tilesBlank: true, attentionNote,
      text: `None of the ${runs(c.total)} could be read, so there are no totals to show.` };
  }
  return { tone: "warning", retry: true, tilesBlank: false, attentionNote,
    text: `Totals cover ${c.covered} of ${c.total} runs. ${c.missing.length} could not be read.` };
}

export const RUN_STATUS: Record<RunRead["state"], { label: string; color: "success" | "warning" | "error" | "default" }> = {
  read: { label: "Read", color: "success" },
  attention: { label: "Needs a look", color: "warning" },
  not_found: { label: "Not found", color: "default" },
  reverted: { label: "Reverted", color: "error" },
  unreadable: { label: "Couldn't read", color: "warning" },
};

export interface TokenMeta { decimals?: number; symbol?: string }

/** Decimals come from the chain or not at all — a guess is how 10^12 errors happen. */
export function amountText(value: bigint, token: string, meta: TokenMeta): string {
  if (meta.decimals === undefined) return `${value} (${short(token)})`;
  return `${formatAmount(value, meta.decimals)} ${meta.symbol || short(token)}`;
}

export function paidLine(
  paid: Map<string, { value: bigint }>, order: string[], meta: Record<string, TokenMeta>,
): string {
  const parts = order
    .map((t) => {
      const got = [...paid.entries()].find(([k]) => k.toLowerCase() === t.toLowerCase());
      return got ? amountText(got[1].value, t, meta[t.toLowerCase()] ?? {}) : undefined;
    })
    .filter((s): s is string => !!s);
  return parts.length ? parts.join(" · ") : "Nothing";
}
```

Note: `None of the ${runs(c.total)}` produces "None of the 3 runs", as the test expects. For a single run it produces "None of the 1 run could be read", which is acceptable copy, and the test does not need that case.

- [ ] **Step 4: Run them to watch them pass**

Run: `cd apps/web && npx vitest run test/dashboard-view.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Hold the copy to the plain-language rule**

Append to the `describe` block in `apps/web/test/plain-language.test.ts`, and add `import { coverageView, RUN_STATUS } from "@/lib/dashboard-view";` to its imports:

```ts
  it("the dashboard's coverage line and statuses", () => {
    const cases = [
      { total: 2, covered: 2, missing: [], attention: [] },
      { total: 2, covered: 1, missing: ["0x1"], attention: ["0x2"] },
      { total: 2, covered: 0, missing: ["0x1", "0x2"], attention: [] },
    ];
    for (const c of cases) {
      const v = coverageView(c, "testnet");
      clean(v.text);
      clean(v.attentionNote);
    }
    for (const s of Object.values(RUN_STATUS)) clean(s.label);
  });
```

Run: `cd apps/web && npx vitest run test/plain-language.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/dashboard-view.ts apps/web/test/dashboard-view.test.ts apps/web/test/plain-language.test.ts
git commit -m "feat(web): the dashboard's words, never claiming a total it could not read" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The dashboard page

**Files:**
- Create: `apps/web/app/(app)/dashboard/Dashboard.tsx`
- Modify: `apps/web/app/(app)/dashboard/page.tsx`, `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `useWallet()` → `{ net, wallet, connect }` (part 1); `runsFor(payer, chainId): RunRecord[]` (`lib/history.ts`); `readRuns`, `describeCoverage`, `RunRead` (Task 3); `coverageView`, `RUN_STATUS`, `amountText`, `paidLine`, `TokenMeta` (Task 4); `readTokenMeta` (Task 2); `totalsByToken`, `tokensForChain` (`@ledgerline/core`); `withNet` (`lib/nav.ts`); `Grid`, `Col` (`components/grid/Grid.tsx`).
- Produces: `/dashboard` renders the four states of spec §3.1.

No unit test: every decision on this page lives in Tasks 1, 3 and 4, which are tested. This task is composition, verified by typecheck, build and the browser checks in Task 6.

- [ ] **Step 1: Write the page component**

```tsx
// apps/web/app/(app)/dashboard/Dashboard.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Skeleton, Table, Tag, type TableColumnsType } from "antd";
import { tokensForChain, totalsByToken, type Address, type RunSummary } from "@ledgerline/core";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Grid, Col } from "@/components/grid/Grid";
import { runsFor, type RunRecord } from "@/lib/history";
import { readRuns, describeCoverage, type RunRead } from "@/lib/run-reads";
import { readTokenMeta } from "@/lib/token-meta";
import { coverageView, RUN_STATUS, amountText, paidLine, type TokenMeta } from "@/lib/dashboard-view";
import { withNet } from "@/lib/nav";

const RECENT = 5;

interface Loaded { reads: RunRead[]; meta: Record<string, TokenMeta> }

export default function Dashboard() {
  const { net, wallet, connect } = useWallet();
  const search = useSearchParams();
  const [loaded, setLoaded] = useState<Loaded>();
  const [attempt, setAttempt] = useState(0);

  const records = useMemo<RunRecord[]>(
    () => (wallet ? runsFor(wallet.address, net.chain.id) : []),
    [wallet, net.chain.id],
  );
  const tokens = useMemo(() => Object.values(tokensForChain(net.chain.id)) as Address[], [net.chain.id]);

  // Reads restart when the wallet, network or history changes; a read that
  // lands after that is dropped, so one wallet's totals never show under another.
  useEffect(() => {
    if (records.length === 0) { setLoaded(undefined); return; }
    let cancelled = false;
    setLoaded(undefined);
    void (async () => {
      const [reads, meta] = await Promise.all([
        readRuns(records, net),
        readTokenMeta(net.defaultRpc, net.chain, net.chain.id)
          .then(({ decimals, symbols }) => Object.fromEntries(
            Object.keys(decimals).map((k) => [k, { decimals: decimals[k], symbol: symbols[k] }]),
          ) as Record<string, TokenMeta>)
          .catch(() => ({} as Record<string, TokenMeta>)),
      ]);
      if (!cancelled) setLoaded({ reads, meta });
    })();
    return () => { cancelled = true; };
  }, [records, net, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!wallet) {
    return (
      <Grid>
        <Col span={8} md={12}>
          <section className="verdict">
            <h1>Your payouts at a glance</h1>
            <p>
              Connect the wallet that paid them. This overview is built from runs sent from
              this browser and re-read from the chain.
            </p>
          </section>
          <Button type="primary" style={{ marginTop: 24 }} onClick={connect}>Connect a wallet</Button>
        </Col>
      </Grid>
    );
  }

  if (records.length === 0) {
    return (
      <Grid>
        <Col span={12}>
          <section className="verdict">
            <h1>Nothing sent from this browser yet</h1>
            <p>
              A run sent from another browser is still on chain. Open it from the explorer or by
              its transaction hash.
            </p>
          </section>
          <p style={{ marginTop: 22 }}>
            <Link href={withNet("/new", search)} className="button-primary">Create a payout run</Link>
          </p>
        </Col>
      </Grid>
    );
  }

  const byHash = new Map((loaded?.reads ?? []).map((r) => [r.txHash.toLowerCase(), r]));
  const summaries: RunSummary[] = (loaded?.reads ?? []).flatMap((r) =>
    r.state === "read" || r.state === "attention" ? [r.summary] : []);
  const totals = totalsByToken(summaries, tokens);
  const coverage = loaded ? coverageView(describeCoverage(loaded.reads), net.name) : undefined;
  const meta = loaded?.meta ?? {};
  const recent = records.slice(0, RECENT);
  const runHref = (r: RunRecord) =>
    `/run/${r.txHash}?n=${net.name}&label=${encodeURIComponent(r.runLabel)}`;
  const attentionHref = () => {
    const hashes = loaded ? describeCoverage(loaded.reads).attention : [];
    const one = hashes.length === 1 ? records.find((r) => r.txHash.toLowerCase() === hashes[0]!.toLowerCase()) : undefined;
    return one ? runHref(one) : withNet("/runs", search);
  };

  const columns: TableColumnsType<RunRecord> = [
    { title: "Run", dataIndex: "runLabel",
      render: (label: string) => label || <span style={{ color: "var(--text-soft)" }}>unnamed</span> },
    { title: "Sent (this browser's clock)", dataIndex: "seenAt", width: 200,
      render: (ms: number) => new Date(ms).toLocaleString() },
    { title: "Paid", key: "paid",
      render: (_, r) => {
        const read = byHash.get(r.txHash.toLowerCase());
        if (!read) return <Skeleton.Input active size="small" />;
        return read.state === "read" || read.state === "attention"
          ? paidLine(read.summary.paid, tokens, meta)
          : <span style={{ color: "var(--text-soft)" }}>—</span>;
      } },
    { title: "Status", key: "status", width: 130,
      render: (_, r) => {
        const read = byHash.get(r.txHash.toLowerCase());
        if (!read) return <Skeleton.Button active size="small" />;
        const s = RUN_STATUS[read.state];
        return <Tag color={s.color}>{s.label}</Tag>;
      } },
    { title: <span className="sr-only">Open</span>, key: "open", width: 80,
      render: (_, r) => <Link href={runHref(r)}>Open</Link> },
  ];

  return (
    <Grid>
      {totals.map((t) => {
        const m = meta[t.token.toLowerCase()] ?? {};
        return (
          <Col key={t.token} span={4} md={12} as="section" className="stat-tile">
            <p className="stat-label">{m.symbol || t.token.slice(0, 10)}</p>
            {!loaded
              ? <Skeleton.Input active />
              : <p className="stat-value">{coverage?.tilesBlank ? "—" : amountText(t.value, t.token, m)}</p>}
            {loaded && !coverage?.tilesBlank && (
              <p className="stat-sub">
                {t.payments} payment{t.payments === 1 ? "" : "s"} · {t.runs} run{t.runs === 1 ? "" : "s"}
              </p>
            )}
          </Col>
        );
      })}

      <Col span={12}>
        {coverage?.tone === "plain" && <p className="coverage-line">{coverage.text}</p>}
        {coverage?.tone === "warning" && (
          <Alert type="warning" showIcon title={coverage.text}
            action={coverage.retry ? <Button size="small" onClick={retry}>Retry</Button> : undefined} />
        )}
        {coverage?.attentionNote && (
          <p className="coverage-line">
            {coverage.attentionNote} <Link href={attentionHref()}>Take a look</Link>
          </p>
        )}
      </Col>

      <Col span={12}>
        <h2 className="section-title">Recent runs</h2>
        <Table<RunRecord>
          columns={columns}
          dataSource={recent.map((r) => ({ ...r, key: r.txHash }))}
          pagination={false}
          size="middle"
          scroll={{ x: "max-content" }}
        />
        <p style={{ marginTop: 12 }}>
          <Link href={withNet("/runs", search)}>All runs →</Link>
        </p>
      </Col>
    </Grid>
  );
}
```

Retry re-reads all recorded runs, not only the missing ones (spec §3.3 as corrected in Task 1 Step 0). Receipts are immutable, so the covered ones come back the same, and the component needs no merge logic.

- [ ] **Step 2: Render it from the page**

```tsx
// apps/web/app/(app)/dashboard/page.tsx
import Dashboard from "./Dashboard";

export const metadata = { title: "Dashboard — Ledgerline" };

export default function DashboardPage() {
  return <Dashboard />;
}
```

- [ ] **Step 3: Tile styles**

Append to `apps/web/app/globals.css`, above the `/* md: …` media block:

```css
/* ── dashboard ────────────────────────────────────────────────────────── */
.stat-tile { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; }
.stat-label { margin: 0; color: var(--text-soft); font-size: 0.85rem; }
.stat-value { margin: 6px 0 2px; font-size: 1.6rem; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.stat-sub { margin: 0; color: var(--text-soft); font-size: 0.85rem; }
.coverage-line { margin: 0; color: var(--text-soft); }
.section-title { margin: 8px 0 12px; font-size: 1rem; font-weight: 600; }
```

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run && pnpm build`
Expected: no type errors; all tests pass; build lists `/dashboard` as dynamic (`ƒ`).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(app)/dashboard" apps/web/app/globals.css
git commit -m "feat(web): the payer's dashboard, per-token totals re-read from the chain" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verify in a real browser

No new code unless a check fails. A failure is fixed in the task that owns the code, with a test where one can pin it, and then this task is re-run.

**Files:** none (evidence only).

- [ ] **Step 1: Build and serve**

Run: `cd apps/web && pnpm build && pnpm start --port 3055 &`, then wait for `curl -s -o /dev/null -w '%{http_code}' http://localhost:3055/dashboard` to print `200`.

- [ ] **Step 2: A signer and a wallet with history**

Run a local signer holding `PRIVATE_KEY` from the repo `.env`, in its own Node process. It answers only `eth_requestAccounts`, `eth_accounts`, `personal_sign` and `eth_sendTransaction`, with `Access-Control-Allow-Origin: http://localhost:3055` (never `*`). Inject an EIP-6963 provider that forwards those four methods to it, answers `eth_chainId` with testnet, and sends other reads to `https://rpc.testnet.arc.io`.

On `/new?n=testnet`, send one two-line run (0.1 USDC, 0.1 EURC to `0xe48A096B9E74f064b13c17734af29F85E02d732a`). History is per browser, so this populates the dashboard.

- [ ] **Step 3: The four states**

On `/dashboard?n=testnet`, record the visible text of each:
1. before connecting: "Your payouts at a glance" and a Connect button;
2. connected, with `localStorage` cleared (`localStorage.removeItem("ledgerline:runs:v1")`, then reload and connect): "Nothing sent from this browser yet";
3. connected with the run from Step 2: three tiles (USDC, EURC, cirBTC); cirBTC shows `0`; the coverage line reads "From 1 of 1 runs sent from this browser, read from Arc testnet.";
4. with the provider's `eth_chainId` changed to `0x1` and `chainChanged` emitted: the same figures, and the top bar offers "Switch to Arc testnet".

Expected: as listed.

- [ ] **Step 4: Figures equal the run page**

For every run in the recent table, open its `/run/[tx]` and compare that page's paid amounts per token with the dashboard's Paid column.
Expected: identical for every run.

- [ ] **Step 5: RPC failure, then Retry**

With Playwright, `page.route("https://rpc.testnet.arc.io/**", r => r.abort())`, reload `/dashboard?n=testnet` and connect.
Expected: the tiles show "—"; a warning reads "None of the 1 run could be read, so there are no totals to show." with Retry. Then `page.unroute(...)` and click Retry. Expected: the figures from Step 3.

- [ ] **Step 6: A late read never shows under another wallet**

Delay every `eth_getTransactionReceipt` by 3 s with `page.route`. Load the dashboard, and within that delay emit `accountsChanged([])` from the provider (the wallet disconnects).
Expected: the page shows the no-wallet state and never renders tiles afterwards (poll for 5 s).

- [ ] **Step 7: axe, overflow, console**

In both themes (`theme` cookie `dark` and `light`), on the populated dashboard and the empty state, inject axe (`.playwright-mcp/axe.min.js`) and run `axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] })`.
Expected: no `serious` or `critical` violations.

At widths 390, 768 and 1280, compute `document.documentElement.scrollWidth - document.documentElement.clientWidth`.
Expected: `0`.

Expected: `browser_console_messages` at level `error` is empty.

- [ ] **Step 8: Stop and run everything**

Stop the signer and the server (`kill $(lsof -tiTCP:3055 -sTCP:LISTEN)`, and the same for the signer's port). From the repo root: `pnpm test && pnpm typecheck`.
Expected: every package passes; typecheck clean. If any fix was needed during this task, commit it with a message naming the check that caught it.
