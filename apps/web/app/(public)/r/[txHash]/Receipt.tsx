"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, type Address } from "viem";
import { Alert, Collapse, Skeleton } from "antd";
import { describeError } from "@/lib/errors";
import {
  verifyReceipt, RUN_COMMITTED_TOPIC,
  type ReceiptResult, type RawLog, type Hex,
} from "@ledgerline/core";
import {
  networkFor, decodeProof, short, formatAmount, formatHeadline, type NetworkView,
} from "@/lib/chain";
import { absentHeadline, RECEIPT_COPY } from "@/lib/receipt-view";

const anchorAbi = [
  { type: "function", name: "verifyItem", stateMutability: "view",
    inputs: [
      { name: "runId", type: "bytes32" }, { name: "memoId", type: "bytes32" },
      { name: "token", type: "address" }, { name: "to", type: "address" },
      { name: "amount", type: "uint256" }, { name: "proof", type: "bytes32[]" },
    ], outputs: [{ type: "bool" }] },
  { type: "function", name: "isCommitted", stateMutability: "view",
    inputs: [{ name: "runId", type: "bytes32" }], outputs: [{ type: "bool" }] },
] as const;

const decimalsAbi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

interface Props {
  txHash: string;
  invoiceId: string | null;
  runSalt: string | null;
  proofRaw: string | null;
  networkName: string | null;
}

type Phase = "loading" | "ready" | "tx_not_found" | "rpc_unreachable";

interface Loaded {
  result: ReceiptResult;
  decimals: number;
  symbol: string;
  blockNumber: bigint;
  logs: RawLog[];
  anchorChecked: boolean;
}

export default function Receipt(props: Props) {
  const net = networkFor(props.networkName);
  const [rpc, setRpc] = useState(net.defaultRpc);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string>();
  const [data, setData] = useState<Loaded>();

  const run = useCallback(
    async (endpoint: string) => {
      setPhase("loading");
      setError(undefined);
      try {
        const loaded = await verifyAgainst(endpoint, net, props);
        setData(loaded);
        setPhase("ready");
      } catch (err) {
        const msg = describeError(err);
        if (/not be found|not found/i.test(msg)) setPhase("tx_not_found");
        else {
          setError(msg);
          setPhase("rpc_unreachable");
        }
      }
    },
    [net, props],
  );

  useEffect(() => {
    void run(rpc);
  }, [run, rpc]);

  return (
    <main className="sheet">
      <div className="masthead">
        <strong>Payment advice</strong>
        <span>
          Arc {net.name}
          {data ? ` at block ${data.blockNumber.toLocaleString("en-US")}` : ""}
        </span>
      </div>

      {phase === "loading" && <Skeleton active paragraph={{ rows: 6 }} style={{ marginTop: 32 }} />}

      {phase === "tx_not_found" && (
        <Verdict
          tone="error"
          headline="No such transaction on Arc"
          body={`Nothing on Arc ${net.name} matches this hash. If the payer sent it on a different network, ask them for the right link.`}
        />
      )}

      {phase === "rpc_unreachable" && (
        <>
          <Verdict
            tone="degraded"
            headline="Could not reach Arc"
            body="This says nothing about the payment — only that the checks could not run. Try again, or point the page at another endpoint below."
          />
          {error && (
            <Alert type="warning" showIcon style={{ marginTop: 20 }} title={error} />
          )}
        </>
      )}

      {phase === "ready" && data && (
        <Ready data={data} net={net} txHash={props.txHash} invoiceId={props.invoiceId} />
      )}

      <footer className="footer">
        <div>
          Checked against <span className="endpoint">{rpc}</span>{" "}
          <button
            className="linkish"
            onClick={() => {
              const next = window.prompt("Arc RPC endpoint to verify against", rpc);
              if (next) setRpc(next.trim());
            }}
          >
            change
          </button>
        </div>
        <p style={{ maxWidth: "62ch", marginTop: "0.6rem" }}>
          Every check above reads the chain directly. Point this page at your own node and
          it will reach the same answer, or a different one — either way you are not taking
          Ledgerline&apos;s word for it.
        </p>
      </footer>
    </main>
  );
}

function Verdict({ tone, headline, body }: { tone: string; headline: string; body: string }) {
  return (
    <section className={`verdict ${tone}`}>
      <h1>{headline}</h1>
      <p>{body}</p>
    </section>
  );
}

