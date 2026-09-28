# Dashboard Part 2 — "Needs you" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/dashboard` for a payer who is not technical. From the top: what needs them, their wallet and the New payout run button, what they paid this month (all time alongside), and recent runs in plain words. A payer with no runs gets a Get started checklist.

**Architecture:**
- Three chain reads start together: receipts by txHash, now carrying their block's timestamp; token metadata; `balanceOf`.
- Pure functions in `lib/dashboard-view.ts` turn the reads into items, labels and lines.
- One small component per page section renders them. `Dashboard.tsx` only orchestrates.
- Core does not change.

**Tech Stack:** TypeScript, viem, vitest 2, Next.js 16 App Router, antd 6, the tape design system (`Tape`, `StatTile`, `Grid`/`Col`), `useWallet()`.

**Spec:** `docs/superpowers/specs/2026-09-28-dashboard-needs-you-design.md` (parent: `2026-09-23-dashboard-design.md`)

**Where this plan refines the spec's §4.2 sketch:**
- `needsYou` also takes `tokens`, so it can tell that *any* token's balance failed.
- `coverageView` becomes `coverageLine`, which is plain text only.
- Five small pure helpers are added: `feeHelp`, `balanceText`, `whenText`, `allTimeLine` and `monthTitle`.

The behaviour is the spec's.

## Global Constraints

