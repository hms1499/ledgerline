"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Steps } from "antd";
import { createPublicClient, http } from "viem";
import { executeRun, ioFromPublicClient, type RunOutcome, type RunStage } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import type { ConnectedWallet } from "@/lib/wallet";
import { describeError } from "@/lib/errors";
import type { PreparedRun } from "./StepPreflight";

const STAGE_LABEL: Record<RunStage, string> = {
  balances: "Checking balances",
  preflight: "Trying every payment against the chain",
  fees: "Setting the fee floor",
  signing: "Waiting for your signature",
  broadcast: "Reading back what was broadcast",
  confirming: "Waiting for a receipt — up to 3 minutes",
};
const ORDER: RunStage[] = ["balances", "preflight", "fees", "signing", "broadcast", "confirming"];

export default function StepSend({
  prepared, net, wallet, onDone, onBusy,
}: {
  prepared: PreparedRun; net: NetworkView; wallet: ConnectedWallet;
  onDone: (outcome: RunOutcome) => void;
  /** True while this screen holds the only copy of a transaction hash. */
  onBusy?: (busy: boolean) => void;
}) {
  const [stage, setStage] = useState<RunStage>("balances");
  const [outcome, setOutcome] = useState<RunOutcome>();
  // React state, not a ref: a ref does not trigger a re-render, so the
  // Steps ladder below would only ever paint by coincidence of an adjacent
  // setStage call. This is the screen that opens the wallet and moves real
  // money — it must not depend on a coincidence to paint correctly.
  const [started, setStarted] = useState(false);
  // executeRun turns every expected failure into a RunOutcome, so reaching
  // this is an unexpected one. It cannot be reported as "nothing was signed":
  // the throw may have come from after the signature, and claiming no money
  // moved when it might have is the one direction that is never safe.
  const [crash, setCrash] = useState<string>();
  // Known at the broadcast readback, which is minutes before the wait for a
  // receipt ends. Holding it until then would leave the payer watching a
  // spinner that already knows why nothing is arriving.
  const [liveFeeWarning, setLiveFeeWarning] = useState<string>();

  const go = useCallback(async () => {
    const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
    try {
      const result = await executeRun({
        manifest: prepared.manifest,
        anchor: net.anchor!,
        io: ioFromPublicClient(client),
        send: (tx) => wallet.walletClient.sendTransaction({
          account: wallet.address, chain: net.chain, ...tx,
        }),
        onProgress: setStage,
        onFeeWarning: setLiveFeeWarning,
      });
      setOutcome(result);
      if (result.state === "confirmed") onDone(result);
    } catch (err) {
      setCrash(describeError(err));
    }
  }, [prepared, net, wallet, onDone]);

  /**
   * The wallet must not be dropped out from under this screen while it is the
   * only thing holding a transaction hash: unmounting between "your wallet
   * signed it" and "here is the receipt" discards the evidence for money that
   * has already moved. `blocked` is the one settled state carrying no hash,
   * because nothing was signed.
   */
  useEffect(() => {
    onBusy?.(started && outcome?.state !== "blocked");
  }, [started, outcome, onBusy]);

  // Leaving this screen releases the hold however it ends.
  useEffect(() => () => onBusy?.(false), [onBusy]);

  // Signing must follow a click, not a render — a wallet prompt nobody asked
  // for is how people learn to approve without reading.
  useEffect(() => {
    setStarted(false);
    setCrash(undefined);
    setLiveFeeWarning(undefined);
  }, [prepared]);

  if (crash) {
    return (
      <>
        <section className="verdict degraded">
          <h1>The run stopped in an unknown state</h1>
          <p>
            Something failed that this screen cannot classify, and it is not safe to tell
            you either that money moved or that it did not. Check{" "}
            <a href={`${net.explorer}/address/${prepared.manifest.payer}`} target="_blank" rel="noreferrer">
              your address on the explorer
            </a>{" "}
            before running this again. If the run did land, a second attempt is refused
            before anything is signed — but confirm rather than assume.
          </p>
        </section>
        <Alert style={{ marginTop: 20 }} type="warning" showIcon title={crash} />
      </>
    );
  }

  if (!outcome) {
    return (
      <>
        <section className="verdict">
          <h1>Ready to send</h1>
          <p>
            One transaction pays every line and records the list on chain. Your wallet will
            ask about fees — <strong>do not lower them below 25 Gwei</strong>. Arc discards
            transactions priced under 20 Gwei without a receipt, an error or a revert.
          </p>
        </section>

        {started ? (
          <>
            <Steps
              direction="vertical"
              style={{ marginTop: 26 }}
              current={ORDER.indexOf(stage)}
              items={ORDER.map((s) => ({ title: STAGE_LABEL[s] }))}
            />
            {liveFeeWarning && (
              <Alert
                style={{ marginTop: 20 }} type="error" showIcon
                title="The fee was lowered below the floor"
                description={
                  <>
                    {liveFeeWarning}
                    <p style={{ marginTop: 10, marginBottom: 0 }}>
                      The wait above will keep running, because a transaction in the mempool
                      is not proof of a dead one. If no receipt arrives, this ends as
                      &ldquo;sent, but not yet in a block&rdquo; — no money will have moved
                      and nothing will have been recorded, so the same run can be sent
                      again at the proper fee.
                    </p>
                  </>
                }
              />
            )}
          </>
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
      onRetry={() => {
        setOutcome(undefined); setStarted(false); setLiveFeeWarning(undefined);
      }}
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
      body: "The node has no record of the hash your wallet returned. On Arc that means the mempool discarded it, which happens silently for transactions priced below 20 Gwei. No money moved. It is safe to run again — if it somehow did land, the next attempt is refused before anything is signed.",
    },
    pending: {
      tone: "degraded",
      title: "Sent, but not yet in a block",
      body: "This is not a completed payment and must not be treated as one. The transaction is in the mempool without a receipt yet. Watch it on the explorer, or run it again — a repeat is refused by the contract if the first one lands.",
    },
    reverted: {
      tone: "error",
      title: "The run reverted",
      body: "It reached a block and failed. No money moved and nothing was recorded, so the run is safe to send again.",
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
