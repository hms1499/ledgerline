# Redesign, part 2: `/dashboard`

The payer's home page: what they have paid, per token, and their most recent
runs, with every figure re-read from the chain.

**Parent specs:**
- `2026-09-23-redesign-shell-design.md` (part 1: shell, grid, tokens; §2
  defines this part, and §6.2 gives the column plan)
- `2026-09-21-ledgerline-design.md` (product, chain constraints)

This part changes one route, `/dashboard`, and adds two pure functions to
core. The payout sequence and the other pages do not change.

---

## 1. Decisions already made

| Question | Decision |
|---|---|
| What the page is for | **An overview of what has been paid.** Per-token totals and recent runs. It is not a health check or a launcher |
| Period the totals cover | **Every run this browser recorded** for the connected wallet on the current network. `lib/history.ts` keeps at most 50 per payer and chain. No month picker |
| Where the figures come from | **Re-read from the chain on every visit** (approach A). Each recorded run's receipt is fetched by its txHash. Nothing about amounts is cached or stored |
| Rejected: cache receipts by txHash | Adds a second derived store and refresh logic for ≤ 50 cheap reads. YAGNI |
| Rejected: store amounts at send time | Figures would come from the browser, not the chain, which breaks invariant 1 |

## 2. Principles this page must not break

- **Invariant 1.** Chain reads by *known* txHash only. The history list only
  says *which* hashes to read; it never supplies an amount. No
  `eth_getLogs`, no searching of history (`CLAUDE.md`, `eth_getLogs` limits).
- **Invariant 5.** Totals come from emitted `Transfer` values, joined to their
  memo. They never come from requested amounts. The system emitter
  `0xffff…fFfE` is ignored, so USDC is not doubled and EURC/cirBTC are not
  halved.
- **Never pooled.** One figure per token. There is no fiat conversion and no
  grand total, because a price would need an oracle the reader cannot verify.
- **A partial total is never shown as complete.** If any run could not be
  read, the page says so next to the totals.

## 3. What the page shows

Layout at `lg` follows part 1 §6.2: stat tiles 4/4/4, runs table 12, empty
state 12. At `md` and `sm` every column becomes full width (`md={12}`), in
the same order.

### 3.1 States

1. **No wallet connected.** A verdict block: "Your payouts at a glance". Body
   text: "Connect the wallet that paid them. This overview is built from
   runs sent from this browser and re-read from the chain." It also has a
   Connect button that calls the provider's `connect`. The history is keyed
   by payer, so without a wallet there is nothing to total.
2. **Connected, no recorded runs.** An empty state, 12 columns: "Nothing
   sent from this browser yet", a **Create a payout run** link (keeping
   `?n=`), and one sentence: "A run sent from another browser is still on
   chain. Open it from the explorer or by its transaction hash."
3. **Connected, runs recorded.** The tiles, the coverage line and the recent
   runs table (§3.2–3.4). While reads are in flight, the tiles and table rows
   show antd `Skeleton`s. Figures appear only when every read has settled,
   never incrementally, so a half-summed number is never on screen.
4. **Wallet on the wrong chain.** Same as 3. Reads go through the RPC of the
   network in the URL (`net.defaultRpc`), not through the wallet. The top
   bar's "Switch to Arc …" already offers the fix.

### 3.2 Stat tiles

- There is one tile for every token in `tokensForChain(net.chain.id)`:
  USDC, EURC and cirBTC. They always appear in that order, and a token never
  paid shows `0`.
  - *Why:* the three-token single transaction is the demo's claim. A zero
    tile shows cirBTC is supported rather than hiding it, and the layout
    never shifts.
- Each tile shows:
  - the total paid, formatted with the token's on-chain `decimals`, read
    through `lib/token-meta.ts`, and never assumed;
  - the on-chain `symbol`;
  - a secondary line: "N payments · M runs". M counts the runs that paid at
    least one amount of that token.

### 3.3 Coverage line

Directly under the tiles:

- **All read:** "From 12 of 12 runs sent from this browser, read from Arc
  testnet." This is plain soft text.
- **Some not read:** a warning `Alert`: "Totals cover 11 of 12 runs. 1 could
  not be read." It carries a **Retry** button that reads every recorded run
  again, in one action. Receipts do not change once final, so re-reading the
  ones already read costs a few calls and saves merging two result sets.
