"use client";

import { useCallback, useState } from "react";
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
import { preflightRows, type PreflightRow } from "@/lib/preflight-view";

export interface PreparedRun {
  manifest: Manifest;
  built: BuiltRun;
  outcomes: PreflightRow[];
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
  // Whether the salt message was actually signed before this attempt failed.
  // A failure can land on either side of it — a dismissed signature prompt
  // never reaches the simulation — and the difference is exactly what the
  // payer is trying to work out when they read a failure screen.
  const [signed, setSigned] = useState(false);

  const prepare = useCallback(async () => {
    setError(undefined);
    // A retry re-signs, which re-derives the salt, which changes every memoId
    // and therefore the manifest root. The abandoned attempt's ladder and
    // identifiers must not linger under the Skeleton describing a commitment
    // that no longer matches what is about to be signed.
    setPrepared(undefined);
    setSigned(false);
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
      setSigned(true);

      const manifest: Manifest = {
        clientRunId: clientRunIdFor(wallet.address, items, draft.runLabel),
        payer: wallet.address,
        chainId: net.chain.id,
        runSalt,
        items,
      };

      if (!net.anchor) throw new Error(`This app is not set up to record runs on Arc ${net.name} yet.`);

      setPhase("checking");
      const built = buildRun(manifest, net.anchor);
      const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
      const sim = await client.call({
        account: wallet.address,
        to: built.to,
        data: buildPreflightData(manifest, net.anchor),
      });
      const outcomes = preflightRows(
        decodePreflightResult(sim.data ?? "0x"),
        manifest.items.map((i) => i.invoiceId),
      );

      const next = { manifest, built, outcomes };
      setPrepared(next);
      setPhase(outcomes.every((o) => o.ok) ? "ready" : "failed");
    } catch (err) {
      const { name, message } = explainRevert(err);
      setError(name ? `${name}: ${message}` : message);
      setPhase("failed");
    }
  }, [draft, net, wallet]);

  const allOk = phase === "ready";

  return (
    <>
      <section className={`verdict ${allOk ? "ok" : phase === "failed" ? "error" : ""}`}>
        <h1>
          {phase === "idle" ? "Check the run before any money moves"
            : phase === "signing" ? "Waiting for your signature"
            : phase === "checking" ? "Checking every payment against the chain"
            : allOk ? "Every payment would go through"
            : "This run would not go through"}
        </h1>
        <p>
          {phase === "idle"
            ? "Your wallet will ask you to sign a short message. It is free and moves no money — it creates this run's reference code, which ties each payment to its invoice. Then every payment is tried against the live chain, so problems show up here instead of after you pay."
            : phase === "signing"
            ? "Your wallet is asking you to sign a short message. This is not the payment — it creates this run's reference code, and it costs nothing."
            : "Each payment is tried against the live chain before you pay, so a problem shows up here rather than after money moves."}
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
              {o.reason && (
                <span className="because">
                  {o.reason}
                  {o.detail && <span className="raw-reason">{o.detail}</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {phase === "failed" && (
        <Alert style={{ marginTop: 20 }} type="error" showIcon
          // Not "nothing was signed": by this point the payer has usually
          // signed the salt message, and telling someone who just approved a
          // wallet prompt that nothing happened is the fastest way to teach
          // them this screen cannot be trusted about what did.
          title="No transaction was signed, and no money moved"
          description={
            <>
              {error ??
                "One or more payments would fail if sent to Arc — each failing row above says why. " +
                  "Fix those and check again; nothing has been paid."}
              <p style={{ marginTop: 10, marginBottom: 0 }}>
                {signed
                  ? "Your wallet did sign the short message a moment ago. That one only created this run's reference code — it costs nothing, moves nothing, and is not a payment. Nothing else has been signed."
                  : "Your wallet has not been asked to sign anything for this attempt."}
              </p>
            </>
          } />
      )}

      {prepared && (
        <dl className="detail" style={{ marginTop: 26 }}>
          <dt>Run ID</dt>
          <dd className="hex">{runIdFor(prepared.manifest.payer, prepared.manifest.clientRunId)}</dd>
          <dt>List fingerprint</dt>
          <dd className="hex">{prepared.built.root}</dd>
        </dl>
      )}

      <div style={{ marginTop: 26, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={onBack}>Back to the review</Button>
        {/* Started by this click, never by an effect: the first thing it does
            is open the wallet, and a prompt nobody asked for is how people
            learn to approve without reading — the send step's rule too. */}
        {phase === "idle" && (
          <Button type="primary" onClick={() => void prepare()}>
            Sign and check the run
          </Button>
        )}
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
