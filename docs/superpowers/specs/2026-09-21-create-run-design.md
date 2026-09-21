# Create-run — Design Spec

The payer side: a CSV becomes a signed, anchored, referenced payout run, from
the browser, without touching a script.

**Parent spec:** `2026-09-21-ledgerline-design.md`. That document specifies the
verification surfaces (reconciler, receipt page, reconciliation view) and the
chain constraints. This one specifies the surface that *creates* the evidence
those pages read. Where the two disagree, the divergence is called out inline.

Claims are tagged `[measured]`, `[docs]` or `[unverified]`, as in the parent.

---

## 1. Why this is not optional

The parent spec files the create-run screen under Milestone C and labels it
cuttable. That label was a deadline hedge written before the schedule was
known, and it is withdrawn: a payout tool whose payer cannot create a payout is
not a product. Ledgerline is an MVP, not a demo.

Reframing from "demo" to "MVP" surfaced three defects that the demo framing had
kept out of view. Two are in scope here; one is deferred with a reason.

### 1.1 The run salt is not random — the privacy claim is currently false

Parent spec §5:

```
runSalt : bytes32        // random, 32 bytes
```

`scripts/run-payout.ts:45`, the only place in the repository that produces one:

```ts
runSalt: keccak256(toHex(`ledgerline-${net.name}-salt-1`)),
```

A public constant. `grep -r 'randomBytes|getRandomValues|crypto\.'` over the
repository returns nothing.

Because `memoId = keccak256(runSalt ‖ invoiceId)` and invoice ids are
conventional (`INV-US-001`), anyone reading the chain can compute the memoId of
any guessable invoice and rebuild counterparty relationships. This defeats the
property `memo.ts` advertises in its own doc comment and that parent §4.2 gives
as the reason for using a Merkle tree rather than a flat hash.

For a single testnet run it is harmless. For a product it is the advertised
privacy property, broken at its source. **In scope — §2.**

### 1.2 A random salt would create permanent data loss

The naive fix makes it worse. If the salt is random and lives only in browser
memory until the payer clicks download, then closing the tab first destroys
every recipient's ability to verify, permanently and unrecoverably — the salt
cannot be read back off the chain.

These two requirements are in direct conflict, and only the MVP framing makes
the second one visible. **In scope — §2 resolves both together.**

### 1.3 Runs over 400 rows have no path forward

`buildRun` throws above `MAX_ITEMS_PER_RUN = 400`. Parent §4.3 says such CSVs
"split into separate runs"; no splitting code exists. A 500-person payroll hits
an error message and stops.

**Deferred**, deliberately. Splitting produces several `txHash` values for one
CSV, which collides with the invariant *one `runId` = one `txHash`* and changes
what both read surfaces display. It is independent work and does not block
running the full flow end to end. Recorded here so it is not rediscovered as a
surprise.

---

## 2. The run salt

### 2.1 Derivation

```
runSalt = keccak256( personal_sign(payer, "ledgerline-run-salt:v1:<chainId>:<runLabel>") )
```

| Property | How it holds |
|---|---|
| Unguessable by observers | Requires the payer's private key |
| Recoverable by the payer | Re-sign the same message; no storage, no server |
| Distinct per network | `chainId` is in the message, so a testnet rehearsal and the mainnet run never share a salt |
| Versioned | `v1:` allows changing the scheme later without invalidating existing runs |

This keeps the source-of-truth principle intact: recovery needs the payer's
wallet and the chain, and nothing of ours.

`runLabel` is normalised before it enters the message — trimmed, inner
whitespace collapsed to single spaces, case preserved — so that a trailing
space typed on the recovery screen does not silently produce a different salt.
Case is kept rather than lowercased because a label is also shown to humans,
and the normalisation rule is recorded in the downloaded manifest.

**Recovery requires the payer to supply the `runLabel` again.** It is not
derivable from the chain: `runId = keccak(payer ‖ clientRunId)` appears as a log
topic, but it cannot be inverted. This is stated rather than hidden, and it is
why the label is a prominent, named field on the create-run form rather than a
generated value — the payer must be able to write it down. A forgotten label is
not a disaster: the manifest download carries it, and a wrong guess is caught
rather than acted upon (§2.2).

