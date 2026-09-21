# Ledgerline

Batched stablecoin payouts on **Arc mainnet** (chain 5042) where every payment
carries its own invoice reference on chain, reconcilable by payer *and*
recipient without trusting each other — or us.

Built for **Arc Microgrants** (DoraHacks). Submissions close **2026-10-14
23:59 ET**; reviewed on a rolling basis, so ship early rather than late.

**Full design:** `docs/superpowers/specs/2026-09-21-ledgerline-design.md`.
Read it before changing architecture. Claims in it are tagged `[measured]`,
`[docs]`, or `[unverified]` — respect those tags and don't silently promote an
unverified claim.

---

## Non-negotiable invariants

Violating any of these breaks the product's core claim, not just a feature.

1. **The chain is the truth; our backend is a convenience.**
   `reconcile()` is a pure function over logs. It takes no database handle. If
   a feature needs our server to be correct, redesign it.
2. **Our contract is never the *caller* in the payment path.**
   `CallFrom` rejects sender spoofing, so a custom contract calling `Memo`
   reverts. `PayoutAnchor` is a *sibling subcall* inside
   `Multicall3From.aggregate3`, never a wrapper. This is why `Transfer.from`
   stays the payer.
3. **`PayoutAnchor` never holds funds.** No approvals, no balances, no
   upgradeability, no admin. It is an evidence layer; if it broke, money would
   still move.
4. **Never report a payment as successful without a receipt.** See the gas trap
   below — this is the difference between a payroll tool and a liability.
5. **Reconcile from the emitted `Transfer` value, never from the requested
   amount.** Immunises against fee-on-transfer tokens and decimal mistakes.
6. **One `runId` = one `txHash`.** CSVs over 400 rows split into separate runs.

---

## Arc gotchas that will bite

These are chain behaviours you cannot infer from reading our code.

| Trap | Reality |
|---|---|
| **Gas floor** | `maxFeePerGas` under **20 Gwei** is **silently dropped** by the mempool — no receipt, no error, no revert. Always floor at 25 Gwei. This is the single most dangerous footgun here |
| **USDC double log** | One ERC-20 USDC transfer emits **two** `Transfer` logs: 6-dec from `0x3600…`, and 18-dec from the system emitter `0xffff…fFfE` (EIP-7708). **EURC and cirBTC emit only one.** Dedup for all ⇒ EURC/cirBTC halved. Dedup for none ⇒ USDC doubled. Fix: ignore `0xffff…fFfE` entirely |
| **USDC has two decimals** | Native `msg.value` is 18-dec; `balanceOf()` is 6-dec. Same balance, off by 10¹². Never mix them in arithmetic |
| **EOA only** | `Memo` requires a direct EOA caller. **Safe, ERC-4337 and all smart-contract wallets are unsupported.** Say so in the UI |
| **Simulation blind spot** | `eth_call` and `debug_traceCall` force `msg.sender == tx.origin`, so they **cannot** test the anti-spoofing rule. A contract caller "succeeds" in simulation but should revert for real. Only a real transaction proves it |
| **Zero address** | Value transfer to `0x0` reverts. Burning is forbidden |
| **Blocklist** | Enforced at runtime with no pre-check function. Only preflight catches it |
| **`PREVRANDAO`** | Always `0`. No on-chain randomness |
| **Block timestamps** | Non-decreasing, not strictly increasing — sub-second blocks share one. Order by block number |
| **`eth_getLogs` limits** | Public RPC caps at **2000 results / ~10k blocks**. Never design a flow that searches history. Prefer a storage read or a known `txHash` |

---

## Addresses (Arc mainnet, chain 5042) — all verified live

```
Memo             0x5294E9927c3306DcBaDb03fe70b92e01cCede505
Multicall3From   0x522fAf9A91c41c443c66765030741e4AaCe147D0
Multicall3       0xcA11bde05977b3631167028862bE2a173976CA11   (naive batch, for the negative control)
USDC   (6 dec)   0x3600000000000000000000000000000000000000
EURC   (6 dec)   0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1
cirBTC (8 dec)   0x171a4217b86a807a64eb94757db6849fb4bdbaa0
SystemEmitter    0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE   (ignore in reconciler)
```

Event topics:

```
Transfer(address,address,uint256)
  0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
Memo(address,address,bytes32,bytes32,bytes,uint256)   indexed: sender, target, memoId
  0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4
BeforeMemo(uint256)
  0xb252e055da754c72fbf7542cf424b190808a9b541e912894c5e15b4238c41501
```

---

## Endpoints

```
Mainnet          https://rpc.mainnet.arc.io          no debug_traceCall
Mainnet (trace)  https://rpc.drpc.mainnet.arc.io     debug_traceCall + stateOverrides — use for dev
Explorer         https://explorer.arc.io             Blockscout, public, supports source verification
Testnet          https://rpc.testnet.arc.io          viem says rpc.testnet.arc.network — verify before relying on it
Faucet           https://faucet.circle.com
```

`viem` ships `arc` (5042) and `arcTestnet` chains built in — don't hand-roll a
chain definition.

Simulating without spending anything: `debug_traceCall` on dRPC accepts
`stateOverrides`, so you can fake balances (and even inject contract code) to
dry-run a full batch against real mainnet state. This is how the design was
validated; keep using it instead of burning testnet cycles.

---

## Stack

- **Contracts:** Foundry. Stock `anvil` is fine for `PayoutAnchor` (plain EVM
  logic). Arc-specific behaviour cannot be simulated locally — use
  `arc-anvil --network arc` from `circlefin/arc-foundry`, or real testnet.
- **TypeScript:** viem, vitest.
- **App:** Next.js App Router on Vercel.
- **UI:** **Ant Design v6** + `@ant-design/nextjs-registry`. Chosen because this
  is a data-table product — `Table`, `Upload.Dragger`, `Steps`, `Result`,
  `Descriptions`, `Tag`, `Statistic` cover the screens almost 1:1.
  Verified: antd `6.6.5`, registry `1.3.0`, Next `16.3.5`, React `19.3.0`.
  - Root layout **must** wrap children in `AntdRegistry`, or styles flash
    unstyled on SSR first paint.
  - **Do not ship stock antd defaults.** Set `ConfigProvider` theme tokens
    (brand colour, radius, typography). Judging includes "quality of what you
    built", and an untouched admin-panel look reads as templated.
  - Visual design direction follows T3 — don't design for data shapes that
    aren't fixed yet.

---

## Working agreements

- **Evidence before assertions.** This project was designed by measuring the
  chain rather than trusting docs, and that found several places where the docs
  were stale or wrong. Keep that standard: run the command, read the output.
- **`reconciler` is component #1.** Golden fixtures from real mainnet traces
  exist, so it can be built and tested before any transaction is sent.
- **Positioning is honest.** This pattern is proven elsewhere (Request Network,
  Stellar memos, XRP destination tags). Don't claim novelty. The real claim is
  the 3-token single-transaction demo plus protocol-native primitives no one on
  Arc is using. Judges are Arc engineers; overclaiming loses credibility.
