"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Skeleton } from "antd";
import { createPublicClient, http } from "viem";
import {
  saltMessageFor, saltFromSignature, clientRunIdFor, buildRun, runIdFor,
  buildPreflightData, decodePreflightResult, explainRevert,
  type Manifest, type BuiltRun,
} from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import type { ConnectedWallet } from "@/lib/wallet";
import type { RunDraft } from "./CreateRun";

export interface PreparedRun {
  manifest: Manifest;
  built: BuiltRun;
  outcomes: { label: string; ok: boolean }[];
}

type Phase = "idle" | "signing" | "checking" | "ready" | "failed";

export default function StepPreflight({
  draft, net, wallet, onBack, onReady,
}: {
  draft: RunDraft; net: NetworkView; wallet: ConnectedWallet;
  onBack: () => void; onReady: (prepared: PreparedRun) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>();
  const [prepared, setPrepared] = useState<PreparedRun>();

  const prepare = useCallback(async () => {
    setError(undefined);
    setPhase("signing");
    try {
      const items = draft.rows.map(({ invoiceId, token, to, amount }) => ({
        invoiceId, token, to, amount,
      }));

      // Signature #1. The salt has to exist before the calldata, because the
      // memoIds it produces are inside the calldata.
      const signature = await wallet.walletClient.signMessage({
        account: wallet.address,
        message: saltMessageFor(net.chain.id, draft.runLabel),
      });
      const runSalt = saltFromSignature(signature);

      const manifest: Manifest = {
        clientRunId: clientRunIdFor(wallet.address, items, draft.runLabel),
        payer: wallet.address,
        chainId: net.chain.id,
        runSalt,
        items,
      };

      if (!net.anchor) throw new Error(`No PayoutAnchor is configured for Arc ${net.name}.`);

      setPhase("checking");
      const built = buildRun(manifest, net.anchor);
      const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
      const sim = await client.call({
        account: wallet.address,
        to: built.to,
        data: buildPreflightData(manifest, net.anchor),
      });
      const outcomes = decodePreflightResult(sim.data ?? "0x").map((o, i) => ({
        ok: o.success,
        label: i === 0 ? "Anchor commit" : manifest.items[i - 1]!.invoiceId,
      }));

      const next = { manifest, built, outcomes };
      setPrepared(next);
      setPhase(outcomes.every((o) => o.ok) ? "ready" : "failed");
    } catch (err) {
      const { name, message } = explainRevert(err);
      setError(name ? `${name}: ${message}` : message);
      setPhase("failed");
    }
  }, [draft, net, wallet]);

  useEffect(() => { void prepare(); }, [prepare]);

  const allOk = phase === "ready";

  return (
    <>
      <section className={`verdict ${allOk ? "ok" : phase === "failed" ? "error" : ""}`}>
        <h1>
          {phase === "signing" ? "Waiting for your signature"
            : phase === "checking" ? "Checking every payment against the chain"
            : allOk ? "Every payment simulates cleanly"
            : "This run would not go through"}
        </h1>
        <p>
          {phase === "signing"
            ? "Your wallet is asking you to sign a short message. This is not the payment — it derives this run's reference salt, and it costs nothing."
            : "Each payment is simulated against live chain state before anything is signed. This is also the only way to see Arc's runtime blocklist, which has no pre-check."}
        </p>
      </section>

      {(phase === "signing" || phase === "checking") && (
        <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 26 }} />
      )}

      {prepared && (
        <ul className="ladder">
          {prepared.outcomes.map((o) => (
            <li key={o.label} className={`rung ${o.ok ? "pass" : "fail"}`}>
              <span className="mark">{o.ok ? "✓" : "✗"}</span>
              <span className="claim">{o.label}</span>
            </li>
          ))}
        </ul>
      )}

      {phase === "failed" && (
        <Alert style={{ marginTop: 20 }} type="error" showIcon
          title="Nothing was signed or sent"
          description={
            error ??
            "One or more payments would fail if sent to Arc — see the failing rows above. " +
              "This is a live simulation against current chain state, which is also the only " +
              "way to see Arc's runtime blocklist; it exposes no pre-check function."
          } />
      )}

      {prepared && (
        <dl className="detail" style={{ marginTop: 26 }}>
          <dt>Run id</dt>
          <dd className="hex">{runIdFor(prepared.manifest.payer, prepared.manifest.clientRunId)}</dd>
          <dt>Manifest root</dt>
          <dd className="hex">{prepared.built.root}</dd>
        </dl>
      )}

      <div style={{ marginTop: 26, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={onBack}>Back to the preview</Button>
        {phase === "failed" && <Button onClick={() => void prepare()}>Try again</Button>}
        {allOk && prepared && (
          <Button type="primary" onClick={() => onReady(prepared)}>
            Sign and send the payment
          </Button>
        )}
      </div>
    </>
  );
}