- **Some need attention:** in addition to the above, a note: "1 run has a
  payment that needs a look. It is left out of the totals." This links to
  that run's `/run/[tx]`. If there are several such runs, the note links to
  `/runs`.

### 3.4 Recent runs table

- It shows the **5** most recent runs by `seenAt`, and has no pagination.
  "All runs →" links to `/runs` (keeping `?n=`). `/runs` keeps the full
  list, Remove, and its explanation. The dashboard duplicates none of it.
- Columns:

| Column | Content |
|---|---|
| Run | `runLabel`, or "unnamed" in `--text-soft` |
| Sent | `seenAt` in local time. Labelled as this browser's clock; it is a label, not evidence |
| Paid | Per-token amounts from the chain, e.g. `0.1 USDC · 0.1 EURC`. Tokens in the table's own order |
| Status | `Tag`: **Read**, **Needs a look**, **Not found**, **Reverted**, **Couldn't read** |
| (action) | **Open** → `/run/[txHash]?n=…&label=…`, exactly as `/runs` builds it |

- The table has `scroll={{ x: "max-content" }}`, like every table after
  part 1.

## 4. Architecture

### 4.1 Core: two pure functions (`packages/core/src/summary.ts`)

```ts
export interface TokenPaid { value: bigint; payments: number }

export interface RunSummary {
  /** Per token (checksummed): emitted value and count, clean payments from `payer` only. */
  paid: Map<Address, TokenPaid>;
  payments: number;                    // clean payments counted, all tokens
  /** Payments whose memo sender ≠ transfer.from. Counted here, never summed. */
  identityBroken: number;
}

export function summarizeRun(logs: RawLog[], payer: Address): RunSummary;

export interface TokenTotal { token: Address; value: bigint; payments: number; runs: number }

/** Every token in `tokens` appears, in that order, zero when never paid. */
export function paidByToken(summaries: RunSummary[], tokens: Address[]): TokenTotal[];
```

- Named `paidByToken`, not `totalsByToken`: `totalsByToken` is already taken
  by `funding.ts`'s pre-payment shortfall calculator (what a run *needs*,
  before it is sent). Two exported functions with the same name and
  different meanings would let the dashboard silently import the wrong one
  from `@ledgerline/core`.
- `summarizeRun` is built on `joinPayments(logs)`. It counts only
  memo-linked payments whose `payer` equals the connected wallet
  (case-insensitive) and whose `identityBroken` is false. It takes no
  database handle and no client (invariant 1).
- Token addresses are compared checksummed (`getAddress`) on both sides,
  because `tokensForChain` and the logs need not agree on case.
- All arithmetic uses `bigint`. There are no floats anywhere, including in
  formatting (`formatAmount` already works on bigint).

### 4.2 Web

| File | Role |
|---|---|
| `lib/token-meta.ts` | **Moved** out of `CreateRun.tsx` (`readTokenMeta`), so the create flow and the dashboard share one reader of `decimals`/`symbol`. CreateRun imports it from here |
| `lib/run-reads.ts` | `readRuns(records, net, opts)` fetches each receipt by txHash, **at most 4 at a time**, with a **10 s timeout** each. It returns one `RunRead` per record. It also exports the pure `describeCoverage(reads)` used by §3.3 |
| `app/(app)/dashboard/page.tsx` | Server component. Sets metadata and renders `<Dashboard />` |
| `app/(app)/dashboard/Dashboard.tsx` | Client. Gets `useWallet()` and `runsFor(...)`, calls `readRuns`, `summarizeRun` and `paidByToken`, and renders. It decides nothing that is not in the functions above |

```ts
type RunRead =
  | { txHash: string; state: "read"; summary: RunSummary }
  | { txHash: string; state: "attention"; summary: RunSummary } // identityBroken > 0
  | { txHash: string; state: "not_found" }
  | { txHash: string; state: "reverted" }
  | { txHash: string; state: "unreadable"; reason: string };
```

- Totals sum the `summary` of `read` **and** `attention` runs. An attention
  run's clean payments still count; only its broken ones are left out.
- **Covered** runs are `read`, `attention` and `reverted`. A reverted run
  moved no money, so its zero is exact, not a gap. **Missing** runs are
  `not_found` and `unreadable`. They lower the coverage count.
- `readRuns` takes an injectable `getReceipt` in `opts`, so its concurrency,
  timeout and state mapping are unit-tested without a network.