### 2.2 Determinism is checked, never assumed

The scheme depends on the same key and message producing the same signature.
**[measured]** viem's local signer does: five signatures over one message were
byte-identical, and changing `runLabel` changed the salt (verified 2026-09-21).

That measures the algorithm (RFC 6979 deterministic ECDSA), **not** MetaMask or
Rabby, which sign with their own implementations. Their behaviour is
`[unverified]`.

So the recovery path does not assume it — it verifies:

```
re-sign → derive salt → derive memoId for each invoice
        → compare against the memoIds actually in the transaction's logs
```

- Match → recovery succeeded; rebuild every receipt link.
- No match → say so plainly and point to the downloaded manifest. Never emit a
  receipt link that has not been checked against the chain.

If browser wallets turn out to be non-deterministic, the product stays correct
and merely loses a convenience — and we find out, because the application
measures it rather than trusting it. The first person to use recovery answers
the question.

### 2.3 Cost: two wallet prompts

The salt must exist before the calldata, because memoIds determine the calldata:

```
CSV → runLabel → [sign #1: salt] → build → preflight → [sign #2: send]
```

These cannot be merged. Accepted knowingly, in exchange for removing the
permanent-data-loss failure of §1.2.

### 2.4 Handoff

The results screen's primary output is **one receipt link per row**, each
carrying `?i=<invoiceId>&s=<runSalt>&p=<proof>&n=<network>`, with a copy
button. The manifest JSON download remains, demoted from sole lifeline to
convenience backup.

`/run/<txHash>` gains a **Recover receipt links** action driving §2.2, which
turns "closed the tab" from a catastrophe into one click — provided the payer
still has the `txHash`. Keeping that findable is §7.

---

## 3. CSV

### 3.1 Format

Header required, column names validated. A silently reordered column is a
wrong-payment bug.

```csv
invoiceId,token,to,amount
INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-EU-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-BTC-003,cirBTC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.00001
```

Token by symbol and amount in decimal form — what an accountant's export
actually looks like. `runLabel` is a form field, not a column: it belongs to the
run, not to any row.

### 3.2 Two phases, and the boundary enforces the decimals invariant

```
packages/core/src/csv.ts
  parseCsv(text)                       → ParsedRow[]      // structure only
  resolveRows(rows, tokens, decimals)  → ManifestItem[]
```

`parseCsv` cannot resolve a token or convert an amount. Producing a
`ManifestItem` *requires* passing a decimals table, and that table can only
come from `decimals()` on chain. The invariant "decimals are read from chain,
never hardcoded" is enforced by the type signature rather than by a comment.

### 3.3 Amount conversion

Integer string arithmetic only; no floating point anywhere. `"0.10"` with 6
decimals → split on `.`, pad the fraction to 6 with zeros, concatenate,
`BigInt` → `100000n`.

Rejected, never silently coerced:

| Input | Reason |
|---|---|
| `0.0000001` against a 6-decimal token | More precision than the token has. Silent rounding of other people's money is not acceptable in a payroll tool |
| `1e-7` | Scientific notation |
| `1,000.50` | Thousands separator |
| `-5` | Negative |
| `0` | Legal on chain, meaningless in payroll |
| empty | — |

### 3.4 Real-world CSV

BOM, CRLF and double-quoted fields containing commas all appear in Excel
exports. Minimal RFC 4180 handling, roughly fifteen lines.

### 3.5 Validation

```
packages/core/src/validate.ts
  validateRun(items) → { errors: RowIssue[], warnings: RowIssue[] }
```

Returns arrays with line numbers; never throws. Fixing a 400-row payroll one
error per attempt is unusable.

