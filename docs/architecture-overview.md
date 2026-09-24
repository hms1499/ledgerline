# Architecture overview

The payer sends one transaction that pays every line and records the list.
Everyone else reads that transaction back from the chain. Ledgerline has no
backend in between. For the details, see [ARCHITECTURE.md](../ARCHITECTURE.md).

## System

```mermaid
flowchart LR
    payer(["Payer"])
    recipient(["Recipient"])

    subgraph ledgerline["Ledgerline (no backend)"]
        web["Web app<br/>Next.js"]
        cli["CLI<br/>arc-reconcile"]
        core["packages/core<br/>build · preflight · send<br/>reconcile · verify"]
    end

    subgraph arc["Arc chain"]
        m3f["Multicall3From"]
        memo["Memo"]
        anchor["PayoutAnchor"]
        tokens["USDC · EURC · cirBTC"]
    end

    payer -- "CSV + wallet signature" --> web
    web --> core
    cli --> core
    core -- "one transaction" --> m3f
    m3f -- "commit list root" --> anchor
    m3f -- "payment + reference" --> memo
    memo -- "transfer" --> tokens
    core -. "read receipt logs<br/>and anchored root" .-> arc
    recipient -- "receipt link" --> web
```

## One payout run

```mermaid
sequenceDiagram
    actor Payer
    participant App as Ledgerline
    participant M3F as Multicall3From
    participant Anchor as PayoutAnchor
    participant Memo
    participant Token as Token contracts
    actor Recipient

    Payer->>App: Upload CSV, sign run name
    App->>App: Build list root, references, preflight
    Payer->>M3F: Sign and send one transaction
    M3F->>Anchor: commit(root, item count)
    loop each payment
        M3F->>Memo: memo(transfer, reference)
        Memo->>Token: transfer(to, amount)
    end
    App->>App: Read the receipt, reconcile
    App-->>Recipient: Receipt link
    Recipient->>App: Open the link
    App->>App: Five checks against the chain
```