- **Invariant 1.** Reads by known txHash, block number or `balanceOf` only. No `eth_getLogs` and no history search. Nothing about amounts is stored.
- Totals come from emitted `Transfer` values via `summarizeRun` and `paidByToken`, never from requested amounts. There is no fiat and no grand total across tokens.
- Wallet figures come from `balanceOf`, in the token's on-chain decimals, and never from the 18-decimal native balance. Decimals are never guessed; `amountText`/`amountFigure` fall back to the raw integer.
- **"✓ Nothing needs you."** appears only after the run reads **and** the balance read have both settled and produced no item.
- A reverted run stays in the history until the payer presses Remove or opens its run page. The dashboard settles **successes only**.
- The month is the viewer's calendar month in their own time zone, taken from the **block timestamp**. `seenAt` is the browser clock: it only picks wording and never decides money.
- Every tile shows every token of `tokensForChain`, in the order USDC, EURC, cirBTC, with `0` when unpaid and "—" when nothing could be read.
- Block time reads: timeout **4 000 ms**, `retryCount: 0`, in the same pool of **4**. Receipt reads keep **10 000 ms**.
- A waiting run changes to the stale wording at **10 minutes** (`STALE_AFTER_MS = 600_000`).
- Every in-app link keeps `?n=` via `withNet`, and run links are built the way `/runs` builds them.
- The copy passes `frontend/test/plain-language.test.ts`: no "manifest", "anchor", "salt", "Merkle", "preflight", "commit", "root" or "run label".
- The interface is English. Colour marks exceptions only: ribbon for a run that did not go through, highlighter for anything to do.
- Package names: the web app is `@ledgerline/web` in `frontend/`. Run web tests with `pnpm --filter @ledgerline/web exec vitest run <file>` from the repo root.
- Commit after every task in the repo's `type(scope): sentence` style with two `-m` flags: the subject, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **The payer switches account or network while reads are in flight.** Expected: the balances, reads and metadata of the old wallet or network are never painted under the new one. Effect timing cannot be reached from a unit test. It is pinned by the three tag checks in Task 5 Step 6, which the Task 7 reviewer reads line by line.
2. **The runs settle before the balances.** Expected: no all-clear until both have settled. Pinned in Task 4 (`needsYou` returns `undefined` while `balances` is undefined).
3. **USDC's balance fails to read, as opposed to being zero.** Expected: a failure gives the `balances` item with Retry, and never "No USDC left". Pinned in Task 4.
4. **The browser clock is behind or ahead of when the run was recorded** (`seenAt` in the future). Expected: the fresh "waiting" wording, never "after -3 minutes". Pinned in Task 4.
5. **The RPC is down, so runs and balances both fail.** Expected: exactly one Retry on the page, and one press refills everything. The rule is pinned in Task 5 (`NeedsYou`'s `firstRetry`); Task 7 Step 5 counts the Retry buttons.

---

## File Structure

```
frontend/
  lib/balances.ts                    CREATE  readBalances, readBalancesWith (moved from StepPreview)
  lib/run-reads.ts                   MODIFY  blockNumber, paidAt, getBlockTime
  lib/dashboard-view.ts              MODIFY  runStatus, inMonth, monthTitle, paidThisMonth, allTimeLine,
                                             coverageLine, toSettle, whenText, balanceText,
                                             needsYou, feeHelp, setupSteps; drop coverageView, RUN_STATUS
  app/(app)/new/StepPreview.tsx      MODIFY  import readBalances from lib
  app/(app)/dashboard/NeedsYou.tsx   CREATE
  app/(app)/dashboard/WalletPanel.tsx CREATE
  app/(app)/dashboard/PaidTotals.tsx CREATE
  app/(app)/dashboard/RecentRuns.tsx CREATE
  app/(app)/dashboard/GetStarted.tsx CREATE
  app/(app)/dashboard/Dashboard.tsx  REWRITE orchestration only
  app/styles/pages.css               MODIFY  dashboard section
  test/balances.test.ts              CREATE
  test/run-reads.test.ts             MODIFY
  test/dashboard-view.test.ts        MODIFY
  test/plain-language.test.ts        MODIFY
  test/tape.test.ts                  MODIFY  keep-case guard now reads PaidTotals.tsx
ARCHITECTURE.md                      MODIFY  the dashboard's reads
```

---

### Task 1: One reader of the wallet's balances

**Files:**
- Create: `frontend/lib/balances.ts`
- Modify: `frontend/app/(app)/new/StepPreview.tsx:5,38-60`
- Test: `frontend/test/balances.test.ts`

**Interfaces:**
- Produces:
  - `readBalances(net: NetworkView, owner: Address, tokens: Address[]): Promise<Record<string, bigint>>`
  - `readBalancesWith(tokens: Address[], readOne: (token: Address) => Promise<bigint>): Promise<Record<string, bigint>>`
  - In both, the result is keyed by lowercased token address. A token whose read failed is **absent**, never `0n`.

- [ ] **Step 1: Write the failing test**

`frontend/test/balances.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Address } from "viem";
import { readBalancesWith } from "@/lib/balances";

const A = "0x3600000000000000000000000000000000000000" as Address;
const B = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address;

describe("readBalancesWith — what the wallet holds, per token", () => {
  it("keys each balance by the lowercased token address", async () => {
    const got = await readBalancesWith([A, B], async (t) => (t === A ? 5n : 7n));
    expect(got).toEqual({ [A.toLowerCase()]: 5n, [B.toLowerCase()]: 7n });
  });

  it("leaves a token out when its read fails: unknown, never zero", async () => {
    const got = await readBalancesWith([A, B], async (t) => {
      if (t === B) throw new Error("rpc down");
      return 0n;
    });
    expect(got).toEqual({ [A.toLowerCase()]: 0n });
    expect(B.toLowerCase() in got).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @ledgerline/web exec vitest run test/balances.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/balances"`.

- [ ] **Step 3: Create `frontend/lib/balances.ts`**

```ts
import { createPublicClient, http, type Address } from "viem";
import type { NetworkView } from "@/lib/chain";

const balanceOfAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** Exported for tests: the reads, with the one-token reader injected. A token
 *  whose balance cannot be read is left out, so it shows as unknown rather
 *  than as an empty wallet. */
export async function readBalancesWith(
  tokens: Address[], readOne: (token: Address) => Promise<bigint>,
): Promise<Record<string, bigint>> {
  const out: Record<string, bigint> = {};
  await Promise.all(tokens.map(async (token) => {
    try {
      out[token.toLowerCase()] = await readOne(token);
    } catch { /* unknown, not zero */ }
  }));
  return out;
}

/**
 * What `owner` holds of each token, from `balanceOf` in the token's own
 * decimals. For USDC that is the 6-decimal ERC-20 figure, never the 18-decimal
 * native balance: the two describe the same money and differ by 10^12.
 */
export function readBalances(
  net: NetworkView, owner: Address, tokens: Address[],
): Promise<Record<string, bigint>> {
  const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
  return readBalancesWith(tokens, (token) => client.readContract({
    address: token, abi: balanceOfAbi, functionName: "balanceOf", args: [owner],
  }));
}
```

- [ ] **Step 4: Point `StepPreview` at it**

In `frontend/app/(app)/new/StepPreview.tsx`:
- Delete the local `balanceOfAbi` const and the local `readBalances` function, together with its doc comment ("Every token the run pays, plus USDC…"). This is today's lines 38–60.
- Keep the doc comment's reasoning at the call site. Just above `const tokenKey = useMemo(`, add:

```ts
  // Every token the run pays, plus USDC, which pays Arc's network fee even
  // when the run pays none.
```

- Change line 5 from `import { createPublicClient, http, type Address } from "viem";` to:

```ts
import type { Address } from "viem";
```

- Add, next to the other `@/lib` imports:

```ts
import { readBalances } from "@/lib/balances";
```

Check nothing else in the file used `createPublicClient` or `http`:

Run: `grep -n "createPublicClient\|http(" 'frontend/app/(app)/new/StepPreview.tsx'`
Expected: no output.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `pnpm --filter @ledgerline/web exec vitest run test/balances.test.ts && pnpm --filter @ledgerline/web typecheck`
Expected: 2 passed, and `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/balances.ts frontend/test/balances.test.ts 'frontend/app/(app)/new/StepPreview.tsx'
git commit -m "refactor(web): the wallet's balances are read in one place" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: A run read from the chain carries its block's time

**Files:**
- Modify: `frontend/lib/run-reads.ts`
- Test: `frontend/test/run-reads.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `RunRead`'s `read`/`attention` arm gains `paidAt?: bigint` (unix seconds). The key is **absent** when no date was read.
  - `ReceiptLike` gains `blockNumber?: bigint`. The real reader always sets it; absent means no date can be read.
  - `export type GetBlockTime = (blockNumber: bigint) => Promise<bigint>`
  - `export const BLOCK_TIME_TIMEOUT_MS = 4_000`
  - `ReadOptions` gains `getBlockTime?: GetBlockTime; blockTimeoutMs?: number`.
  - New signature: `readRunsWith(records, payer, getReceipt, summarize, concurrency?, timeoutMs?, getBlockTime?, blockTimeoutMs?)`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/test/run-reads.test.ts`:

```ts
describe("readRunsWith — the date a run was paid, from its block", () => {
  const BLOCK = 63_549_920n;
  const withBlock: GetReceipt = async () => ({ status: "success", logs, blockNumber: BLOCK });
  const clean = () => ({ paid: new Map(), payments: 0, identityBroken: 0 });

  it("sets paidAt from the block's timestamp", async () => {
    const [r] = await readRunsWith([rec("0xa")], PAYER, withBlock, clean, 4, 1_000,
      async (b) => (b === BLOCK ? 1_790_145_433n : 0n));
    expect(r).toMatchObject({ state: "read", paidAt: 1_790_145_433n });
  });

  it("dates an attention run too", async () => {
    const [r] = await readRunsWith([rec("0xa")], PAYER, withBlock,
      () => ({ paid: new Map(), payments: 0, identityBroken: 1 }), 4, 1_000, async () => 7n);
    expect(r).toMatchObject({ state: "attention", paidAt: 7n });
  });

  it("a failed block read leaves the run read, with no date", async () => {
    const [r] = await readRunsWith([rec("0xa")], PAYER, withBlock, clean, 4, 1_000,
      async () => { throw new Error("rpc down"); });
    expect(r!.state).toBe("read");
    expect("paidAt" in r!).toBe(false);
  });

  it("a block read that outlives its own timeout leaves the run read, with no date", async () => {
    const [r] = await readRunsWith([rec("0xa")], PAYER, withBlock, clean, 4, 1_000,
      () => new Promise(() => {}), 20);
    expect(r!.state).toBe("read");
    expect("paidAt" in r!).toBe(false);
  });

  it("never reads a block for a reverted or missing run", async () => {
    let blockReads = 0;
    const getReceipt: GetReceipt = async (h) => (h === "0xr" ? { status: "reverted", logs: [], blockNumber: 1n } : null);
    const reads = await readRunsWith([rec("0xr"), rec("0xm")], PAYER, getReceipt, clean, 4, 1_000,
      async () => { blockReads++; return 1n; });
    expect(reads.map((r) => r.state)).toEqual(["reverted", "not_found"]);
    expect(blockReads).toBe(0);
  });

  it("keeps receipt and block reads together inside the pool of four", async () => {
    let live = 0;
    let peak = 0;
    const slow = async <T,>(v: T): Promise<T> => {
      live++; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return v;
    };
    const records = Array.from({ length: 12 }, (_, i) => rec(`0x${i.toString(16)}`));
    await readRunsWith(records, PAYER, () => slow({ status: "success" as const, logs, blockNumber: 1n }), clean, 4, 1_000,
      () => slow(1n));
    expect(peak).toBe(4);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @ledgerline/web exec vitest run test/run-reads.test.ts`
Expected: FAIL. At least "sets paidAt from the block's timestamp" fails: `paidAt` is missing, because `readRunsWith` ignores its seventh argument.

- [ ] **Step 3: Implement in `frontend/lib/run-reads.ts`**

Replace the constants, types and `receiptReader` at the top of the file (through the end of `receiptReader`) with:

```ts
export const READ_CONCURRENCY = 4;
export const READ_TIMEOUT_MS = 10_000;
/** A date is a courtesy line: one try, short, like lib/paid-at.ts. */
export const BLOCK_TIME_TIMEOUT_MS = 4_000;

export type RunRead =
  | { txHash: string; state: "read" | "attention"; summary: RunSummary; paidAt?: bigint }
  | { txHash: string; state: "not_found" | "reverted" }
  | { txHash: string; state: "unreadable"; reason: string };

export interface ReceiptLike { status: "success" | "reverted"; logs: RawLog[]; blockNumber?: bigint }
/** null means the node has no such transaction. */
export type GetReceipt = (txHash: Hex) => Promise<ReceiptLike | null>;
/** A block's timestamp, in unix seconds. */
export type GetBlockTime = (blockNumber: bigint) => Promise<bigint>;
export interface ReadOptions {
  getReceipt?: GetReceipt; getBlockTime?: GetBlockTime;
  concurrency?: number; timeoutMs?: number; blockTimeoutMs?: number;
}

type Summarize = (logs: RawLog[], payer: Address) => RunSummary;
type Rec = Pick<RunRecord, "txHash">;

function receiptReader(net: NetworkView): GetReceipt {
  // retryCount: 0 — viem's own retries must not outlive READ_TIMEOUT_MS;
  // withTimeout below is the only retry/timeout policy that governs a read.
  const client = createPublicClient({
    chain: net.chain,
    transport: http(net.defaultRpc, { timeout: READ_TIMEOUT_MS, retryCount: 0 }),
  });
  return async (hash) => {
    try {
      const r = await client.getTransactionReceipt({ hash });
      return {
        status: r.status,
        blockNumber: r.blockNumber,
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

function blockTimeReader(net: NetworkView): GetBlockTime {
  const client = createPublicClient({
    chain: net.chain,
    transport: http(net.defaultRpc, { timeout: BLOCK_TIME_TIMEOUT_MS, retryCount: 0 }),
  });
  return async (blockNumber) => (await client.getBlock({ blockNumber })).timestamp;
}
```

Replace the whole `readRunsWith` function with:

```ts
/** Exported for tests: the pool, with the receipt reader and summariser injected.
 *  `payer` is always the connected wallet, passed explicitly (M1) — never a
 *  record's own stored `payer`, which is untrusted localStorage. */
export async function readRunsWith(
  records: Rec[], payer: Address, getReceipt: GetReceipt, summarize: Summarize,
  concurrency = READ_CONCURRENCY, timeoutMs = READ_TIMEOUT_MS,
  getBlockTime?: GetBlockTime, blockTimeoutMs = BLOCK_TIME_TIMEOUT_MS,
): Promise<RunRead[]> {
  // history.ts dedupes on record, but a read must not trust that.
  const seen = new Set<string>();
  const unique = records.filter((r) => {
    const k = r.txHash.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // A run whose date cannot be read is still read: only the month figure
  // loses it (spec §5), so this never throws.
  const dateOf = async (blockNumber: bigint | undefined): Promise<bigint | undefined> => {
    if (!getBlockTime || blockNumber === undefined) return undefined;
    try {
      return await withTimeout(getBlockTime(blockNumber), blockTimeoutMs);
    } catch {
      return undefined;
    }
  };

  const out: RunRead[] = new Array(unique.length);
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const i = next++;
      const { txHash } = unique[i]!;
      try {
        const receipt = await withTimeout(getReceipt(txHash as Hex), timeoutMs);
        if (!receipt) out[i] = { txHash, state: "not_found" };
        else if (receipt.status === "reverted") out[i] = { txHash, state: "reverted" };
        else {
          const summary = summarize(receipt.logs, payer);
          const state = summary.identityBroken > 0 ? "attention" : "read";
          const paidAt = await dateOf(receipt.blockNumber);
          out[i] = paidAt === undefined ? { txHash, state, summary } : { txHash, state, summary, paidAt };
        }
      } catch (err) {
        out[i] = { txHash, state: "unreadable", reason: err instanceof Error ? err.message : String(err) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out;
}
```

Replace `readRuns` with:

```ts
/** Each run's receipt, fetched by its known hash, and its block's time.
 *  Never searches history. `payer` is the connected wallet (spec §4.1) —
 *  the caller passes it explicitly rather than this reading it off each record. */
export function readRuns(records: Rec[], payer: Address, net: NetworkView, opts: ReadOptions = {}): Promise<RunRead[]> {
  return readRunsWith(
    records, payer, opts.getReceipt ?? receiptReader(net), summarizeRun,
    opts.concurrency ?? READ_CONCURRENCY, opts.timeoutMs ?? READ_TIMEOUT_MS,
    opts.getBlockTime ?? blockTimeReader(net), opts.blockTimeoutMs ?? BLOCK_TIME_TIMEOUT_MS,
  );
}
```

`describeCoverage` and `Coverage` are unchanged. The existing tests' receipts carry no `blockNumber`, so `readRuns` makes no block read in them and touches no network.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `pnpm --filter @ledgerline/web exec vitest run test/run-reads.test.ts && pnpm --filter @ledgerline/web typecheck`
Expected: every test in the file passes, including the 6 new ones, and `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/run-reads.ts frontend/test/run-reads.test.ts
git commit -m "feat(web): a run read from the chain carries its block's time" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The page's figures and words, as pure functions

**Files:**
- Modify: `frontend/lib/dashboard-view.ts`
- Test: `frontend/test/dashboard-view.test.ts`

**Interfaces:**
- Consumes (Task 2):
  - `RunRead` with `paidAt?: bigint`;
  - `Coverage` from `@/lib/run-reads`;
  - `paidByToken`, `TokenTotal`, `Address` from `@ledgerline/core`;
  - `paidAtText(seconds, timeZone?)` from `@/lib/receipt-view`;
  - `short` from `@/lib/chain`;
  - `RunRecord` (type) from `@/lib/history`.
- Produces:
  - `type StatusColor = "success" | "warning" | "error" | "default"`
  - `runStatus(read: RunRead, record: Pick<RunRecord, "awaitingReceipt">): { label: string; color: StatusColor }`
  - `inMonth(paidAt: bigint, now: Date): boolean`
  - `monthTitle(now: Date): string`, e.g. `"September 2026"`
  - `paidThisMonth(reads: RunRead[], tokens: Address[], now: Date): { totals: TokenTotal[]; undated: number }`
  - `allTimeLine(reads: RunRead[], tokens: Address[], meta: Record<string, TokenMeta>): string`
  - `interface CoverageLine { text: string; tilesBlank: boolean }`
  - `coverageLine(c: Coverage, undated: number, networkName: string, now: Date): CoverageLine`
  - `toSettle(reads: RunRead[]): string[]`
  - `whenText(read: RunRead, record: Pick<RunRecord, "awaitingReceipt">, timeZone?: string): string`
  - `balanceText(value: bigint | undefined, token: string, meta: TokenMeta): string`
  - `coverageView` and `RUN_STATUS` **stay** until Task 5, so the current page still builds.

- [ ] **Step 1: Write the failing tests**

In `frontend/test/dashboard-view.test.ts`, replace the import line with:

```ts
import { getAddress } from "viem";
import { tokensForChain, type Address, type RunSummary } from "@ledgerline/core";
import type { RunRead } from "@/lib/run-reads";
import {
  coverageView, excludedNote, RUN_STATUS, amountText, paidLine,
  runStatus, inMonth, monthTitle, paidThisMonth, allTimeLine, coverageLine, toSettle, whenText, balanceText,
} from "@/lib/dashboard-view";
```

(The `vitest` import line stays first.) Append:

```ts
const T = tokensForChain(5_042_002);
const TOKENS = [T.USDC, T.EURC, T.cirBTC] as Address[];
const META = {
  [T.USDC.toLowerCase()]: { decimals: 6, symbol: "USDC" },
  [T.EURC.toLowerCase()]: { decimals: 6, symbol: "EURC" },
  [T.cirBTC.toLowerCase()]: { decimals: 8, symbol: "cirBTC" },
};
/** Seconds for a local wall-clock time, so a test holds in any time zone. */
const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
  BigInt(Math.floor(new Date(y, mo, d, h, mi, s).getTime() / 1000));
const NOW = new Date(2026, 8, 28, 12, 0); // 28 September 2026, local
const sum = (usdc: bigint, eurc = 0n, identityBroken = 0): RunSummary => {
  const paid = new Map<Address, { value: bigint; payments: number }>();
  if (usdc) paid.set(getAddress(T.USDC), { value: usdc, payments: 1 });
  if (eurc) paid.set(getAddress(T.EURC), { value: eurc, payments: 1 });
  return { paid, payments: paid.size, identityBroken };
};
const read = (txHash: string, s: RunSummary, paidAt?: bigint): RunRead =>
  paidAt === undefined ? { txHash, state: "read", summary: s } : { txHash, state: "read", summary: s, paidAt };

describe("runStatus — a run's status in the payer's words", () => {
  it("names each state plainly", () => {
    expect(runStatus(read("0x1", sum(1n)), {})).toEqual({ label: "Paid", color: "success" });
    expect(runStatus({ txHash: "0x1", state: "attention", summary: sum(1n, 0n, 1) }, {}))
      .toEqual({ label: "Check one payment", color: "warning" });
    expect(runStatus({ txHash: "0x1", state: "attention", summary: sum(1n, 0n, 3) }, {}))
      .toEqual({ label: "Check 3 payments", color: "warning" });
    expect(runStatus({ txHash: "0x1", state: "reverted" }, {})).toEqual({ label: "Didn't go through", color: "error" });
    expect(runStatus({ txHash: "0x1", state: "unreadable", reason: "x" }, {})).toEqual({ label: "Couldn't check", color: "warning" });
  });

  it("a missing receipt is Waiting for a run sent from here, Not found otherwise", () => {
    expect(runStatus({ txHash: "0x1", state: "not_found" }, { awaitingReceipt: true })).toEqual({ label: "Waiting", color: "default" });
    expect(runStatus({ txHash: "0x1", state: "not_found" }, {})).toEqual({ label: "Not found", color: "default" });
  });
});

describe("inMonth / monthTitle — the payer's own calendar month", () => {
  it("the first and last second of this month count; the seconds either side do not", () => {
    expect(inMonth(at(2026, 8, 1, 0, 0, 0), NOW)).toBe(true);
    expect(inMonth(at(2026, 8, 30, 23, 59, 59), NOW)).toBe(true);
    expect(inMonth(at(2026, 7, 31, 23, 59, 59), NOW)).toBe(false);
    expect(inMonth(at(2026, 9, 1, 0, 0, 0), NOW)).toBe(false);
  });

  it("the same month of another year does not count", () => {
    expect(inMonth(at(2025, 8, 15), NOW)).toBe(false);
  });

  it("names the month in full", () => {
    expect(monthTitle(NOW)).toBe("September 2026");
    expect(monthTitle(new Date(2027, 0, 1))).toBe("January 2027");
  });
});

describe("paidThisMonth / allTimeLine", () => {
  const reads: RunRead[] = [
    read("0x1", sum(100_000n, 50_000n), at(2026, 8, 23)),
    read("0x2", sum(200_000n), at(2026, 7, 20)),
    read("0x3", sum(300_000n)),
    { txHash: "0x4", state: "reverted" },
    { txHash: "0x5", state: "unreadable", reason: "x" },
  ];

  it("sums only runs dated this month, every token in order, zero when unpaid", () => {
    const m = paidThisMonth(reads, TOKENS, NOW);
    expect(m.totals.map((t) => t.value)).toEqual([100_000n, 50_000n, 0n]);
    expect(m.totals.map((t) => t.runs)).toEqual([1, 1, 0]);
  });

  it("counts a read run with no date as undated, never guessing its month", () => {
    expect(paidThisMonth(reads, TOKENS, NOW).undated).toBe(1);
  });

  it("an attention run's clean payments count toward the month", () => {
    const m = paidThisMonth([{ txHash: "0x6", state: "attention", summary: sum(70_000n, 0n, 1), paidAt: at(2026, 8, 2) }], TOKENS, NOW);
    expect(m.totals[0]!.value).toBe(70_000n);
  });

  it("the all-time line sums every read run, paid tokens only", () => {
    expect(allTimeLine(reads, TOKENS, META)).toBe("0.6 USDC · 0.05 EURC");
    expect(allTimeLine([{ txHash: "0x4", state: "reverted" }], TOKENS, META)).toBe("nothing yet");
  });
});

describe("coverageLine — what the totals stand on, in plain text", () => {
  it("one run, all read", () => {
    expect(coverageLine({ total: 1, covered: 1, missing: [], attention: [] }, 0, "testnet", NOW))
      .toEqual({ tilesBlank: false, text: "From the 1 run sent from this browser, read from Arc testnet." });
  });

  it("says what is missing and what has no date", () => {
    expect(coverageLine({ total: 12, covered: 11, missing: ["0x1"], attention: [] }, 1, "testnet", NOW).text).toBe(
      "From 12 runs sent from this browser, read from Arc testnet. 1 run could not be read and is not counted. " +
      "1 run's date could not be read, so it is left out of September.");
    expect(coverageLine({ total: 5, covered: 3, missing: ["0x1", "0x2"], attention: [] }, 2, "mainnet", NOW).text).toBe(
      "From 5 runs sent from this browser, read from Arc mainnet. 2 runs could not be read and are not counted. " +
      "2 runs' dates could not be read, so they are left out of September.");
  });

  it("keeps the note that a payment needing a look is left out", () => {
    expect(coverageLine({ total: 2, covered: 2, missing: [], attention: ["0x1"] }, 0, "testnet", NOW).text).toContain(
      "1 run has a payment that needs a look. That payment is left out of the totals; the run's other payments are counted.");
  });

  it("none readable: the tiles go blank rather than claim zero", () => {
    expect(coverageLine({ total: 3, covered: 0, missing: ["0x1", "0x2", "0x3"], attention: [] }, 0, "testnet", NOW))
      .toEqual({ tilesBlank: true, text: "None of the 3 runs could be read, so there are no totals to show." });
  });
});

describe("toSettle — a reverted run is never taken off the list here", () => {
  it("returns successes only", () => {
    expect(toSettle([
      read("0x1", sum(1n)),
      { txHash: "0x2", state: "attention", summary: sum(1n, 0n, 1) },
      { txHash: "0x3", state: "reverted" },
      { txHash: "0x4", state: "not_found" },
      { txHash: "0x5", state: "unreadable", reason: "x" },
    ])).toEqual(["0x1", "0x2"]);
  });
});

describe("whenText / balanceText", () => {
  it("dates a paid run by its block, in the viewer's zone", () => {
    expect(whenText(read("0x1", sum(1n), 1_790_145_433n), {}, "Asia/Ho_Chi_Minh")).toBe("23 Sep 2026, 13:37 GMT+7");
  });

  it("a sent run waiting for its receipt is Sending…; anything else undated is —", () => {
    expect(whenText({ txHash: "0x1", state: "not_found" }, { awaitingReceipt: true })).toBe("Sending…");
    expect(whenText({ txHash: "0x1", state: "not_found" }, {})).toBe("—");
    expect(whenText(read("0x1", sum(1n)), {})).toBe("—");
    expect(whenText({ txHash: "0x1", state: "reverted" }, {})).toBe("—");
  });

  it("a wallet figure in the token's decimals, or — when it could not be read", () => {
    expect(balanceText(36_807_197n, T.USDC, META[T.USDC.toLowerCase()]!)).toBe("36.807197 USDC");
    expect(balanceText(undefined, T.USDC, META[T.USDC.toLowerCase()]!)).toBe("— USDC");
    expect(balanceText(undefined, T.USDC, {})).toBe("— 0x3600…0000");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @ledgerline/web exec vitest run test/dashboard-view.test.ts`
Expected: FAIL. `runStatus`, `inMonth` and the others are not exported, so the calls throw `is not a function`.

- [ ] **Step 3: Implement in `frontend/lib/dashboard-view.ts`**

Replace the two import lines at the top with:

```ts
import { paidByToken, type Address, type TokenTotal } from "@ledgerline/core";
import type { Coverage, RunRead } from "@/lib/run-reads";
import type { RunRecord } from "@/lib/history";
import { amountText, type TokenMeta } from "@/lib/token-meta";
import { paidAtText } from "@/lib/receipt-view";
import { short } from "@/lib/chain";
```

Move the attention note out of `coverageView` into a helper that both use. Replace the `const attentionNote = …;` statement inside `coverageView` with `const note = attentionNote(c.attention.length);`. Then rename `attentionNote` to `attentionNote: note` in its three `return` objects. Add above `coverageView`:

```ts
// An attention run's clean payments are still counted — only its broken
// payment is left out (parent spec §4.2). The copy must not read as "the
// whole run is excluded" (Important 1).
function attentionNote(n: number): string | undefined {
  if (n === 0) return undefined;
  return n === 1
    ? "1 run has a payment that needs a look. That payment is left out of the totals; the run's other payments are counted."
    : `${n} runs have a payment that needs a look. Those payments are left out of the totals; the runs' other payments are counted.`;
}
```

Append to the end of the file:

```ts
export type StatusColor = "success" | "warning" | "error" | "default";

/** A run's status in the payer's words (spec §3.3). "Read" used to mean paid. */
export function runStatus(read: RunRead, record: Pick<RunRecord, "awaitingReceipt">): { label: string; color: StatusColor } {
  switch (read.state) {
    case "read": return { label: "Paid", color: "success" };
    case "attention": {
      const n = read.summary.identityBroken;
      return { label: n === 1 ? "Check one payment" : `Check ${n} payments`, color: "warning" };
    }
    case "not_found":
      return record.awaitingReceipt ? { label: "Waiting", color: "default" } : { label: "Not found", color: "default" };
    case "reverted": return { label: "Didn't go through", color: "error" };
    case "unreadable": return { label: "Couldn't check", color: "warning" };
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/** True when a block's timestamp falls in `now`'s calendar month, in the
 *  viewer's own time zone (spec decision 2). */
export function inMonth(paidAt: bigint, now: Date): boolean {
  const d = new Date(Number(paidAt) * 1000);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** "September 2026": the heading over the month's tiles. */
export function monthTitle(now: Date): string {
  return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

type Counted = Extract<RunRead, { state: "read" | "attention" }>;
const counted = (reads: RunRead[]): Counted[] =>
  reads.filter((r): r is Counted => r.state === "read" || r.state === "attention");

/** This month's totals per token, from runs whose block is dated this month.
 *  A read run with no date is counted in `undated`, never guessed into a month. */
export function paidThisMonth(reads: RunRead[], tokens: Address[], now: Date): { totals: TokenTotal[]; undated: number } {
  const all = counted(reads);
  const dated = all.filter((r) => r.paidAt !== undefined);
  return {
    totals: paidByToken(dated.filter((r) => inMonth(r.paidAt!, now)).map((r) => r.summary), tokens),
    undated: all.length - dated.length,
  };
}

/** The all-time line under the tiles: tokens actually paid, in tile order. */
export function allTimeLine(reads: RunRead[], tokens: Address[], meta: Record<string, TokenMeta>): string {
  const paid = paidByToken(counted(reads).map((r) => r.summary), tokens).filter((t) => t.value > 0n);
  return paid.length
    ? paid.map((t) => amountText(t.value, t.token, meta[t.token.toLowerCase()] ?? {})).join(" · ")
    : "nothing yet";
}

export interface CoverageLine {
  text: string;
  /** No run could be read: a 0 on a tile would be a claim, so show "—". */
  tilesBlank: boolean;
}

/** The plain line under the totals (spec §3.3). Retry lives in Needs you, so
 *  this line only says what the figures stand on. */
export function coverageLine(c: Coverage, undated: number, networkName: string, now: Date): CoverageLine {
  if (c.total > 0 && c.covered === 0) {
    return { tilesBlank: true, text: `None of the ${runs(c.total)} could be read, so there are no totals to show.` };
  }
  const parts = [c.total === 1
    ? `From the 1 run sent from this browser, read from Arc ${networkName}.`
    : `From ${c.total} runs sent from this browser, read from Arc ${networkName}.`];
  const m = c.missing.length;
  if (m > 0) parts.push(`${runs(m)} could not be read and ${m === 1 ? "is" : "are"} not counted.`);
  const month = MONTHS[now.getMonth()];
  if (undated > 0) {
    parts.push(undated === 1
      ? `1 run's date could not be read, so it is left out of ${month}.`
      : `${undated} runs' dates could not be read, so they are left out of ${month}.`);
  }
  const note = attentionNote(c.attention.length);
  if (note) parts.push(note);
  return { tilesBlank: false, text: parts.join(" ") };
}

/** The runs whose read may settle their history entry: successes only. A
 *  reverted run stays until the payer removes it (spec decision 4). */
export function toSettle(reads: RunRead[]): string[] {
  return counted(reads).map((r) => r.txHash);
}

/** The When column: the block's time, "Sending…" while a sent run waits for
 *  its receipt, otherwise "—". Never the browser's clock. */
export function whenText(read: RunRead, record: Pick<RunRecord, "awaitingReceipt">, timeZone?: string): string {
  if ((read.state === "read" || read.state === "attention") && read.paidAt !== undefined) {
    return paidAtText(read.paidAt, timeZone);
  }
  if (read.state === "not_found" && record.awaitingReceipt) return "Sending…";
  return "—";
}

/** One wallet figure: "12.4 USDC", or "— USDC" when its balance could not be read. */
export function balanceText(value: bigint | undefined, token: string, meta: TokenMeta): string {
  if (value === undefined) return `— ${meta.symbol || short(token)}`;
  return amountText(value, token, meta);
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `pnpm --filter @ledgerline/web exec vitest run test/dashboard-view.test.ts && pnpm --filter @ledgerline/web typecheck`
Expected: every test in the file passes, the old ones and the new ones, and `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/dashboard-view.ts frontend/test/dashboard-view.test.ts
git commit -m "feat(web): the dashboard's months, statuses and lines are pure functions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: What needs the payer, and how to get started

**Files:**
- Modify: `frontend/lib/dashboard-view.ts`
- Test: `frontend/test/dashboard-view.test.ts`, `frontend/test/plain-language.test.ts`

**Interfaces:**
- Consumes (Task 3): `runs`, `counted`, `coverageLine`, `runStatus`; `FAUCET_URL` from `@/lib/wallet-help`.
- Produces:
  - `const STALE_AFTER_MS = 600_000`
  - `type NeedKind = "reverted" | "waiting" | "attention" | "unreadable" | "balances" | "no_fee"`
  - `interface NeedItem { kind: NeedKind; key: string; text: string; txHash?: string; runLabel?: string }`
  - `needsYou(input: { records: RunRecord[]; reads: RunRead[] | undefined; balances: Record<string, bigint> | undefined; tokens: Address[]; usdc: Address; now: number }): NeedItem[] | undefined`
  - `interface FeeHelp { text: string; link?: { text: string; href: string } }`
  - `feeHelp(network: "mainnet" | "testnet"): FeeHelp`
  - `type StepState = "done" | "todo" | "unknown" | "loading"`
  - `interface SetupStep { key: "wallet" | "network" | "fees" | "first"; title: string; state: StepState }`
  - `setupSteps(input: { wrongChain: boolean; balances: Record<string, bigint> | undefined; usdc: Address; network: "mainnet" | "testnet" }): SetupStep[]`

- [ ] **Step 1: Write the failing tests**

In `frontend/test/dashboard-view.test.ts`, add these names to the `@/lib/dashboard-view` import: `needsYou, feeHelp, setupSteps, STALE_AFTER_MS`. Add:

```ts
import type { RunRecord } from "@/lib/history";
import { FAUCET_URL } from "@/lib/wallet-help";
```

Append:

```ts
describe("needsYou — what the payer has to do", () => {
  const PAYER = "0x5955000000000000000000000000000000000017";
  const T0 = new Date(2026, 8, 28, 14, 2).getTime(); // 14:02 local
  const record = (txHash: string, over: Partial<RunRecord> = {}): RunRecord => ({
    txHash, payer: PAYER, chainId: 5_042_002, runLabel: `Run ${txHash}`, seenAt: T0, itemCount: 1, ...over,
  });
  const FULL = { [T.USDC.toLowerCase()]: 5n, [T.EURC.toLowerCase()]: 0n, [T.cirBTC.toLowerCase()]: 0n };
  const base = { tokens: TOKENS, usdc: T.USDC as Address, now: T0 + 60_000 };

  it("says nothing until both the runs and the balances have been read", () => {
    const records = [record("0x1")];
    expect(needsYou({ ...base, records, reads: undefined, balances: FULL })).toBeUndefined();
    expect(needsYou({ ...base, records, reads: [read("0x1", sum(1n))], balances: undefined })).toBeUndefined();
  });

  it("an empty list when everything settled clean (an unpaid EURC balance is not a problem)", () => {
    expect(needsYou({ ...base, records: [record("0x1")], reads: [read("0x1", sum(1n))], balances: FULL })).toEqual([]);
  });

  it("a run that did not go through, named or unnamed", () => {
    const items = needsYou({ ...base, records: [record("0x1"), record("0x2", { runLabel: "" })],
      reads: [{ txHash: "0x1", state: "reverted" }, { txHash: "0x2", state: "reverted" }], balances: FULL })!;
    expect(items.map((i) => [i.kind, i.text, i.txHash])).toEqual([
      ["reverted", "Run 0x1 did not go through. No money moved.", "0x1"],
      ["reverted", "An unnamed run did not go through. No money moved.", "0x2"],
    ]);
  });

  it("a sent run with no receipt waits, then warns at exactly ten minutes", () => {
    const records = [record("0x1", { awaitingReceipt: true })];
    const reads: RunRead[] = [{ txHash: "0x1", state: "not_found" }];
    expect(needsYou({ ...base, records, reads, balances: FULL, now: T0 + STALE_AFTER_MS - 1 })![0]!.text)
      .toBe("Run 0x1 is waiting for the network (sent 14:02).");
    expect(needsYou({ ...base, records, reads, balances: FULL, now: T0 + STALE_AFTER_MS })![0]!.text).toBe(
      "Still no receipt for Run 0x1 after 10 minutes. Open your wallet's activity before sending this run again: " +
      "if it is still pending there, sending again could pay twice.");
  });

  it("a browser clock behind the recorded time still reads as waiting, never negative minutes", () => {
    const items = needsYou({ ...base, records: [record("0x1", { awaitingReceipt: true })],
      reads: [{ txHash: "0x1", state: "not_found" }], balances: FULL, now: T0 - 5 * 60_000 })!;
    expect(items[0]!.text).toBe("Run 0x1 is waiting for the network (sent 14:02).");
  });

  it("a missing receipt for a run not sent from here is not an item", () => {
    expect(needsYou({ ...base, records: [record("0x1")], reads: [{ txHash: "0x1", state: "not_found" }], balances: FULL }))
      .toEqual([]);
  });

  it("payments that need a look, in the singular and the plural", () => {
    const items = needsYou({ ...base, records: [record("0x1"), record("0x2")], balances: FULL, reads: [
      { txHash: "0x1", state: "attention", summary: sum(1n, 0n, 1) },
      { txHash: "0x2", state: "attention", summary: sum(1n, 0n, 2) },
    ] })!;
    expect(items.map((i) => i.text)).toEqual([
      "One payment in Run 0x1 needs a look.",
      "2 payments in Run 0x2 need a look.",
    ]);
  });

  it("unreadable runs make one item with their count", () => {
    const items = needsYou({ ...base, records: [record("0x1"), record("0x2")], balances: FULL, reads: [
      { txHash: "0x1", state: "unreadable", reason: "x" }, { txHash: "0x2", state: "unreadable", reason: "y" },
    ] })!;
    expect(items).toEqual([{ kind: "unreadable", key: "unreadable", text: "Couldn't reach Arc to check 2 runs." }]);
  });

  it("a balance that failed to read is not a zero: it asks for Retry, and never says No USDC", () => {
    const noUsdc = { [T.EURC.toLowerCase()]: 0n, [T.cirBTC.toLowerCase()]: 0n };
    const items = needsYou({ ...base, records: [record("0x1")], reads: [read("0x1", sum(1n))], balances: noUsdc })!;
    expect(items.map((i) => i.kind)).toEqual(["balances"]);
    expect(items[0]!.text).toBe("Couldn't read this wallet's balances.");
  });

  it("no USDC at all means no fee can be paid", () => {
    const items = needsYou({ ...base, records: [record("0x1")], reads: [read("0x1", sum(1n))],
      balances: { ...FULL, [T.USDC.toLowerCase()]: 0n } })!;
    expect(items).toEqual([{ kind: "no_fee", key: "no_fee",
      text: "No USDC left for network fees. Arc takes its fee in USDC, so no run can be sent." }]);
  });

  it("orders by kind, then keeps the history's newest-first order within a kind", () => {
    const records = ["0x1", "0x2", "0x3", "0x4", "0x5"].map((h) => record(h, { awaitingReceipt: h === "0x3" }));
    const items = needsYou({ ...base, records, balances: { [T.USDC.toLowerCase()]: 0n }, reads: [
      { txHash: "0x1", state: "unreadable", reason: "x" },
      { txHash: "0x2", state: "attention", summary: sum(1n, 0n, 1) },
      { txHash: "0x3", state: "not_found" },
      { txHash: "0x4", state: "reverted" },
      { txHash: "0x5", state: "reverted" },
    ] })!;
    expect(items.map((i) => i.kind)).toEqual(["reverted", "reverted", "waiting", "attention", "unreadable", "balances", "no_fee"]);
    expect(items.slice(0, 2).map((i) => i.txHash)).toEqual(["0x4", "0x5"]);
  });

  it("matches a read to its record whatever the hash's case", () => {
    const items = needsYou({ ...base, records: [record("0xAB")], reads: [{ txHash: "0xab", state: "reverted" }], balances: FULL })!;
    expect(items[0]!.text).toBe("Run 0xAB did not go through. No money moved.");
  });
});

describe("feeHelp / setupSteps — getting a first run out", () => {
  it("testnet links the faucet; mainnet has words only, since no link is verified", () => {
    expect(feeHelp("testnet")).toEqual({ text: "Get free test USDC at", link: { text: "faucet.circle.com", href: FAUCET_URL } });
    expect(feeHelp("mainnet")).toEqual({ text: "Add USDC to this wallet on Arc mainnet." });
  });

  const usdc = T.USDC as Address;
  const states = (s: ReturnType<typeof setupSteps>) => s.map((x) => [x.key, x.state]);

  it("four steps, in order, with the network named", () => {
    const s = setupSteps({ wrongChain: false, balances: { [usdc.toLowerCase()]: 5n }, usdc, network: "testnet" });
    expect(s.map((x) => x.title)).toEqual(["Wallet connected", "On Arc testnet", "USDC for network fees", "Send your first run"]);
    expect(states(s)).toEqual([["wallet", "done"], ["network", "done"], ["fees", "done"], ["first", "todo"]]);
  });

  it("the wrong network and an empty wallet are to do", () => {
    const s = setupSteps({ wrongChain: true, balances: { [usdc.toLowerCase()]: 0n }, usdc, network: "mainnet" });
    expect(states(s).slice(1, 3)).toEqual([["network", "todo"], ["fees", "todo"]]);
  });

  it("fees are loading while balances are read, and unknown when USDC's read failed", () => {
    expect(setupSteps({ wrongChain: false, balances: undefined, usdc, network: "testnet" })[2]!.state).toBe("loading");
    expect(setupSteps({ wrongChain: false, balances: {}, usdc, network: "testnet" })[2]!.state).toBe("unknown");
  });
});
```

In `frontend/test/plain-language.test.ts`:
- Change the `@/lib/dashboard-view` import to:

```ts
import { coverageView, RUN_STATUS, needsYou, runStatus, feeHelp, setupSteps, coverageLine } from "@/lib/dashboard-view";
import type { RunRead } from "@/lib/run-reads";
import type { RunRecord } from "@/lib/history";
```

- Add `type Address` to the existing `@ledgerline/core` import list.
- Add this test right after the existing "the dashboard's coverage line and statuses" test:

```ts
  it("the dashboard's needs, steps, statuses and totals lines", () => {
    const now = new Date(2026, 8, 28, 14, 30).getTime();
    const rec = (txHash: string, over: Partial<RunRecord> = {}): RunRecord =>
      ({ txHash, payer: "0x1", chainId: 5_042_002, runLabel: "", seenAt: now - 60_000, itemCount: 1, ...over });
    const summary = (identityBroken: number) => ({ paid: new Map(), payments: 0, identityBroken });
    const reads: RunRead[] = [
      { txHash: "0x1", state: "reverted" },
      { txHash: "0x2", state: "not_found" },
      { txHash: "0x3", state: "not_found" },
      { txHash: "0x4", state: "attention", summary: summary(1) },
      { txHash: "0x5", state: "attention", summary: summary(2) },
      { txHash: "0x6", state: "unreadable", reason: "x" },
      { txHash: "0x7", state: "read", summary: summary(0) },
    ];
    const records = [rec("0x1"), rec("0x2", { awaitingReceipt: true }),
      rec("0x3", { awaitingReceipt: true, seenAt: now - 3_600_000 }), rec("0x4"), rec("0x5"), rec("0x6"), rec("0x7")];
    const usdc = tokensForChain(5_042_002).USDC as Address;
    const items = needsYou({ records, reads, balances: { [usdc.toLowerCase()]: 0n },
      tokens: [usdc, "0x0000000000000000000000000000000000000002"], usdc, now })!;
    expect(items.map((i) => i.kind)).toEqual(["reverted", "waiting", "waiting", "attention", "attention", "unreadable", "balances", "no_fee"]);
    for (const it of items) clean(it.text);
    for (const r of reads) {
      clean(runStatus(r, { awaitingReceipt: true }).label);
      clean(runStatus(r, {}).label);
    }
    for (const network of ["mainnet", "testnet"] as const) {
      clean(feeHelp(network).text);
      for (const s of setupSteps({ wrongChain: true, balances: {}, usdc, network })) clean(s.title);
    }
    clean(coverageLine({ total: 3, covered: 1, missing: ["0x1", "0x2"], attention: ["0x3"] }, 1, "testnet", new Date(now)).text);
    clean(coverageLine({ total: 2, covered: 0, missing: ["0x1", "0x2"], attention: [] }, 0, "testnet", new Date(now)).text);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @ledgerline/web exec vitest run test/dashboard-view.test.ts test/plain-language.test.ts`
Expected: FAIL. `needsYou`, `feeHelp` and `setupSteps` are not functions.

- [ ] **Step 3: Implement in `frontend/lib/dashboard-view.ts`**

Add to the imports:

```ts
import { FAUCET_URL } from "@/lib/wallet-help";
```

Append:

```ts
/** From this age, a run with no receipt gets the wording that stops a second
 *  payment (spec §3.3). Arc drops a fee under 20 Gwei without a word. */
export const STALE_AFTER_MS = 10 * 60_000;

export type NeedKind = "reverted" | "waiting" | "attention" | "unreadable" | "balances" | "no_fee";
export interface NeedItem { kind: NeedKind; key: string; text: string; txHash?: string; runLabel?: string }

const NEED_ORDER: NeedKind[] = ["reverted", "waiting", "attention", "unreadable", "balances", "no_fee"];

/** 14:02, from this browser's clock: wording only, never evidence. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * What the payer has to do, one item per thing, in the order of NEED_ORDER
 * and newest run first within a kind (spec §3.3). Undefined while the run
 * reads or the balance read have not settled: an all-clear shown before then
 * would be a claim the page cannot make.
 */
export function needsYou({ records, reads, balances, tokens, usdc, now }: {
  records: RunRecord[];
  reads: RunRead[] | undefined;
  /** Keyed by lowercased token; a token whose read failed is absent. */
  balances: Record<string, bigint> | undefined;
  tokens: Address[];
  usdc: Address;
  now: number;
}): NeedItem[] | undefined {
  if (!reads || !balances) return undefined;
  const byHash = new Map(records.map((r) => [r.txHash.toLowerCase(), r]));
  const items: NeedItem[] = [];
  let unreadable = 0;
  for (const read of reads) {
    const rec = byHash.get(read.txHash.toLowerCase());
    const label = rec?.runLabel || "an unnamed run";
    const about = { txHash: read.txHash, runLabel: rec?.runLabel ?? "" };
    if (read.state === "reverted") {
      items.push({ ...about, kind: "reverted", key: `reverted:${read.txHash}`,
        text: `${cap(label)} did not go through. No money moved.` });
    } else if (read.state === "not_found" && rec?.awaitingReceipt) {
      const age = now - rec.seenAt;
      items.push({ ...about, kind: "waiting", key: `waiting:${read.txHash}`, text: age < STALE_AFTER_MS
        ? `${cap(label)} is waiting for the network (sent ${clock(rec.seenAt)}).`
        : `Still no receipt for ${label} after ${Math.floor(age / 60_000)} minutes. Open your wallet's activity before sending this run again: if it is still pending there, sending again could pay twice.` });
    } else if (read.state === "attention") {
      const n = read.summary.identityBroken;
      items.push({ ...about, kind: "attention", key: `attention:${read.txHash}`, text: n === 1
        ? `One payment in ${label} needs a look.`
        : `${n} payments in ${label} need a look.` });
    } else if (read.state === "unreadable") {
      unreadable++;
    }
  }
  if (unreadable > 0) {
    items.push({ kind: "unreadable", key: "unreadable", text: `Couldn't reach Arc to check ${runs(unreadable)}.` });
  }
  if (tokens.some((t) => balances[t.toLowerCase()] === undefined)) {
    items.push({ kind: "balances", key: "balances", text: "Couldn't read this wallet's balances." });
  }
  if (balances[usdc.toLowerCase()] === 0n) {
    items.push({ kind: "no_fee", key: "no_fee",
      text: "No USDC left for network fees. Arc takes its fee in USDC, so no run can be sent." });
  }
  // Array.prototype.sort is stable, so the history's newest-first order holds within a kind.
  return items.sort((a, b) => NEED_ORDER.indexOf(a.kind) - NEED_ORDER.indexOf(b.kind));
}

export interface FeeHelp { text: string; link?: { text: string; href: string } }

/** Where USDC for fees comes from: the faucet on testnet. On mainnet no bridge
 *  or swap link is verified, so words only (non-tech spec §10). */
export function feeHelp(network: "mainnet" | "testnet"): FeeHelp {
  return network === "testnet"
    ? { text: "Get free test USDC at", link: { text: "faucet.circle.com", href: FAUCET_URL } }
    : { text: "Add USDC to this wallet on Arc mainnet." };
}

export type StepState = "done" | "todo" | "unknown" | "loading";
export interface SetupStep { key: "wallet" | "network" | "fees" | "first"; title: string; state: StepState }

/** State B's checklist (spec §3.2). `balances` undefined means still reading;
 *  USDC absent from it means its read failed. */
export function setupSteps({ wrongChain, balances, usdc, network }: {
  wrongChain: boolean;
  balances: Record<string, bigint> | undefined;
  usdc: Address;
  network: "mainnet" | "testnet";
}): SetupStep[] {
  const held = balances?.[usdc.toLowerCase()];
  const fees: StepState = !balances ? "loading" : held === undefined ? "unknown" : held > 0n ? "done" : "todo";
  return [
    { key: "wallet", title: "Wallet connected", state: "done" },
    { key: "network", title: `On Arc ${network}`, state: wrongChain ? "todo" : "done" },
    { key: "fees", title: "USDC for network fees", state: fees },
    { key: "first", title: "Send your first run", state: "todo" },
  ];
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `pnpm --filter @ledgerline/web exec vitest run test/dashboard-view.test.ts test/plain-language.test.ts && pnpm --filter @ledgerline/web typecheck`
Expected: every test in both files passes, and `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/dashboard-view.ts frontend/test/dashboard-view.test.ts frontend/test/plain-language.test.ts
git commit -m "feat(web): what needs the payer, and a first run's checklist, as pure functions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The page with runs: Needs you, wallet, month, recent runs

**Files:**
- Create: `frontend/app/(app)/dashboard/NeedsYou.tsx`, `WalletPanel.tsx`, `PaidTotals.tsx`, `RecentRuns.tsx`
- Rewrite: `frontend/app/(app)/dashboard/Dashboard.tsx`
- Modify: `frontend/app/styles/pages.css` (the `── dashboard ──` section)
- Modify: `frontend/lib/dashboard-view.ts` (delete `coverageView`, `CoverageView`, `RUN_STATUS`)
- Modify: `frontend/test/dashboard-view.test.ts`, `frontend/test/plain-language.test.ts`, `frontend/test/tape.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `readBalances`.
  - Task 2: `readRuns`, `RunRead`, `describeCoverage`.
  - Tasks 3–4: `needsYou`, `NeedItem`, `feeHelp`, `toSettle`, `runStatus`, `whenText`, `paidLine`, `excludedNote`, `paidThisMonth`, `allTimeLine`, `coverageLine`, `monthTitle`, `amountText`, `balanceText`, `TokenMeta`.
  - Also `useWallet()` → `{ net, wallet, connect, wrongChain, switching, switchToArc }`; `runsFor`, `settleRun`, `forgetRun`, `RunRecord`; `withNet`; `readTokenMeta`.
- Produces: the components' props, exactly as typed below. Task 6 adds `GetStarted` beside them.

- [ ] **Step 1: Point the guard tests at the new files, and drop the old functions' tests**

- In `frontend/test/tape.test.ts`, change `"../app/(app)/dashboard/Dashboard.tsx"` to `"../app/(app)/dashboard/PaidTotals.tsx"`.
- In `frontend/test/dashboard-view.test.ts`:
  - delete the `describe("coverageView — the line under the tiles", …)` and `describe("RUN_STATUS", …)` blocks;
  - remove `coverageView` and `RUN_STATUS` from the import.
- In `frontend/test/plain-language.test.ts`:
  - delete the whole `it("the dashboard's coverage line and statuses", …)` test;
  - remove `coverageView, RUN_STATUS` from the import.

Run: `pnpm --filter @ledgerline/web exec vitest run test/tape.test.ts`
Expected: FAIL on "a dashboard tile's token symbol is data, not a label", with `ENOENT … PaidTotals.tsx`.

- [ ] **Step 2: Delete the replaced functions from `frontend/lib/dashboard-view.ts`**

- Delete the `CoverageView` interface, the `coverageView` function and the `RUN_STATUS` const, with their doc comments.
- Keep `runs`, `attentionNote`, `excludedNote`, `paidLine`, `amountText` and `TokenMeta`.
- `Coverage` is still imported and used by `coverageLine`.

- [ ] **Step 3: Create `frontend/app/(app)/dashboard/NeedsYou.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Button, Skeleton } from "antd";
import Tape from "@/components/ui/Tape";
import { feeHelp, type NeedItem } from "@/lib/dashboard-view";

/** The top of the page: what the payer has to do, one action each (spec §3.3). */
export default function NeedsYou({ items, network, runHref, newRunHref, onRetry, onRemove }: {
  /** Undefined while any read is in flight: no all-clear before then. */
  items: NeedItem[] | undefined;
  network: "mainnet" | "testnet";
  runHref: (txHash: string, runLabel: string) => string;
  newRunHref: string;
  onRetry: () => void;
  onRemove: (txHash: string) => void;
}) {
  if (!items) {
    return (
      <Tape title="Needs you" state="feeding">
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      </Tape>
    );
  }
  if (items.length === 0) {
    return <Tape title="Needs you"><p className="all-clear">✓ Nothing needs you.</p></Tape>;
  }

  const fee = feeHelp(network);
  // One Retry re-reads everything, so it is offered once, on the first item that needs it.
  const firstRetry = items.find((i) => i.kind === "unreadable" || i.kind === "balances")?.key;
  const actions = (it: NeedItem) => {
    switch (it.kind) {
      case "reverted":
        return (
          <>
            <Link href={newRunHref}>Send again</Link>
            <button type="button" className="linkish" onClick={() => onRemove(it.txHash!)}>Remove</button>
          </>
        );
      case "waiting":
        return <Link href={runHref(it.txHash!, it.runLabel ?? "")}>Check</Link>;
      case "attention":
        return <Link href={runHref(it.txHash!, it.runLabel ?? "")}>Open</Link>;
      case "unreadable":
      case "balances":
        return it.key === firstRetry ? <Button size="small" onClick={onRetry}>Retry</Button> : null;
      case "no_fee":
        return fee.link
          ? <span>{fee.text} <a href={fee.link.href} target="_blank" rel="noreferrer">{fee.link.text}</a></span>
          : <span>{fee.text}</span>;
    }
  };

  return (
    <Tape title="Needs you">
      <ul className="needs">
        {items.map((it) => (
          <li key={it.key} className={`need is-${it.kind}`}>
            <span className="mark" aria-hidden="true">{it.kind === "reverted" ? "✗" : "!"}</span>
            <span className="need-text">{it.text}</span>
            <span className="need-actions">{actions(it)}</span>
          </li>
        ))}
      </ul>
    </Tape>
  );
}
```

- [ ] **Step 4: Create `frontend/app/(app)/dashboard/WalletPanel.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Skeleton } from "antd";
import type { Address } from "@ledgerline/core";
import Tape from "@/components/ui/Tape";
import { short } from "@/lib/chain";
import { balanceText, type TokenMeta } from "@/lib/dashboard-view";

/** What the paying wallet holds now, from balanceOf in each token's own
 *  decimals, beside the one action a payer comes back for (spec §3.3). */
export default function WalletPanel({ address, tokens, balances, meta, newRunHref }: {
  address: string;
  tokens: Address[];
  /** Keyed by lowercased token; absent = could not be read. Undefined while reading. */
  balances: Record<string, bigint> | undefined;
  meta: Record<string, TokenMeta> | undefined;
  newRunHref: string;
}) {
  return (
    <Tape title="Your wallet">
      <p className="wallet-addr"><span className="hex addr" title={address}>{short(address)}</span></p>
      <ul className="balances">
        {tokens.map((t) => (
          <li key={t}>
            {balances && meta
              ? balanceText(balances[t.toLowerCase()], t, meta[t.toLowerCase()] ?? {})
              : <Skeleton.Input active size="small" />}
          </li>
        ))}
      </ul>
      <p className="wallet-cta"><Link href={newRunHref} className="button-primary">New payout run</Link></p>
    </Tape>
  );
}
```

- [ ] **Step 5: Create `frontend/app/(app)/dashboard/PaidTotals.tsx` and `RecentRuns.tsx`**

`PaidTotals.tsx`:

```tsx
"use client";

import { Skeleton } from "antd";
import type { Address } from "@ledgerline/core";
import { Col } from "@/components/grid/Grid";
import StatTile from "@/components/ui/StatTile";
import { describeCoverage, type RunRead } from "@/lib/run-reads";
import {
  allTimeLine, amountText, coverageLine, monthTitle, paidThisMonth, type TokenMeta,
} from "@/lib/dashboard-view";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** This month's tiles, the all-time line and what they stand on (spec §3.3).
 *  Figures appear only once every read has settled, never a half-sum. */
export default function PaidTotals({ reads, tokens, meta, network, now }: {
  reads: RunRead[] | undefined;
  tokens: Address[];
  meta: Record<string, TokenMeta> | undefined;
  network: string;
  /** When the reads settled; undefined while they are in flight. */
  now: Date | undefined;
}) {
  const ready = reads && meta && now ? { reads, meta, now } : undefined;
  const month = ready ? paidThisMonth(ready.reads, tokens, ready.now) : undefined;
  const coverage = ready && month
    ? coverageLine(describeCoverage(ready.reads), month.undated, network, ready.now) : undefined;

  return (
    <>
      <Col span={12}>
        <h2 className="section-title">{now ? `Paid in ${monthTitle(now)}` : "Paid this month"}</h2>
      </Col>
      {tokens.map((token, i) => {
        const m = meta?.[token.toLowerCase()] ?? {};
        const t = month?.totals[i];
        return (
          <Col key={token} span={4} md={12}>
            <StatTile
              label={<span className="keep-case">{m.symbol || token.slice(0, 10)}</span>}
              value={!t ? <Skeleton.Input active /> : coverage?.tilesBlank ? "—" : amountText(t.value, token, m)}
              sub={t && !coverage?.tilesBlank ? `${plural(t.payments, "payment")} · ${plural(t.runs, "run")}` : undefined}
            />
          </Col>
        );
      })}
      <Col span={12}>
        {ready && !coverage?.tilesBlank && (
          <p className="all-time">
            All time, from runs sent from this browser: {allTimeLine(ready.reads, tokens, ready.meta)}
          </p>
        )}
        {coverage && <p className="coverage-line">{coverage.text}</p>}
      </Col>
    </>
  );
}
```

`RecentRuns.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Skeleton, Table, Tag, type TableColumnsType } from "antd";
import type { Address } from "@ledgerline/core";
import Tape from "@/components/ui/Tape";
import type { RunRecord } from "@/lib/history";
import type { RunRead } from "@/lib/run-reads";
import { excludedNote, paidLine, runStatus, whenText, type TokenMeta } from "@/lib/dashboard-view";

const RECENT = 5;

export default function RecentRuns({ records, reads, tokens, meta, runHref, allRunsHref }: {
  records: RunRecord[];
  reads: RunRead[] | undefined;
  tokens: Address[];
  meta: Record<string, TokenMeta> | undefined;
  runHref: (txHash: string, runLabel: string) => string;
  allRunsHref: string;
}) {
  const byHash = new Map((reads ?? []).map((r) => [r.txHash.toLowerCase(), r]));
  // A row fills in only when its amounts can be printed in the token's own decimals.
  const readOf = (r: RunRecord) => (meta ? byHash.get(r.txHash.toLowerCase()) : undefined);

  const columns: TableColumnsType<RunRecord> = [
    { title: "Run", dataIndex: "runLabel",
      render: (label: string) => label || <span style={{ color: "var(--ink-soft)" }}>unnamed</span> },
    { title: "When", key: "when", width: 210,
      render: (_, r) => {
        const read = readOf(r);
        return read ? whenText(read, r) : <Skeleton.Input active size="small" />;
      } },
    { title: "Paid", key: "paid",
      render: (_, r) => {
        const read = readOf(r);
        if (!read) return <Skeleton.Input active size="small" />;
        if (read.state === "read") return paidLine(read.summary.paid, tokens, meta!);
        // An attention run's figure leaves out its broken payments; say how
        // many, or it silently disagrees with the run's own page.
        if (read.state === "attention") {
          return `${paidLine(read.summary.paid, tokens, meta!)} · (${excludedNote(read.summary.identityBroken)})`;
        }
        return <span style={{ color: "var(--ink-soft)" }}>—</span>;
      } },
    { title: "Status", key: "status", width: 170,
      render: (_, r) => {
        const read = readOf(r);
        if (!read) return <Skeleton.Button active size="small" />;
        const s = runStatus(read, r);
        return <Tag color={s.color}>{s.label}</Tag>;
      } },
    { title: <span className="sr-only">Open</span>, key: "open", width: 80,
      render: (_, r) => <Link href={runHref(r.txHash, r.runLabel)}>Open</Link> },
  ];

  return (
    <Tape title="Recent runs">
      <Table<RunRecord>
        columns={columns}
        dataSource={records.slice(0, RECENT).map((r) => ({ ...r, key: r.txHash }))}
        pagination={false}
        size="middle"
        scroll={{ x: "max-content" }}
      />
      <p style={{ marginTop: 12, marginBottom: 0 }}><Link href={allRunsHref}>All runs →</Link></p>
    </Tape>
  );
}
```

- [ ] **Step 6: Rewrite `frontend/app/(app)/dashboard/Dashboard.tsx`**

The two early returns for "no wallet" and "no records" are today's markup, unchanged here. Task 6 replaces them.

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "antd";
import { tokensForChain, type Address } from "@ledgerline/core";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Grid, Col } from "@/components/grid/Grid";
import Tape from "@/components/ui/Tape";
import OpenRunByHash from "@/components/OpenRunByHash";
import { runsFor, settleRun, forgetRun, type RunRecord } from "@/lib/history";
import { readRuns, type RunRead } from "@/lib/run-reads";
import { readBalances } from "@/lib/balances";
import { readTokenMeta } from "@/lib/token-meta";
import { needsYou, toSettle, type TokenMeta } from "@/lib/dashboard-view";
import { withNet } from "@/lib/nav";
import NeedsYou from "./NeedsYou";
import WalletPanel from "./WalletPanel";
import PaidTotals from "./PaidTotals";
import RecentRuns from "./RecentRuns";

// Each read is tagged with the inputs it was read for. Render trusts only a
// result whose tag matches this render's own inputs, so a read for a
// superseded wallet, network or Retry is never painted, not even for one
// frame: a route/search-param change is a transition, and effects after a
// transition flush after paint, so clearing state in an effect is too late.
interface RunsRead { records: RunRecord[]; attempt: number; reads: RunRead[]; at: number }
interface BalancesRead { owner: string; chainId: number; attempt: number; balances: Record<string, bigint> }
interface MetaRead { chainId: number; attempt: number; meta: Record<string, TokenMeta> }

export default function Dashboard() {
  const { net, wallet, connect } = useWallet();
  const search = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  // Bumped by Remove, so the history is read again without a reload.
  const [version, setVersion] = useState(0);
  const [runsRead, setRunsRead] = useState<RunsRead>();
  const [balancesRead, setBalancesRead] = useState<BalancesRead>();
  const [metaRead, setMetaRead] = useState<MetaRead>();

  const records = useMemo<RunRecord[]>(
    () => (wallet ? runsFor(wallet.address, net.chain.id) : []),
    // `version` is not read inside: it only forces a fresh read of the history.
    [wallet, net.chain.id, version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const tokens = useMemo(() => Object.values(tokensForChain(net.chain.id)) as Address[], [net.chain.id]);
  const usdc = tokensForChain(net.chain.id).USDC as Address;

  useEffect(() => {
    if (records.length === 0 || !wallet) return;
    const payer = wallet.address as Address;
    let cancelled = false;
    void readRuns(records, payer, net).then((reads) => {
      // A run recorded at broadcast settles once its receipt shows it paid.
      // A reverted one stays for the payer to see and remove (spec decision 4).
      for (const h of toSettle(reads)) settleRun(h, payer, net.chain.id, "success");
      if (!cancelled) setRunsRead({ records, attempt, reads, at: Date.now() });
    });
    return () => { cancelled = true; };
  }, [records, wallet, net, attempt]);

  useEffect(() => {
    if (!wallet) return;
    const owner = wallet.address as Address;
    let cancelled = false;
    void readBalances(net, owner, tokens).then((balances) => {
      if (!cancelled) setBalancesRead({ owner, chainId: net.chain.id, attempt, balances });
    });
    return () => { cancelled = true; };
  }, [wallet, net, tokens, attempt]);

  useEffect(() => {
    let cancelled = false;
    void readTokenMeta(net.defaultRpc, net.chain, net.chain.id)
      .then(({ decimals, symbols }) => Object.fromEntries(
        Object.keys(decimals).map((k) => [k, { decimals: decimals[k], symbol: symbols[k] }]),
      ) as Record<string, TokenMeta>)
      // Unreadable metadata prints raw integers, never guessed decimals.
      .catch(() => ({} as Record<string, TokenMeta>))
      .then((meta) => { if (!cancelled) setMetaRead({ chainId: net.chain.id, attempt, meta }); });
    return () => { cancelled = true; };
  }, [net, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const remove = useCallback((txHash: string) => {
    if (!wallet) return;
    forgetRun(txHash, wallet.address, net.chain.id);
    setVersion((v) => v + 1);
  }, [wallet, net.chain.id]);

  if (!wallet) {
    return (
      <Grid>
        <Col span={12}>
          <Tape>
            <section className="verdict">
              <h2>Your payouts at a glance</h2>
              <p>
                Connect the wallet that paid them. This overview is built from runs sent from
                this browser and re-read from the chain.
              </p>
            </section>
            <Button type="primary" style={{ marginTop: 20 }} onClick={connect}>Connect a wallet</Button>
            <OpenRunByHash network={net.name} />
          </Tape>
        </Col>
      </Grid>
    );
  }

  // The tag checks (Review Focus 1): each read is trusted only for the
  // wallet, network, history and attempt it was read for.
  const balances = balancesRead
    && balancesRead.owner.toLowerCase() === wallet.address.toLowerCase()
    && balancesRead.chainId === net.chain.id && balancesRead.attempt === attempt
    ? balancesRead.balances : undefined;
  const meta = metaRead && metaRead.chainId === net.chain.id && metaRead.attempt === attempt
    ? metaRead.meta : undefined;
  const runs = runsRead && runsRead.records === records && runsRead.attempt === attempt ? runsRead : undefined;

  if (records.length === 0) {
    return (
      <Grid>
        <Col span={12}>
          <Tape>
            <section className="verdict">
              <h2>Nothing sent from this browser yet</h2>
              <p>
                A run sent from another browser is still on chain. Open it from the explorer or by
                its transaction hash.
              </p>
            </section>
            <p style={{ marginTop: 20, marginBottom: 0 }}>
              <Link href={withNet("/new", search)} className="button-primary">Create a payout run</Link>
            </p>
            <OpenRunByHash network={net.name} />
          </Tape>
        </Col>
      </Grid>
    );
  }

  const items = needsYou({ records, reads: runs?.reads, balances, tokens, usdc, now: runs?.at ?? 0 });
  const runHref = (txHash: string, runLabel: string) =>
    `/run/${txHash}?n=${net.name}&label=${encodeURIComponent(runLabel)}`;

  return (
    <Grid>
      <Col span={12}>
        <NeedsYou items={items} network={net.name} runHref={runHref}
          newRunHref={withNet("/new", search)} onRetry={retry} onRemove={remove} />
      </Col>
      <Col span={12}>
        <WalletPanel address={wallet.address} tokens={tokens} balances={balances} meta={meta}
          newRunHref={withNet("/new", search)} />
      </Col>
      <PaidTotals reads={runs?.reads} tokens={tokens} meta={meta} network={net.name}
        now={runs ? new Date(runs.at) : undefined} />
      <Col span={12}>
        <RecentRuns records={records} reads={runs?.reads} tokens={tokens} meta={meta}
          runHref={runHref} allRunsHref={withNet("/runs", search)} />
      </Col>
    </Grid>
  );
}
```

`balances` and `meta` are computed before the no-records return on purpose: Task 6's Get started needs `balances` there. `tsconfig.base.json` has no `noUnusedLocals`, so `balances` going unused in that branch until Task 6 is not an error.

- [ ] **Step 7: Style the sections in `frontend/app/styles/pages.css`**

Replace the `── dashboard ──` section (today one rule, `.coverage-line`) with:

```css
/* ── dashboard ────────────────────────────────────────────────────────── */
.coverage-line { margin: 0; color: var(--ink-soft); }
.all-time { margin: 0 0 4px; }
.all-clear { margin: 0; }
.section-title {
  margin: 10px 0 0;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%;
  font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
}
.needs, .setup, .balances { list-style: none; margin: 0; padding: 0; }
.needs li, .setup li {
  display: flex; gap: 10px; align-items: baseline;
  padding: 8px 0; border-top: 1.5px dotted var(--rule);
}
.needs li:last-child, .setup li:last-child { border-bottom: 1.5px dotted var(--rule); }
:is(.needs, .setup) .mark {
  width: 1.2rem; flex: none; text-align: center;
  font-family: var(--font-mono), ui-monospace, monospace;
}
/* Colour marks exceptions only: the ribbon for money that did not move,
   the highlighter for anything left to do. */
.need.is-reverted .mark { color: var(--ribbon); }
.need:not(.is-reverted) .mark, .setup :is(.is-todo, .is-unknown) .mark {
  background: var(--highlight); color: var(--on-highlight);
}
.need-text, .setup-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.need-actions, .setup-actions { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; }
.need-actions { flex: none; }
.setup-body { display: block; margin-top: 4px; color: var(--ink-soft); }
.balances {
  display: flex; flex-wrap: wrap; gap: 6px 28px; margin-top: 6px;
  font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%; font-size: 17px;
}
.wallet-addr { margin: 0; color: var(--ink-soft); }
.wallet-cta { margin: 18px 0 0; }
@media (max-width: 639px) {
  .needs li { flex-wrap: wrap; }
  .need-actions { flex-basis: 100%; padding-left: calc(1.2rem + 10px); }
}
```

- [ ] **Step 8: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every package passes, `frontend test` shows 0 failed, and `tsc` prints no errors.

Run: `grep -rn "coverageView\|RUN_STATUS" frontend/app frontend/lib frontend/test`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add 'frontend/app/(app)/dashboard' frontend/app/styles/pages.css frontend/lib/dashboard-view.ts \
  frontend/test/dashboard-view.test.ts frontend/test/plain-language.test.ts frontend/test/tape.test.ts
git commit -m "feat(web): the dashboard opens on what needs the payer, then their wallet, month and runs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Get started, and the no-wallet line

**Files:**
- Create: `frontend/app/(app)/dashboard/GetStarted.tsx`
- Modify: `frontend/app/(app)/dashboard/Dashboard.tsx` (the two early returns, and the `useWallet` line)
- Modify: `ARCHITECTURE.md:160`

**Interfaces:**
- Consumes:
  - `setupSteps`, `SetupStep`, `feeHelp` (Task 4);
  - `sampleCsvHref()` from `@/lib/sample-csv`;
  - `realFundsNotice(net)?.tryHref` from `@/lib/network-notice`;
  - `useWallet()` → `wrongChain`, `switching`, `switchToArc`.
- Produces: `GetStarted` props, exactly as typed below.

- [ ] **Step 1: Create `frontend/app/(app)/dashboard/GetStarted.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Button, Skeleton } from "antd";
import type { Address } from "@ledgerline/core";
import Tape from "@/components/ui/Tape";
import OpenRunByHash from "@/components/OpenRunByHash";
import { short } from "@/lib/chain";
import { sampleCsvHref } from "@/lib/sample-csv";
import { feeHelp, setupSteps, type SetupStep } from "@/lib/dashboard-view";

const MARK: Record<SetupStep["state"], string> = { done: "✓", todo: "✗", unknown: "?", loading: "…" };
const SAID: Record<SetupStep["state"], string> = { done: "done", todo: "to do", unknown: "not known", loading: "checking" };

/** A wallet and no runs yet: what is still needed, one action each (spec §3.2). */
export default function GetStarted({
  address, network, wrongChain, switching, balances, usdc, newRunHref, tryTestnetHref, onSwitch, onRetry,
}: {
  address: string;
  network: "mainnet" | "testnet";
  wrongChain: boolean;
  switching: boolean;
  /** Undefined while reading; USDC absent = its read failed. */
  balances: Record<string, bigint> | undefined;
  usdc: Address;
  newRunHref: string;
  /** Mainnet only: the same flow on testnet, where nothing has value. */
  tryTestnetHref: string | undefined;
  onSwitch: () => void;
  onRetry: () => void;
}) {
  const fee = feeHelp(network);
  const body = (s: SetupStep) => {
    switch (s.key) {
      case "wallet":
        return <span className="hex addr" title={address}>{short(address)}</span>;
      case "network":
        return s.state === "todo"
          ? <Button size="small" loading={switching} onClick={onSwitch}>Switch to Arc {network}</Button>
          : null;
      case "fees":
        if (s.state === "loading") return <Skeleton.Input active size="small" />;
        if (s.state === "unknown") {
          return <>Couldn&apos;t read this wallet&apos;s balance. <Button size="small" onClick={onRetry}>Retry</Button></>;
        }
        if (s.state === "done") return "Arc takes its network fee in USDC.";
        return (
          <>
            Arc takes its network fee in USDC. {fee.text}
            {fee.link && <> <a href={fee.link.href} target="_blank" rel="noreferrer">{fee.link.text}</a></>}
          </>
        );
      case "first":
        return (
          <span className="setup-actions">
            <Link href={newRunHref} className="button-primary">Create a payout run</Link>
            <a href={sampleCsvHref()} download="ledgerline-sample.csv">Download the sample file</a>
            {tryTestnetHref && <Link href={tryTestnetHref}>Try it on testnet first</Link>}
          </span>
        );
    }
  };

  return (
    <Tape title="Get started">
      <ol className="setup">
        {setupSteps({ wrongChain, balances, usdc, network }).map((s) => (
          <li key={s.key} className={`is-${s.state}`}>
            <span className="mark" aria-hidden="true">{MARK[s.state]}</span>
            <span className="setup-text">
              <strong>{s.title}</strong> <span className="sr-only">({SAID[s.state]})</span>
              <span className="setup-body">{body(s)}</span>
            </span>
          </li>
        ))}
      </ol>
      <OpenRunByHash network={network} />
    </Tape>
  );
}
```

- [ ] **Step 2: Use it in `Dashboard.tsx`**

Change the `useWallet` line to:

```tsx
  const { net, wallet, connect, wrongChain, switching, switchToArc } = useWallet();
```

Add imports:

```tsx
import { realFundsNotice } from "@/lib/network-notice";
import GetStarted from "./GetStarted";
```

Replace the whole `if (records.length === 0) { … }` block with:

```tsx
  if (records.length === 0) {
    return (
      <Grid>
        <Col span={12}>
          <GetStarted address={wallet.address} network={net.name} wrongChain={wrongChain} switching={switching}
            balances={balances} usdc={usdc} newRunHref={withNet("/new", search)}
            tryTestnetHref={realFundsNotice(net)?.tryHref}
            onSwitch={() => void switchToArc()} onRetry={retry} />
        </Col>
      </Grid>
    );
  }
```

In the `if (!wallet)` block, add this line right after the closing `</section>` of the verdict:

```tsx
            <p style={{ marginTop: 12, marginBottom: 0 }}>
              You need a browser wallet (MetaMask or Rabby) and a little USDC on Arc for network fees.
            </p>
```

`Link` is no longer used in `Dashboard.tsx`. Remove `import Link from "next/link";`.

- [ ] **Step 3: Update `ARCHITECTURE.md:160`**

Replace the `/dashboard`, `/runs` row with:

```markdown
| `/dashboard`, `/runs` | The connected wallet's runs from `localStorage`, each re-read from the chain. Up to four receipt reads at a time, with a 10-second timeout per read. The dashboard also reads each run's block time (4-second timeout) and the wallet's `balanceOf` per token |
```

- [ ] **Step 4: Run the whole suite and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: every package passes, and `tsc` prints no errors.

- [ ] **Step 5: Commit**

```bash
git add 'frontend/app/(app)/dashboard' ARCHITECTURE.md
git commit -m "feat(web): a wallet with no runs gets a Get started checklist" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Drive it in a real browser (spec §6.2)

The build, typecheck and tests say nothing about the wallet seam. Drive the page with the Playwright MCP against `next start`, with a keyless stand-in wallet. No money moves.

Known testnet facts, measured 2026-09-28:
- The run `0x0914b2ee684e1b84dd1227a21899335098cb9ecdcd7dee7366f1e9b159a13de0`:
  - paid by `0x595558b91dfaa97840f2f00bf6728a74b8e6de17`;
  - status success, block 63549920;
  - block timestamp `1790145433` (2026-09-23 06:37:13 UTC);
  - pays 0.1 USDC and 0.1 EURC.
- That wallet held 36.807197 USDC (`balanceOf`) at the time. Re-read it with `eth_call` before comparing.

**Files:** none changed unless a check fails. A fix goes back into the task that owns the code, with its own test where one can hold it.

- [ ] **Step 1: Build and start**

Run: `pnpm build && (cd frontend && pnpm exec next start -p 3100)`, with `run_in_background: true`.
Expected: `Ready` on `http://localhost:3100`.

- [ ] **Step 2: A stand-in wallet and a seeded history**

With `browser_run_code_unsafe`, before the first navigation:

```js
async (page) => {
  await page.context().addInitScript(() => {
    const ADDR = "0x595558b91dfaa97840f2f00bf6728a74b8e6de17";
    const provider = {
      request: async ({ method }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDR];
        if (method === "eth_chainId") return window.__walletChain ?? "0x4cef52"; // 5042002
        if (method === "wallet_switchEthereumChain") { window.__walletChain = "0x4cef52"; return null; }
        if (method === "wallet_revokePermissions") return null;
        throw Object.assign(new Error("not used by this check"), { code: 4200 });
      },
      on() {}, removeListener() {},
    };
    const detail = Object.freeze({
      info: { uuid: "0c1d-dashboard-check", name: "Check wallet", rdns: "local.ledgerline.check",
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" },
      provider,
    });
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  });
}
```

Navigate to `http://localhost:3100/dashboard?n=testnet`. Then seed the history and reload:

```js
async (page) => {
  const ADDR = "0x595558b91dfaa97840f2f00bf6728a74b8e6de17";
  await page.evaluate((ADDR) => {
    const now = Date.now();
    localStorage.setItem("ledgerline:runs:v1", JSON.stringify({ [`${ADDR}:5042002`]: [
      { txHash: "0x" + "cd".repeat(32), payer: ADDR, chainId: 5042002, runLabel: "Failed run",
        seenAt: now - 5 * 60_000, itemCount: 1, awaitingReceipt: true },
      { txHash: "0x" + "ab".repeat(32), payer: ADDR, chainId: 5042002, runLabel: "Stuck run",
        seenAt: now - 25 * 60_000, itemCount: 1, awaitingReceipt: true },
      { txHash: "0x0914b2ee684e1b84dd1227a21899335098cb9ecdcd7dee7366f1e9b159a13de0", payer: ADDR,
        chainId: 5042002, runLabel: "Payroll 2026-09", seenAt: 1790145433000, itemCount: 2 },
    ] }));
  }, ADDR);
  // The "Failed run" hash has no transaction: answer its receipt as reverted.
  await page.route(/arc-testnet\.drpc\.org/, async (route) => {
    const body = route.request().postDataJSON();
    if (body?.method === "eth_getTransactionReceipt" && body.params?.[0] === "0x" + "cd".repeat(32)) {
      return route.fulfill({ json: { jsonrpc: "2.0", id: body.id, result: {
        transactionHash: "0x" + "cd".repeat(32), transactionIndex: "0x0", blockHash: "0x" + "11".repeat(32),
        blockNumber: "0x3c9b3e0", from: ADDR, to: "0x522faf9a91c41c443c66765030741e4aace147d0",
        cumulativeGasUsed: "0x5208", gasUsed: "0x5208", effectiveGasPrice: "0x5d21dba00",
        contractAddress: null, logs: [], logsBloom: "0x" + "00".repeat(256), status: "0x0", type: "0x2",
      } } });
    }
    return route.continue();
  });
  await page.reload();
}
```

Click **Connect a wallet** and choose "Check wallet" if the picker opens.

- [ ] **Step 3: State C, read against the chain**

`browser_snapshot` once the skeletons are gone. Expected:
- **Needs you**, in this order:
  - "Failed run did not go through. No money moved." with Send again and Remove;
  - "Still no receipt for Stuck run after 25 minutes. Open your wallet's activity…" with Check.
- There is no all-clear line.
- **Your wallet** shows the USDC figure equal to a fresh `balanceOf` at 6 decimals. Read it with:
  `curl -s -X POST https://arc-testnet.drpc.org -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x3600000000000000000000000000000000000000","data":"0x70a08231000000000000000000000000595558b91dfaa97840f2f00bf6728a74b8e6de17"},"latest"]}'`
  Then divide the hex result by 10^6.
- **Paid in September 2026**: USDC `0.1`, EURC `0.1`, cirBTC `0`. The sub-line on USDC reads "1 payment · 1 run".
- Open `/run/0x0914b2ee…3de0?n=testnet` in a new tab: its paid amounts are 0.1 USDC and 0.1 EURC. They match.
- **Recent runs**:
  - "Payroll 2026-09" shows When = the browser zone's rendering of 1790145433, e.g. "23 Sep 2026, 13:37 GMT+7", and Status **Paid**;
  - "Stuck run" shows "Sending…" and **Waiting**;
  - "Failed run" shows **Didn't go through**.
- The coverage line reads "From 3 runs sent from this browser, read from Arc testnet. 1 run could not be read and is not counted." The stuck run is `not_found`, which the page counts as missing.

`browser_console_messages`: expected no errors.

- [ ] **Step 4: Remove, and the all-clear**

Click **Remove** on "Failed run". Expected:
- the item leaves without a reload;
- `localStorage["ledgerline:runs:v1"]` no longer holds `0xcdcd…`.

Then seed only the Payroll run and reload. Expected: "✓ Nothing needs you." appears only after the wallet figures appear, never before them. Check with a `MutationObserver` that pushes the order in which `.all-clear` and the first `.balances li` text appear, and compare the sequence.

- [ ] **Step 5: RPC down, then Retry**

```js
async (page) => { await page.unroute(/arc-testnet\.drpc\.org/); await page.route(/arc-testnet\.drpc\.org/, (r) => r.abort()); await page.reload(); }
```

Expected:
- Needs you shows "Couldn't reach Arc to check 1 run." and "Couldn't read this wallet's balances.";
- there is **exactly one** Retry button: `document.querySelectorAll('.needs button').length` counts only Retry here, so it is 1;
- there is no all-clear, and the tiles show "—".

Then `await page.unroute(/arc-testnet\.drpc\.org/)` and click Retry. Expected: the figures fill in and the all-clear appears.

- [ ] **Step 6: State B and state A**

- **State B.** Clear the history (`localStorage.removeItem("ledgerline:runs:v1")`) and reload. Expected: Get started shows four steps:
  - "Wallet connected" ✓ with `0x5955…de17`;
  - "On Arc testnet" ✓;
  - "USDC for network fees" ✓;
  - "Send your first run", with Create, Download the sample file and no testnet link, since this is testnet.
- **Wrong network.** Set `window.__walletChain = "0x13b2"` (mainnet) and reconnect. Expected: step 2 is ✗ with "Switch to Arc testnet".
- **State A.** Open a **new browser context without the init script**. Expected: "Your payouts at a glance", the new sentence about a browser wallet and USDC, and Connect.

- [ ] **Step 7: Accessibility and overflow, in both themes**

For states A, B and C, in Light and in Dark (the theme toggle in the side nav):
- Inject `.playwright-mcp/axe.min.js` with `page.addScriptTag({ path })`. Run `axe.run()`. Expected: no violation with impact `serious` or `critical`.
- At widths 390, 768 and 1280: `document.documentElement.scrollWidth === document.documentElement.clientWidth`.

- [ ] **Step 8: Record, clean up, commit any fixes**

- Write what each step showed into the session scratchpad. Include every failure and the fix it got, in the task that owns the code.
- Clean up: `find .playwright-mcp -maxdepth 1 -type f ! -name axe.min.js -delete`.
- Stop the `next start` background process.
- If fixes were made, run `pnpm test && pnpm typecheck` again, and commit each fix separately in the repo's style.
