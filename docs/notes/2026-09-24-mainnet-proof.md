# The mainnet proof — three tokens, one transaction, and its control

Submission artifacts #2, #3, #5, #6 and #7. Run 2026-09-24 on Arc mainnet
(chain 5042) against the verified anchor
`0xd4838881EcBa8320d456B8B65A07A0ac167F0890` (see `2026-09-24-mainnet-deploy.md`).

## #2 — the referenced three-token run

`scripts/run-payout.ts --network mainnet`, run label `mainnet-2026-09`, after a
`--dry-run` against live state passed balances, per-payment preflight and fees.

| | |
|---|---|
| Tx | `0xaf3e61940847555a93ac9880a44c3f16e08a4ea80d2f43c69a28a949e738e4c0` |
| Block | 22,453,870 |
| Payments | 0.10 USDC (INV-US-001), 0.10 EURC (INV-EU-002), 0.00001 cirBTC (INV-BTC-003) |
| Payer → recipient | `0x5955…de17` → `0xe48A…732a` |
| runId | `0x8b0747a1f7c24cf617bddb55e2fc392cc8039e33d3793b9fefd31be535f24fcb` |
| Anchored | root `0xdfe5…f330`, 3 items, payer `0x5955…de17` (read back with `runs(runId)`) |
| Logs | 11 |

## #5 — the table rebuilt from RPC alone

```
$ pnpm reconcile 0xaf3e61940847555a93ac9880a44c3f16e08a4ea80d2f43c69a28a949e738e4c0
  paid      —   0xe48A096B…  0.1 USDC
  paid      —   0xe48A096B…  0.1 EURC
  paid      —   0xe48A096B…  0.00001 cirBTC
  Completeness: complete — All 3 recorded payments are present.
```

With `--manifest docs/notes/mainnet-manifest.json` all three rows read
`matched` with their invoice ids, and the run file matches the anchored root.
The run file itself is gitignored: it carries the run salt.

In a browser, against `next start` with the mainnet env:
- `/r/<tx>?i=INV-BTC-003&…&n=mainnet` reads **Verified**, 5 of 5 checks ✓,
  amount `0.00001 cirBTC` (8 decimals, read from the token).
- `/run/<tx>?n=mainnet` reads Payments 3 with one figure per token,
  Completeness **Complete**, the block and an explorer link.
- No console errors on any of the three pages.

## #3 — the negative control

`scripts/naive-batch.ts --network mainnet`: the same 0.10 USDC through the
standard Multicall3.

| Step | Tx | Block | Gas |
|---|---|---|---:|
| approve Multicall3 for 0.10 USDC | `0x75663aaf2d6b41ffa656ad63f0e98739de59c24826deedfa6e0f5cdf52896c34` | 22,453,916 | 55,438 |
| `aggregate3([transferFrom])` | `0x08c578c541dc40cd23d181e0f637a760e3ef7f71286fdc945196c434caed5905` | 22,453,918 | 58,755 |

Reference on chain: none (0 Memo events). `Transfer.from` is still the payer —
`transferFrom` keeps it — so `/why` says plainly there is no difference there.
The allowance was exact and reads 0 afterwards.

`/why?n=mainnet` reads both transactions live: 3 of 3 referenced against 0 of
1, one signed transaction against two.

## #6 — measured cost

All at 21 Gwei effective (base fee pinned at 20 Gwei). Gas is paid in USDC.

| | Gas | Cost (USDC) | Per payment |
|---|---:|---:|---:|
| Referenced run, 3 payments, 3 tokens, anchored | 266,370 | 0.00559 | 88,790 gas |
| Naive batch, 1 payment (approve + batch) | 114,193 | 0.00240 | 114,193 gas |
| Anchor deploy (once) | 358,456 | 0.00753 | — |

The whole mainnet proof, deploy included, moved 0.20 USDC + 0.10 EURC +
0.00001 cirBTC to the recipient and cost 0.0155 USDC in gas. Measured from the
payer's balances: USDC 2.974150 → 2.758630.

## #7 — double payment is rejected

Re-running the same script does not reach the anchor: it stops at the balance
check (the wallet now holds 185 base units of cirBTC, the run needs 1,000),
signs nothing, and the nonce is unchanged. So the guard itself was exercised
directly, as the payer, against mainnet state:

```
$ cast call 0xd4838881EcBa8320d456B8B65A07A0ac167F0890 \
    "commit(bytes32,bytes32,uint32)" <clientRunId> <root> 3 --from <payer>
execution reverted, data: "0xc0d6b579"      # RunExists()
```

This is an `eth_call`, not a sent transaction. The anchor subcall is built with
`allowFailure: false` (`packages/core/src/build.ts`), so in a real resubmission
this revert takes the whole batch down and no payment moves.
