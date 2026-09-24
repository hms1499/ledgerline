# Architecture

This document is for people who will change Ledgerline's code. It describes how
the pieces fit, where each responsibility lives, and which design decisions are
deliberate and should not be "tidied" away. For what the project does and how
to run it, start with the [README](README.md). For the measurements behind the
design, see the [design spec](docs/superpowers/specs/2026-09-21-ledgerline-design.md).

## Bird's-eye view

Ledgerline has one central claim: **the chain is the record.** A payout run is
a single transaction whose logs carry everything needed to reconcile it. Every
component either builds that transaction or reads it back. No component keeps
state that another one depends on to be correct.

```text
                     ┌──────────────────────────────────────────────┐
  CSV ──► apps/web ──┤  packages/core                               │
          (/new)     │   validate → build → preflight → executeRun  │──► one transaction on Arc
  scripts/ ──────────┤                                              │
  run-payout.ts      └──────────────────────────────────────────────┘
                                                                        │
                                        receipt logs (eth_getTransactionReceipt)
                                                                        ▼
                     ┌──────────────────────────────────────────────┐
  packages/cli ──────┤  packages/core                               │
  apps/web (/run,    │   reconcile · verifyReceipt ·                │◄── PayoutAnchor.runs(runId)
  /r, /dashboard,    │   assessCompleteness · checkManifestAgainstRoot  (root, itemCount)
  /why)              └──────────────────────────────────────────────┘
```

There is no backend. The web app's pages are server-rendered shells, and every
chain read happens in the browser against an RPC endpoint. The only things
stored off chain are conveniences: the payer's run history in `localStorage`,
and the run file the payer downloads.
Losing either loses nothing that cannot be rebuilt from the chain and a
signature.

## The transaction

Everything else in the codebase exists to build this transaction or to read it.

```text
payer EOA ──► Multicall3From.aggregate3([
                { PayoutAnchor.commit(clientRunId, root, itemCount),  allowFailure: false },
                { Memo.memo(token₁, transfer(to₁, amount₁), memoId₁, 0x), allowFailure },
                …                                                    (up to 400 items)
              ])
```

`Multicall3From` and `Memo` are Arc predeploys. `PayoutAnchor` is the only
contract this project deploys.

| Value | Definition | Where |
|---|---|---|
| `runSalt` | `keccak256` of the payer's signature over `saltMessageFor(chainId, runLabel)` | `core/src/salt.ts` |
| `memoId` | `keccak256(runSalt ‖ utf8(invoiceId))` | `core/src/memo.ts` |
| leaf | `keccak256(abi.encode(memoId, token, to, amount))` | `core/src/merkle.ts`, `PayoutAnchor.verifyItem` |
| `root` | Merkle root over the leaves in list order, OpenZeppelin sorted-pair hashing, an odd node carried up unhashed | `core/src/merkle.ts` |
| `clientRunId` | `keccak256(abi.encode(payer, keccak256(runLabel), sorted([keccak256(abi.encode(keccak256(invoiceId), token, to, amount))…])))`. Sorting makes it independent of row order | `core/src/build.ts` |
| `runId` | `keccak256(abi.encode(payer, clientRunId))`, computed on chain from `msg.sender` | `PayoutAnchor.runIdFor` |

Three properties follow from this layout, and most of the code depends on them:

- **Every subcall sees the payer as `msg.sender`.** Arc's `CallFrom` rejects
  sender spoofing, so a contract that called `Memo` for the payer would revert.
  `PayoutAnchor` is therefore a sibling subcall, never a wrapper. This was
  proven with real testnet transactions, because `eth_call` forces
  `msg.sender == tx.origin` and cannot test the rule.
- **The anchor call is never optional.** It is always `allowFailure: false`, so
  a duplicate run (`RunExists()`) reverts the whole batch and no payment moves.
  Payment calls are `allowFailure: false` in the real transaction and `true`
  only in preflight, where each row should report its own failure.
- **A payment is joined to its reference by hash, not by position.** `Memo`
  emits `callDataHash = keccak256(transfer(to, value))`. The reconciler rebuilds
  that hash from each `Transfer` log. Log order never matters, which is why the
  reconciler survives EIP-7708 system logs and nested memos that unwind
  innermost-first.

## Codemap

### `packages/core`

Pure TypeScript shared by the CLI, the scripts and the browser. Apart from
`execute.ts`, no module performs I/O.

**Building a run**

