# Ledgerline — Design Spec

- **Date:** 2026-09-21
- **Status:** Approved for implementation planning
- **Target:** Arc Microgrants (DoraHacks), submissions close 2026-10-14 23:59 ET
- **Name:** `Ledgerline` (provisional — rename is a find/replace)

> Every factual claim marked **[measured]** was verified against Arc mainnet
> during design. Claims marked **[docs]** come from Arc documentation and are
> not independently verified. Claims marked **[unverified]** are open.

---

## 1. Problem

A USDC transfer carries no reference to what it paid for.

When a company pays 500 contractors, the chain records 500 transfers with no
invoice ID, no payroll-run ID, no employee ID. Finance maintains a parallel
spreadsheet mapping `tx hash → person → invoice`. That mapping is manual, fails
silently, and the counterparty cannot verify it.

Two failure modes, and on every other chain they are mutually exclusive:

1. **No reference.** The recipient sees `+1,250 USDC`. Which invoice? Which
   month? The chain cannot say.
2. **Batching destroys payer identity.** Batch through a standard `Multicall3`
   and each recipient sees `from = 0xcA11bde0…`, the batching contract — not the
   company. The recipient's own books break, and any compliance screening based
   on "who paid me" breaks with them.

You can batch cheaply, **or** preserve identity and references. Not both.

### Evidence this is a real, funded problem

An entire software category exists to work around it: **Bitwave** (SOC 1/2
Type 2, NetSuite/QuickBooks/Sage/Xero integrations), **Cryptio** (institutional
subledger, quote-based enterprise pricing), **Tres Finance**. Industry
descriptions of the daily work:

> "Teams spend hours copying and pasting transaction hashes from block
> explorers, manually calculating confirmation times, and trying to match
> payments to invoices."

> "A shared treasury address is a failure mode where two clients can pay on the
> same day and you cannot tell whose invoice cleared."

These products **guess**: they match on amount + address + timestamp,
heuristically, after the fact.

### Why Arc changes the shape of the problem

Arc ships two predeployed contracts that make the reference native:

| Contract | Address | Role |
|---|---|---|
| `Memo` | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` | Wraps any call, attaches `memoId` + metadata, emits an indexed audit trail |
| `Multicall3From` | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` | Batches calls while preserving the original EOA as `msg.sender` |

Both are live on mainnet **[measured]**. Combined, they remove the trade-off:
batched *and* referenced *and* correctly attributed.

Usage today is near zero: the `Memo` contract's global `memoIndex` counter reads
**345** **[measured]**, across a chain with ~21.9M blocks. The mechanism exists
and is unused.

---

## 2. Prior art (honest assessment)

**This pattern is not novel. It is a proven pattern that Arc has not received.**

### Chain-native reference fields (~10 years old)

Stellar (28-byte memo), XRP (32-bit destination tag), EOS, TON, Algorand
(note), Cosmos (memo). Every major exchange uses them for shared-deposit-address
attribution. Arc's `Memo` is Arc's version of an industry-standard idea.

### Request Network — the closest prior art

Does essentially this on 7 EVM chains plus Tron:

```solidity
ERC20FeeProxy.transferFromWithReferenceAndFee(
    tokenAddress, to, amount, paymentReference, feeAmount, feeAddress
) → emit TransferWithReferenceAndFee(...)   // paymentReference is indexed
```

with `paymentReference = last8Bytes(keccak256(lowercase(requestId) + salt + address))`,
a `BatchConversionPayments` contract, a `payments-subgraph`, and the commercial
product Request Finance on top.

**Arc is not on their supported-chain list.**

### What we take from prior art

- **Salted references.** Request hashes the reference with a salt so observers
  cannot read the invoice ID. We adopt this. A plaintext `invoiceId` in `Memo`
  would publish counterparty relationships and payment cycles.

### What is genuinely different here

1. `Memo` wraps **any** call at the protocol layer — not one company's
   payment-specific contract. No dependency on a private deployment.
2. **USDC + EURC + cirBTC coexist at the protocol level** on one chain
   **[measured]**. A single transaction can pay USD, EUR, and BTC with
   per-payment references. No other chain has all three natively.
3. `callDataHash` in the `Memo` event enables a **cryptographic** join between
   payment and reference (see §4.1) — not heuristic matching.

### Positioning rule

Do not claim "nobody has solved this." The judges are Arc engineers who know
Request Network exists. Claim what is true: *a proven pattern, implemented on
the protocol-native primitives of a chain that has neither the pattern nor any
user of those primitives.*

---

## 3. Core value and non-goals

### The claim the MVP must prove

> A USDC/EURC/cirBTC payout on Arc can carry its own accounting context, so the
> books close themselves — and it stays true for a 500-recipient batch.

Sub-claims:

