"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, decodeAbiParameters, type Address } from "viem";
import { Alert, Skeleton, Table, Tag, type TableColumnsType } from "antd";
import {
  assessBatch, reconcile,
  type BatchAssessment, type PaymentRecord, type RawLog, type Hex,
} from "@ledgerline/core";
import { networkFor, short, type NetworkView } from "@/lib/chain";
import { describeError } from "@/lib/errors";
import { amountText } from "@/lib/token-meta";

/** Approval(address indexed owner, address indexed spender, uint256 value) */
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "allowance", stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

interface TokenMeta { decimals: number; symbol: string }

interface Side {
  hash: Hex;
  assessment: BatchAssessment;
  payments: PaymentRecord[];
  payer: Address;
  /** receipt.to — the contract the payer called. */
  batcher?: Address;
  gasUsed: bigint;
  blockNumber: bigint;
  reverted: boolean;
}

interface Loaded {
  ours: Side;
  naive: Side;
  tokens: Map<string, TokenMeta>;
  /** Live allowance from the payer to the naive batcher, read just now. */
  allowanceNow?: { token: Address; value: bigint; spender: Address };
  /** The approval the naive route needed, and what it cost. */
  approve?: { hash: Hex; gasUsed: bigint; granted?: bigint; token?: Address };
}

type Phase = "loading" | "ready" | "unconfigured" | "tx_not_found" | "rpc_unreachable";

export default function Why({
  networkName, oursHash, naiveHash, approveHash,
}: {
  networkName: string | null;
  oursHash: string | null;
  naiveHash: string | null;
  approveHash: string | null;
}) {
  const net = networkFor(networkName);
  const ours = (oursHash ?? net.demo.ours) as Hex | undefined;
  const naive = (naiveHash ?? net.demo.naive) as Hex | undefined;
  const approve = (approveHash ?? net.demo.naiveApprove) as Hex | undefined;

  const [rpc, setRpc] = useState(net.defaultRpc);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string>();
  const [data, setData] = useState<Loaded>();

  const load = useCallback(async () => {
    if (!ours || !naive) { setPhase("unconfigured"); return; }
    setPhase("loading");
    setError(undefined);
    try {
      setData(await loadBoth(rpc, net, ours, naive, approve));
      setPhase("ready");
    } catch (err) {
      const msg = describeError(err);
      if (/not be found|not found/i.test(msg)) setPhase("tx_not_found");
      else { setError(msg); setPhase("rpc_unreachable"); }
    }
  }, [rpc, net, ours, naive, approve]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="sheet sheet--wide">
      <div className="masthead">
        <strong>Why this differs</strong>
        <span>
          Arc {net.name}
          {data ? ` at block ${data.ours.blockNumber.toLocaleString("en-US")}` : ""}
        </span>
      </div>

      {phase === "loading" && <Skeleton active paragraph={{ rows: 8 }} style={{ marginTop: 32 }} />}

      {phase === "unconfigured" && (
        <>
          <section className="verdict degraded">
            <h1>No pair of transactions to compare yet</h1>
            <p>
              This page reads two real transactions off Arc and derives every claim below
              from their logs. It asserts nothing on its own, so with no transactions
              configured it has nothing to say.
            </p>
          </section>
          <p style={{ marginTop: "1.6rem", maxWidth: "62ch" }}>
            Point it at a pair:{" "}
            <code className="hex">/why?ours=0x…&amp;naive=0x…&amp;approve=0x…&amp;n={net.name}</code>
          </p>
        </>
      )}

      {phase === "tx_not_found" && (
        <section className="verdict error">
          <h1>One of these transactions is not on Arc {net.name}</h1>
          <p>Nothing here matches. If the pair was sent on another network, switch with <code>?n=mainnet</code>.</p>
        </section>
      )}

      {phase === "rpc_unreachable" && (
        <>
          <section className="verdict degraded">
            <h1>Could not reach Arc</h1>
            <p>
              This says nothing about either transaction — only that the comparison could
              not be read. Try another endpoint below.
            </p>
          </section>
          {error && <Alert type="warning" showIcon style={{ marginTop: 20 }} title={error} />}
        </>
      )}

      {phase === "ready" && data && <Comparison data={data} net={net} />}

      <footer className="footer">
        <div>
          Read from <span className="endpoint">{rpc}</span>{" "}
          <button className="linkish" onClick={() => {
            const next = window.prompt("Arc RPC endpoint to read from", rpc);
            if (next) setRpc(next.trim());
          }}>change</button>
        </div>
      </footer>
    </div>
  );
}

