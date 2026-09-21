# Pre-mainnet audit — `PayoutAnchor`

2026-09-21, before any mainnet deploy. Every finding had a proof-of-concept;
the PoCs now live on as regression tests in `contracts/test/Audit.t.sol`.

The timing mattered: the contract has no admin and is not upgradeable, so this
was the only moment the first three findings could be fixed at all.

## Fixed

### H-1 — an identical repeat payout was permanently impossible

`clientRunIdFor(payer, items)` hashed the payer and the list and nothing else.
A fixed-salary payroll has the same invoice ids and the same amounts every
month, so month two produced the same id as month one, `PayoutAnchor` refused
it with `RunExists`, and the payment could never be made. Write-once, no admin,
no recovery.

The replay guard was blocking the legitimate payment it was supposed to
protect. The two cases differ only by *period*, and period was not in the
formula.

`runLabel` is now a required third argument. Same list, same label still
collides — a double-clicked button is still blocked. Same list, next label is a
new run. Required rather than defaulted, because a default would restore the
bug silently.

Confirmed on testnet against the fixed contract: `testnet-2026-09` run twice is
refused; the identical list under `testnet-2026-10` pays.

### H-1b — delimiter injection in the run id (found while fixing H-1)

The old canonical form joined fields with `|` and rows with `\n`. One row whose
`invoiceId` contained those characters canonicalised identically to two honest
rows — demonstrated as a real collision before the fix. Every field is now
ABI-encoded at fixed width and the `invoiceId` is hashed, so no content inside
an id can change the structure.

### M-1 — `verifyItem` accepted internal nodes and the root as members

`verifyItem(runId, leaf, proof)` took a caller-supplied `bytes32`.
`MerkleProof.processProof` returns the leaf unchanged for an empty proof, so
`verifyItem(runId, root, [])` returned **true**, and any internal node verified
with its sibling's proof.

The plan's reasoning — leaf preimages are 128 bytes, node preimages 64, so
second-preimage resistance is structural — is true but answers a different
question. It stops someone *finding a preimage* for a node; it does not stop
them *passing the node's hash straight in* as the leaf argument.

Our own code was never exposed, because it derives leaves via `leafFor()`. But
`verifyItem` is public API on a contract that will be source-verified on
mainnet, and the Plan 2 web UI is a caller. Any integrator who accepts a
user-supplied leaf could be shown a forged membership proof.

Fixed at the contract, not in documentation: `verifyItem` now takes
`(runId, memoId, token, to, amount, proof)` and derives the leaf itself. A bare
`bytes32` is no longer reachable through the API.

Confirmed on testnet: the real line verifies; amount +1, a substituted
recipient, and the root fed in as `memoId` all return false.

### M-2 — struct field order wasted a storage slot

`address payer` was declared before `bytes32 root`. `root` needs a whole slot,
so `payer` sat alone in slot 0 with 12 bytes wasted and the struct spanned
three slots. Declaring `root` first packs `payer` + `itemCount` + `timestamp`
into exactly 32 bytes.

**22,140 gas per commit (~30%)**, measured in isolation against an otherwise
identical contract.

Do not read the drop in the end-to-end testnet run (274,152 → 209,951) as this
figure. Most of that gap is the recipient's token balance slots being non-zero
on the second run.

### L-2 — `verifyItem` conflated "no such run" with "bad proof"

Both returned `false`. Added `isCommitted(runId)`.

### L-3 — `MemoCallerProbe` lived in `src/`

An unrestricted arbitrary-call contract with `receive() payable`. Anyone can
make it call anything, including transferring away whatever it holds — proven
in `test/ProbeRisk.t.sol`. It was being compiled into the deployable artifact
set, one careless `forge create` away from mainnet. Moved to `test/`.

The testnet instance at `0xd4838881EcBa8320d456B8B65A07A0ac167F0890` still
holds 0.01 testnet USDC and remains drainable by anyone. Left as-is; it is
worthless and the contract is a record of the §6.1 experiment.

### L-4 / L-6 — pragma and mislabelled output

`pragma` pinned to `0.8.28` for reproducible verification. `testnet-run.ts` was
printing `clientRunId` under the label `runId`; during this audit that cost a
wrong explorer lookup that read exactly like "the run was never committed".
`runIdFor()` was added to `@ledgerline/core`, mirroring the contract, and the
script now prints both. The TypeScript derivation is pinned by a test to the
value the deployed contract returned.

## Accepted, not fixed

**`itemCount` is unverified.** The contract never sees the leaves, so it cannot
check the count against the tree. Documented in NatSpec as a display hint from
the payer, never a trusted count. Pinned by a test.

**Anyone can commit any root.** `runId` is namespaced by `msg.sender`, so this
is noise inside the committer's own namespace. A test pins that the payer's id
stays unreachable.

**A commitment proves declaration, not execution.** Nothing on chain binds the
committed root to the payments in the same transaction — it cannot, because
`CallFrom` forbids this contract from being the caller. The reconciler is what
compares intent against reality. The NatSpec now states this scope limit
explicitly.

Keep the pitch honest about it: the anchor makes divergence *detectable*, it
does not *prevent* a wrong payment. The judges are Arc engineers and this is
the first question a careful one asks.

## Verified good

No funds, no approvals, no owner, no upgradeability, no external calls in
`commit()` and therefore no reentrancy surface.

`msg.sender` inside `commit()` is the payer EOA, not `Multicall3From` —
checked on testnet by reading `runs[runIdFor(EOA, clientRunId)]` and finding
the run, while `runIdFor(Multicall3From, …)` is empty. The whole `runId` scheme
rests on this.

## State after the audit

76 TypeScript tests, 21 Solidity tests, typecheck clean.

Fixed anchor redeployed to testnet at
`0xb8907A07768D936D1D498257E5803c91033a8802`. The earlier deployment
`0xf22B15fDCADB13573E732eE89841299717f6B7f4` is the pre-audit contract and must
not be used.
