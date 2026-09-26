"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Popconfirm, Table, type TableColumnsType } from "antd";
import { createPublicClient, http, type Address } from "viem";
import { fundingFor, tokensForChain, totalsByToken, type ResolvedRow } from "@ledgerline/core";
import { short, type NetworkView } from "@/lib/chain";
import type { ConnectedWallet } from "@/lib/wallet";
import type { RunDraft } from "./CreateRun";
import type { ConnectError } from "@/lib/connect-error";
import { fundingView, topUpHint } from "@/lib/funding-view";
import { amountFigure, metaFor } from "@/lib/token-meta";
import { fixList } from "@/lib/fix-list";
import { changeCounts, type RunEdits } from "@/lib/run-edits";
import { correctedFile } from "@/lib/corrected-file";
import { saveFile } from "@/lib/save-file";
import TechnicalDetails from "@/components/ui/TechnicalDetails";
import FixList from "./FixList";

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

/** Bring the first problem to the payer: scrolled to, its first field focused. */
function focusFirst(id: string) {
  const el = document.getElementById(id) ?? document.getElementById("fix-list");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  (el.querySelector<HTMLElement>("input, button") ?? el).focus({ preventScroll: true });
}

export default function StepPreview({
  draft, net, onEdits, onBack, onNext, wallet, walletError, onConnect, wrongChain,
}: {
  draft: RunDraft; net: NetworkView;
  onEdits: (edits: RunEdits) => void;
  onBack: () => void; onNext: () => void;
  wallet?: ConnectedWallet; walletError?: ConnectError; onConnect: () => void;
  /** Connected, but not on Arc. The banner above carries the fix. */
  wrongChain?: boolean;
}) {
  const fix = fixList({ checked: draft, source: draft.source, edits: draft.edits, tokens: draft.tokens });
  const blocking = fix.blocking;
  const changes = changeCounts(draft.edits);
  const changed = changes.edited + changes.leftOut;
  const editedLines = new Set(Object.keys(draft.edits.cells).map(Number));

  // Read for the wallet on screen and dropped the moment it changes, so a
  // switched account never inherits the last one's balances.
  const usdc = tokensForChain(net.chain.id).USDC as Address;
  const [balances, setBalances] = useState<Record<string, bigint>>();
  // Bumped by "Check balances again", after the payer tops up.
  const [reads, setReads] = useState(0);
  const owner = wallet && !wrongChain ? wallet.address : undefined;
  // The draft is derived, so `draft.rows` is a fresh array after every edit
  // even when the run's tokens did not change. Keying the read on the token
  // set itself — sorted, deduped, lowercased — means a recipient or amount
  // fix never clears balances or re-hits the RPC; only a token edit that
  // actually changes what is owed does.
  const tokenKey = useMemo(
    () => [...new Set([usdc, ...totalsByToken(draft.rows).map((t) => t.token)].map((t) => t.toLowerCase()))]
      .sort()
      .join(","),
    [draft.rows, usdc],
  );
  useEffect(() => {
    setBalances(undefined);
    if (!owner) return;
    let current = true;
    const tokens = tokenKey.split(",") as Address[];
    void readBalances(net, owner, tokens).then((b) => { if (current) setBalances(b); });
    return () => { current = false; };
  }, [owner, net, tokenKey, reads]);

  const funding = balances && fundingView({
    lines: fundingFor(draft.rows, balances),
    usdc, usdcHold: balances[usdc.toLowerCase()],
    decimals: draft.decimals, symbols: draft.symbols,
  });
  const checkingFunds = !!owner && !balances;
  const shortTokens = funding?.short ?? 0;

  const columns: TableColumnsType<ResolvedRow> = [
    {
      title: "Line", dataIndex: "line", width: 70,
      render: (line: number) => editedLines.has(line)
        ? <>{line} <span className="edited-mark" title="Edited here" aria-label="edited here">✎</span></>
        : line,
    },
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
      <FixList view={fix} edits={draft.edits} onEdits={onEdits} />

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
          title={walletError.title}
          description={
            <>
              {walletError.description}
              {walletError.detail && (
                <TechnicalDetails><p className="raw-reason" style={{ margin: 0 }}>{walletError.detail}</p></TechnicalDetails>
              )}
            </>
          } />
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {changed > 0 ? (
          <Popconfirm
            title={`Discard your ${changed} ${changed === 1 ? "edit" : "edits"}?`}
            okText="Discard" cancelText="Keep editing" onConfirm={onBack}>
            <Button>Choose another file</Button>
          </Popconfirm>
        ) : (
          <Button onClick={onBack}>Choose another file</Button>
        )}
        {changes.edited > 0 && (
          <Button onClick={() => { const f = correctedFile(draft); saveFile(f.name, f.text, f.type); }}>
            Download the corrected file
          </Button>
        )}
        {blocking > 0 ? (
          <Button type="primary" onClick={() => focusFirst(fix.firstOpen)}>{fix.fixFirst}</Button>
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
