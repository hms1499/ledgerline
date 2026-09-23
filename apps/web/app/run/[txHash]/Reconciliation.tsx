"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, http, type Address } from "viem";
import { Alert, Button, Input, Skeleton, Table, Tag, Upload, type TableColumnsType } from "antd";
import {
  reconcile, assessCompleteness, checkManifestAgainstRoot, RUN_COMMITTED_TOPIC,
  saltMessageFor, saltFromSignature, memoIdFor, proofsFromChain,
  type ReconcileResult, type ReconcileRow, type ReconcileStatus,
  type Manifest, type RawLog, type Hex, type Completeness, type ManifestCheck,
  type PaymentRecord,
} from "@ledgerline/core";
import { networkFor, short, formatAmount, receiptUrl, type NetworkView } from "@/lib/chain";
import { connect, knownWallets, watchWalletList, type WalletChoice } from "@/lib/wallet";
import { describeError } from "@/lib/errors";
import WalletPicker from "@/components/WalletPicker";
import { SEVERITY, statusView } from "@/lib/reconcile-view";

const anchorAbi = [
  { type: "function", name: "runs", stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [
      { name: "root", type: "bytes32" }, { name: "payer", type: "address" },
      { name: "itemCount", type: "uint32" }, { name: "timestamp", type: "uint64" },
    ] },
] as const;

const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

type Phase = "loading" | "ready" | "tx_not_found" | "run_reverted" | "rpc_unreachable";

interface TokenMeta { decimals: number; symbol: string }

interface Loaded {
  result: ReconcileResult;
  completeness: Completeness;
  tokens: Map<string, TokenMeta>;
  blockNumber: bigint;
  anchoredItemCount?: number;
  anchorPayer?: Address;
  /** The root PayoutAnchor committed, kept so link recovery can check against
   *  it. It cannot lean on `manifestCheck`, which is undefined until someone
   *  uploads a manifest — and recovery's whole premise is having none. */
  anchoredRoot?: Hex;
  manifestCheck?: ManifestCheck;
  logs: RawLog[];
}