interface ClaimRow {
  key: string;
  claim: string;
  ours: React.ReactNode;
  naive: React.ReactNode;
  /** Where the two cells came from. Every claim names its own evidence. */
  source: string;
  /** True when the two sides do not actually differ. */
  same?: boolean;
}

function Comparison({ data, net }: { data: Loaded; net: NetworkView }) {
  const { ours, naive, tokens, allowanceNow, approve } = data;

  const tok = (t: Address) => tokens.get(t.toLowerCase());
  const amount = (t: Address, v: bigint) => amountText(v, t, tok(t) ?? {});

  const naiveTxCount = approve ? 2 : 1;
  const naiveGas = naive.gasUsed + (approve?.gasUsed ?? 0n);
  const reverted = [ours, naive].filter((s) => s.reverted);

  const rows: ClaimRow[] = [
    {
      key: "reference",
      claim: "Payments carrying a reference",
      ours: <Tag color="success">{ours.assessment.referenced} of {ours.assessment.payments}</Tag>,
      naive: <Tag color="error">{naive.assessment.referenced} of {naive.assessment.payments}</Tag>,
      source: "Memo logs joined to Transfer logs by callDataHash",
    },
    {
      key: "txs",
      claim: "Transactions the payer signs",
      ours: <strong>1</strong>,
      naive: <strong>{naiveTxCount}</strong>,
      source: approve
        ? "the approval and the batch are two separate transactions"
        : "the batch alone; no approval transaction was supplied",
    },
    {
      key: "allowance",
      claim: "Allowance granted to a contract the payer does not control",
      ours: <span style={{ color: "var(--tick)" }}>none — no approval exists in this path</span>,
      naive: approve?.granted !== undefined && approve.token
        ? <>{amount(approve.token, approve.granted)} granted</>
        : <>required before any transfer</>,
      source: "Approval log on the approve transaction",
    },
    {
      key: "standing",
      claim: "That allowance, read from the chain right now",
      ours: <span style={{ color: "var(--text-soft)" }}>—</span>,
      naive: allowanceNow
        ? allowanceNow.value === 0n
          ? <span style={{ color: "var(--tick)" }}>0 — fully spent</span>
          : <span style={{ color: "var(--flag)" }}>{amount(allowanceNow.token, allowanceNow.value)} still standing</span>
        : <span style={{ color: "var(--text-soft)" }}>not read</span>,
      source: `allowance(payer, ${allowanceNow ? short(allowanceNow.spender) : "batcher"}) — an eth_call made when this page loaded`,
    },
    {
      key: "from",
      claim: "Who the recipient sees as Transfer.from",
      ours: ours.assessment.payerVisible
        ? <>the payer, <span className="hex addr">{short(ours.payer)}</span></>
        : <span style={{ color: "var(--flag)" }}>{naive.assessment.senders.map(short).join(", ")}</span>,
      naive: naive.assessment.payerVisible
        ? <>the payer, <span className="hex addr">{short(naive.payer)}</span></>
        : <span style={{ color: "var(--flag)" }}>{naive.assessment.senders.map(short).join(", ")}</span>,
      source: "Transfer.from on every non-system Transfer log",
      same: ours.assessment.payerVisible && naive.assessment.payerVisible,
    },
    {
      key: "gas",
      claim: "Gas used",
      // Raw totals compare three payments against one, which flatters the
      // wrong side. Per payment is the figure that means anything.
      ours: <Gas total={ours.gasUsed} payments={ours.assessment.payments} />,
      naive: <Gas total={naiveGas} payments={naive.assessment.payments} />,
      source: approve
        ? "receipt.gasUsed, approval and batch summed, divided by payments made"
        : "receipt.gasUsed, divided by payments made",
    },
  ];

  const columns: TableColumnsType<ClaimRow> = [
    {
      title: "What the recipient can establish",
      dataIndex: "claim",
      width: "30%",
      render: (claim: string, r) => (
        <>
          <span>{claim}</span>
          <span className="because">{r.source}</span>
        </>
      ),
    },
    { title: "Ledgerline", dataIndex: "ours", width: "35%" },
    {
      title: "Ordinary Multicall3 batch",
      dataIndex: "naive",
      width: "35%",
      render: (cell: React.ReactNode, r) => (
        <>
          {cell}
          {r.same && <span className="because">No difference here. Said plainly because it is true.</span>}
        </>
      ),
    },
  ];

  return (
    <>
      <section className="line line--summary">
        <div>
          <p className="amount">
            {ours.assessment.referenced}
            <span className="unit">of {ours.assessment.payments} referenced</span>
          </p>
          <p className="payee">
            one transaction, {ours.assessment.totals.map((t) => amount(t.token, t.value)).join(" · ")}
          </p>
        </div>
        <span className="reference is-void">
          {naive.assessment.referenced} of {naive.assessment.payments} the ordinary way
        </span>
      </section>

      {reverted.length > 0 && (
        <Alert
          style={{ marginTop: 22 }}
          type="error"
          showIcon
          title={`${reverted.length === 2 ? "Both" : "One"} of these transactions reverted`}
          description="A reverted transaction moved no money, so the comparison below is not a comparison of two payments. Fix the configured pair before showing this to anyone."
        />
      )}

      <section className="verdict ok" style={{ paddingBottom: 0 }}>
        <h1>The reference is the difference</h1>
        <p>
          Both transactions below moved real money on Arc {net.name}. Every claim in the
          table is read from their logs when this page loads — nothing here is asserted
          by us.
        </p>
      </section>

      <div style={{ marginTop: 26 }}>
        <Table<ClaimRow>
          columns={columns}
          dataSource={rows}
          pagination={false}
          size="middle"
        />
      </div>

      <div className="compare">
        <TxCard
          title="Ledgerline"
          side={ours}
          net={net}
          note="Multicall3From → Memo → transfer. The token still sees the payer as msg.sender, and each payment carries its own reference."
        >
          <dl className="detail">
            {ours.payments.map((p) => (
              <div key={p.memoId} style={{ display: "contents" }}>
                <dt className="hex addr">{short(p.memoId)}</dt>
                <dd>
                  {amount(p.token, p.value)} to{" "}
                  <a className="hex addr" href={`${net.explorer}/address/${p.to}`} target="_blank" rel="noreferrer">
                    {short(p.to)}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
          <p className="because" style={{ marginTop: "0.9rem" }}>
            The reference is salted, so the chain shows a reference exists without
            revealing which invoice it names. Only someone holding the run salt can read
            it — which is what the <a href={`/r/${ours.hash}?n=${net.name}`}>receipt page</a> does.
          </p>
        </TxCard>

        <TxCard
          title="Ordinary Multicall3 batch"
          side={naive}
          net={net}
          note="approve, then aggregate3 → transferFrom. The money arrives; nothing on chain says what it was for."
        >
          {approve && (
            <p className="because">
              Preceded by{" "}
              <a className="hex addr" href={`${net.explorer}/tx/${approve.hash}`} target="_blank" rel="noreferrer">
                {short(approve.hash)}
              </a>
              , the approval, at {approve.gasUsed.toLocaleString("en-US")} gas.
            </p>
          )}
          <p className="because" style={{ marginTop: "0.6rem" }}>
            {naive.assessment.payments} payment
            {naive.assessment.payments === 1 ? "" : "s"}, no Memo log of any kind. A
            recipient reading this transaction learns an amount and a sender, and nothing
            else.
          </p>
        </TxCard>
      </div>

      <Alert
        style={{ marginTop: 26 }}
        type="info"
        title="What this comparison does not claim"
        description={
          <>
            <p style={{ marginTop: 0 }}>
              An ordinary <code>Multicall3</code> batch does <strong>not</strong> hide the
              payer. <code>transferFrom(from, …)</code> emits{" "}
              <code>Transfer(from, …)</code>, so the payer stays visible — the table above
              reads the same address on both sides. Identity is lost only with a{" "}
              <em>custodial</em> batcher that pays out of its own balance, which is a
              different design and not the one compared here.
            </p>
            <p style={{ marginBottom: 0 }}>
              {allowanceNow?.value === 0n
                ? "The allowance above is 0 because this approval was for an exact amount and the transfer consumed all of it. Tools that approve an unlimited amount leave one standing indefinitely; this one did not."
                : "Whether an allowance outlives the payment depends on whether it was granted for an exact amount. This page reads the live value rather than assuming."}
            </p>
          </>
        }
      />
    </>
  );
}

function Gas({ total, payments }: { total: bigint; payments: number }) {
  if (payments === 0) return <>{total.toLocaleString("en-US")}</>;
  const each = Number(total) / payments;
  return (
    <>
      <strong>{Math.round(each).toLocaleString("en-US")}</strong> per payment
      <span className="because">
        {total.toLocaleString("en-US")} total over {payments} payment{payments === 1 ? "" : "s"}
      </span>
    </>
  );
}

function TxCard({
  title, side, net, note, children,
}: {
  title: string; side: Side; net: NetworkView; note: string; children?: React.ReactNode;
}) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      <p className="because" style={{ marginTop: 0 }}>{note}</p>
      <p style={{ margin: "0.9rem 0" }}>
        <a className="hex" href={`${net.explorer}/tx/${side.hash}`} target="_blank" rel="noreferrer">
          {side.hash}
        </a>
      </p>
      {children}
    </section>
  );
}

async function loadBoth(
  endpoint: string, net: NetworkView, oursHash: Hex, naiveHash: Hex, approveHash?: Hex,
): Promise<Loaded> {
  const client = createPublicClient({ chain: net.chain, transport: http(endpoint) });

  const readSide = async (hash: Hex): Promise<Side> => {
    const receipt = await client.getTransactionReceipt({ hash });
    const logs: RawLog[] = receipt.logs.map((l, i) => ({
      address: l.address as Address,
      topics: l.topics as Hex[],
      data: l.data as Hex,
      logIndex: l.logIndex ?? i,
    }));
    return {
      hash,
      assessment: assessBatch(logs, receipt.from as Address),
      payments: reconcile(logs).payments,
      payer: receipt.from as Address,
      batcher: (receipt.to ?? undefined) as Address | undefined,
      gasUsed: receipt.gasUsed,
      blockNumber: receipt.blockNumber,
      reverted: receipt.status === "reverted",
    };
  };

  const [ours, naive] = await Promise.all([readSide(oursHash), readSide(naiveHash)]);

  const tokens = new Map<string, TokenMeta>();
  const allTokens = [...ours.assessment.totals, ...naive.assessment.totals].map((t) => t.token);
  for (const token of new Set(allTokens.map((t) => t.toLowerCase()))) {
    const address = allTokens.find((t) => t.toLowerCase() === token)!;
    const [decimals, symbol] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address, abi: erc20Abi, functionName: "symbol" }).catch(() => ""),
    ]);
    tokens.set(token, { decimals: Number(decimals), symbol: symbol as string });
  }

  // The claim "an allowance is left standing" is the kind that ages badly, so
  // read the current value instead of asserting it.
  let allowanceNow: Loaded["allowanceNow"];
  const naiveToken = naive.assessment.totals[0]?.token;
  if (naiveToken && naive.batcher) {
    try {
      const value = await client.readContract({
        address: naiveToken, abi: erc20Abi, functionName: "allowance",
        args: [naive.payer, naive.batcher],
      });
      allowanceNow = { token: naiveToken, value, spender: naive.batcher };
    } catch { /* an unreadable allowance must not blank the page */ }
  }

  let approve: Loaded["approve"];
  if (approveHash) {
    try {
      const r = await client.getTransactionReceipt({ hash: approveHash });
      const log = r.logs.find((l) => l.topics[0] === APPROVAL_TOPIC);
      const granted = log
        ? (decodeAbiParameters([{ type: "uint256" }], log.data as Hex)[0] as bigint)
        : undefined;
      approve = {
        hash: approveHash, gasUsed: r.gasUsed, granted,
        token: log ? (log.address as Address) : undefined,
      };
    } catch { /* the approval is supporting evidence, not load-bearing */ }
  }

  return { ours, naive, tokens, allowanceNow, approve };
}