| Module | Responsibility |
|---|---|
| `csv.ts` | Parse a payout CSV, resolve token symbols to addresses and human amounts to base units |
| `validate.ts` | Row-level checks that return every issue at once (a 400-row payroll should not be fixed one error per attempt) |
| `salt.ts` | Normalise the run label, build the message to sign, derive the salt from the signature |
| `memo.ts` | `memoIdFor` |
| `merkle.ts` | Leaves, tree and proofs. Cross-checked against the contract in `contracts/test/MerkleCrossCheck.t.sol` |
| `build.ts` | `clientRunIdFor`, `runIdFor` and `buildRun`: the `aggregate3` calldata, root, proofs and memo ids. Enforces the 400-item cap, no zero address, positive amounts |
| `preflight.ts` | Simulation calldata, decoding per-row outcomes, and `gasPolicy` (25 Gwei floor on `maxFeePerGas`, 1 Gwei floor on the tip) |
| `funding.ts` | What the payer needs per token. Never pooled across tokens |
| `errors.ts` | Turns revert data into sentences, including `RunExists` and `EmptyRun` |
| `execute.ts` | `executeRun`: the whole send sequence (see below) |

**Reading a run**

| Module | Responsibility |
|---|---|
| `logs.ts` | Decode `Memo` and `Transfer` logs. Drops the system emitter `0xffff…fFfE`, which emits a second, 18-decimal `Transfer` for every USDC transfer |
| `join.ts` | Join each memo to its transfer by `callDataHash`. A memo with no matching transfer is `unlinked` |
| `reconcile.ts` | `reconcile(logs, manifest?)`: the pure reconciler. Six statuses: `matched`, `amount_mismatch`, `recipient_mismatch`, `unpaid`, `unexpected`, `unlinked`. Without a manifest every payment is `unexpected`, and the UI and CLI present that as "paid" |
| `completeness.ts` | `assessCompleteness` compares payments found with the anchored `itemCount`. `checkManifestAgainstRoot` rebuilds a run file's root and compares it with the anchored one |
| `verify.ts` | `verifyReceipt`: the recipient's five checks (`tx_found`, `payment_found`, `invoice_match`, `identity_intact`, `anchored`) and the resulting receipt state |
| `links.ts` | Rebuild receipt proofs from what is on chain |
| `summary.ts` | Per-token totals of a run, for the dashboard |
| `compare.ts` | What one transaction's logs let a recipient establish: referenced payments and who `Transfer.from` is. `/why` runs it on both transactions |
| `constants.ts` | Addresses, event topics, gas floors, per-chain token sets |

`execute.ts` is the one deliberate exception to "no I/O in core". The script
and the browser must run the same send sequence, and that sequence contains the
gas floor. Two copies would drift, and on Arc a drifted fee is a payment that
silently never happens. `executeRun` takes a narrow `ExecuteIO` interface (with
`ioFromPublicClient` adapting viem to it) and a `send` callback. It orchestrates
and decides nothing that `reconcile()` depends on.

### `packages/cli`

`arc-reconcile`, run as `pnpm reconcile <txHash>`. It reads the receipt,
calls `reconcile()`, reads token decimals and symbols, and reads
`PayoutAnchor.runs(runId)` for completeness. With `--manifest` it also checks
the run file against the anchored root.

- `args.ts` parses flags and holds the known anchor for each network. The
  anchor address comes from here or from `--anchor`, never from the transaction
  being checked, because any contract can emit a `RunCommitted` event.
- `anchor.ts` finds the run id in the trusted anchor's log.
- `format.ts` prints amounts in the token's own decimals, or unscaled with the
  token address when decimals cannot be read.

### `apps/web`

Next.js App Router with Ant Design. Pages are thin server components that pass
URL parameters to client components, and every chain read is made from the browser. The network is chosen per URL with `?n=mainnet|testnet`
(`lib/use-network.ts`, `lib/chain.ts`), and the default comes from
`NEXT_PUBLIC_DEFAULT_NETWORK`.

Two route groups, each with its own shell:

| Group | Routes | Shell | Wallet |
|---|---|---|---|
| `app/(public)` | `/`, `/why`, `/r/[txHash]` | `PublicShell` | None. A receipt must verify for someone who has no wallet |
| `app/(app)` | `/dashboard`, `/new`, `/runs`, `/run/[txHash]` | `AppShell` (side nav, top bar, bottom tabs) | `WalletProvider`, mounted in `(app)/layout.tsx` |

| Route | What it does |
|---|---|
| `/new` | Five steps (Upload, Review, Check, Pay, Receipts). The payer signs the salt message at Check. Pay calls `executeRun`, and Receipts offers the run file and receipt links |
| `/run/[txHash]` | The reconciliation view: tiles, the payments table, completeness, loading a run file, and rebuilding receipt links by signing again |
| `/r/[txHash]` | The recipient's receipt. The invoice id, salt and proof travel in the URL (`?i=&s=&p=&n=`), and the RPC endpoint can be changed on the page |
| `/dashboard`, `/runs` | The connected wallet's runs from `localStorage`, each re-read from the chain. Up to four receipt reads at a time, with a 10-second timeout per read |
| `/why` | The referenced run beside a standard `Multicall3` batch. Every figure is read from the configured transactions' logs, plus a live `allowance` read. `?ours=&naive=&approve=` swaps in any other pair |

