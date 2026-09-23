"use client";

import { useState } from "react";
import { Alert, Button, Table, type TableColumnsType } from "antd";
import type { RunOutcome } from "@ledgerline/core";
import { formatAmount, receiptUrl, short, type NetworkView } from "@/lib/chain";
import type { PreparedRun } from "./StepPreflight";
import type { RunDraft } from "./CreateRun";

interface LinkRow {
  key: string;
  invoiceId: string;
  to: string;
  token: string;
  amount: bigint;
  url: string;
}

export default function Result({
  outcome, prepared, draft, net,
}: {
  outcome: Extract<RunOutcome, { state: "confirmed" }>;
  prepared: PreparedRun; draft: RunDraft; net: NetworkView;
}) {
  const [copied, setCopied] = useState<string>();

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const rows: LinkRow[] = prepared.manifest.items.map((item, i) => ({
    key: item.invoiceId,
    invoiceId: item.invoiceId,
    to: item.to,
    token: item.token,
    amount: item.amount,
    url: receiptUrl({
      origin, txHash: outcome.txHash, invoiceId: item.invoiceId,
      runSalt: prepared.manifest.runSalt, proof: prepared.built.proofs[i]!, network: net.name,
    }),
  }));

  const downloadManifest = () => {
    const blob = new Blob([JSON.stringify({
      ...prepared.manifest,
      items: prepared.manifest.items.map((i) => ({ ...i, amount: i.amount.toString() })),
      runLabel: draft.runLabel,
      txHash: outcome.txHash,
      anchor: net.anchor,
      root: prepared.built.root,
      memoIds: prepared.built.memoIds,
      proofs: prepared.built.proofs,
      runLabelNormalisation: "trimmed, inner whitespace collapsed to single spaces, case preserved",
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ledgerline-${draft.runLabel.replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const columns: TableColumnsType<LinkRow> = [
    { title: "Invoice", dataIndex: "invoiceId", width: 160 },
    {
      title: "Paid", dataIndex: "amount", width: 150,
      render: (a: bigint, r) => (
        <span className="hex">
          {formatAmount(a, draft.decimals[r.token.toLowerCase()] ?? 6)}{" "}
          {draft.symbols[r.token.toLowerCase()] ?? ""}
        </span>
      ),
    },
    { title: "Recipient", dataIndex: "to", width: 140, render: (to: string) => <span className="hex">{short(to)}</span> },
    {
      title: "Receipt link", dataIndex: "url",
      render: (url: string, r) => (
        <Button
          size="small"
          onClick={() => { void navigator.clipboard.writeText(url); setCopied(r.invoiceId); }}
        >
          {copied === r.invoiceId ? "Copied" : "Copy link"}
        </Button>
      ),
    },
  ];

  return (
    <>
      <section className="line line--summary">
        <div>
          <p className="amount">
            {rows.length}<span className="unit">paid</span>
          </p>
          <p className="payee">block {outcome.receipt.blockNumber.toLocaleString("en-US")} · {outcome.receipt.gasUsed.toLocaleString("en-US")} gas</p>
        </div>
        <span className="reference">{draft.runLabel}</span>
      </section>

      <section className="verdict ok">
        <h1>Paid, with a receipt</h1>
        <p>
          Each link below verifies against the chain on its own. Send each recipient
          theirs — they need nothing from us to check it.
        </p>
      </section>

      {outcome.feeWarning && (
        <Alert style={{ marginTop: 20 }} type="warning" showIcon
          title="The fee was below the floor" description={outcome.feeWarning} />
      )}

      <div style={{ marginTop: 24 }}>
        <Table<LinkRow> columns={columns} dataSource={rows}
          pagination={rows.length > 25 ? { pageSize: 25 } : false} size="middle" />
      </div>

      <Alert
        style={{ marginTop: 24 }}
        type="info"
        title="Keep two things"
        description={
          <>
            <p style={{ marginTop: 0 }}>
              The transaction hash <span className="hex">{outcome.txHash}</span> and the run
              name <strong>{draft.runLabel}</strong>. With both, these links can be rebuilt
              from <a href={`/run/${outcome.txHash}?n=${net.name}`}>the run page</a> at any
              time, by signing the same message again. Neither is stored anywhere by us.
            </p>
            <p>
              This browser has remembered both, so{" "}
              <a href={`/runs?n=${net.name}`}>your runs</a> can reopen this one without
              them. That list is a convenience kept on this machine only — it is lost with
              the site&apos;s data, which is why the two things above are still worth
              writing down.
            </p>
            <p style={{ marginBottom: 0 }}>
              The hash is also on{" "}
              <a href={`${net.explorer}/address/${prepared.manifest.payer}`} target="_blank" rel="noreferrer">
                your address on the explorer
              </a>
              , permanently.
            </p>
          </>
        }
      />

      <div style={{ marginTop: 22, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={downloadManifest}>Download the manifest</Button>
        <Button href={`/run/${outcome.txHash}?n=${net.name}`}>Open the reconciliation</Button>
        <Button href={`${net.explorer}/tx/${outcome.txHash}`} target="_blank">On the explorer</Button>
      </div>
    </>
  );
}
