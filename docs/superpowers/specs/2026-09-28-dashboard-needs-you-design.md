# Dashboard, part 2: what needs the payer

`/dashboard` answers the question a payer who is not technical asks first:
**is there anything I have to do?** Below that it shows the wallet they pay
from, what they paid this month, and their recent runs.

**Parent specs:**
- `2026-09-23-dashboard-design.md`: the current page, its reads and its
  invariants. Anything this spec does not change stays as it describes.
- `2026-09-25-non-tech-ux-design.md`: plain words, one action per problem.
- `2026-09-24-tape-design-system-design.md`: the look.

Claims are tagged as in the parent specs: `[measured]`, `[docs]`,
`[unverified]`.

---

## 1. Why

Today's page answers "what have I paid?", an accountant's question. Read as a
payer who is not technical `[measured, 2026-09-28, reading Dashboard.tsx]`:

| # | Gap |
|---|---|
| 1 | Nothing says what the wallet holds or whether it can pay the network fee. A payer first learns they are short at the Check step of `/new` |
| 2 | A run with no receipt, or one with a payment that needs a look, sits in the table like any other row |
| 3 | Statuses are developer words: `Read` means paid, `No receipt`, `Reverted` |
| 4 | Once one run exists there is no button to start the next |
| 5 | A payer with a wallet and no runs gets one link, not what they still need (right network, USDC for fees) |
| 6 | The dashboard settles a reverted run by removing it from the history (`settleRun(…, "reverted")`). A payer who closed the tab while sending never learns that payroll did not go through |

## 2. Decisions

Made with the product owner on 2026-09-28:

1. **The top of the page is "Needs you".** Each item is something the payer has
   to do, with one action. When nothing is left: "✓ Nothing needs you."
2. **Totals lead with this month; all time is a secondary line.** The month is
   the payer's calendar month, in their own time zone, taken from **block
   timestamps**, never from the browser's clock.
3. **One page, reordered** (approach 1 of 3). Rejected: moving totals to
   `/runs` (relocates a working feature) and a banner over today's layout
   (leaves the page reading as accounting).
4. **A reverted run stays until the payer removes it** or opens its run page,
   which already explains the revert.
5. The interface stays in English. No invariant in `CLAUDE.md` changes.

## 3. What the page shows

Every figure is still read from the chain on each visit (parent §1). New reads
are listed in §4.1.

### 3.1 State A: no wallet connected

As today (parent §3.1.1), with one sentence added under the body: *"You need a
browser wallet (MetaMask or Rabby) and a little USDC on Arc for network
fees."* The Connect button and `OpenRunByHash` stay.

### 3.2 State B: connected, no runs recorded, so "Get started"

A tape titled **Get started**, four steps. Each step is done (✓), not done
(✗, with exactly one action), or unknown (a read failed, with Retry):