- **(a)** Self-describing on chain: the reference is an indexed event, readable
  by both parties, no shared spreadsheet.
- **(b)** Survives batching: recipients see the real payer as `msg.sender`, and
  each sub-payment keeps its own reference. *(hardest claim)*
- **(c)** Verifiable by the **recipient**, not only the payer. This is what
  makes it a primitive rather than an internal tool.
- **(d)** Economically viable on Arc: 100 referenced payments cost $0.112
  **[measured]**.

### Non-goals (explicitly out of scope)

Full payroll SaaS · tax/VAT · multi-step approvals · recurring invoices ·
fiat on/off-ramp · ERP integration · user accounts · Safe / ERC-4337 wallet
support · streaming payments · dispute resolution.

---

## 4. Architecture

### Hard constraint discovered during spike

**Our contract must not be the *caller* in the payment path.** `CallFrom`
rejects sender spoofing, so a custom `PayoutContract` calling `Memo` reverts.
`Multicall3From` works because it is a privileged predeploy.

Our contract may only be a **sibling subcall**, never a wrapper. This shaped the
entire design.

### The central transaction

```
ONE TRANSACTION — signed by the payer EOA

payer EOA
  └─► Multicall3From.aggregate3([
        PayoutAnchor.commit(clientRunId, manifestRoot, itemCount),  ← anchor first
        Memo.memo(USDC,   transfer(r1, a1), memoId₁, meta₁),
        Memo.memo(EURC,   transfer(r2, a2), memoId₂, meta₂),
        Memo.memo(cirBTC, transfer(r3, a3), memoId₃, meta₃),
      ])
```

Every subcall observes `msg.sender == payer EOA` **[measured]** — verified by
injecting an echo contract (`0x3360005260206000f3`) via state override and
reading its return value through both `Multicall3From` and
`Multicall3From → Memo`.

### Source-of-truth principle

> **The chain is the truth. Our backend is an index and a convenience.**

Enforced by a concrete test: the verifier CLI takes only `txHash` + `RPC URL`,
touches no database, and must reproduce the full reconciliation table.

---

### 4.1 `reconciler` — component #1

A pure function. No I/O, no database, no network.

```ts
reconcile(
  logs:      Log[],       // from eth_getTransactionReceipt
  manifest?: Manifest,    // intent: (invoiceId, token, to, amount)[]
  runSalt?:  Hex          // to resolve memoId → invoiceId
): ReconcileResult
```

#### The cryptographic join

`Memo` emits `callDataHash = keccak256(forwarded calldata)`, and the forwarded
calldata is exactly `transfer(to, value)`. So a candidate `Transfer` log can be
**proven** to belong to a given memo by rebuilding and hashing:

```
keccak256( 0xa9059cbb ‖ to(32) ‖ value(32) ) == memo.callDataHash
```

Verified on real trace data **[measured]**:

```
memo.callDataHash                                    = 0x0de6e58d…e6d1
keccak(0xa9059cbb ‖ 0x2222… ‖ 1000000)               = 0x0de6e58d…e6d1  ✅
```

**Consequence: the reconciler does not depend on log ordering.** No positional
guessing, no exposure to EIP-7708 log hoisting, no fragility from interleaved
logs. This is the single most important property of the design.

#### Algorithm

```
1. Filter logs:
     memos     = topic0 == Memo(...)      from 0x5294E9…
     transfers = topic0 == Transfer(...)
                 AND log.address != 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE
2. For each memo, find the transfer where:
     transfer.address == memo.target
     AND keccak(0xa9059cbb ‖ to ‖ value) == memo.callDataHash
3. Invariant: memo.sender == transfer.from     (mismatch ⇒ flag `unlinked`)
4. decimals read from token.decimals() on chain — never hardcoded
5. Invoice match: memoId == keccak256(runSalt ‖ invoiceId)
```

Step 1's emitter exclusion is one line and resolves the double-count trap
(§6.2) without per-token branching. The cost: only ERC-20 `transfer` payments
are recognised; native sends are out of scope by design.

#### Output statuses

`matched` · `amount_mismatch` · `recipient_mismatch` · `unpaid` ·
`unexpected` · `unlinked`

`unlinked` — a memo exists but no `Transfer` satisfies the hash join. This
signals tampering or anomaly and only this design can detect it.

---

### 4.2 `PayoutAnchor.sol`

