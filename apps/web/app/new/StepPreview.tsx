"use client";

import { Alert, Button, Table, type TableColumnsType } from "antd";
import type { ResolvedRow } from "@ledgerline/core";
import { formatAmount, short, type NetworkView } from "@/lib/chain";
import type { ConnectedWallet } from "@/lib/wallet";
import type { ConnectError, RunDraft } from "./CreateRun";

export default function StepPreview({
  draft, net, onBack, onNext, wallet, walletError, onConnect,
}: {
  draft: RunDraft; net: NetworkView;
  onBack: () => void; onNext: () => void;
  wallet?: ConnectedWallet; walletError?: ConnectError; onConnect: () => void;
}) {
  const blocking = draft.issues.length + draft.errors.length;

  const columns: TableColumnsType<ResolvedRow> = [
    { title: "Line", dataIndex: "line", width: 70 },
    { title: "Invoice", dataIndex: "invoiceId", width: 160 },
    {
      title: "Token", dataIndex: "token", width: 110,
      render: (t: string) => draft.symbols[t.toLowerCase()] ?? short(t),
    },
    {
      title: "Recipient", dataIndex: "to",
      render: (to: string) => (
        <a className="hex" href={`${net.explorer}/address/${to}`} target="_blank" rel="noreferrer" title={to}>
          {short(to)}
        </a>
      ),
    },
    {
      title: "Amount", dataIndex: "amount", align: "right",
      render: (a: bigint, r) => (
        <span className="hex">{formatAmount(a, draft.decimals[r.token.toLowerCase()] ?? 6)}</span>
      ),
    },
  ];

  const totals = new Map<string, bigint>();
  for (const r of draft.rows) {
    const k = r.token.toLowerCase();
    totals.set(k, (totals.get(k) ?? 0n) + r.amount);
  }

  return (
    <>
      <section className="line line--summary">
        <div>
          <p className="amount">
            {draft.rows.length}
            <span className="unit">{draft.rows.length === 1 ? "payment" : "payments"}</span>
          </p>
          <ul className="totals">
            {[...totals.entries()].map(([t, v]) => (
              <li key={t}>
                <span className="hex">{formatAmount(v, draft.decimals[t] ?? 6)}</span>{" "}
                {draft.symbols[t] ?? short(t)}
              </li>
            ))}
          </ul>
        </div>
        <span className={`reference${blocking ? " is-void" : ""}`}>{draft.runLabel}</span>
      </section>

      {draft.issues.map((i) => (
        <Alert key={`i-${i.line}-${i.message}`} style={{ marginTop: 14 }} type="error" showIcon
          title={`Line ${i.line}`} description={i.message} />
      ))}
      {draft.errors.map((e, n) => (
        <Alert key={`e-${n}`} style={{ marginTop: 14 }} type="error" showIcon
          title={e.line ? `Line ${e.line}` : "This run"} description={e.message} />
      ))}
      {draft.warnings.map((w, n) => (
        <Alert key={`w-${n}`} style={{ marginTop: 14 }} type="warning" showIcon
          title={w.line ? `Line ${w.line}` : "This run"} description={w.message} />
      ))}

      <div style={{ marginTop: 24 }}>
        <Table<ResolvedRow>
          columns={columns}
          dataSource={draft.rows.map((r) => ({ ...r, key: r.line }))}
          pagination={draft.rows.length > 25 ? { pageSize: 25 } : false}
          size="middle"
        />
      </div>

      {walletError && (
        <Alert style={{ marginTop: 18 }} type={walletError.type} showIcon
          title={walletError.title} description={walletError.description} />
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={onBack}>Choose another file</Button>
        {wallet ? (
          <Button type="primary" disabled={blocking > 0} onClick={onNext}>
            {blocking > 0 ? `${blocking} problem${blocking === 1 ? "" : "s"} to fix first` : "Check it against the chain"}
          </Button>
        ) : (
          <Button type="primary" onClick={onConnect}>Connect a wallet to continue</Button>
        )}
      </div>

      <p className="because" style={{ marginTop: 18 }}>
        Arc&apos;s Memo contract requires the payer to sign directly, so Safe, ERC-4337 and
        other smart-contract wallets are not supported. Nothing has been signed or sent yet.
      </p>
    </>
  );
}