function Ready({
  data, net, txHash, invoiceId,
}: { data: Loaded; net: NetworkView; txHash: string; invoiceId: string | null }) {
  const { result, decimals, symbol } = data;
  const copy = RECEIPT_COPY[result.state];
  const p = result.payment;
  const void_ = result.severity === "error" || result.severity === "critical";

  return (
    <>
      <section className="line">
        <div>
          {p ? (
            <>
              <p className="amount">
                {formatHeadline(p.value, decimals)}
                <span className="unit">{symbol}</span>
              </p>
              <p className="payee">to {short(p.to)}</p>
            </>
          ) : (
            /* A bare em dash at headline size reads as a redaction, not an
               absence. Say what is missing instead. */
            <p className="amount is-absent">{absentHeadline(result)}</p>
          )}
        </div>
        {invoiceId && (
          <span className={`reference${void_ ? " is-void" : ""}`}>{invoiceId}</span>
        )}
      </section>

      <Verdict tone={copy.tone} headline={copy.headline} body={copy.body} />

      <ol className="ladder">
        {result.rungs.map((r, i) => (
          <li
            key={r.id}
            className={`rung ${r.status}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="mark" aria-hidden>
              {r.status === "pass" ? "✓" : r.status === "fail" ? "✕" : "–"}
            </span>
            <span className="claim">
              {r.label}
              <span className="sr-only">
                {r.status === "pass" ? " — passed" : r.status === "fail" ? " — failed" : " — not checked"}
              </span>
            </span>
            {r.detail && <span className="because">{r.detail}</span>}
          </li>
        ))}
      </ol>

      <div style={{ marginTop: "2.2rem" }}>
        <Collapse
          ghost
          items={[
            {
              key: "detail",
              label: "Payment detail",
              children: (
                <dl className="detail">
                  {p && (
                    <>
                      <dt>Payer</dt>
                      <dd className="hex">{p.payer}</dd>
                      <dt>Recipient</dt>
                      <dd className="hex">{p.to}</dd>
                      <dt>Token</dt>
                      <dd className="hex">
                        {symbol} — {p.token} ({decimals} decimals, read from chain)
                      </dd>
                      <dt>Amount</dt>
                      <dd>
                        {formatAmount(p.value, decimals)} {symbol} ({p.value.toString()} raw)
                      </dd>
                    </>
                  )}
                  <dt>Invoice</dt>
                  <dd>{invoiceId ?? "—"}</dd>
                  <dt>Reference</dt>
                  <dd className="hex">{result.derivedMemoId ?? "—"}</dd>
                  <dt>Transaction</dt>
                  <dd className="hex">
                    <a href={`${net.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">
                      {txHash}
                    </a>
                  </dd>
                  <dt>Block</dt>
                  <dd>{data.blockNumber.toLocaleString("en-US")}</dd>
                </dl>
              ),
            },
            {
              key: "raw",
              label: `Raw evidence, ${data.logs.length} logs`,
              children: (
                <pre
                  className="hex"
                  style={{ margin: 0, maxHeight: 360, overflow: "auto", fontSize: "0.72rem", lineHeight: 1.5 }}
                >
                  {JSON.stringify(data.logs, null, 2)}
                </pre>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}

async function verifyAgainst(
  endpoint: string, net: NetworkView, props: Props,
): Promise<Loaded> {
  const client = createPublicClient({ chain: net.chain, transport: http(endpoint) });
  const receipt = await client.getTransactionReceipt({ hash: props.txHash as Hex });

  const logs: RawLog[] = receipt.logs.map((l, i) => ({
    address: l.address as Address,
    topics: l.topics as Hex[],
    data: l.data as Hex,
    logIndex: l.logIndex ?? i,
  }));

  // First pass: everything computable from the chain alone.
  const first = verifyReceipt({
    invoiceId: props.invoiceId ?? "",
    runSalt: (props.runSalt ?? undefined) as Hex | undefined,
    receiptStatus: receipt.status,
    logs,
  });

  let decimals = 6;
  let symbol = "";
  if (first.payment) {
    const [d, s] = await Promise.all([
      client.readContract({ address: first.payment.token, abi: decimalsAbi, functionName: "decimals" }),
      client
        .readContract({
          address: first.payment.token,
          abi: [{ type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }] as const,
          functionName: "symbol",
        })
        .catch(() => ""),
    ]);
    decimals = Number(d);
    symbol = s as string;
  }

  // Second pass: the two answers only the anchor can give.
  const proof = decodeProof(props.proofRaw);
  let anchorProofValid: boolean | undefined;
  let runCommitted: boolean | undefined;
  let anchorChecked = false;

  if (first.payment && net.anchor && props.runSalt) {
    const runId = runIdFromLogs(logs, net.anchor);
    if (!runId) return { result: first, decimals, symbol, blockNumber: receipt.blockNumber, logs, anchorChecked: false };
    try {
      runCommitted = await client.readContract({
        address: net.anchor, abi: anchorAbi, functionName: "isCommitted", args: [runId],
      });
      if (runCommitted && proof) {
        anchorProofValid = await client.readContract({
          address: net.anchor, abi: anchorAbi, functionName: "verifyItem",
          args: [
            runId, first.payment.memoId, first.payment.token,
            first.payment.to, first.payment.value, proof,
          ],
        });
      }
      anchorChecked = true;
    } catch {
      /* Leave undefined: the page degrades honestly rather than claiming a result. */
    }
  }

  const result = verifyReceipt({
    invoiceId: props.invoiceId ?? "",
    runSalt: (props.runSalt ?? undefined) as Hex | undefined,
    receiptStatus: receipt.status,
    logs,
    anchorProofValid,
    runCommitted,
  });

  return { result, decimals, symbol, blockNumber: receipt.blockNumber, logs, anchorChecked };
}

/**
 * The runId is recoverable from the run's own receipt: RunCommitted is indexed
 * by runId, so topics[1] is it directly. That keeps the link free of one more
 * parameter.
 *
 * The emitter is required to be the anchor this page trusts. Any contract can
 * emit this topic, and accepting one that is merely shaped right would let a
 * payer stage their own "anchor" and have the page vouch for it.
 */
function runIdFromLogs(logs: RawLog[], anchor: Address): Hex | undefined {
  const log = logs.find(
    (l) =>
      l.address.toLowerCase() === anchor.toLowerCase() &&
      l.topics[0] === RUN_COMMITTED_TOPIC &&
      l.topics.length >= 2,
  );
  return log?.topics[1];
}