```solidity
contract PayoutAnchor {
    struct Run {
        address payer;
        bytes32 root;
        uint32  itemCount;
        uint64  timestamp;
    }
    mapping(bytes32 => Run) public runs;

    event RunCommitted(
        bytes32 indexed runId,
        address indexed payer,
        bytes32 root,
        uint32  itemCount
    );

    function commit(bytes32 clientRunId, bytes32 root, uint32 itemCount) external {
        bytes32 runId = keccak256(abi.encode(msg.sender, clientRunId));
        require(runs[runId].payer == address(0), "run exists");
        require(root != bytes32(0) && itemCount > 0, "empty run");
        runs[runId] = Run(msg.sender, root, itemCount, uint64(block.timestamp));
        emit RunCommitted(runId, msg.sender, root, itemCount);
    }

    function verifyItem(bytes32 runId, bytes32 leaf, bytes32[] calldata proof)
        external view returns (bool)
    {
        bytes32 root = runs[runId].root;
        return root != bytes32(0) && MerkleProof.verify(proof, root, leaf);
    }
}
```

#### Merkle, not a flat hash — for payroll privacy

```
leafᵢ        = keccak256(abi.encode(memoIdᵢ, tokenᵢ, toᵢ, amountᵢ))
manifestRoot = merkleRoot(leaves)
```

With a flat hash, a recipient verifying their own line would need the entire
manifest — every colleague's salary. With Merkle, they need only their leaf and
a proof. For payroll this is a precondition for usability, not a nicety.

#### `runId` derivation

`runId` is derived **inside** the contract from `msg.sender`, so two payers can
never collide and nobody can front-run and squat a `runId`. Safe because
`msg.sender` is the payer EOA even when called via `Multicall3From`
**[measured]**.

#### Safety properties

| Property | Why it holds |
|---|---|
| **Holds no funds** | Never touches tokens. No approvals, no balances. Zero custody risk |
| **Not upgradeable** | No proxy, no admin, no pause. Nothing to capture |
| **Write-once** | A `runId` anchors exactly once, immutably |
| **Cannot block payments** | If this contract fails, money still moves; it is an evidence layer only |

#### Storage, not events-only

Public-RPC `eth_getLogs` is capped at **2000 results / ~10k block range**
**[measured]**. A log-search-based lookup would break. A public mapping makes
lookup a single `eth_call` on any RPC, forever. Cost: one cold `SSTORE`
≈ 20,000 gas ≈ **$0.0004**.

#### What the anchor actually buys

Under `allowFailure=false` the whole transaction reverts on any failure, so the
anchor is not written — but the failure is still visible on chain as a
`status=0` transaction. The anchor's real value is three things, true in both
modes:

1. **Proof of intent** → enables recipient Merkle proofs without leaking others' amounts
2. **Detecting `unexpected` payments** — on chain but absent from the manifest
3. **A stable `runId`** to reference the run later

---

### 4.3 `builder`

#### Preflight — the most important feature

Before signing, simulate the exact calldata and show per-payment outcomes.
Works on **any** RPC (no `debug_traceCall` needed) via this trick: simulate with
`allowFailure = true` even when execution will use `false`.

```
preflight:  aggregate3(calls, allowFailure=true)
            → [(true,0x), (false,MemoFailed…), (true,0x…01)]     [measured]
execute:    aggregate3(calls, allowFailure=false)   (or user's choice)
```

Preflight is also the **only** way to detect Arc's runtime blocklist, which has
no pre-check function **[docs]**.

#### Pre-sign validation

| Check | Rationale |
|---|---|
| `to != 0x0` | Arc reverts `"transfer to the zero address"` **[measured]** |
| `amount > 0` | Zero transfers are legal but meaningless in payroll |
| Sufficient balance **per token** | Summed per token, not pooled |
| Sufficient USDC for gas | Gas is USDC; running out stalls the run |
| No duplicate `invoiceId` | Duplicate ⇒ duplicate `memoId` ⇒ ambiguous reconciliation |
| Duplicate recipient | **Warn, do not block** — paying one person two invoices is valid |
| ≤ 400 items | 30M block gas limit ≈ 535 items **[measured]**; keep margin |
| Blocklist | No pre-check exists; preflight catches it |

#### Gas policy — the most dangerous footgun in the project

Transactions with `maxFeePerGas` below 20 Gwei are **silently dropped by the
mempool** — no receipt, no error **[docs]**. For a payroll tool this means
"I paid everyone" while nothing happened.

```ts
const suggested = await rpc("eth_gasPrice");            // measured: 20.33 Gwei
const tip       = await rpc("eth_maxPriorityFeePerGas");// measured: 0.33 Gwei
maxFeePerGas         = max(25_gwei, suggested * 1.5);   // hard floor
maxPriorityFeePerGas = max(1_gwei, tip);
gasLimit             = estimateGas * 1.2;
```

**Never report success without a receipt.** If none arrives within **30 blocks
(~15 s at 0.5 s block time)**, report "not yet included" and offer a fee bump.
The run stays in `pending` and is never counted as paid.

#### `allowFailure` default

