# arc-reconcile

Rebuild a [Ledgerline](https://github.com/hms1499/ledgerline) payout run's
reconciliation table from its transaction hash and an Arc RPC. Nothing is read
from Ledgerline's servers: the table comes from the transaction's own logs and
the list the payer recorded on chain.

```console
$ npx arc-reconcile 0xaf3e61940847555a93ac9880a44c3f16e08a4ea80d2f43c69a28a949e738e4c0

  Ledgerline reconciliation — 0xaf3e61940847555a93ac9880a44c3f16e08a4ea80d2f43c69a28a949e738e4c0
  Arc mainnet   RPC: https://rpc.mainnet.arc.io   block 22453870

  status                invoice           recipient    amount
  ────────────────────────────────────────────────────────────────────────
  paid                  —                 0xe48A096B…  0.1 USDC
  paid                  —                 0xe48A096B…  0.1 EURC
  paid                  —                 0xe48A096B…  0.00001 cirBTC

  3 referenced payment(s) found.
  Completeness: complete — All 3 recorded payments are present.
```

That is Ledgerline's public proof run on Arc mainnet: three tokens paid to
three invoices in one transaction.

## What it checks

- **Which payments carry a reference.** Each payment is joined to its `Memo`
  log by the hash of the transfer it wraps, not by position or amount.
- **Whether the whole run was paid.** The number of payments found is compared
  with the item count the payer recorded in `PayoutAnchor`.
- **Whether a run file is the one recorded.** With `--manifest`, the file's
  Merkle root is rebuilt and compared with the anchored root, and each payment
  is matched to its invoice id.
- **Whether the token is real.** Names come from Ledgerline's list of Arc's
  USDC, EURC and cirBTC, never from a contract's `symbol()`. Anything else is
  flagged and printed unscaled, beside its address.

Decimals are read from each token contract, never assumed.

## Usage

```text
arc-reconcile <txHash> [--network mainnet|testnet] [--rpc <url>] [--anchor <address>] [--manifest <run file>]
```

| Option | Default |
|---|---|
| `--network` | `mainnet` |
| `--rpc` | `https://rpc.mainnet.arc.io`, or `https://arc-testnet.drpc.org` on testnet. Point it at your own node to trust no one's |
| `--anchor` | The source-verified `PayoutAnchor` for the network |
| `--manifest` | None. A run file, as the payer downloads it from the app |

Requires Node.js 20 or later.

## License

MIT