| Check | Level |
|---|---|
| `to` is `0x0` | error — Arc reverts on value transfer to zero |
| `to` malformed or bad checksum | error |
| unknown token symbol | error |
| duplicate `invoiceId` | error — duplicate memoId makes reconciliation ambiguous |
| more than 400 rows | error — see §1.3 |
| **duplicate recipient** | **warning, never blocking** — two invoices to one person is valid |

Per-token balance and Arc's runtime blocklist require the network and belong to
preflight (§4), not here.

`buildRun` keeps its existing `throw`s. They are not redundant:
`validateRun` serves the interface, the throws are the last guard for any
caller reaching `buildRun` directly. Two layers, on purpose.

---

## 4. Shared executor

### 4.1 Why it is shared

`scripts/run-payout.ts` and the create-run screen perform the same eighty lines
between them, differing only at the ends: signing with a private key versus a
wallet, writing a file versus offering a download.

The project has already paid for this lesson once — `testnet-run.ts` and
`mainnet-run.ts` were merged into one script because "two near-identical
scripts drift, and drift costs real money". The same argument applies with more
force here, because the duplicated middle contains the gas floor.

### 4.2 Interface

```ts
packages/core/src/execute.ts

executeRun({ manifest, anchor, publicClient, send, onProgress }) → RunOutcome
```

`send` is supplied by the caller: the script signs with
`privateKeyToAccount`, the browser opens the wallet. Core neither knows nor
needs to know the difference. `onProgress` drives the antd `Steps` in the
browser and `console.log` in the script.

Sequence:

```
1. balances    balanceOf + decimals per token, summed per token, against need
2. preflight   eth_call with allowFailure=true → per-payment outcomes
3. fees        gasPolicy(gasPrice, tip) + estimateGas × 1.2
4. send        send(tx) → hash
5. read back   inspect the transaction that was actually broadcast
6. await       receipt, with timeout
```

`execute.ts` is a deliberate exception to core's otherwise network-free
character. It takes a viem `PublicClient`; core already depends on viem.
`reconcile.ts` remains pure — invariant #1 is about the reconciler
specifically. This exception is to be recorded in `CLAUDE.md` so it is not
"cleaned up" later.

### 4.3 Step 5 is the reason this milestone exists

We set `maxFeePerGas` correctly, but a browser wallet presents its own fee
interface and the user can edit it. Below 20 Gwei, Arc's mempool drops the
transaction **silently** — no receipt, no error, no revert **[docs]**. For a
payroll tool that means the screen says "paid" while nothing happened.

We cannot prevent it, so we measure it:

- `getTransactionByHash` returning `null` persistently → the mempool took it.
  Almost certainly a fee below the floor.
- Transaction present → read **its own** `maxFeePerGas` and compare against
  25 Gwei. If the wallet lowered it, warn immediately: this may never be
  included.

A short notice appears before the wallet opens: *the wallet will ask about
fees; do not lower them below 25 Gwei.*

### 4.4 Outcome states are types, not message strings

```ts
type RunOutcome =
  | { state: "blocked";   reason: "balance" | "preflight"; details }  // nothing signed
  | { state: "dropped";   txHash; sentFees }                          // never entered the mempool
  | { state: "pending";   txHash; sentFees }                          // in the mempool, no receipt yet
  | { state: "reverted";  txHash; receipt }                           // mined, failed
  | { state: "confirmed"; txHash; receipt }                           // paid
```

Invariant #4 — never report a payment successful without a receipt — becomes
something the compiler holds: no path reaches `confirmed` without a receipt
whose `status` is `success`. `pending` and `dropped` are displayable states,
not the absence of one.

Both `dropped` and `pending` offer a re-run. This is safe by construction
rather than by interface discipline: `PayoutAnchor` is write-once, so if the
first attempt did land, preflight blocks the second **[measured]** — observed
on testnet, finding 5 of the testnet notes.

---

## 5. Wallet

`apps/web/lib/wallet.ts`, roughly sixty lines: raw EIP-1193 plus viem
`custom()`. `connect`, `ensureChain` (`wallet_switchEthereumChain`, falling
back to `wallet_addEthereumChain`), and listeners for `accountsChanged` and
`chainChanged`.

