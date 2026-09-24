# PayoutAnchor on Arc mainnet — deploy and source verification

Submission artifact #1. Deployed 2026-09-24.

| | |
|---|---|
| Address | `0xd4838881EcBa8320d456B8B65A07A0ac167F0890` |
| Deploy tx | `0x5a53dfb7ee2286cd13a055b59f9e8f1518687713ec9af1d0cadfb305096ecd31` |
| Block | 22,452,696 |
| Gas used | 358,456 at 21 Gwei effective (0.0075 USDC) |
| Deployer | `0x595558B91DFAA97840F2F00bF6728A74B8E6de17` (the demo payer) |
| Explorer | https://explorer.arc.io/address/0xd4838881EcBa8320d456B8B65A07A0ac167F0890?tab=contract |

## Freeze gate, checked before deploying

`contracts/src/PayoutAnchor.sol` is unchanged since `683fde5` (the audit
fixes). Its deployed bytecode from `forge build` is byte-identical to the
testnet anchor `0xb8907A07768D936D1D498257E5803c91033a8802`, which every
testnet run and the Task 10 browser pass exercised. After the deploy, the
mainnet bytecode read with `cast code` is identical to the same build.

## Fees

At deploy time mainnet read base fee 20 Gwei, `eth_gasPrice` 20.1 Gwei and a
0.1 Gwei tip, so a fee estimated from those sits right on the silent-drop
line. The deploy set them explicitly:

```bash
cd contracts && forge script script/DeployAnchor.s.sol:DeployAnchor \
  --rpc-url arc --private-key $PRIVATE_KEY --broadcast --slow \
  --with-gas-price 30gwei --priority-gas-price 1gwei
```

## Source verification — the plan's command does not work

`forge verify-contract --verifier blockscout --verifier-url https://explorer.arc.io/api/`
fails: explorer.arc.io sits behind a Cloudflare challenge, which answers every
non-browser request to `/api` and `/api/v2` with an HTML challenge page (403).

Sourcify supports Arc mainnet (chain 5042), and the hosted Blockscout reads
from it:

```bash
cd contracts && forge verify-contract 0xd4838881EcBa8320d456B8B65A07A0ac167F0890 \
  src/PayoutAnchor.sol:PayoutAnchor --chain-id 5042 --verifier sourcify --watch
```

Result: `exact_match`. Opened in a real browser, the explorer's Contract tab
reads "Contract source code verified (exact match)" with contract name
`PayoutAnchor`, compiler `0.8.28+commit.7893614a`, optimizer on at 200 runs,
and a Read/Write contract tab.
