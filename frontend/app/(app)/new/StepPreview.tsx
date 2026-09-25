"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Table, type TableColumnsType } from "antd";
import { createPublicClient, http, type Address } from "viem";
import { fundingFor, tokensForChain, totalsByToken, type ResolvedRow } from "@ledgerline/core";
import { short, type NetworkView } from "@/lib/chain";
import type { ConnectedWallet } from "@/lib/wallet";
import type { RunDraft } from "./CreateRun";
import type { ConnectError } from "@/lib/connect-error";
import { fundingView, topUpHint } from "@/lib/funding-view";
import { amountFigure, metaFor } from "@/lib/token-meta";
import { reviewView } from "@/lib/review-view";
import ReviewIssues from "./ReviewIssues";

const balanceOfAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/**
 * Every token the run pays, plus USDC, which pays Arc's network fee even when
 * the run pays none. A token whose balance cannot be read is left out, so it
 * shows as unknown rather than as an empty wallet.
 */
async function readBalances(
  net: NetworkView, owner: Address, tokens: Address[],
): Promise<Record<string, bigint>> {
  const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
  const out: Record<string, bigint> = {};
  await Promise.all(tokens.map(async (token) => {
    try {
      out[token.toLowerCase()] = await client.readContract({
        address: token, abi: balanceOfAbi, functionName: "balanceOf", args: [owner],
      });
    } catch { /* unknown, not zero */ }
  }));
  return out;
}

export default function StepPreview({
  draft, net, onBack, onNext, wallet, walletError, onConnect, wrongChain,
}: {
  draft: RunDraft; net: NetworkView;
  onBack: () => void; onNext: () => void;
  wallet?: ConnectedWallet; walletError?: ConnectError; onConnect: () => void;
  /** Connected, but not on Arc. The banner above carries the fix. */
  wrongChain?: boolean;
}) {
  const review = reviewView({
    issues: draft.issues, errors: draft.errors, warnings: draft.warnings, parsed: draft.parsed,
  });
  const blocking = review.blocking;

  // Read for the wallet on screen and dropped the moment it changes, so a
  // switched account never inherits the last one's balances.
  const usdc = tokensForChain(net.chain.id).USDC as Address;
  const [balances, setBalances] = useState<Record<string, bigint>>();
  // Bumped by "Check balances again", after the payer tops up.
  const [reads, setReads] = useState(0);
  const owner = wallet && !wrongChain ? wallet.address : undefined;
  useEffect(() => {
    setBalances(undefined);
    if (!owner) return;
    let current = true;
    const tokens = [...new Set([usdc, ...totalsByToken(draft.rows).map((t) => t.token)]
      .map((t) => t.toLowerCase()))] as Address[];
    void readBalances(net, owner, tokens).then((b) => { if (current) setBalances(b); });
    return () => { current = false; };
  }, [owner, net, draft.rows, usdc, reads]);

  const funding = balances && fundingView({
    lines: fundingFor(draft.rows, balances),
    usdc, usdcHold: balances[usdc.toLowerCase()],
    decimals: draft.decimals, symbols: draft.symbols,
  });
  const checkingFunds = !!owner && !balances;
  const shortTokens = funding?.short ?? 0;

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
        <a className="hex addr" href={`${net.explorer}/address/${to}`} target="_blank" rel="noreferrer" title={to}>
          {short(to)}
        </a>
      ),
    },
    {
      title: "Amount", dataIndex: "amount", align: "right",
      render: (a: bigint, r) => (
        <span className="hex">{amountFigure(a, r.token, metaFor(r.token, draft.decimals, draft.symbols))}</span>
      ),
    },
  ];

  return (
    <>
      <ReviewIssues view={review} />

      <div style={{ marginTop: 24 }}>
        <Table<ResolvedRow>
          columns={columns}
          dataSource={draft.rows.map((r) => ({ ...r, key: r.line }))}
          pagination={draft.rows.length > 25 ? { pageSize: 25 } : false}
          size="middle"
          scroll={{ x: "max-content" }}
        />
      </div>

      {owner && (
        <section className="funding" aria-live="polite">
          <h2>Can this wallet pay it?</h2>
          {checkingFunds ? (
            <p className="because">Reading the wallet&apos;s balances on Arc {net.name}…</p>
          ) : (
            <>
              <ul>
                {funding!.rows.map((r) => (
                  <li key={r.key} className={`funding-${r.state}`}>
                    <span className="mark" aria-hidden>
                      {r.state === "ok" ? "✓" : r.state === "short" ? "✗" : "–"}
                    </span>
                    <span>
                      <strong>{r.need} {r.symbol}</strong> needed
                      {r.state === "unknown"
                        ? " — the balance could not be read, so the next step will check it"
                        : <> · wallet holds <span className="hex">{r.hold}</span></>}
                      {r.shortBy && <> · <strong>short by {r.shortBy} {r.symbol}</strong></>}
                      {r.state === "short" && (() => {
                        const h = topUpHint(r.symbol, net.name);
                        return (
                          <span className="because">
                            {h.text}
                            {h.link && <> <a href={h.link.href} target="_blank" rel="noreferrer">{h.link.text}</a>.</>}
                          </span>
                        );
                      })()}
                    </span>
                  </li>
                ))}
              </ul>
              <Button size="small" style={{ marginTop: 10 }} onClick={() => setReads((n) => n + 1)}>
                Check balances again
              </Button>
            </>
          )}
          {funding?.feeWarning && (
            <Alert style={{ marginTop: 14 }} type="warning" showIcon
              title="Nothing left for the network fee" description={funding.feeWarning} />
          )}
        </section>
      )}

      {walletError && (
        <Alert style={{ marginTop: 18 }} type={walletError.type} showIcon
          title={walletError.title} description={walletError.description} />
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={onBack}>Choose another file</Button>
        {blocking > 0 ? (
          <Button type="primary" disabled>{review.fixFirst}</Button>
        ) : wallet ? (
          <Button
            type="primary"
            disabled={wrongChain || checkingFunds || shortTokens > 0}
            loading={checkingFunds}
            onClick={onNext}
          >
            {wrongChain
              ? "Switch to Arc first"
              : checkingFunds
                ? "Checking balances"
                : shortTokens > 0
                  ? `Top up ${shortTokens === 1 ? "the short token" : `${shortTokens} tokens`} first`
                  : "Check it against the chain"}
          </Button>
        ) : (
          <Button type="primary" onClick={onConnect}>Connect a wallet to continue</Button>
        )}
      </div>

      <p className="because" style={{ marginTop: 18 }}>
        Arc requires the payer to sign directly, so Safe, ERC-4337 and
        other smart-contract wallets are not supported. Nothing has been signed or sent yet.
      </p>
    </>
  );
}