**Default `false`** (atomic run). A partially-paid payroll is worse than a
failed one: it is harder to reconcile and harder to retry safely. A failed run
reverts entirely, writes no anchor, and is safe to re-run with the same CSV.

Best-effort mode (`true`) is available behind an explicit opt-in, for cases
where one bad recipient should not block everyone else. Preflight always runs
with `true` regardless, since that is how per-payment outcomes are obtained.

#### Idempotency

`clientRunId = keccak256(canonicalised CSV ‖ payer)`. Resubmitting the same CSV
produces the same `runId`, and the contract rejects it with `run exists`.
**Double-payment is prevented at the contract layer, not in the UI.**

#### One run = one transaction

CSVs over 400 rows split into separate runs, each with its own `runId` and
anchor. The invariant `one runId = one txHash` is preserved, trading capacity
for reconciliation simplicity.

---

### 4.4 App and receipt page

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js App Router on Vercel | Public URL required for submission |
| **UI kit** | **Ant Design v6** + `@ant-design/nextjs-registry` **[measured]** | See below |
| Chain | **viem `arc`** (built in: id 5042, currency USDC) **[measured]** | No hand-rolled chain definition |
| Wallet | MetaMask / Rabby (**EOA only**) | Hard constraint, §6.1 |
| Storage | **None required**; KV is a convenience only | §4 source-of-truth principle |

#### Why Ant Design rather than Tailwind + shadcn/ui

This is an enterprise data-table product, and antd's components map almost 1:1
onto what the screens need:

| Need | Component |
|---|---|
| Reconciliation table: 6 statuses, sorting, per-token grouping, totals row | `Table` (expandable rows, summary, filters built in) |
| CSV drop | `Upload.Dragger` |
| upload → preview → preflight → sign | `Steps` |
| Receipt verdict (verified / failed) | `Result` |
| Payment detail | `Descriptions` |
| Status badges, per-token totals | `Tag`, `Statistic` |
| Preflight warnings | `Alert` |

With a headless kit these would be assembled by hand (TanStack Table, a custom
dropzone, a custom stepper) — several days, none of it the interesting part of
this project.

Verified compatible **[measured]**: antd `6.6.5`, `@ant-design/nextjs-registry`
`1.3.0`, Next `16.3.5`, React `19.3.0`.

Two costs, both mitigated:

1. **App Router SSR.** The root layout must wrap children in `AntdRegistry`, or
   styles flash unstyled on first paint. One file, done once.
2. **Generic admin-panel look**, a real risk against the "quality of what you
   built" criterion. Mitigated with `ConfigProvider` theme tokens (brand colour,
   radius, typography) — roughly 30 minutes. **Do not ship stock antd defaults.**

Visual design direction is deliberately **not** decided here. It should follow
T3, once the reconciler's real output shape is fixed; designing before then is
designing for imaginary data.

#### Self-contained receipt URL

The recipient needs their leaf and Merkle proof. If those are only obtainable
from our server, we become a dependency — contradicting the source-of-truth
principle. So the evidence goes **in the URL**:

```
/r/<txHash>?m=<memoId>&s=<runSalt>&p=<proof-base64url>
```

Size: a proof for a 400-item run is 9 hashes × 32 B = 288 B; with leaf and salt
≈ 430 base64 chars, total URL ≈ 600 chars. Well within browser limits.

The page runs entirely client-side:

```
1. eth_getTransactionReceipt(txHash)             ← one call, any RPC
2. reconcile(logs)                                ← pure function §4.1
3. check memoId == keccak(salt ‖ invoiceId)
4. PayoutAnchor.verifyItem(runId, leaf, proof)   ← one eth_call
```

#### `/why` — the judge-facing demo

Two **real mainnet transactions** side by side: a naive `Multicall3` batch
(recipient sees `from = 0xcA11bde0…`, no reference) against ours (recipient sees
the company, plus `INV-US-001`). This is the negative control from §7 doubling
as the 10-second explanation.

---

### 4.5 Screen specification

Detailed here: the **receipt page** and the **reconciliation view**. Both are
proof artifacts on the never-cut list. The create-run screen is deliberately
left coarse (§4.5.3) because it is cuttable and not required for submission.

---

#### 4.5.1 Receipt page — `/r/<txHash>?m=<memoId>&s=<runSalt>&p=<proof>`

**Governing rule: this page must never fail opaquely.** Its entire purpose is
to let a recipient verify a payment without trusting us. A generic "invalid"
destroys exactly the property it exists to demonstrate. Every failure must name
the rung that broke and what that means.

##### The verification ladder

Verification is a sequence of independent checks, rendered as visible progress:

