"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Steps } from "antd";
import { createPublicClient, http } from "viem";
import { executeRun, ioFromPublicClient, type RunOutcome, type RunStage } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import type { ConnectedWallet } from "@/lib/wallet";
import type { PreparedRun } from "./StepPreflight";

const STAGE_LABEL: Record<RunStage, string> = {
  balances: "Checking balances",
  preflight: "Simulating every payment",
  fees: "Setting the fee floor",
  signing: "Waiting for your signature",
  broadcast: "Reading back what was broadcast",
  confirming: "Waiting for a receipt",
};
const ORDER: RunStage[] = ["balances", "preflight", "fees", "signing", "broadcast", "confirming"];

export default function StepSend({
  prepared, net, wallet, onDone,
}: {
  prepared: PreparedRun; net: NetworkView; wallet: ConnectedWallet;
  onDone: (outcome: RunOutcome) => void;
}) {
  const [stage, setStage] = useState<RunStage>("balances");
  const [outcome, setOutcome] = useState<RunOutcome>();
  // React state, not a ref: a ref does not trigger a re-render, so the
  // Steps ladder below would only ever paint by coincidence of an adjacent
  // setStage call. This is the screen that opens the wallet and moves real
  // money — it must not depend on a coincidence to paint correctly.
  const [started, setStarted] = useState(false);

  const go = useCallback(async () => {
    const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
    const result = await executeRun({
      manifest: prepared.manifest,
      anchor: net.anchor!,
      io: ioFromPublicClient(client),
      send: (tx) => wallet.walletClient.sendTransaction({
        account: wallet.address, chain: net.chain, ...tx,
      }),
      onProgress: setStage,
    });
    setOutcome(result);
    if (result.state === "confirmed") onDone(result);
  }, [prepared, net, wallet, onDone]);

  // Signing must follow a click, not a render — a wallet prompt nobody asked
  // for is how people learn to approve without reading.
  useEffect(() => { setStarted(false); }, [prepared]);

  if (!outcome) {
    return (
      <>
        <section className="verdict">
          <h1>Ready to send</h1>
          <p>
            One transaction pays every line and commits the manifest root. Your wallet will
            ask about fees — <strong>do not lower them below 25 Gwei</strong>. Arc discards
            transactions priced under 20 Gwei without a receipt, an error or a revert.
          </p>
        </section>

        {started ? (
          <Steps
            direction="vertical"
            style={{ marginTop: 26 }}
            current={ORDER.indexOf(stage)}
            items={ORDER.map((s) => ({ title: STAGE_LABEL[s] }))}
          />
        ) : (
          <Button
            type="primary" size="large" style={{ marginTop: 26 }}
            onClick={() => { setStarted(true); setStage("balances"); void go(); }}
          >
            Sign and pay {prepared.manifest.items.length} invoice
            {prepared.manifest.items.length === 1 ? "" : "s"}
          </Button>
        )}
      </>
    );
  }

  return (
    <OutcomeView
      outcome={outcome} net={net}
      onRetry={() => { setOutcome(undefined); setStarted(false); }}
    />
  );
}

function OutcomeView({
  outcome, net, onRetry,
}: { outcome: RunOutcome; net: NetworkView; onRetry: () => void }) {
  if (outcome.state === "confirmed") return null; // the parent has moved on

  const explorer = "txHash" in outcome
    ? `${net.explorer}/tx/${outcome.txHash}` : undefined;

  const copy: Record<string, { tone: string; title: string; body: string }> = {
    blocked: {
      tone: "error",
      title: "Nothing was signed",
      body: outcome.state === "blocked" ? outcome.details : "",
    },
    dropped: {
      tone: "error",
      title: "Arc never saw this transaction",
      body: "The node has no record of the hash your wallet returned. On Arc that means the mempool discarded it, which happens silently for transactions priced below 20 Gwei. No money moved. It is safe to run again — the anchor is write-once, so if it somehow did land, the next attempt is blocked at preflight.",
    },
    pending: {
      tone: "degraded",
      title: "Sent, but not yet in a block",
      body: "This is not a completed payment and must not be treated as one. The transaction is in the mempool without a receipt yet. Watch it on the explorer, or run it again — a repeat is refused by the contract if the first one lands.",
    },
    reverted: {
      tone: "error",
      title: "The run reverted",
      body: "It reached a block and failed. No money moved and no anchor was written, so the run is safe to send again.",
    },
  };

  const c = copy[outcome.state]!;
  return (
    <>
      <section className={`verdict ${c.tone}`}>
        <h1>{c.title}</h1>
        <p>{c.body}</p>
      </section>

      {"feeWarning" in outcome && outcome.feeWarning && (
        <Alert style={{ marginTop: 20 }} type="error" showIcon
          title="The fee was lowered below the floor" description={outcome.feeWarning} />
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button type="primary" onClick={onRetry}>Try the run again</Button>
        {explorer && <Button href={explorer} target="_blank">Open on the explorer</Button>}
      </div>
    </>
  );
}