export default function Reconciliation({
  txHash, networkName, runSalt, runLabel,
}: {
  txHash: string; networkName: string | null; runSalt: string | null;
  /** Carried from the history list so the payer does not retype it. */
  runLabel?: string | null;
}) {
  const net = networkFor(networkName);
  const [rpc, setRpc] = useState(net.defaultRpc);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string>();
  const [data, setData] = useState<Loaded>();
  const [manifest, setManifest] = useState<Manifest>();
  const [manifestName, setManifestName] = useState<string>();

  const load = useCallback(async () => {
    setPhase("loading");
    setError(undefined);
    try {
      const loaded = await loadRun(rpc, net, txHash, manifest, runSalt);
      if (loaded === "reverted") { setPhase("run_reverted"); return; }
      setData(loaded);
      setPhase("ready");
    } catch (err) {
      const msg = describeError(err);
      if (/not be found|not found/i.test(msg)) setPhase("tx_not_found");
      else { setError(msg); setPhase("rpc_unreachable"); }
    }
  }, [rpc, net, txHash, manifest, runSalt]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="sheet sheet--wide">
      <div className="masthead">
        <strong>Payout run</strong>
        <span>
          Arc {net.name}
          {data ? ` at block ${data.blockNumber.toLocaleString("en-US")}` : ""}
        </span>
      </div>

      {phase === "loading" && <Skeleton active paragraph={{ rows: 8 }} style={{ marginTop: 32 }} />}

      {phase === "tx_not_found" && (
        <Headline tone="error" title="No such transaction on Arc"
          body={`Nothing on Arc ${net.name} matches this hash. If the run was sent on a different network, switch with ?n=mainnet.`} />
      )}

      {phase === "run_reverted" && (
        <>
          <Headline tone="error" title="This payout run did not execute"
            body="The transaction reverted. No money moved, nothing was paid, and no anchor was written. The run is safe to send again." />
          <p style={{ marginTop: "1.5rem" }}>
            <a href={`${net.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">
              Inspect the failed transaction
            </a>
          </p>
        </>
      )}

      {phase === "rpc_unreachable" && (
        <>
          <Headline tone="degraded" title="Could not reach Arc"
            body="This says nothing about the run — only that the checks could not run. Try another endpoint below." />
          {error && <Alert type="warning" showIcon style={{ marginTop: 20 }} title={error} />}
        </>
      )}

      {phase === "ready" && data && (
        <Ready
          data={data} net={net} txHash={txHash} hasManifest={!!manifest}
          runSalt={(runSalt as Hex | null) ?? manifest?.runSalt}
          manifestName={manifestName} runLabel={runLabel}
          onManifest={(m, name) => { setManifest(m); setManifestName(name); }}
        />
      )}

      <footer className="footer">
        <div>
          Checked against <span className="endpoint">{rpc}</span>{" "}
          <button className="linkish" onClick={() => {
            const next = window.prompt("Arc RPC endpoint to verify against", rpc);
            if (next) setRpc(next.trim());
          }}>change</button>
        </div>
      </footer>
    </main>
  );
}

function Headline({ tone, title, body }: { tone: string; title: string; body: string }) {
  return (
    <section className={`verdict ${tone}`}>
      <h1>{title}</h1>
      <p>{body}</p>
    </section>
  );
}

function Ready({
  data, net, txHash, hasManifest, runSalt, manifestName, runLabel, onManifest,
}: {
  data: Loaded; net: NetworkView; txHash: string; hasManifest: boolean;
  /** Without it no receipt link can be issued — the page would only hand the
   *  recipient an "incomplete" one. */
  runSalt?: Hex;
  manifestName?: string;
  runLabel?: string | null;
  onManifest: (m: Manifest, name: string) => void;
}) {
  const { result, completeness, tokens } = data;

  const counts = useMemo(() => {
    const c = new Map<ReconcileStatus, number>();
    for (const r of result.rows) c.set(r.status, (c.get(r.status) ?? 0) + 1);
    return c;
  }, [result.rows]);

  const perToken = useMemo(() => {
    const t = new Map<string, bigint>();
    for (const p of result.payments) {
      t.set(p.token.toLowerCase(), (t.get(p.token.toLowerCase()) ?? 0n) + p.value);
    }
    return t;
  }, [result.payments]);

  // A link is offered only when every piece of its evidence is in hand and
  // the proofs rebuild the anchored root. Anything less opens as incomplete.
  const proofs = useMemo(
    () => proofsFromChain(result.payments, data.anchoredRoot),
    [result.payments, data.anchoredRoot],
  );
  const receiptFor = (r: ReconcileRow): string | undefined => {
    const proof = proofs?.(r.memoId);
    if (!r.invoiceId || !runSalt || !proof) return undefined;
    return receiptUrl({ txHash, invoiceId: r.invoiceId, runSalt, proof, network: net.name });
  };

  // Without a manifest every payment is `unexpected` by definition — there is
  // no intent to compare against. Counting those as things to review would
  // contradict the completeness verdict directly above them.
  const problems = result.rows.filter(
    (r) => r.status !== "matched" && !(r.status === "unexpected" && !hasManifest),
  ).length;

  const columns: TableColumnsType<ReconcileRow> = [
    {
      title: "Status", dataIndex: "status", width: 210,
      filters: [...counts.keys()].sort((a, b) => SEVERITY[a] - SEVERITY[b])
        .map((s) => ({ text: statusView(s, hasManifest).label, value: s })),
      onFilter: (v, r) => r.status === v,
      sorter: (a, b) => SEVERITY[a.status] - SEVERITY[b.status],
      defaultSortOrder: "ascend",
      render: (s: ReconcileStatus) => {
        const v = statusView(s, hasManifest);
        return <Tag color={v.color}>{v.label}</Tag>;
      },
    },
    {
      title: "Invoice", dataIndex: "invoiceId", width: 150,
      render: (id?: string) => id ?? (
        <span style={{ opacity: 0.45 }}>{hasManifest ? "not in manifest" : "see manifest"}</span>
      ),
    },
    {
      title: "Token", dataIndex: "token", width: 110,
      filters: [...perToken.keys()].map((t) => ({
        text: tokens.get(t)?.symbol ?? short(t), value: t,
      })),
      onFilter: (v, r) => r.token.toLowerCase() === v,
      render: (t: Address) => tokens.get(t.toLowerCase())?.symbol ?? short(t),
    },
    {
      title: "Recipient", dataIndex: "to", width: 150,
      render: (to: Address | undefined, r) => {
        if (r.status === "recipient_mismatch" && to && r.expectedTo) {
          // Showing only where the money went would read as correct. The row
          // has to carry the disagreement itself, not hide it behind an expand.
          return (
            <span className="hex" style={{ display: "block", lineHeight: 1.5 }}>
              <span style={{ color: "var(--flag)" }}>{short(to)}</span>
              <br />
              <span style={{ opacity: 0.6, fontSize: "0.85em" }}>owed {short(r.expectedTo)}</span>
            </span>
          );
        }
        const shown = to ?? r.expectedTo;
        if (!shown) return <span style={{ opacity: 0.45 }}>—</span>;
        return (
          <a className="hex" href={`${net.explorer}/address/${shown}`} target="_blank" rel="noreferrer" title={shown}>
            {short(shown)}
          </a>
        );
      },
    },
    {
      title: "Amount", dataIndex: "actual", align: "right",
      render: (_: unknown, r) => <Amount row={r} tokens={tokens} />,
    },
    {
      title: "Receipt", key: "receipt", width: 110,
      render: (_: unknown, r) => {
        const url = receiptFor(r);
        return url
          ? <a href={url}>Open</a>
          : <span style={{ opacity: 0.45 }} title={hasManifest ? undefined : "Load the manifest to issue receipt links"}>—</span>;
      },
    },
  ];

  return (
    <>
      <section className="line line--summary">
        <div>
          <p className="amount">
            {result.payments.length}
            <span className="unit">{result.payments.length === 1 ? "payment" : "payments"}</span>
          </p>
          <ul className="totals">
            {[...perToken.entries()].map(([t, total]) => {
              const m = tokens.get(t);
              return (
                <li key={t}>
                  <span className="hex">{formatAmount(total, m?.decimals ?? 6)}</span>{" "}
                  {m?.symbol ?? short(t)}
                </li>
              );
            })}
          </ul>
        </div>
        <span className={`reference${problems ? " is-void" : ""}`}>
          {problems
            ? `${problems} to review`
            : hasManifest
              ? "all matched"
              : "read from chain"}
        </span>
      </section>

      <section className="verdict" style={{ paddingBottom: 0 }}>
        <h1 style={{ color: completeness.verdict === "complete" ? "var(--tick)"
          : completeness.verdict === "unknown" ? "var(--pending)" : "var(--flag)" }}>
          {completeness.verdict === "complete" ? "Complete run"
            : completeness.verdict === "incomplete" ? `${completeness.missing} missing`
            : completeness.verdict === "over" ? `${completeness.surplus} beyond the manifest`
            : "Completeness unknown"}
        </h1>
        <p>{completeness.note}</p>
      </section>

      {!hasManifest && (
        <Alert
          style={{ marginTop: 22 }}
          type="info"
          title="Reading without a manifest"
          description={
            <>
              Every payment below is read from the chain. Without the payer&apos;s manifest
              there is no record of intent, so amounts cannot be checked against what was
              owed — only against what the anchor committed to.{" "}
              <Upload
                accept=".json"
                showUploadList={false}
                beforeUpload={(file) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    try {
                      const raw = JSON.parse(String(reader.result));
                      onManifest(
                        { ...raw, items: raw.items.map((i: { amount: string }) => ({ ...i, amount: BigInt(i.amount) })) },
                        file.name,
                      );
                    } catch { /* a malformed file must not blank the page */ }
                  };
                  reader.readAsText(file);
                  return false;
                }}
              >
                <button className="linkish">Load a manifest</button>
              </Upload>{" "}
              to compare intent against what happened. It is read in your browser and never uploaded.
            </>
          }
        />
      )}

      {hasManifest && data.manifestCheck && (
        <Alert
          style={{ marginTop: 22 }}
          type={data.manifestCheck.matches === true ? "success"
            : data.manifestCheck.matches === false ? "error" : "warning"}
          showIcon
          title={
            data.manifestCheck.matches === true ? "This manifest is the one that was committed"
              : data.manifestCheck.matches === false ? "This manifest was not the one committed"
              : "This manifest could not be checked"
          }
          description={
            <>
              {data.manifestCheck.note}
              {manifestName && <> Read from <strong>{manifestName}</strong> in your browser, never uploaded.</>}
              {data.manifestCheck.matches === false && data.manifestCheck.computedRoot && (
                <dl className="detail" style={{ marginTop: 10 }}>
                  <dt>Committed on chain</dt>
                  <dd className="hex">{data.manifestCheck.anchoredRoot}</dd>
                  <dt>This file rebuilds</dt>
                  <dd className="hex">{data.manifestCheck.computedRoot}</dd>
                </dl>
              )}
            </>
          }
        />
      )}

      <div style={{ marginTop: 26 }}>
        <Table<ReconcileRow>
          columns={columns}
          dataSource={result.rows.map((r, i) => ({ ...r, key: `${r.memoId}-${i}` }))}
          pagination={result.rows.length > 25 ? { pageSize: 25 } : false}
          size="middle"
          expandable={{
            rowExpandable: (r) => r.status !== "matched",
            expandedRowRender: (r) => (
              <RowDetail row={r} net={net} tokens={tokens} receipt={receiptFor(r)}
                note={statusView(r.status, hasManifest).note ?? r.note} />
            ),
          }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>
                  <strong>{result.rows.length} rows</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} colSpan={2}>
                  {[...counts.entries()].sort((a, b) => SEVERITY[a[0]] - SEVERITY[b[0]])
                    .map(([s, n]) => `${n} ${statusView(s, hasManifest).label.toLowerCase()}`).join(", ")}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right" colSpan={3}>
                  <ul className="totals totals--tight">
                    {[...perToken.entries()].map(([t, total]) => {
                      const m = tokens.get(t);
                      return (
                        <li key={t}>
                          <span className="hex">{formatAmount(total, m?.decimals ?? 6)}</span>{" "}
                          {m?.symbol ?? ""}
                        </li>
                      );
                    })}
                  </ul>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </div>

      <RecoverLinks
        net={net} txHash={txHash}
        memoIdsOnChain={new Set(result.payments.map((p) => p.memoId.toLowerCase()))}
        payments={result.payments}
        anchoredRoot={data.anchoredRoot}
        anchorPayer={data.anchorPayer}
        initialLabel={runLabel ?? ""}
      />

      <p style={{ marginTop: 20, fontSize: "0.85rem" }}>
        <a href={`${net.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">
          This run on the explorer
        </a>
      </p>
    </>
  );
}

function Amount({ row, tokens }: { row: ReconcileRow; tokens: Map<string, TokenMeta> }) {
  const d = tokens.get(row.token.toLowerCase())?.decimals ?? 6;
  if (row.status === "amount_mismatch" && row.expected !== undefined && row.actual !== undefined) {
    const delta = row.actual - row.expected;
    return (
      <span className="hex">
        {formatAmount(row.actual, d)}{" "}
        <span style={{ color: "var(--flag)" }}>
          ({delta > 0n ? "+" : ""}{formatAmount(delta, d)})
        </span>
        <br />
        <span style={{ opacity: 0.6, fontSize: "0.85em" }}>owed {formatAmount(row.expected, d)}</span>
      </span>
    );
  }
  if (row.actual !== undefined) return <span className="hex">{formatAmount(row.actual, d)}</span>;
  if (row.expected !== undefined) {
    return <span className="hex" style={{ opacity: 0.6 }}>owed {formatAmount(row.expected, d)}</span>;
  }
  return <span style={{ opacity: 0.45 }}>—</span>;
}

function RowDetail({
  row, net, tokens, note, receipt,
}: {
  row: ReconcileRow; net: NetworkView; tokens: Map<string, TokenMeta>;
  note?: string;
  receipt?: string;
}) {
  const d = tokens.get(row.token.toLowerCase())?.decimals ?? 6;
  return (
    <dl className="detail">
      {note && (<><dt>What this means</dt><dd>{note}</dd></>)}
      {row.status === "recipient_mismatch" && (
        <>
          <dt>Paid to</dt><dd className="hex" style={{ color: "var(--flag)" }}>{row.to}</dd>
          <dt>Should have been</dt><dd className="hex">{row.expectedTo}</dd>
        </>
      )}
      {row.status === "amount_mismatch" && (
        <>
          <dt>Paid</dt><dd className="hex">{formatAmount(row.actual!, d)}</dd>
          <dt>Owed</dt><dd className="hex">{formatAmount(row.expected!, d)}</dd>
        </>
      )}
      <dt>Reference</dt><dd className="hex">{row.memoId}</dd>
      {row.payer && (<><dt>Payer</dt><dd className="hex">{row.payer}</dd></>)}
      <dt>Receipt</dt>
      <dd>
        {receipt ? (
          <a href={receipt}>Open this line&apos;s receipt</a>
        ) : (
          <span style={{ opacity: 0.6 }}>
            {!row.invoiceId
              ? "Needs the invoice reference and run salt, which only the manifest holds."
              : row.actual === undefined
                ? "No receipt: nothing on chain carries this reference, so there is no payment to prove."
                : "No receipt: the anchored root could not be read or rebuilt, so no proof can be issued for this line."}
          </span>
        )}
      </dd>
    </dl>
  );
}

async function loadRun(
  endpoint: string, net: NetworkView, txHash: string,
  manifest: Manifest | undefined, runSalt: string | null,
): Promise<Loaded | "reverted"> {
  const client = createPublicClient({ chain: net.chain, transport: http(endpoint) });
  const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });

  // A reverted run is a first-class state, not an error: it means nothing
  // was paid, which is a legitimate and important thing to show plainly.
  if (receipt.status === "reverted") return "reverted";

  const logs: RawLog[] = receipt.logs.map((l, i) => ({
    address: l.address as Address,
    topics: l.topics as Hex[],
    data: l.data as Hex,
    logIndex: l.logIndex ?? i,
  }));

  const effective = manifest && runSalt
    ? { ...manifest, runSalt: runSalt as Hex }
    : manifest;

  const result = reconcile(logs, effective);

  const tokens = new Map<string, TokenMeta>();
  for (const token of new Set(result.payments.map((p) => p.token))) {
    const [decimals, symbol] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }).catch(() => ""),
    ]);
    tokens.set(token.toLowerCase(), { decimals: Number(decimals), symbol: symbol as string });
  }

  let anchoredItemCount: number | undefined;
  let anchorPayer: Address | undefined;
  let anchoredRoot: Hex | undefined;
  const runId = runIdFromLogs(logs, net.anchor);
  if (net.anchor && runId) {
    try {
      const [root, payer, itemCount] = await client.readContract({
        address: net.anchor, abi: anchorAbi, functionName: "runs", args: [runId],
      });
      anchoredItemCount = Number(itemCount);
      anchorPayer = payer;
      anchoredRoot = root;
    } catch { /* degrade to "completeness unknown" rather than assert */ }
  }

  const unlinkedCount = result.rows.filter((r) => r.status === "unlinked").length;
  const completeness = assessCompleteness({
    anchoredItemCount, paymentsFound: result.payments.length, unlinkedCount,
  });

  const manifestCheck = effective ? checkManifestAgainstRoot(effective, anchoredRoot) : undefined;

  return {
    result, completeness, tokens, blockNumber: receipt.blockNumber,
    anchoredItemCount, anchorPayer, anchoredRoot, manifestCheck, logs,
  };
}