```
✅ Transaction found on Arc mainnet             block 21,945,182 · finalized
✅ Payment to you: 1.50 USDC                    from 0x5a21…f8c4
✅ Matches invoice INV-US-001                   callDataHash join verified
✅ Payer signed this transaction directly       Memo.sender == Transfer.from
✅ Included in anchored run RUN-2026-09         Merkle proof valid · 3 items
```

Each rung maps to a specific check:

| # | Rung | Check | Source |
|---|---|---|---|
| 1 | Transaction exists and succeeded | `eth_getTransactionReceipt`, `status == 1` | chain |
| 2 | A payment to this recipient | `Transfer.to`, `value`, `token.decimals()` | chain |
| 3 | Payment belongs to this invoice | `keccak(0xa9059cbb ‖ to ‖ value) == memo.callDataHash` **and** `memoId == keccak(salt ‖ invoiceId)` | chain + URL salt |
| 4 | Payer identity intact | `memo.sender == transfer.from` | chain |
| 5 | Item was in the committed manifest | `PayoutAnchor.verifyItem(runId, leaf, proof)` | chain + URL proof |

##### Failure states — each names its rung

| State | Trigger | What the page says |
|---|---|---|
| `bad_link` | Missing/malformed URL params | "This link is incomplete — ask the payer to resend it." Names which param is missing |
| `rpc_unreachable` | RPC call failed | "Could not reach Arc." Offers retry **and the RPC selector (below)**. Never implies the payment is invalid |
| `tx_not_found` | No receipt for `txHash` | "No such transaction on Arc mainnet." Suggests checking the network |
| `run_reverted` | `status == 0` | "**This payout run did not execute.** The transaction failed, so no money moved and nothing was paid." Links to the failed tx |
| `memo_absent` | No `Memo` log with that `memoId` | "This transaction exists but contains no payment for this invoice." |
| `unlinked` | Memo present, no `Transfer` satisfies the hash join | **Critical.** "Anomaly: a reference exists with no matching payment." Show raw evidence and advise contacting the payer |
| `salt_mismatch` | `memoId != keccak(salt ‖ invoiceId)` | "This link's invoice reference does not match. The link may be for a different invoice." |
| `identity_broken` | `memo.sender != transfer.from` | **Critical.** "The payer on record differs from the sender of funds." |
| `not_anchored` | `runs[runId].payer == address(0)` | Degraded, not failed — see below |
| `proof_invalid` | Merkle verification false | "This payment is real, but it was **not** part of the committed manifest." |
| `verified` | All rungs pass | Full success |

##### Honest degradation

When the URL carries no `p=` proof, or the run was never anchored, the page
**must not** silently show success. It verifies rungs 1–4 and states plainly:

> ✅ Payment verified against the blockchain.
> ⚠️ Could not confirm it was part of a committed payout run — no anchor proof
> in this link. The payment itself is real.

Saying what was *not* checked is as important as saying what was.

##### RPC transparency

The page shows which RPC endpoint it used and lets the viewer **substitute
their own**:

```
Verified using  https://rpc.mainnet.arc.io          [ change ]
```

This is not a convenience feature. It closes the last trust gap: a viewer who
distrusts our hosting can point the page at any Arc RPC — or their own node —
and re-run every check. Combined with the self-contained URL (§4.4), the claim
"you do not have to trust this page" becomes literally testable, and that
demonstration is submission artifact #4.

##### Layout

`Result` for the verdict, `Descriptions` for payment detail (payer, recipient,
token, amount, invoice, run, block, timestamp), the ladder as a checklist, and
a raw-evidence disclosure (`Collapse`) containing the decoded logs so a
technical recipient can audit by hand.

---

#### 4.5.2 Reconciliation view — `/run/<txHash>`

##### Two modes, and the difference is not cosmetic

| Mode | Who | Data available | What can be concluded |
|---|---|---|---|
| **With manifest** | Payer (holds the manifest JSON) | Intent + actual | All 6 statuses. Can prove completeness |
| **Without manifest** | Anyone with the link | Actual + anchor (`root`, `itemCount`) | Payment list, plus a **completeness check** |

The second mode is stronger than it first appears. `PayoutAnchor` stores
`itemCount`, so even without the manifest:

```
anchored itemCount = 5
payments found     = 3
⇒ 2 payments are missing — detectable with no manifest at all
```

This is why `itemCount` is a stored field rather than an afterthought.

##### Status presentation

| Status | Severity | Must display |
|---|---|---|
| `matched` | ok | amount, recipient, invoice |
| `amount_mismatch` | warn | **both** expected and actual, and the delta |
| `recipient_mismatch` | warn | both addresses, visually diffed |
| `unpaid` | error | invoice + intended amount; state that the subcall failed |
| `unexpected` | warn | the payment, flagged as absent from the manifest |
| `unlinked` | **critical** | raw log evidence; this indicates anomaly, not user error |

