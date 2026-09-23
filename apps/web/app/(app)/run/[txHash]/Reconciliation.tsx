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
import { networkFor, short, receiptUrl, type NetworkView } from "@/lib/chain";
import { connect, knownWallets, watchWalletList, type WalletChoice } from "@/lib/wallet";
import { describeError } from "@/lib/errors";
import WalletPicker from "@/components/WalletPicker";
import { SEVERITY, statusView } from "@/lib/reconcile-view";
import { amountFigure, amountText, type TokenMeta } from "@/lib/token-meta";
import {
  tokensToRead, runStatsView, STAT_LABELS, perTokenTotals, statusBreakdown,
} from "@/lib/run-view";
import { Grid, Col } from "@/components/grid/Grid";
import Panel from "@/components/ui/Panel";
import StatTile from "@/components/ui/StatTile";
import Verdict from "@/components/ui/Verdict";

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

  const failed = (tone: string, title: string, body: string, extra?: React.ReactNode) => (
    <Col span={12}>
      <Panel>
        <Verdict tone={tone} title={title} body={body} />
        {extra}
      </Panel>
    </Col>
  );

  return (
    <Grid>
      {phase === "loading" && (
        <>
          {STAT_LABELS.map((label) => (
            <Col key={label} span={3} md={6}>
              <StatTile label={label} value={<Skeleton.Input active size="small" />} />
            </Col>
          ))}
          <Col span={12}><Panel><Skeleton active paragraph={{ rows: 8 }} /></Panel></Col>
        </>
      )}

      {phase === "tx_not_found" && failed("error", "No such transaction on Arc",
        `Nothing on Arc ${net.name} matches this hash. If the run was sent on a different network, switch with ?n=mainnet.`)}

      {phase === "run_reverted" && failed("error", "This payout run did not execute",
        "The transaction reverted. No money moved, nothing was paid, and nothing was recorded. The run is safe to send again.",
        <p style={{ marginTop: "1.2rem", marginBottom: 0 }}>
          <a href={`${net.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">Inspect the failed transaction</a>
        </p>)}

      {phase === "rpc_unreachable" && failed("degraded", "Could not reach Arc",
        "This says nothing about the run — only that the checks could not run. Try another endpoint below.",
        error ? <Alert type="warning" showIcon style={{ marginTop: 20 }} title={error} /> : undefined)}

      {phase === "ready" && data && (
        <Ready
          data={data} net={net} txHash={txHash} hasManifest={!!manifest}
          runSalt={(runSalt as Hex | null) ?? manifest?.runSalt}
          manifestName={manifestName} runLabel={runLabel}
          onManifest={(m, name) => { setManifest(m); setManifestName(name); }}
        />
      )}

      <Col span={12}>
        <footer className="footer">
          <div>
            Checked against <span className="endpoint">{rpc}</span>{" "}
            <button className="linkish" onClick={() => {
              const next = window.prompt("Arc RPC endpoint to verify against", rpc);
              if (next) setRpc(next.trim());
            }}>change</button>
          </div>
        </footer>
      </Col>
    </Grid>
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

  // The one sum the tiles (via runStatsView) and this table's footer both
  // read, so an edit to one can never make the page disagree with itself.
  const tokenTotals = useMemo(() => perTokenTotals(result.payments), [result.payments]);

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

  const stats = runStatsView({
    payments: result.payments, rows: result.rows, completeness,
    hasManifest, blockNumber: data.blockNumber, meta: tokens,
  });

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
        <span style={{ color: "var(--text-soft)" }}>{hasManifest ? "not on the list" : "in the run file"}</span>
      ),
    },
    {
      title: "Token", dataIndex: "token", width: 110,
      filters: tokenTotals.map(({ token: t }) => ({
        text: tokens.get(t.toLowerCase())?.symbol ?? short(t), value: t.toLowerCase(),
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
              <span style={{ color: "var(--danger)" }}>{short(to)}</span>
              <br />
              <span style={{ color: "var(--text-soft)", fontSize: "0.85em" }}>owed {short(r.expectedTo)}</span>
            </span>
          );
        }
        const shown = to ?? r.expectedTo;
        if (!shown) return <span style={{ color: "var(--text-soft)" }}>—</span>;
        return (
          <a className="hex addr" href={`${net.explorer}/address/${shown}`} target="_blank" rel="noreferrer" title={shown}>
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
          : <span style={{ color: "var(--text-soft)" }} title={hasManifest ? undefined : "Load the run file to issue receipt links"}>—</span>;
      },
    },
  ];

  return (
    <>
      {stats.map((s) => (
        <Col key={s.key} span={3} md={6}>
          <StatTile
            label={s.label} tone={s.tone} value={s.value}
            sub={s.key === "recorded"
              ? <a href={`${net.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">View on explorer</a>
              : s.sub.length ? s.sub.map((line) => <span key={line} className="stat-line">{line}</span>) : undefined}
          />
        </Col>
      ))}

      <Col span={12}><p className="coverage-line">{completeness.note}</p></Col>

      {!hasManifest && (
        <Col span={12}>
          <Alert
            type="info"
            title="Reading without the run file"
            description={
              <>
                Every payment below is read from the chain. Without the payer&apos;s run file
                there is no record of what each invoice was owed, so amounts can only be checked
                against the list the payer recorded on chain.{" "}
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
                  <button className="linkish">Load the run file</button>
                </Upload>{" "}
                to compare what was owed with what was paid. It is read in your browser and never uploaded.
              </>
            }
          />
        </Col>
      )}

      {hasManifest && data.manifestCheck && (
        <Col span={12}>
          <Alert
            type={data.manifestCheck.matches === true ? "success"
              : data.manifestCheck.matches === false ? "error" : "warning"}
            showIcon
            title={
              data.manifestCheck.matches === true ? "This run file matches the recorded list"
                : data.manifestCheck.matches === false ? "This run file does not match the recorded list"
                : "This run file could not be checked"
            }
            description={
              <>
                {data.manifestCheck.note}
                {manifestName && <> Read from <strong>{manifestName}</strong> in your browser, never uploaded.</>}
                {data.manifestCheck.matches === false && data.manifestCheck.computedRoot && (
                  <dl className="detail" style={{ marginTop: 10 }}>
                    <dt>Recorded on chain</dt>
                    <dd className="hex">{data.manifestCheck.anchoredRoot}</dd>
                    <dt>This file&apos;s fingerprint</dt>
                    <dd className="hex">{data.manifestCheck.computedRoot}</dd>
                  </dl>
                )}
              </>
            }
          />
        </Col>
      )}

      <Col span={12}>
        <Panel title="Payments in this run">
          <Table<ReconcileRow>
            columns={columns}
            dataSource={result.rows.map((r, i) => ({ ...r, key: `${r.memoId}-${i}` }))}
            pagination={result.rows.length > 25 ? { pageSize: 25 } : false}
            size="middle"
            scroll={{ x: "max-content" }}
            expandable={{
              columnTitle: <span className="sr-only">Details</span>,
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
                    {statusBreakdown(result.rows, hasManifest)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right" colSpan={3}>
                    <ul className="totals totals--tight">
                      {tokenTotals.map(({ token: t, total }) => (
                        <li key={t}>
                          <span className="hex">{amountText(total, t, tokens.get(t.toLowerCase()) ?? {})}</span>
                        </li>
                      ))}
                    </ul>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </Panel>
      </Col>

      <Col span={8} md={12}>
        <Panel>
          <RecoverLinks
            net={net} txHash={txHash}
            memoIdsOnChain={new Set(result.payments.map((p) => p.memoId.toLowerCase()))}
            payments={result.payments}
            anchoredRoot={data.anchoredRoot}
            anchorPayer={data.anchorPayer}
            initialLabel={runLabel ?? ""}
          />
        </Panel>
      </Col>
    </>
  );
}

function Amount({ row, tokens }: { row: ReconcileRow; tokens: Map<string, TokenMeta> }) {
  const m = tokens.get(row.token.toLowerCase()) ?? {};
  const f = (v: bigint) => amountFigure(v, row.token, m);
  if (row.status === "amount_mismatch" && row.expected !== undefined && row.actual !== undefined) {
    const delta = row.actual - row.expected;
    return (
      <span className="hex">
        {f(row.actual)}{" "}
        <span style={{ color: "var(--danger)" }}>
          ({delta > 0n ? "+" : ""}{f(delta)})
        </span>
        <br />
        <span style={{ color: "var(--text-soft)", fontSize: "0.85em" }}>owed {f(row.expected)}</span>
      </span>
    );
  }
  if (row.actual !== undefined) return <span className="hex">{f(row.actual)}</span>;
  if (row.expected !== undefined) {
    return <span className="hex" style={{ color: "var(--text-soft)" }}>owed {f(row.expected)}</span>;
  }
  return <span style={{ color: "var(--text-soft)" }}>—</span>;
}

function RowDetail({
  row, net, tokens, note, receipt,
}: {
  row: ReconcileRow; net: NetworkView; tokens: Map<string, TokenMeta>;
  note?: string;
  receipt?: string;
}) {
  const m = tokens.get(row.token.toLowerCase()) ?? {};
  const f = (v: bigint) => amountFigure(v, row.token, m);
  return (
    <dl className="detail">
      {note && (<><dt>What this means</dt><dd>{note}</dd></>)}
      {row.status === "recipient_mismatch" && (
        <>
          <dt>Paid to</dt><dd className="hex" style={{ color: "var(--danger)" }}>{row.to}</dd>
          <dt>Should have been</dt><dd className="hex">{row.expectedTo}</dd>
        </>
      )}
      {row.status === "amount_mismatch" && (
        <>
          <dt>Paid</dt><dd className="hex">{f(row.actual!)}</dd>
          <dt>Owed</dt><dd className="hex">{f(row.expected!)}</dd>
        </>
      )}
      <dt>Reference</dt><dd className="hex">{row.memoId}</dd>
      {row.payer && (<><dt>Payer</dt><dd className="hex">{row.payer}</dd></>)}
      <dt>Receipt</dt>
      <dd>
        {receipt ? (
          <a href={receipt}>Open this line&apos;s receipt</a>
        ) : (
          <span style={{ color: "var(--text-soft)" }}>
            {!row.invoiceId
              ? "Needs the invoice reference and reference code, which only the run file holds."
              : row.actual === undefined
                ? "No receipt: nothing on chain carries this reference, so there is no payment to prove."
                : "No receipt: the recorded list could not be read or matched, so no proof can be issued for this line."}
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
  for (const token of tokensToRead(result)) {
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
          `Only the paying wallet can rebuild these links, because their reference code comes from its signature.`,
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
    <details open={!!initialLabel}>
      <summary style={{ cursor: "pointer" }}>
        Lost the receipt links? Rebuild them by signing again
      </summary>

      <p className="because" style={{ marginTop: 12 }}>
        For the payer only{anchorPayer ? <> — the wallet at <span className="hex addr">{short(anchorPayer)}</span></> : null}.
        Nothing about this run was stored: the reference code that makes each link
        verifiable comes from that wallet&apos;s signature over the run name, so signing the
        same message again is what brings the links back. Recipients and auditors do not need
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
          description="The reference codes from that signature are not the ones this transaction carries, or they do not rebuild the list the payer recorded. Usually the run name was typed differently, an invoice reference is spelled differently, the wallet does not produce the same signature twice, or the recorded list could not be read. Use the run file you downloaded — no links are shown, because a link that cannot verify is worse than none." />
      )}

      {state === "error" && error && (
        <Alert style={{ marginTop: 16 }} type="warning" showIcon title={error} />
      )}

      {state === "ok" && (
        <>
          <Alert style={{ marginTop: 16 }} type="success" showIcon
            title="Rebuilt and checked against the chain"
            description="Every reference below came from your signature, was found in this transaction, and together they rebuild the list the payer recorded on chain." />
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