/** Required to come from the anchor this page trusts — any contract can emit
 *  this topic, and a payer could otherwise stage their own. */
function runIdFromLogs(logs: RawLog[], anchor?: Address): Hex | undefined {
  if (!anchor) return undefined;
  return logs.find(
    (l) => l.address.toLowerCase() === anchor.toLowerCase() &&
      l.topics[0] === RUN_COMMITTED_TOPIC && l.topics.length >= 2,
  )?.topics[1];
}

/**
 * The design's safety valve. The salt is derived from a signature and stored
 * nowhere, so recovery is a signature rather than a backup — and what makes it
 * safe to hand out the resulting links is that nothing here is assumed. The
 * re-derived references must be ones this transaction's logs actually carry,
 * and the tree rebuilt from those logs must produce the root the anchor
 * committed. Either check failing means silence: an unverified receipt link is
 * worse than no link at all.
 */
function RecoverLinks({
  net, txHash, memoIdsOnChain, payments, anchoredRoot, anchorPayer, initialLabel,
}: {
  net: NetworkView; txHash: string;
  memoIdsOnChain: Set<string>;
  payments: PaymentRecord[];
  /** The root PayoutAnchor committed for this run, when it could be read. */
  anchoredRoot?: Hex;
  /** Who the anchor records as having paid — the only wallet this can work
   *  for, and worth saying out loud rather than discovering by failing. */
  anchorPayer?: Address;
  initialLabel?: string;
}) {
  const [label, setLabel] = useState(initialLabel ?? "");
  const [invoices, setInvoices] = useState("");
  const [state, setState] = useState<"idle" | "working" | "ok" | "mismatch" | "error">("idle");
  const [error, setError] = useState<string>();
  const [links, setLinks] = useState<{ invoiceId: string; url: string }[]>([]);
  const [copied, setCopied] = useState<string>();
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [picking, setPicking] = useState(false);

  // Same reason as the history page: without an ask, this page sees only the
  // wallets that announced before it mounted, which is none of them.
  useEffect(() => watchWalletList(() => setChoices(knownWallets())), []);

  // Recovery re-derives the salt from a signature, so it must be signed by the
  // payer's wallet specifically. With two wallets installed, connecting to
  // whichever one the browser happened to hand over would sign with the wrong
  // account and report a mismatch that says nothing about the run.
  const onRebuild = () => {
    const found = knownWallets();
    if (found.length > 1) { setChoices(found); setPicking(true); return; }
    void recover(found[0]);
  };

  const recover = async (choice?: WalletChoice) => {
    setPicking(false);
    setState("working");
    setError(undefined);
    setCopied(undefined);
    try {
      const ids = invoices.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) throw new Error("List the invoice references, one per line.");

      const { address, walletClient } = await connect(net, choice);

      // Checked before signing, not after. Signing with the wrong account
      // produces a different salt and therefore a mismatch, which is correct
      // but says nothing useful — "these do not match the chain" is a poor
      // way to tell someone they connected the wrong wallet.
      if (anchorPayer && address.toLowerCase() !== anchorPayer.toLowerCase()) {
        throw new Error(
          `This run was paid by ${anchorPayer}, but the wallet you connected is ${address}. ` +
          `Only the paying wallet can rebuild these links, because the salt is derived from its signature.`,
        );
      }

      const signature = await walletClient.signMessage({
        account: address,
        message: saltMessageFor(net.chain.id, label),
      });
      const runSalt = saltFromSignature(signature);

      // Check 1: the derived references must be ones this transaction carries.
      const derived = ids.map((invoiceId) => ({ invoiceId, memoId: memoIdFor(runSalt, invoiceId) }));
      if (!derived.every((d) => memoIdsOnChain.has(d.memoId.toLowerCase()))) {
        setState("mismatch");
        setLinks([]);
        return;
      }

      // Check 2: the tree rebuilt from every payment in the run must produce
      // the root the anchor committed. If it does not, say nothing.
      const proofs = proofsFromChain(payments, anchoredRoot);
      if (!proofs) {
        setState("mismatch");
        setLinks([]);
        return;
      }

      setLinks(derived.map((d) => ({
        invoiceId: d.invoiceId,
        url: receiptUrl({
          origin: window.location.origin, txHash, invoiceId: d.invoiceId,
          runSalt, proof: proofs(d.memoId)!, network: net.name,
        }),
      })));
      setState("ok");
    } catch (err) {
      setError(describeError(err));
      setState("error");
    }
  };

  return (
    <details open={!!initialLabel} style={{ marginTop: 26 }}>
      <summary style={{ cursor: "pointer" }}>
        Lost the receipt links? Rebuild them by signing again
      </summary>

      <p className="because" style={{ marginTop: 12 }}>
        For the payer only{anchorPayer ? <> — the wallet at <span className="hex">{short(anchorPayer)}</span></> : null}.
        Nothing about this run was stored: the salt that makes each link verifiable is
        derived from that wallet&apos;s signature over the run name, so signing the same
        message again is what brings the links back. Recipients and auditors do not need
        this — the link they were given already verifies on its own.
      </p>

      <label style={{ display: "block", marginTop: 14, maxWidth: "32rem" }}>
        <span style={{ display: "block", fontSize: "0.87rem", marginBottom: 6 }}>Run name</span>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Payroll 2026-09" />
      </label>

      <label style={{ display: "block", marginTop: 14, maxWidth: "32rem" }}>
        <span style={{ display: "block", fontSize: "0.87rem", marginBottom: 6 }}>
          Invoice references, one per line
        </span>
        <Input.TextArea rows={4} value={invoices} onChange={(e) => setInvoices(e.target.value)} />
      </label>

      <Button style={{ marginTop: 14 }} loading={state === "working"} onClick={onRebuild}>
        Sign and rebuild
      </Button>

      <WalletPicker
        choices={choices} open={picking}
        onPick={(c) => void recover(c)}
        onCancel={() => setPicking(false)}
      />

      {state === "mismatch" && (
        <Alert style={{ marginTop: 16 }} type="error" showIcon
          title="These do not match what is on chain"
          description="Either the references derived from that signature are not the ones this transaction carries, or the rebuilt manifest root is not the one the anchor committed. That covers a run name typed differently, an invoice reference spelled differently, a wallet that does not reproduce its signatures, and an anchor that could not be read. Use the manifest you downloaded — no links are shown, because an unverified link is worse than none." />
      )}

      {state === "error" && error && (
        <Alert style={{ marginTop: 16 }} type="warning" showIcon title={error} />
      )}

      {state === "ok" && (
        <>
          <Alert style={{ marginTop: 16 }} type="success" showIcon
            title="Rebuilt and checked against the chain"
            description="Every reference below was derived from your signature and then found in this transaction's logs, and the tree they came from rebuilds the root the anchor committed." />
          <dl className="detail" style={{ marginTop: 14 }}>
            {links.map((l) => (
              <div key={l.invoiceId} style={{ display: "contents" }}>
                <dt>{l.invoiceId}</dt>
                <dd>
                  <button className="linkish" onClick={() => {
                    void navigator.clipboard.writeText(l.url);
                    setCopied(l.invoiceId);
                  }}>
                    {copied === l.invoiceId ? "Copied" : "Copy link"}
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </details>
  );
}