`app/**` holds components. Decisions that can be unit-tested live in
`lib/*-view.ts` as pure functions (`run-view`, `receipt-view`, `dashboard-view`,
`preflight-view`, `funding-view`, `reconcile-view`, `run-summary-view`).
`apps/web/test` tests those functions. The repository has no React test
library, so behaviour at the wallet seam is checked in a real browser (see
Testing).

Wallet handling:

- `lib/wallet.ts` does EIP-6963 discovery and connection.
- `lib/wallet-session.ts` is a pure reducer for session transitions. It holds
  back a disconnect or account change while a screen has the only copy of a
  transaction hash.
- `components/wallet/WalletProvider.tsx` is the single provider for the app
  group.

Theming uses CSS tokens (`app/globals.css`, `lib/theme-tokens.ts`) mapped onto
antd's `ConfigProvider`. `apps/web/test/no-legacy-css.test.ts` guards against
colour aliases and hardcoded colours, and `plain-language.test.ts` keeps
internal terms such as "manifest" or "Merkle" out of user-facing copy.

### `contracts`

`PayoutAnchor.sol` (Foundry, solc 0.8.28) stores
`runs[runId] = { root, payer, itemCount, timestamp }` and emits
`RunCommitted`. It has three functions: `commit`, `isCommitted` and
`verifyItem` (Merkle proof against the stored root). It has no owner, no
upgrade path, no approvals and no balance. The mainnet deployment is
source-verified. See [`docs/notes/2026-09-24-mainnet-deploy.md`](docs/notes/2026-09-24-mainnet-deploy.md).

Tests: `PayoutAnchor.t.sol` (behaviour), `MerkleCrossCheck.t.sol` (proofs built
in TypeScript verify on chain), `Audit.t.sol` (findings from the pre-mainnet
audit), `ProbeRisk.t.sol`. `CustodialBatcher.sol` and `MemoCallerProbe.sol` are
test fixtures used to establish the caller rules and the negative control.

### `scripts`

- `run-payout.ts` sends a referenced run through `executeRun`. `--dry-run` stops
  after preflight and signs nothing.
- `naive-batch.ts` sends the same payment through a standard `Multicall3`.
- `lib/network.ts` resolves the network, RPC, anchor and token set from
  `--network` and `.env`, so the mainnet script is the one already rehearsed on
  testnet.
- `capture-fixture.ts` and `capture-receipt.ts` record real receipts as test fixtures.

## Flows

### Paying a run

```text
CSV ─ parseCsv ─ resolveRows ─ validateRun            (/new: Upload, Review)
     └─ sign saltMessageFor(chainId, runLabel) ─► runSalt
        └─ clientRunIdFor · buildRun                   (/new: Check)
           └─ executeRun                               (/new: Pay, or run-payout.ts)
                0 chain     the client's chain id must equal the manifest's
                1 balances  per token, never pooled
                2 preflight eth_call with allowFailure=true per row, so each row reports itself
                3 fees      gasPolicy, with the 25 Gwei floor
                4 send      the send callback: wallet or private key
                5 read back the fee the wallet actually broadcast; flag it if under the floor
                6 receipt   confirmed, reverted, dropped (the node never saw it) or pending
```

`executeRun` returns an outcome and never throws for an expected failure.
`confirmed` is the only state that carries a receipt, and it is the only one
the UI or script presents as paid.

The chain check comes first because USDC has the same predeploy address on
mainnet and testnet. Without it, a client pointed at the wrong chain would read
a real balance, pass preflight and sign for real money.

### Reconciling a run

```text
receipt.logs ─ decodeMemoLogs / decodeTransferLogs (drop system emitter)
             ─ joinPayments (callDataHash, sender == from)
             ─ reconcile(…, manifest?) ─► rows with statuses
PayoutAnchor.runs(runIdFromLogs) ─► assessCompleteness, checkManifestAgainstRoot
```

The run page and the CLI run the same core functions. They differ only in how
they present the result.

### Verifying a receipt

`/r/[txHash]` reads the receipt and, when the anchor has the run, its root. It
then calls `verifyReceipt` with the invoice id, salt and proof from the URL.
The page renders a pass, fail or skip for each check. It works without a
wallet, and with any RPC endpoint the recipient chooses.

## State and trust