No wagmi, no RainbowKit. One chain, EOA only, and antd is already the UI kit —
wagmi brings a React context and a query client to solve problems this
application does not have.

### 5.1 Contract wallets are rejected at connect

`Memo` reverts with `sender spoofing requires tx.origin as sender`
**[measured]** — a real testnet transaction, since `eth_call` and
`debug_traceCall` force `msg.sender == tx.origin` and cannot test the rule.

So after connecting, `getCode(address)`: non-empty means a Safe or ERC-4337
wallet, which is blocked with an explanation rather than allowed to sign a
transaction guaranteed to revert and burn gas.

One exception: an EOA carrying an EIP-7702 delegation also has code while
remaining an EOA with a valid `tx.origin`, so code beginning with `0xef0100` is
allowed through. `[unverified]` — whether Arc enables 7702 is unknown; the
guard is three lines and prevents a false rejection.

### 5.2 Who this serves, and who it does not

The EOA rule is not a missing feature; it is a property of Arc's `Memo`
predeploy, and it decides who can use Ledgerline at all.

A company running payroll does not hold its funds in a single private key. It
holds them in a Safe, behind multiple signers, because that is how treasury
works. **That company cannot use this product as designed.** Saying so here,
plainly, is cheaper than letting someone discover it at the signing step.

The workaround, and its cost, stated rather than implied:

```
Safe  --(transfer)-->  operating EOA  --(payout run)-->  recipients
```

It works, and it costs a second transaction plus a window in which one key
controls the payroll amount. That window is exactly the custody risk the
product otherwise avoids. It is a defensible trade for a treasury that already
funds an operating wallet on a schedule, and a bad one for a treasury that does
not.

So the honest audience for the MVP is a payer who already operates from a
single signing key: a small company, a contractor payer, a grants programme, a
DAO's operating wallet. Not a multisig treasury paying directly.

The UI states this at the wallet connection point rather than at the failure
point, and §5.1 blocks a contract wallet with this explanation instead of a
revert.

---

## 6. Screens

Route `/new`, not `/run/new`, to keep it clear of `/run/<txHash>`.

```
1 Upload      Upload.Dragger + runLabel. Parsed on drop; errors shown in place
2 Preview     Table: symbol, resolved address, amount at on-chain decimals,
              recipient, per-token totals. Errors block; warnings do not
3 Preflight   [sign #1 for salt] → build → balances + preflight → per-row result
4 Send        fee notice → [sign #2] → live through the five RunOutcome states
5 Result      per-row receipt links with copy, manifest download
```

Wallet connection is **not a step**. It lives in the masthead — address,
network, disconnect, and a link to `/runs` — always visible, and step 3 gates
on it. Requiring a
wallet before someone may look at their own CSV is a bad habit of the genre.

### 6.1 Files

`Reconciliation.tsx` has reached ~500 lines and is hard to read. Not repeated:

```
app/new/page.tsx
app/new/CreateRun.tsx      state and orchestration
app/new/StepUpload.tsx
app/new/StepPreview.tsx
app/new/StepPreflight.tsx
app/new/StepSend.tsx
app/new/Result.tsx
app/runs/page.tsx          local run history (§7)
lib/wallet.ts
lib/history.ts             localStorage index, no authority
```

The existing ledger-paper vocabulary is reused throughout — `.sheet`,
`.masthead`, `.line`, `.verdict`, `.rung`. New CSS should be close to none.

---

## 7. Run history

### 7.1 The problem the source-of-truth principle creates

`[measured]` on Arc testnet, 2026-09-21: the most recent 10,000 blocks span
7,247 seconds — **2.01 hours**, at an average block time of 0.725 s.

The public RPC caps `eth_getLogs` at roughly 2,000 results over ~10,000 blocks.
`RunCommitted` does index `payer`, so filtering by it is possible — for the
last two hours. Beyond that the chain is, in practice, unsearchable.

So a payer who loses a `txHash` has lost the run. Opening the application
tomorrow, there is no way to find last month's payroll. This compounds with
§2: recovery needs the `txHash` *and* the `runLabel`, and losing the first
makes the second worthless.

