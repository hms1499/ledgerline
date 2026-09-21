# Negative control — what ordinary batching actually records

2026-09-21, Arc testnet. Run before spending anything on mainnet, and it
overturned a claim the spec had been making since design.

## The claim that was wrong

The spec's §1 said:

> Batch through a standard `Multicall3` and each recipient sees
> `from = 0xcA11bde0…`, the batching contract — not the company.

The plan repeated it in Task 16 Step 5: *"`from` will be the batching
contract."*

**It is not.** `transferFrom(from, to, amount)` emits `Transfer(from, to,
amount)`, so routing a payment through `Multicall3` leaves the payer perfectly
visible. Measured:

```
tx 0xe29621ec2283fe141ab5934b9a9e1890a6e62021ee28752345c4c3c09e907c2d  (approve, 55,438 gas)
tx 0xc7d9255d4c0fc793e261d4ca02f9df1985694a2f31401e15ab7ead6d27440bfe  (batch,   58,755 gas)
  Transfer  token 0x3600…  from 0x595558b91dfaa97840f2f00bf6728a74b8e6de17
  payer EOA                     0x595558B91DFAA97840F2F00bF6728A74B8E6de17
```

Both hashes are what `/why` is pointed at on testnet.

Identical. Had this gone to mainnet as artifact #3, the side-by-side would have
shown two transactions whose `Transfer.from` agree, under a caption claiming
they differ. The judges are Arc engineers.

## Where identity really is lost

A *custodial* batcher — the Disperse.app shape, where the payer funds the
contract and the contract pays out of its own balance. `CustodialBatcher` was
deployed to testnet at `0xd9C48e577F49031d0C2193F2a1d9e3C964Ce3212` to settle
it:

```
tx 0xf67ebc82899808541ff63f456b1225f4b4918117fe3b23f29cdeab08e6de99d1
  Transfer  from 0xd9c48e577f49031d0c2193f2a1d9e3c964ce3212   ← the contract
  payer EOA      0x595558B91DFAA97840F2F00bF6728A74B8E6de17
```

So the spec's failure mode is real, but it belongs to a different batcher than
the one the spec named.

## The honest comparison

| | Ledgerline | `Multicall3` + `transferFrom` | Custodial batcher |
|---|---|---|---|
| Reference on chain | **per payment** | none | none |
| `Transfer.from` | payer EOA | payer EOA | the contract |
| Allowance to a third party | none | **required first** | none |
| Custody of funds | never | never | **yes** |
| Transactions | **1** | 2 | 2 |
| Gas, 1 USDC payment | ~70k | 114,193 (55,438 + 58,755) | fund + disperse |

The reference is the difference that holds against **every** batcher shape, and
it is the one the product is actually about. The approval is the second real
difference: the `Multicall3` route requires granting a contract the payer does
not control the right to move their tokens, before any money can move.

Identity preservation is a genuine advantage over custodial batchers, and not
one over `Multicall3`. Say it that way.

## Correction — the allowance does not automatically outlive the payment

The paragraph above originally ended *"and that allowance outlives the
payment."* Checked against the chain while building `/why`, that is false for
the transaction we actually sent:

```
allowance(0x595558B9…de17, 0xcA11bde0…76CA11)  on testnet USDC  =  0
```

`naive-batch.ts` approves the exact amount and `transferFrom` consumes all of
it, so nothing is left standing. An allowance outlives the payment only when
the tool approves more than it spends — which is what unlimited-approval tools
do, and it is a property of *how the tool approves*, not of `Multicall3`.

Two things changed as a result. `naive-batch.ts` now reads the remaining
allowance back rather than printing `standing allowance left: yes`, and the
`/why` page makes an `allowance()` call when it loads and shows whatever the
chain returns. The surviving claim is the narrower one: **the ordinary route
requires an approval to a third-party contract before any money can move; ours
requires none.**

## What goes to mainnet

Only the `Multicall3` + `transferFrom` control, via the standard batcher that
is already deployed. It demonstrates the missing reference, the extra
transaction and the required allowance, which are the claims that survive
scrutiny.

The custodial contract stays on testnet. Deploying a fund-taking contract to
mainnet purely to prove a negative would add a second, unrelated contract to
the submission's explorer trail for no gain.
