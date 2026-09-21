# Arc testnet findings — 2026-09-21

Task 14 of `docs/superpowers/plans/2026-09-21-ledgerline-core.md`. Everything
below was run against Arc testnet (chain **5042002**) with faucet funds.

The plan called for two USDC payments. This run paid **three tokens** instead,
because the wallet held all three and rehearsing the exact shape of the mainnet
demo costs nothing on testnet. Three tokens also exercise the decimal spread
(6, 6, 8) and the USDC-only double log, which a USDC-only run cannot.

## Deployments

| What | Address |
|---|---|
| `PayoutAnchor` | `0xf22B15fDCADB13573E732eE89841299717f6B7f4` |
| `MemoCallerProbe` | `0xd4838881EcBa8320d456B8B65A07A0ac167F0890` |
| Payer EOA | `0x595558B91DFAA97840F2F00bF6728A74B8E6de17` |
| Recipient | `0xe48A096B9E74f064b13c17734af29F85E02d732a` |

## Finding 1 — testnet token addresses differ from mainnet

USDC keeps the same predeploy address because it is the native gas token.
**EURC and cirBTC do not.** The mainnet addresses have no code on testnet, and
calling them fails with an opaque `contract does not have any code` rather than
anything a reader would connect to "wrong network".

| Token | Mainnet | Testnet | Decimals |
|---|---|---|---|
| USDC | `0x3600…0000` | `0x3600…0000` (same) | 6 |
| EURC | `0xbEf5…21c1` | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 |
| cirBTC | `0x171a…baa0` | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | 8 |

All verified live via `symbol()`, `decimals()` and `balanceOf()`. Recorded in
`packages/core/src/constants.ts` as `*_TESTNET_ADDRESS`.

Both documented testnet RPC hosts are live and return the same chain id, so the
open question in `CLAUDE.md` is settled — they are interchangeable:
`https://rpc.testnet.arc.io` and `https://rpc.testnet.arc.network`.

## Finding 2 — the three-token run

`0x06ce9e8d16b68bf4cdf5d354c239fe6212ad3358c9aee8f69ef3ad75cb9bc96a`

| | |
|---|---|
| Status | success, block 63221380 |
| Gas used | 274,152 |
| Cost | 0.0068538 USDC |
| Logs | **11** |

The log count is the whole §6.2 claim in one number:

```
 1  RunCommitted                                    (anchor)
 4  BeforeMemo, Memo, Transfer(6dec), Transfer(18dec, system emitter)   USDC
 3  BeforeMemo, Memo, Transfer                                          EURC
 3  BeforeMemo, Memo, Transfer                                          cirBTC
──
11
```

USDC emits two `Transfer` logs; EURC and cirBTC emit one. Dedup applied to all
tokens would halve EURC and cirBTC; applied to none it would double USDC.

**`Transfer.from` on all three non-system logs is the payer EOA**, not
`Multicall3From` — sub-claim (b), the hardest one in the spec, now shown in a
real transaction rather than a simulation.

Reconciled with `arc-reconcile` both ways: without a manifest all three rows
read `unexpected` with correct amounts; with the manifest all three read
`matched`, rendering 0.1 / 0.1 / 0.00001 from on-chain `decimals()`.

## Finding 3 — §6.1 settled: `Memo` does reject contract callers

This is the claim the spec flagged `[unverified]`, because `eth_call` and
`debug_traceCall` force `msg.sender == tx.origin` and therefore cannot test it.

Both paths were run, and they disagree — which is exactly why the plan insisted
on a real transaction:

| Path | Result |
|---|---|
| `eth_call` on `tryMemo` (simulation) | returns `false`, but proves nothing |
| Real transaction `0xd5170c81…434cca` | `ok == false`, **zero `Transfer` logs** |

The probe was pre-funded with 0.01 USDC so a balance shortfall could not be
mistaken for the rule. The bubbled-up revert was `Error(string)`:

> `sender spoofing requires tx.origin as sender`

The docs were right. **Safe, ERC-4337 and all smart-contract wallets remain
unsupported, and the UI must say so.** Spec §6.1 moved `[unverified]` →
`[measured]`.

## Finding 4 — §6.3 partly corrected: the priority fee floor

The plan records `eth_maxPriorityFeePerGas` as returning 0.33 Gwei. **On
testnet it returns 5 Gwei.** Base fee sits exactly on the 20 Gwei floor and
`eth_gasPrice` reads 25 Gwei.

Both tips were sent with `maxFeePerGas` held at 37.5 Gwei:

| Tip | Effective gas price | Block | Included in |
|---|---|---|---|
| 1 Gwei | 21 Gwei | 63221623 | ~1 s |
| 5 Gwei | 25 Gwei | 63221626 | ~3 s |

**1 Gwei is sufficient.** `MIN_PRIORITY_FEE_WEI` stays at `1_000_000_000n`; no
change was needed. The spread between the two is block-time noise, not
congestion — Arc's blocks are sub-second and the chain is quiet.

Note this says nothing about mainnet under load. The 25 Gwei `maxFeePerGas`
floor remains the load-bearing protection, since that is the one whose failure
is silent.

## Finding 5 — double payment is blocked at the contract layer

Re-running `scripts/testnet-run.ts` completely unchanged reverts at preflight.
Nothing is signed and nothing is sent.

`clientRunId` is derived from the payer plus the payout list, so an identical
list is an identical run, and `PayoutAnchor` is write-once.

One bug found and fixed here: the script's first cut guessed `RunExists()`'s
selector rather than deriving it, and guessed **wrong** (`0xb0c8f9dc`; the real
one is `0xc0d6b579`). The replay was still blocked — the chain did its job —
but the tool reported "reverted for an unknown reason" instead of naming the
cause. `packages/core/src/errors.ts` now derives selectors from signatures and
walks viem's nested error shape to recover the revert data, with tests
asserting the selectors the chain actually returned.

## What this does not cover

Mainnet. Testnet settles the two behavioural rules, not the economics: the
`[measured]` gas and cost figures in the spec are mainnet numbers and stand
unchanged. Tasks 15 and 16 remain to be run.