The three non-green statuses that are easiest to forget while coding are
`unlinked`, `amount_mismatch` and `unexpected`. Each needs a golden-fixture
test **before** the view is built (T3), not after.

##### Page states

`loading` · `tx_not_found` · `run_reverted` · `ready`

`run_reverted` is a first-class state, not an error toast: a reverted run means
**nothing was paid**, which is a legitimate and important thing to display
clearly rather than as a failure banner.

##### Layout

`Table` with per-token grouping and a summary row; `Statistic` row for totals
per token and counts by status; `Tag` for statuses; filters by status and by
token; every row links to the receipt page and to explorer.arc.io.

Default sort: **most severe first.** A finance user opening this page needs the
problems, not the successes — the 97 rows that worked are not why they are here.

---

#### 4.5.3 Create-run screen (deferred)

`Steps`: upload → preview → preflight → sign. `Upload.Dragger` for CSV,
`Table` for preview with on-chain token symbols and decimals, `Alert` for
preflight results per §4.3, wallet signature last.

Deliberately left at this level of detail. It is cuttable (§8) and not required
for submission; specify it fully at T10, when the reconciler's output shape and
the preflight result format are both settled.

---

#### 4.5.4 Rules shared by all screens

1. **Never show an amount without its token and decimals.** Decimals are read
   from chain, never hardcoded (USDC 6, EURC 6, cirBTC 8).
2. **Never show a payment as complete without a receipt** (§4.3). `pending` is
   a visible state, not an absence of state.
3. **Addresses are truncated but always copyable in full**, and always link to
   explorer.arc.io.
4. **Every claim the UI makes must be traceable to a rung or a log.** If the
   interface asserts something the user cannot verify, it does not belong.

## 5. Data model

```
Manifest {
  clientRunId : bytes32        // keccak(canonical CSV ‖ payer)
  payer       : address
  chainId     : 5042
  runSalt     : bytes32        // random, 32 bytes
  items: [{
    invoiceId : string         // never published in plaintext
    token     : address        // USDC | EURC | cirBTC | any ERC-20
    to        : address
    amount    : bigint         // in token base units
    memoId    : bytes32        // keccak(runSalt ‖ invoiceId)
    leaf      : bytes32        // keccak(abi.encode(memoId, token, to, amount))
  }]
}
```

`runSalt` is shared with recipients via the receipt URL. It protects against
outside observers, not against the recipient — who legitimately knows their own
invoice.

---

## 6. Arc-specific constraints

### 6.1 EOA only

`Memo` requires a direct EOA caller; `CallFrom` rejects sender spoofing
**[docs]**. **Safe, ERC-4337, and all smart-contract wallets are unsupported.**
This is a real product limitation and must be stated in the UI, since many
finance teams use Safe.

**[unverified]** — `eth_call` and `debug_traceCall` both force
`msg.sender == tx.origin`, so simulation cannot test this rule. A contract-address
caller "succeeded" in simulation, contradicting the docs. **Must be confirmed
with a real transaction (task T5).**

### 6.2 USDC emits two Transfer logs; other tokens emit one

| Token | Decimals | `Transfer` logs per payment | Gas (single) |
|---|---|---|---|
| USDC | 6 (18 natively) | **2** | 101,425 |
| EURC | 6 | 1 | 89,157 |
| cirBTC | 8 | 1 | 89,157 |

All **[measured]**. USDC emits an extra 18-decimal log from the system emitter
`0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` because it is the native gas token.

Getting this wrong fails in two opposite, equally silent directions: applying
dedup to all tokens **halves EURC and cirBTC**; applying it to none **doubles
USDC**. Resolved by §4.1 step 1.

### 6.3 Other measured facts

- Mainnet chain ID **5042**; base fee pinned at the **20 Gwei** floor
- Block gas limit 30M; ~12 tx/block — the chain is quiet
- `eth_getLogs` on the public RPC: 2000 results / ~10k blocks
- `debug_traceCall` is **not** available on `rpc.mainnet.arc.io`, but **is**
  available on `rpc.drpc.mainnet.arc.io` — useful for development
- `explorer.arc.io` is publicly reachable (Cloudflare-challenged for bots) and
  runs Blockscout, so contract verification is available. Arc docs' claim that
  mainnet explorer access is "permissioned" is stale.
- `PREVRANDAO` always returns 0 — no on-chain randomness (not used here)

### 6.4 Cost table (measured, 20 Gwei)

| Payments / tx | Gas | Cost | Per payment |
|---:|---:|---:|---:|
| 1 | 101,425 | $0.0020 | $0.00203 |
| 10 | 600,667 | $0.0120 | $0.00120 |
| 100 | 5,600,095 | **$0.112** | $0.00112 |

Plus ~25,000 gas ($0.0005) for the anchor — 0.4% overhead on a 100-item run.

