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

**Not recorded:** whether Rabby's fee editor *permits* dropping below 25 Gwei.
The run was sent at the floor the executor set, so the question of what the
wallet would allow was never put to it. This remains the one thing the
automated tests cannot reach, and it is still open.

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

## Open items, none blocking

1. Rabby's fee floor behaviour, above.
2. `validateRun` warns on a repeated recipient without considering the token,
   so the three-token demo — one recipient, three tokens — always raises two
   warnings that cannot be accidental duplicates. Noise in the channel that
   also carries real warnings.
3. The recovery panel is titled after its mechanism rather than the problem it
   solves, and is offered to everyone who opens a run page although only the
   payer's own wallet can use it. The page already reads `anchorPayer` from the
   anchor and could say so.
