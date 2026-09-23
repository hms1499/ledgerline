"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Table, type TableColumnsType } from "antd";
import type { RunOutcome } from "@ledgerline/core";
import { formatAmount, receiptUrl, short, type NetworkView } from "@/lib/chain";
import type { PreparedRun } from "./StepPreflight";
import type { RunDraft } from "./CreateRun";
import { fileSlug, receiptLinksCsv, receiptLinksText, type ReceiptLinkRow } from "@/lib/receipt-export";
import { useWallet } from "@/components/wallet/WalletProvider";

/** Hand the payer a file. The object URL is revoked a tick later, not
 *  straight after click(): some browsers start the download asynchronously
 *  and a URL revoked first saves nothing. */
function saveFile(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

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
  const [manifestSaved, setManifestSaved] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // The manifest is the only record of what each invoice was owed; the chain
  // holds what was paid. Until it is saved, leaving asks first. Receipt links
  // are not guarded the same way: they can be rebuilt by signing again.
  // The shell's own links navigate client-side and never see beforeunload;
  // they read this instead.
  const { setUnsavedRun } = useWallet();
  useEffect(() => {
    setUnsavedRun(!manifestSaved);
    return () => setUnsavedRun(false);
  }, [manifestSaved, setUnsavedRun]);

  useEffect(() => {
    if (manifestSaved) return;
    const hold = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [manifestSaved]);

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

  const slug = fileSlug(draft.runLabel);

  const exportRows: ReceiptLinkRow[] = rows.map((r) => ({
    invoiceId: r.invoiceId,
    recipient: r.to,
    amount: formatAmount(r.amount, draft.decimals[r.token.toLowerCase()] ?? 6),
    symbol: draft.symbols[r.token.toLowerCase()] ?? r.token,
    url: r.url,
  }));

  const downloadManifest = () => {
    saveFile(`ledgerline-${slug}.json`, JSON.stringify({
      ...prepared.manifest,
      items: prepared.manifest.items.map((i) => ({ ...i, amount: i.amount.toString() })),
      runLabel: draft.runLabel,
      txHash: outcome.txHash,
      anchor: net.anchor,
      root: prepared.built.root,
      memoIds: prepared.built.memoIds,
      proofs: prepared.built.proofs,
      runLabelNormalisation: "trimmed, inner whitespace collapsed to single spaces, case preserved",
    }, null, 2), "application/json");
    setManifestSaved(true);
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
    { title: "Recipient", dataIndex: "to", width: 140, render: (to: string) => <span className="hex addr">{short(to)}</span> },
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

      <Alert
        style={{ marginTop: 24 }}
        type={manifestSaved ? "success" : "warning"}
        showIcon
        title={manifestSaved ? "Run file saved" : "Save the run file before you leave"}
        description={
          <>
            <p style={{ marginTop: 0 }}>
              {manifestSaved
                ? "Keep it with your records. Load it on the run page any time to check each invoice against what was paid."
                : "It is the only record of what each invoice was owed — the chain holds what was paid, not what was meant. Load it on the run page later to check one against the other. Nothing is stored by us, so this is your copy."}
            </p>
            <Button type={manifestSaved ? "default" : "primary"} onClick={downloadManifest}>
              {manifestSaved ? "Download it again" : "Download the run file"}
            </Button>
          </>
        }
      />

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={() => {
          void navigator.clipboard.writeText(receiptLinksText(exportRows));
          setCopiedAll(true);
        }}>
          {copiedAll ? `Copied ${rows.length} links` : "Copy all links"}
        </Button>
        <Button onClick={() => saveFile(`ledgerline-${slug}-receipts.csv`, receiptLinksCsv(exportRows), "text/csv")}>
          Download links as CSV
        </Button>
      </div>

      <div style={{ marginTop: 14 }}>
        <Table<LinkRow> columns={columns} dataSource={rows}
          pagination={rows.length > 25 ? { pageSize: 25 } : false} size="middle"
          scroll={{ x: "max-content" }} />
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
        <Button href={`/run/${outcome.txHash}?n=${net.name}`}>Open the reconciliation</Button>
        <Button href={`${net.explorer}/tx/${outcome.txHash}`} target="_blank">On the explorer</Button>
      </div>
    </>
  );
}