### 7.2 A local index that holds no authority

Invariant #1 says `reconcile()` must take no database handle and that no
feature may need our server to be *correct*. It does not forbid an index for
*finding* things. The distinction is the whole design:

- Stored in the payer's browser (`localStorage`), never on a server of ours.
- Holds `txHash`, `runLabel`, `chainId`, timestamp, item count, per-token
  totals. Enough to find a run, never enough to prove one.
- **Opening an entry re-reads the chain.** Nothing displayed comes from
  storage. Where storage and chain disagree, the chain wins and the entry is
  marked stale.
- Deleting the whole history loses nothing that the chain does not still hold,
  provided the payer kept the `txHash`.

An entry is written **as soon as a `txHash` exists**, not on `confirmed`. A
`dropped` or `pending` run is precisely the one worth finding again.

### 7.3 What it deliberately is not

It is per-browser and per-device, and it does not sync. A payer on a new laptop
sees an empty list. That is a real limitation, and the downloaded manifest
remains the portable record — this index is a convenience on top of it, not a
replacement for it.

It also holds `runLabel` in plain text, which may name a client or a pay
period. That is the same exposure as browser history on a shared machine, and
the history screen carries an explicit clear action for it.

### 7.4 Screen

Route `/runs`: a list of local entries, newest first, each linking to
`/run/<txHash>`. Reachable from the masthead. Empty state explains what the
list is and why it may be empty on this device.

---

## 8. Testing

**Core, TDD with vitest.** `parseCsv` and `resolveRows` against a case table:
BOM, CRLF, quoted fields, missing and extra columns, every amount case in §3.3,
400 rows against 401. `executeRun` against a fake `publicClient` and a fake
`send`: insufficient balance → `blocked`; a failing preflight row → `blocked`
with nothing signed; `getTransactionByHash` null → `dropped`; a lowered fee →
`confirmed` with a warning; a reverted receipt → `reverted`.

**Web.** No unit tests, per the existing convention that logic lives in
`@ledgerline/core`.

**The browser signing path has no automated coverage.** A development-only
injected provider was designed and then dropped: it was the one element that
would be dangerous if it ever reached production, and the owner has taken on
real-wallet testing manually. The cost is explicit — every change to the
signing path needs a manual pass. Automated regression can be added later if
that becomes painful.

Two questions belong to the wallet and can only be answered by hand:

1. Does the wallet permit lowering the fee below 25 Gwei, and does our warning
   catch it?
2. Does re-signing the same message produce the same signature? — answered in
   passing the first time anyone uses recovery, because §2.2 checks itself.

### 8.1 Definition of done

One complete three-token payout run on Arc testnet, executed entirely from the
browser with no script involved, followed by opening a receipt link produced by
the results screen and seeing all five rungs pass.

Then, from a fresh page load: find that run again in `/runs`, open it, use
**Recover receipt links**, and get the same links back — proving §2.2 and §7
together, and answering the wallet-determinism question in passing.

---

## 9. Out of scope, with reasons

| Item | Why not |
|---|---|
| Splitting runs over 400 rows | §1.3 — collides with *one runId = one txHash* and changes both read surfaces. Independent work |
| `allowFailure` opt-in | Parent §4.3 offers it. Adds a hard-to-test branch for a case this MVP does not have. Default stays `false`: a whole run reverts rather than paying some people |
| An email column in the CSV | Assumes the payer holds a mailing list; rejected when the format was chosen, and not to be reintroduced by the back door |
| wagmi / RainbowKit | §5 |
| Development-only injected provider | §8 |
| Syncing run history across devices | §7.3 — would need a server holding payer data, which is the shape invariant #1 exists to prevent. The downloaded manifest is the portable record |
| Real fee bump (replacement transaction at the same nonce) | Parent §4.3 describes it. Requires nonce management, `replacement underpriced` handling, and the race where the original lands after the bump. The write-once anchor already makes a plain re-run safe, which covers the same ground for far less risk |