| # | Step | Done when | Action when not done |
|---|---|---|---|
| 1 | Wallet connected | always, in this state | none |
| 2 | On Arc *network* | `!wrongChain` | **Switch to Arc *network*** (the provider's `switchToArc`) |
| 3 | USDC for network fees | USDC `balanceOf` > 0 | testnet: *"Get free test USDC at faucet.circle.com"* (link). Mainnet: *"Add USDC to this wallet on Arc mainnet. Arc takes its network fee in USDC."* |
| 4 | Send your first run | never, in this state | **Create a payout run** (`/new`, keeping `?n=`) and **Download the sample file** (`sampleCsvHref()`). On mainnet also **Try it on testnet first** (`realFundsNotice(net).tryHref`) |

Step 1 shows the address shortened (`0x5955…de17`). Arc takes the network fee
in USDC `[docs]`. `OpenRunByHash` stays below the steps.

### 3.3 State C: runs recorded

Order at every width: Needs you, Your wallet, Paid this month, Recent runs.
Grid: every section 12 columns; the month tiles 4/4/4 at `lg` and
`md={12}` below, as today.

#### Needs you

Items, in this order, newest run first within a kind:

| Kind | Shown when | Text | Actions |
|---|---|---|---|
| `reverted` | read `reverted` | "*Label* did not go through. No money moved." | **Send again** (`/new`) · **Remove** (`forgetRun`) |
| `waiting` | read `not_found` and the record has `awaitingReceipt` | under 10 min: "*Label* is waiting for the network (sent *14:02*)." From 10 min: "Still no receipt for *Label* after *25* minutes. Open your wallet's activity before sending this run again: if it is still pending there, sending again could pay twice." | **Check** (the run page) |
| `attention` | read `attention` | "One payment in *Label* needs a look." / "*N* payments in *Label* need a look." | **Open** |
| `unreadable` | any read `unreadable`, as one item | "Couldn't reach Arc to check *N* run(s)." | **Retry** |
| `balances` | the balance read failed for any token | "Couldn't read this wallet's balances." | **Retry** (the one Retry on the page; the wallet figure shows "—") |
| `no_fee` | USDC `balanceOf` read and equal to 0 | "No USDC left for network fees. Arc takes its fee in USDC, so no run can be sent." | testnet: faucet link. Mainnet: none; the text says to add USDC on Arc mainnet |

- *Label* is `runLabel`, or "An unnamed run".
- The run's age is `now - seenAt`. `seenAt` is this browser's clock. Here it
  only picks the wording; it decides nothing about money.
- The 10-minute wording exists to stop a double payment. That a wallet shows
  a transaction the mempool dropped as still pending is `[unverified]`.
  Arc's silent drop below 20 Gwei is from `CLAUDE.md`.
- **"✓ Nothing needs you."** appears only once the run reads **and** the
  balance read have settled and produced no item. Until then the section
  shows a `Skeleton`. An all-clear shown too early would be a false claim.
- A `not_found` run with no `awaitingReceipt` is not an item. The table
  labels it and the coverage line counts it (below).
- A wallet on the wrong chain is not an item: the top bar already offers the
  switch, and the reads go through the page's RPC anyway (parent §3.1.4).

#### Your wallet

A tape titled **Your wallet**, with the short address. It shows one figure per
token in `tokensForChain` order (USDC, EURC, cirBTC), each from `balanceOf` in
the token's on-chain decimals (`amountText`; no guessed decimals). A token
whose balance could not be read shows "—". The primary button **New payout
run** goes to `/new`, keeping `?n=`.

`balanceOf` is 6-decimal for USDC, not the 18-decimal native balance
(`CLAUDE.md`, "USDC has two decimals"). The page reads only `balanceOf`.

#### Paid in *September 2026*

- Heading: the payer's current month, `Intl.DateTimeFormat("en-GB",
  { month: "long", year: "numeric" })`, local time zone.
- Three `StatTile`s as today (parent §3.2): every token in order, `0` when
  not paid this month, sub-line "*N* payments · *M* runs". A run counts
  toward the month when its block timestamp falls in the payer's current
  calendar month, local time.
- Under the tiles, one line: "All time, from runs sent from this browser:
  1.20 USDC · 0.40 EURC · 0.00001 cirBTC" (`paidLine`).
- The coverage line (parent §3.3) becomes **plain text only**. Retry moves to
  Needs you, so it is not offered twice. It adds, when true:
  - "*N* run(s) could not be read and are not counted." (`not_found` and
    `unreadable`, as today's `missing`);
  - "*N* run's date could not be read, so it is left out of *September*."
- If no run could be read, every tile shows "—" and the all-time line is
  left out (parent §5).

#### Recent runs

The same 5 rows and the "All runs →" link as today. Columns:

| Column | Content |
|---|---|
| Run | `runLabel`, or "unnamed" |
| When | The block timestamp, `en-GB` (`24 Sep 2026, 14:46`), local time. "Sending…" for a `waiting` run. "—" when no date was read. Replaces "Sent (this browser's clock)" |
| Paid | As today, including the attention "(*N* payments excluded)" note. "—" while waiting |
| Status | `Tag`, from `runStatus` (below) |
| Open | As today |

| Read | Record | Label | Tag colour |
|---|---|---|---|
| `read` | any | Paid | success |
| `attention` | any | Check one payment / Check *N* payments | warning |
| `not_found` | `awaitingReceipt` | Waiting | default |
| `not_found` | not awaiting | Not found | default |
| `reverted` | any | Didn't go through | error |
| `unreadable` | any | Couldn't check | warning |

## 4. Architecture

### 4.1 Reads

On each visit, and again on Retry, three reads start together:

1. **Runs**: `readRuns`, extended. After a `read` or `attention` receipt, the
   same worker fetches that receipt's block timestamp (`getBlock` by
   `blockNumber`, injectable as `getBlockTime`, its own 4 s timeout,
   `retryCount: 0`, like `lib/paid-at.ts`). If it fails, `paidAt` is left
   undefined and the run stays `read`. Reverted and missing runs get no
   block read.
2. **Token metadata**: `readTokenMeta`, as today.
3. **Balances**: `readBalances(net, wallet, tokens)`.

Each is a read by known hash, block number or storage slot. No `eth_getLogs`
and no search (`CLAUDE.md`). Nothing about amounts is stored.

A Retry bumps one `attempt` counter and re-runs all three reads. The
effect-scoped guard stays: a result is painted only for the `records` it was
read for.

### 4.2 Files

| File | Change |
|---|---|
| `lib/balances.ts` | **New.** `readBalances` moved out of `app/(app)/new/StepPreview.tsx` unchanged: a token whose balance fails is absent, i.e. unknown, never zero. `StepPreview` imports it from here |
| `lib/run-reads.ts` | `ReceiptLike` gains `blockNumber: bigint`. `read`/`attention` reads gain `paidAt?: bigint` (unix seconds). `readRunsWith` takes an optional `getBlockTime` |
| `lib/dashboard-view.ts` | New pure functions, below. `RUN_STATUS` is replaced by `runStatus` |
| `app/(app)/dashboard/NeedsYou.tsx` | **New.** Renders `NeedItem[]`, the all-clear, or a skeleton |
| `app/(app)/dashboard/WalletPanel.tsx` | **New** |
| `app/(app)/dashboard/PaidTotals.tsx` | **New.** Month tiles, all-time line, coverage line |
| `app/(app)/dashboard/RecentRuns.tsx` | **New.** The table |
| `app/(app)/dashboard/GetStarted.tsx` | **New.** State B |
| `app/(app)/dashboard/Dashboard.tsx` | Orchestrates only: wallet, records, reads, the stale-result guard, Retry, Remove. It decides nothing that is not in the functions below |

Pure functions in `lib/dashboard-view.ts`:

```ts
type NeedKind = "reverted" | "waiting" | "attention" | "unreadable" | "balances" | "no_fee";
interface NeedItem { kind: NeedKind; key: string; text: string; txHash?: string; runLabel?: string }

