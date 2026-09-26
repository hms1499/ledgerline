"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Popconfirm } from "antd";
import { createPublicClient, http, type Address } from "viem";
import { fundingFor, tokensForChain, totalsByToken } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import type { ConnectedWallet } from "@/lib/wallet";
import type { RunDraft } from "./CreateRun";
import type { ConnectError } from "@/lib/connect-error";
import { fundingView, topUpHint } from "@/lib/funding-view";
import { fixList } from "@/lib/fix-list";
import { changeCounts, changeTotal, fileChanged, type SheetEdits } from "@/lib/sheet-edits";
import { correctedFile } from "@/lib/corrected-file";
import { saveFile } from "@/lib/save-file";
import TechnicalDetails from "@/components/ui/TechnicalDetails";
import FixList from "./FixList";
import type { ColumnId } from "@ledgerline/core";
import {
  addLine, deleteLine, droppedByHeader, editCells, headerWarning, leaveOut, putBack, restoreLine, useAsHeader,
} from "@/lib/sheet-edits";
import { sheetGrid } from "@/lib/sheet-grid";
import SheetGrid, { type CellPos } from "./SheetGrid";
import type { LineAction } from "./LineMenu";
import type { Role } from "@ledgerline/core";
import { addColumn, applyBatch, nextBatchId, numberInvoices, setRole } from "@/lib/sheet-edits";
import type { GhostColumn, GridColumn } from "@/lib/sheet-grid";
import { ColumnHead, GhostHead } from "./ColumnHead";
import FindReplace from "./FindReplace";

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
  onEdits: (edits: SheetEdits) => void;
  onBack: () => void; onNext: () => void;
  wallet?: ConnectedWallet; walletError?: ConnectError; onConnect: () => void;
  /** Connected, but not on Arc. The banner above carries the fix. */
  wrongChain?: boolean;
}) {
  // Memoized so its cards/groups keep their object identity across a render
  // that leaves the draft unchanged (a balance read resolving, "Check
  // balances again"): LineCard/FixList's own focus effects key on that
  // identity, and a fresh object on every render would consume their pending
  // focus intent before the card was actually done being open.
  const fix = useMemo(
    () => fixList({ checked: draft, source: draft.sheet, edits: draft.edits, tokens: draft.tokens }),
    [draft],
  );
  const grid = useMemo(
    () => sheetGrid({ lines: draft.lines, sheet: draft.sheet, edits: draft.edits, checked: draft, tokens: draft.tokens }),
    [draft],
  );
  const [openCell, setOpenCell] = useState<CellPos & { seq: number }>();
  const [focusSeq, setFocusSeq] = useState<number>();
  const [askHeader, setAskHeader] = useState<number>();
  const onEdit = (line: number, col: ColumnId, text: string) => onEdits(editCells(draft.edits, [{ line, col, text }]));
  const toHeader = (line: number) => { onEdits(useAsHeader(draft.edits, line)); setFocusSeq(Date.now()); };
  const onLine = (line: number, action: LineAction) => {
    const e = draft.edits;
    if (action === "leave-out") onEdits(leaveOut(e, line));
    else if (action === "put-back") onEdits(putBack(e, line));
    else if (action === "delete") onEdits(deleteLine(e, line));
    else if (action === "restore") onEdits(restoreLine(e, line));
    else if (droppedByHeader(e) > 0) setAskHeader(line);
    else toHeader(line);
  };
  const onAddLine = () => {
    // The empty entry a final line break leaves is not a line of the file:
    // a 4-line file's first new line is 5 (spec §3.1).
    const last = draft.lines.at(-1);
    const count = draft.lines.length - (draft.lines.length > 1 && last?.body === "" && last.end === "" ? 1 : 0);
    const { edits, line } = addLine(draft.edits, count);
    onEdits(edits);
    const first = grid.columns[0];
    if (first) setOpenCell({ line, col: first.id, seq: Date.now() });
  };
  const [replacing, setReplacing] = useState<GridColumn>();
  const symbols = Object.keys(draft.tokens);
  const inFile = grid.rows.filter((r) => r.state !== "deleted");
  const settle = (next: typeof draft.edits) => { onEdits(next); setFocusSeq(Date.now()); };
  const head = (c: GridColumn) => (
    <ColumnHead
      column={c}
      onRole={(role: Role) => onEdits(setRole(draft.edits, draft.sheet.roles, c.id, role))}
      onReplace={() => setReplacing(c)}
    />
  );
  const ghostHead = (g: GhostColumn) => (
    <GhostHead
      ghost={g}
      symbols={symbols}
      numberPreview={`${draft.runLabel}-1 to ${draft.runLabel}-${inFile.length}, one per line.`}
      onFill={(value) => settle(addColumn(draft.edits, g.role, value).edits)}
      onEmpty={() => settle(addColumn(draft.edits, g.role, "").edits)}
      onNumber={() => settle(numberInvoices(draft.edits, inFile.map((r) => r.line), draft.runLabel))}
    />
  );
  const blocking = fix.blocking;
  const changes = changeCounts(draft.edits);
  const changed = changeTotal(changes);

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

  return (
    <>
      <FixList view={fix} edits={draft.edits} onEdits={onEdits} />

      <SheetGrid view={grid} onEdit={onEdit} onLine={onLine} onAddLine={onAddLine} open={openCell} focusSeq={focusSeq}
        head={head} ghostHead={ghostHead} />

      <Modal
        open={askHeader !== undefined}
        title={`Use line ${askHeader ?? ""} as the header?`}
        okText="Use it"
        cancelText="Keep the header"
        focusTriggerAfterClose={false}
        onOk={() => { const line = askHeader!; setAskHeader(undefined); toHeader(line); }}
        onCancel={() => { setAskHeader(undefined); setFocusSeq(Date.now()); }}
      >
        <p>{headerWarning(droppedByHeader(draft.edits))}</p>
      </Modal>
      {replacing && (
        <FindReplace
          column={replacing}
          values={inFile.map((r) => ({ line: r.line, text: r.cells.find((c) => c.col === replacing.id)?.text ?? "" }))}
          onApply={(changes, title) => {
            setReplacing(undefined);
            settle(applyBatch(draft.edits, { id: nextBatchId(draft.edits, "replace"), kind: "column", title }, changes));
          }}
          onClose={() => { setReplacing(undefined); setFocusSeq(Date.now()); }}
        />
      )}

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
        {fileChanged(changes) && (
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
