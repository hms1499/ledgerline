# End-to-end run from the browser — Arc testnet

Task 12 of `docs/superpowers/plans/2026-09-21-create-run.md`: a CSV becomes a
signed, anchored, referenced payout run with no script involved, and the links
the result screen produces verify on their own.

Run by the owner in Rabby on 2026-09-22. Every number below was read back off
chain afterwards rather than copied from the screen, so the screen and the
chain are two independent witnesses to the same run.

## The run

| | |
|---|---|
| Network | Arc testnet, chain 5042002 |
| Run name | `browser-2026-09` |
| Wallet | Rabby |
| Payer | `0x595558B91DFAA97840F2F00bF6728A74B8E6de17` |
| Transaction | `0xb6e922908f25a63e9bbbc273c45cccaf22b5651fd28b2700868247c2eabf4c3a` |
| Block | 63,431,435 |
| Status | 1 (success) |
| Gas used | 209,951 |
| Logs | 11 |
| Anchored at | 2026-09-22 13:59:36 UTC |

`to` is `0x522fAf9A91c41c443c66765030741e4AaCe147D0` — Multicall3From, not
PayoutAnchor. The anchor is a sibling subcall, exactly as invariant 2 requires,
and `from` is the payer's own EOA. [measured]

## Anchor record

`PayoutAnchor.runs(0x4c05e0b0…3fd5)` returns:

```
root       0x8df22638d2cb0cb66fa314f0f4b76be9072c7f2d483aa218d27b049b8fc37ec9
payer      0x595558B91DFAA97840F2F00bF6728A74B8E6de17
itemCount  3
timestamp  1790085576
```

## Three tokens, three decimals, one transaction

| Invoice | Token | Decimals | Raw | Paid |
|---|---|---|---|---|
| INV-BROWSER-001 | USDC | 6 | `100000` | 0.10 |
| INV-BROWSER-002 | EURC | 6 | `100000` | 0.10 |
| INV-BROWSER-003 | cirBTC | 8 | `1000` | 0.00001 |

All three to `0xe48A096B9E74f064b13c17734af29F85E02d732a`. Decimals were read
from each token's own `decimals()`, and 6, 6 and 8 in one run came out right in
the UI and on chain. [measured]

## The USDC double log, live

The 11 logs break down as:

```
1 x RunCommitted   from PayoutAnchor   0xb8907A07…8802
3 x BeforeMemo     from Memo           0x5294E992…e505
3 x Memo           from Memo           0x5294E992…e505
1 x Transfer       from USDC           0x36000000…0000   100000                (6 dec)
1 x Transfer       from SystemEmitter  0xffffFFFf…FFfE   100000000000000000   (18 dec)
1 x Transfer       from EURC           0x89B50855…D72a   100000                (6 dec)
1 x Transfer       from cirBTC         0xf0C4a4CE…32BF   1000                  (8 dec)
```

Four Transfer logs for three payments. USDC emitted two — the 6-decimal one
from the token and an 18-decimal one from the EIP-7708 system emitter — while
EURC and cirBTC emitted one each. This is the gotcha the reconciler's
"ignore `0xffff…fFfE` entirely" rule exists for, observed on a real run rather
than taken from documentation. Deduplicating for all three would have halved
EURC and cirBTC; deduplicating for none would have doubled USDC. [measured]

## Fees

`effectiveGasPrice` was 37,500,000,000 wei — **37.5 Gwei**, comfortably above
the 25 Gwei floor and well clear of the 20 Gwei silent-drop threshold. The run
was included in a block and returned a receipt, so no fee warning was due and
none appeared. [measured]

**Answered on a second pass, 2026-09-22.** Rabby's fee editor accepts a custom
value of **10 Gwei and confirms it without any warning** — no caution about the
chain's floor, no refusal, nothing. The payer is one text field away from a
transaction Arc will never mine, and the wallet says nothing about it.

This is the case the executor's fee floor exists for, and it is worth stating
plainly: *the wallet will not stop this.* The floor is only enforced where we
set it, and a payer who edits the field defeats it silently.

What happened next was correct but mute. The node accepted the transaction into
its mempool, so it was not `dropped`; `eth_getTransactionByHash` found it and
reported 10 Gwei, and the run moved to waiting for a receipt that was never
going to come. The fee warning was already computed at that point — and was
held back until the 180-second timeout expired. Three minutes of a spinner over
an app that already knew the answer. Fixed: `executeRun` now calls
`onFeeWarning` before the wait rather than after it, and the stage says how long
it will wait. [measured]

## Wallet signature determinism — the `[unverified]` claim answered

Recovery from nothing but the transaction hash **succeeded**. Opening
`/run/<txHash>`, entering the run name and the three invoice references, and
signing again produced links that opened to five green rungs — including "The
payment was in the committed payout run".

That only happens if Rabby reproduced its earlier signature byte for byte: the
salt is `keccak256(signature)`, every memoId derives from the salt, and
recovery refuses to emit anything unless the re-derived memoIds are present in
this transaction's logs *and* the tree rebuilt from those logs reproduces the
root the anchor committed.

So for Rabby on Arc testnet, `personal_sign` is deterministic. [measured]

This does not generalise to every wallet, and it does not need to: when a
wallet is not deterministic, recovery reports a mismatch and shows nothing,
which is the designed degradation rather than a failure.

## The deliberate mismatch

Repeating recovery with the run name `browser-2026-10` produced the error and
**no links**, as designed. An unverified receipt link is worse than none.

## What this run changed

Three things the run exposed have since been fixed, and none of them touched
money, calldata or reconciliation:

1. `validateRun` warned on a repeated recipient without considering the token,
   so the three-token demo — one recipient, three tokens — always raised two
   warnings that could not be the duplicated paste the rule exists to catch.
   Now keyed on recipient and token, with a test over this exact CSV.
2. The recovery panel was titled after its mechanism rather than the problem
   it solves, and was offered to everyone opening a run page although only the
   payer's wallet can use it. It now names the anchor's payer, says recipients
   do not need it, and opens prefilled when reached from the new `/runs` list.
3. Preflight's failure was titled "Nothing was signed or sent" although the
   salt signature happens before the simulation. Found while confirming that a
   repeat run is refused: the `RunExists` text underneath was accurate and
   decoded from the contract's own selector, and the sentence above it was not.

Still open: nothing blocking. The fee question above is answered; what remains
is a product decision rather than a defect — whether the send screen should
refuse to proceed when the wallet reports a broadcast fee under the floor,
rather than warning and waiting. Refusing would mean discarding a transaction
that is already signed and in a mempool, which is the unsafe direction, so
warning is probably right.