---

## 7. Testing and proof artifacts

### Test layers

| Layer | Tool | Covers |
|---|---|---|
| `reconciler` | vitest + golden fixtures from real mainnet traces | hash join, USDC dedup, 6 statuses, decimals |
| `PayoutAnchor` | Foundry (stock anvil suffices) | Merkle, `runId` derivation, overwrite + replay protection |
| Arc-specific flow | **real testnet transactions** | nested `Memo`, true log ordering, smart-wallet rejection |
| Cost | mainnet | real gas table |

The third layer is mandatory: simulation has a `tx.origin` blind spot (§6.1).

Golden fixtures already exist from design-phase traces, so `reconciler` is
testable before any transaction is sent — which is why it is component #1.

### Submission artifacts

1. `PayoutAnchor` with **verified source** on explorer.arc.io
2. **One real 3-token mainnet run** — USDC + EURC + cirBTC, 3 invoices, one tx
3. **Negative control**: naive `Multicall3` batch beside ours
4. **A receipt URL that verifies with our backend switched off** (recorded)
5. `npx arc-reconcile <txHash>` reproducing the table from RPC alone
6. Measured cost table
7. **Double-payment rejection**: resubmitting the same CSV reverts `run exists`

Artifacts 4 and 7 demonstrate *properties*, not features, and are the strongest
evidence for the judging criteria.

---

## 8. Task plan

### Milestone 0 — De-risk

| ID | Task | Deps | Done when |
|---|---|---|---|
| **T0** | Verify acquisition path for all 3 tokens on mainnet | — | A mainnet wallet actually holds USDC + EURC + cirBTC. If cirBTC is unobtainable, cut it **now** |
| T1 | Repo scaffold: Foundry + TS workspace | — | `forge test` and `vitest` run green and empty |

### Milestone A — Verification core

| ID | Task | Deps | Done when |
|---|---|---|---|
| T2 | Golden fixtures from mainnet traces | T1 | Design-phase traces committed as test fixtures |
| **T3** | `reconciler` pure function | T2 | Hash join; USDC deduped, EURC/cirBTC not; 6 statuses; on-chain decimals |
| T4 | `PayoutAnchor.sol` + Foundry tests | T1 | Merkle, `runId`, overwrite + replay protection all tested |
| **T5** | First real **testnet** transaction | T4, T0 | Confirms true log order and **smart-wallet rejection** |

T3 and T4 are parallel (TypeScript vs Solidity). T5 can feed corrections back
into T3, so run it early.

### Milestone B — Submittable

| ID | Task | Deps | Done when |
|---|---|---|---|
| T6 | `builder`: manifest → Merkle → calldata | T3, T4 | Valid `aggregate3` calldata from a CSV |
| T7 | Preflight + gas policy | T6 | Per-payment simulation; 25 Gwei floor; never claims success without a receipt |
| T13 | Deploy `PayoutAnchor` to mainnet + verify | T4, T5, T0 | Contract tab shows source on explorer.arc.io |
| **T14** | **Real 3-token mainnet payout run** | T13, T7 | One tx: USDC + EURC + cirBTC, 3 invoices, `Transfer.from` = company |
| T12 | Public receipt page | T3, T4 | Verifies correctly **with the backend switched off** |
| T15 | Negative control + `/why` page | T14 | Two clickable mainnet transactions side by side |
| T16 | README + demo video | T14, T15 | A stranger can reproduce it |

**Completing T16 satisfies every hackathon requirement.** The payer-side UI is
not required — the first run may be executed from the CLI.

### Milestone C — Full product

| ID | Task | Deps | Done when |
|---|---|---|---|
| T9 | App skeleton + wallet connect | T1 | Connects Rabby/MetaMask to chain 5042 |
| T10 | Create-run screen | T7, T9 | CSV → preview → preflight → sign |
| T11 | Reconciliation view | T3, T9 | 6 statuses, explorer links |
| T8 | `npx arc-reconcile` CLI | T3 | Rebuilds the table from `txHash` + RPC |

T9 depends only on T1, so frontend work can start immediately and interleave.

### Critical path

```
T1 → T2 → T3 ─┐
T1 → T4 → T5 ─┴→ T6 → T7 → T14 → T15 → T16 → submit
T0 ───────────────────────┘
```

Nine tasks. Everything else is parallel or cuttable.

### Cut order under time pressure

cirBTC (keep USDC + EURC) → T8 CLI → T10 create-run screen → Merkle degraded to
a flat hash (loses payroll privacy).

**Never cut:** T3, T13, T14, T12.

### Submission timing