- Reads restart when the wallet, the network or the history changes. A read
  that finishes after the inputs changed is discarded (an effect-scoped
  cancelled flag), so a result for one wallet is never shown under another.

## 5. Error handling

| Case | Behaviour |
|---|---|
| RPC unreachable / timeout | That run is `unreadable`; the coverage line warns and offers Retry. Totals show what was read, labelled as partial |
| Every read fails | Tiles show "—" rather than `0`, because a zero would be a claim. The warning says none could be read |
| Receipt missing (`not_found`) | Status "Not found". Likely a history entry from a different network or a pruned node; the run page explains more |
| Transaction reverted | Status "Reverted". Contributes nothing. A reverted run moved no money, so this is correct, not a gap |
| `identityBroken` payment | Status "Needs a look"; excluded from totals; linked to the run page |
| Token metadata unreadable | Tiles fall back to the raw integer and a short address. A decimal is never guessed |
| `localStorage` blocked | `runsFor` already returns `[]`, so the page shows the empty state (§3.1.2). Nothing throws |

## 6. Testing and definition of done

### 6.1 Unit (vitest, part of `pnpm test`)

- `summarizeRun` on `fixtures/mainnet-2pay.json` counts USDC **once**, with
  the system-emitter log ignored, and the total equals the emitted values.
- **New fixture** `fixtures/testnet-usdc-eurc.json`, holding the receipt
  logs of the real testnet run
  `0x0914b2ee684e1b84dd1227a21899335098cb9ecdcd7dee7366f1e9b159a13de0`
  (0.1 USDC + 0.1 EURC), read with `eth_getTransactionReceipt` from
  `https://rpc.testnet.arc.io`. It is captured with a new
  `scripts/capture-receipt.ts`, which reads one receipt's logs from a given
  RPC. `capture-fixture.ts` builds a synthetic trace and is left as it is.
  The fixture checks that USDC is not doubled and EURC is not halved in the
  same transaction.
  - `[unverified]` cirBTC has no fixture. Its single-log behaviour matches
    EURC per `CLAUDE.md`, but it is covered by that rule, not by a
    measurement.
- `summarizeRun` ignores payments from another payer, and does not sum
  `identityBroken` payments while counting them.
- `paidByToken` lists every token in order, zero when never paid, and
  counts runs per token correctly.
- `readRuns`:
  - never has more than 4 reads in flight;
  - a slow read becomes `unreadable` at the timeout;
  - a reverted receipt becomes `reverted`, and a missing one `not_found`.
- `describeCoverage`: all read, some unreadable, none readable, some needing
  attention.

### 6.2 Browser (Playwright against `next start`)

- axe with no serious or critical issues in both themes, in the empty state
  and in the populated state.
- Horizontal overflow is 0 at 390, 768 and 1280.
- With the test wallet on testnet, each run's per-token amount on the
  dashboard equals the amount on that run's `/run/[tx]` page.
- With the RPC blocked (Playwright `route.abort`), the coverage line warns,
  the tiles show "—", and Retry after unblocking fills them.

### 6.3 Done means

- The placeholder is gone; `/dashboard` shows states 1–4 of §3.1.
- Every figure on the page can be traced to a receipt fetched by txHash in
  this visit.
- `pnpm test` and `pnpm typecheck` are green; §6.2 is recorded.

## 7. Out of scope

- Month or date filtering, fiat values, charts, export.
- Runs not in this browser's history. Finding them would require searching
  chain history, which is ruled out.
- **`/run/[tx]` still manages its own wallet** (`Reconciliation.tsx` imports
  `connect`/`WalletPicker` directly), so part 1 did not move it onto the
  provider. That belongs to **part 3** (page migration) and is recorded
  there, not fixed here.
- Part 1's deferred minors that concern page layout (two `<h1>` per page, the
  safe-area inset under the tab bar, "How it works" leaving the app group) go
  to part 3.

## 8. Risks

| Risk | Mitigation |
|---|---|
| 50 receipt reads load the public RPC slowly | Concurrency 4, timeout 10 s, skeletons meanwhile; Retry covers failures. The cap of 50 is already enforced by `history.ts` |
| A figure appears that the run page disagrees with | Both come from the same `joinPayments` over the same receipt; §6.2 compares them run by run |
| Totals read as "everything I ever paid" | The coverage line always says "runs sent from this browser" |