| Data | Lives in | Trusted for | If lost |
|---|---|---|---|
| Payments, references, `RunCommitted` | Chain (the transaction's logs) | Everything | Cannot be lost |
| Root and item count | Chain (`PayoutAnchor.runs`) | Completeness, run-file integrity, receipt proofs | Cannot be lost |
| `runSalt` | Nowhere. Re-derived from a payer signature | Mapping payments to invoice ids | The payer signs again |
| Run file (JSON) | The payer's disk | Invoice ids and intended amounts, after it matches the anchored root | Ids are recoverable from the payer's own records plus a signature, and the root still proves the list |
| Run history | The payer's browser `localStorage`, keyed by payer and chain | Nothing. Every entry is re-read from the chain, and the connected wallet, not the stored payer, decides whose runs are shown | Only the list of hashes is lost |
| Receipt link | The recipient | The invoice id, salt and proof the recipient checks against the chain | Rebuilt from the run page by the payer |

No salt is ever stored. The run label stored in history is harmless on its own,
because turning it into the salt needs the payer's signature. Re-deriving the
salt assumes the wallet signs deterministically (RFC 6979), which is the norm
for `personal_sign`.

## Invariants

These hold across the codebase. Breaking one breaks the product's claim, not
just a feature.

1. **The chain is the truth.** `reconcile()` is a pure function over logs and
   takes no database or network handle. If a feature needs Ledgerline's server
   to be correct, it is designed wrong.
2. **Our contract is never the caller in the payment path.** `PayoutAnchor` is
   a sibling subcall, so `Transfer.from` stays the payer.
3. **`PayoutAnchor` never holds funds.** It has no approvals, balances, owner or
   upgrade path. It is an evidence layer. If it broke, money would still move.
4. **No payment is reported without a receipt.** `executeRun` separates
   `dropped` and `pending` from `confirmed`.
5. **Reconcile from the emitted `Transfer` value, never from the requested
   amount.** This makes the reconciler correct for fee-on-transfer tokens and
   immune to decimal mistakes in the request.
6. **Decimals come from the token contract or not at all.** No `?? 6`. An
   amount with unknown decimals is shown as the raw integer and the token
   address.
7. **One figure per token.** No pooled totals and no fiat conversion.
8. **One `runId` = one transaction**, at most 400 items.

## Arc behaviours the design depends on

Measured on Arc, and not visible from the code. Details are in the design spec
§6 and in `docs/notes/`.

- A transaction with `maxFeePerGas` under 20 Gwei is dropped silently. The fee
  floor is 25 Gwei.
- A USDC transfer emits two `Transfer` logs (6 and 18 decimals). EURC and
  cirBTC emit one. The system emitter is ignored rather than deduplicated.
- `Memo` requires a direct EOA caller, so smart-contract wallets cannot pay.
- `eth_getLogs` on the public RPC is capped, so no flow searches history.
  Everything starts from a known transaction hash or a storage read.
- `explorer.arc.io`'s API is behind a Cloudflare challenge. Contracts are
  verified through Sourcify, which the explorer reads.

## Testing

| Layer | Where | What it proves |
|---|---|---|
| Core | `packages/core/test` (vitest) | Reconciler, joins, Merkle vectors and the send sequence, against golden fixtures captured from real mainnet and testnet receipts (`test/fixtures`). `execute.test.ts` drives `executeRun` through a fake `ExecuteIO` |
| Contract | `contracts/test` (Foundry) | Anchor behaviour, replay protection, audit findings, TypeScript proofs verifying on chain |
| CLI | `packages/cli/test` | Argument parsing, trusted-anchor lookup, amount formatting |
| Web | `apps/web/test` | The pure `lib/*` view functions, plain-language copy, CSS guards |
| Wallet seam | Playwright against `next start` with an injected EIP-6963 provider | What unit tests cannot reach: provider events, effect ordering, wallet echoes. Every wallet-facing defect in this project's history passed build, typecheck and unit tests |
| Chain behaviour | Real testnet and mainnet transactions | The caller rules, log shapes and the gas floor, which simulation cannot show |

Run everything with `pnpm test && pnpm typecheck` and `cd contracts && forge test`.

## Decisions that look odd and are deliberate

- **`execute.ts` lives in core although core is otherwise pure.** One send
  sequence for script and browser, because it contains the gas floor.
- **The run page and receipt page read one transaction, never a range of logs.**
  Arc's public RPC caps `eth_getLogs`, and a design that searches history would
  fail at scale.
- **The receipt URL carries the salt.** The recipient needs it to recompute
  their memo id, and the salt only unlocks references within that run.
- **The salt is a signature, not random bytes.** A random salt held only in
  the browser would be destroyed by closing the tab. A signature cannot be
  guessed by an observer and can always be reproduced by the payer.
- **The known anchor addresses are compiled into the CLI and configured into
  the web app.** They are not discovered from the transaction, because any
  contract can emit the `RunCommitted` topic.