/** Undefined while any input is still being read: the page must not claim all-clear. */
function needsYou(input: {
  records: RunRecord[]; reads: RunRead[] | undefined;
  balances: Record<string, bigint> | undefined; usdc: Address; now: number;
}): NeedItem[] | undefined;

/** Calendar month of `now`, local time; paidAt in unix seconds. */
function inMonth(paidAt: bigint, now: Date): boolean;

/** paidByToken over the summaries of runs dated in now's month, plus how many
 *  covered runs had no date. */
function paidThisMonth(reads: RunRead[], tokens: Address[], now: Date):
  { totals: TokenTotal[]; undated: number };

function runStatus(read: RunRead, record: RunRecord): { label: string; color: "success" | "warning" | "error" | "default" };

function setupSteps(input: { wrongChain: boolean; usdcBalance: bigint | undefined; network: "mainnet" | "testnet" }): SetupStep[];

/** Which reads the history may settle: successes only (decision 4). */
function toSettle(reads: RunRead[]): string[];
```

Core does not change: `paidByToken` already takes any list of summaries.

### 4.3 History

- The dashboard settles only `toSettle(reads)`, i.e. successes. It never
  removes a reverted run.
- **Remove** on a `reverted` item calls `forgetRun` and bumps a local `version`
  that `records`' `useMemo` depends on, so the list recomputes without a
  reload.
- The run page's own `settleRun(…, receipt.status)` is unchanged: opening the
  run shows the revert explanation, and then the run may leave the list.
- `CreateRun`'s `onReverted → forgetRun` is unchanged: the payer saw the
  revert on screen.

## 5. Error handling

| Case | Behaviour |
|---|---|
| One run unreadable | `unreadable` item with Retry. Totals labelled partial on the coverage line |
| Every run unreadable | Tiles "—", all-time line left out, `unreadable` item with Retry |
| A block timestamp unreadable | The run counts toward all time, not the month. Coverage line says so. When column "—" |
| Balance read fails for a token | That figure "—", a `balances` item with Retry, and no all-clear |
| Token metadata unreadable | Raw integer and short address, as today (`amountFigure`). Never a guessed decimal |
| `localStorage` blocked | `runsFor` returns `[]`, so state B. Remove does nothing and throws nothing |
| Wallet on another chain | Page reads through the URL's network as today. Top bar offers the switch. In state B, step 2 is ✗ |

## 6. Testing and definition of done

### 6.1 Unit (vitest, in `pnpm test`)

- `needsYou`:
  - each kind is produced from its input;
  - the order is by kind, then newest first;
  - several unreadable runs make one item with their count;
  - `undefined` while `reads` or `balances` is undefined;
  - `[]` when everything settled clean;
  - the waiting text switches at exactly 10 minutes;
  - a `not_found` without `awaitingReceipt` is not an item.
- `inMonth` at the boundaries: last second of the previous month, first
  second of this month, and first second of the next month. Dates are built
  with the local `Date` constructor, so the test holds in any time zone.
- `paidThisMonth`:
  - an undated run is counted in `undated`, not in the month;
  - a run from last month is excluded;
  - all three tokens appear in order.
- `runStatus`: every row of the §3.3 table.
- `setupSteps`: each step's done, not done and unknown.
- `toSettle` never returns a reverted run.
- `readRunsWith` with an injected `getBlockTime`:
  - a success sets `paidAt`;
  - a timeout or failure leaves `paidAt` undefined and the run `read`;
  - no block read happens for reverted or missing runs;
  - concurrency stays at most 4.
- `readBalances` behaves the same after the move: a failed token is absent,
  not zero.

### 6.2 Browser (Playwright against `next start`)

A real browser, per the project's rule that a green build says nothing about
the wallet seam:

- States A, B and C in both themes. axe finds no serious or critical issues.
  Horizontal overflow is 0 at 390, 768 and 1280.
- With the test wallet on testnet:
  - this month's per-token tiles equal the sum of the matching `/run/[tx]`
    pages dated this month;
  - the wallet figures equal the Check step's balances on `/new`.
- With the RPC blocked (`route.abort`):
  - Needs you shows the `unreadable` and `balances` items and no all-clear;
  - after unblocking, Retry fills the page.
- A reverted run recorded as `awaitingReceipt` shows the `reverted` item;
  Remove takes it off without a reload. A stubbed receipt is fine here: no
  money needs to move.

### 6.3 Done means

- States A, B and C as in §3. Every figure traces to a read made in this visit
  (§4.1).
- `pnpm test` and `pnpm typecheck` are green, and §6.2 is recorded.

## 7. Out of scope

A month picker, fiat values, charts, export, notifications, runs not sent from
this browser (finding them means searching history), and translation of the
interface.

## 8. Risks

| Risk | Mitigation |
|---|---|
| A block read per run doubles the calls (≤ 50 runs gives ≤ 100 reads) | Same pool of 4. The block read has a 4 s timeout, and a missing date degrades only the month figure |
| A payer's accounting month is in another time zone | The heading is the payer's own month, in their own time zone. The When column shows each run's time, so an edge case can be checked by eye |
| The payer sends a stuck run again and pays twice | The 10-minute wording says to check the wallet's activity first. The run page's no-receipt copy is unchanged |
| An all-clear shown before the reads finish | `needsYou` returns `undefined` until every input has settled, and a unit test holds it |