Arc reviews on a rolling basis, states *"earlier submissions get earlier
answers"*, and issues all decisions by 2026-10-21. **Submit as soon as T16 is
done** — do not wait for the deadline. Milestone C can continue afterwards; the
repo and deployment update continuously.

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| ~~EURC / cirBTC unobtainable on mainnet~~ | **RETIRED 2026-09-21** | Resolved by T0 — see §9.1. Deep Uniswap liquidity exists for both |
| Priority-fee floor set too low | Medium | Uniswap's Arc playbook states `maxPriorityFeePerGas ≈ 5 gwei`; `eth_maxPriorityFeePerGas` returns **0.33 gwei** **[measured]**. Our §4.3 floor of 1 gwei may be too low. Confirm with a real transaction at T5 and raise if needed |
| Smart-wallet rejection behaves unexpectedly | Medium | T5 tests it for real; simulation cannot (§6.1) |
| Real log ordering differs from expectation | Low | §4.1 join is order-independent by construction |
| Judged as derivative of Request Network | Medium | Position honestly (§2); lead with the 3-token single-transaction demo, which Request cannot do |
| Non-standard ERC-20 (fee-on-transfer) breaks matching | Low | Reconcile from the emitted `Transfer` value, never from requested amount |
| Scope creep into payroll SaaS | Medium | §3 non-goals are binding |

---

### 9.1 T0 resolved — token acquisition path

Investigated 2026-09-21. **The project's highest risk is retired.**

Direct cirBTC minting is gated to KYB-verified institutions through Circle
Mint, and StableFX is an enterprise RFQ venue — neither is available to us.
Neither is needed: **Uniswap v2, v3, v4 and UniswapX are live on Arc**, the
Uniswap Web App supports chain 5042 directly, and cirBTC was supported from
launch.

| Token | Path | Liquidity **[measured]** |
|---|---|---|
| USDC | CCTP bridge from another chain | — |
| **EURC** | Uniswap swap on Arc | v3 fee=500 pool `0x6fd5F2fb…`: **$16,656 / €12,862**; v4 PoolManager holds **€45,873** |
| **cirBTC** | Uniswap swap on Arc | v3 fee=100 pool `0x82916bee…`: **67.05 BTC / $5.85M** |

Three on-chain discoveries cross-check exactly against Uniswap's published Arc
playbook, which is what makes this conclusion trustworthy rather than inferred:

| Found on chain | Confirmed as |
|---|---|
| factory `0xf0db7b58379503491d857dB50AC9ece64c653918` | Uniswap **v3 Factory** on Arc |
| swap sender `0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77` (24,497 bytes) | **SwapRouter02** |
| large EURC holder `0x8366a39cc670b4001a1121b8f6a443a643e40951` | Uniswap **v4 PoolManager** |

Demo needs only a few dollars against pools holding millions, so slippage is
immaterial. Pool addresses above are **not** hardcoded anywhere in the product —
they are acquisition logistics only.

## 10. Definition of done

> A stranger, holding only a `txHash` and an RPC URL, can rebuild the complete
> reconciliation table and verify any individual payment — **without touching
> our infrastructure.**

---

## Appendix A — Verified addresses (Arc mainnet, chain 5042)

| Contract | Address | Status |
|---|---|---|
| `Memo` | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` | live **[measured]** |
| `Multicall3From` | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` | live **[measured]** |
| `Multicall3` | `0xcA11bde05977b3631167028862bE2a173976CA11` | live **[measured]** |
| USDC (ERC-20) | `0x3600000000000000000000000000000000000000` | 6 dec, $624.2M **[measured]** |
| EURC | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | 6 dec, €4.02M **[measured]** |
| cirBTC | `0x171a4217b86a807a64eb94757db6849fb4bdbaa0` | 8 dec, 397.4 BTC **[measured]** |
| USYC | `0x8a5D989Bbb96929F689B0200f435f53dA42bF490` | supply 0 — unused **[measured]** |
| System emitter | `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` | EIP-7708, 18 dec **[measured]** |

### Event signatures

```
Transfer(address,address,uint256)
  0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
Memo(address,address,bytes32,bytes32,bytes,uint256)
  0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4
BeforeMemo(uint256)
  0xb252e055da754c72fbf7542cf424b190808a9b541e912894c5e15b4238c41501
```

`Memo` indexed fields: `sender`, `target`, `memoId`. `callDataHash`, `memo`, and
`memoIndex` live in the data section.

### Endpoints

```
Mainnet RPC     https://rpc.mainnet.arc.io          (no debug_traceCall)
Mainnet RPC alt https://rpc.drpc.mainnet.arc.io     (debug_traceCall + state overrides)
Explorer        https://explorer.arc.io             (Blockscout, public)
Testnet RPC     https://rpc.testnet.arc.io          (viem says rpc.testnet.arc.network — verify)
Faucet          https://faucet.circle.com
```
