"use client";

import { useState } from "react";
import { Alert, Input, Upload } from "antd";
import { parseCsv, resolveRows, validateRun, tokensForChain } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import { describeError } from "@/lib/errors";
import { readTokenMeta, type RunDraft } from "./CreateRun";

const SAMPLE = `invoiceId,token,to,amount
INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-EU-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-BTC-003,cirBTC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.00001`;

export default function StepUpload({
  net, onReady,
}: { net: NetworkView; onReady: (draft: RunDraft) => void }) {
  const [runLabel, setRunLabel] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const handle = async (text: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const { rows, issues } = parseCsv(text);
      // Decimals come from the chain before any amount is interpreted.
      const { decimals, symbols } = await readTokenMeta(net.defaultRpc, net.chain, net.chain.id);
      const resolved = resolveRows(rows, tokensForChain(net.chain.id), decimals);
      const { errors, warnings } = validateRun(resolved.items);
      onReady({
        rows: resolved.items,
        runLabel: runLabel.trim(),
        issues: [...issues, ...resolved.issues],
        errors, warnings, decimals, symbols,
      });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const labelReady = runLabel.trim().length > 0;

  return (
    <>
      <section className="verdict">
        <h1>A run starts with a file and a name</h1>
        <p>
          The name is what lets the same payroll run again next month — the anchor rejects
          a repeat of the identical list under the identical name, which is how double
          payment is blocked at the contract rather than in this screen.
        </p>
      </section>

      <label style={{ display: "block", marginTop: 22, maxWidth: "32rem" }}>
        <span style={{ display: "block", fontSize: "0.87rem", marginBottom: 6 }}>
          Run name
        </span>
        <Input
          placeholder="Payroll 2026-09"
          value={runLabel}
          onChange={(e) => setRunLabel(e.target.value)}
        />
        <span className="because">
          You will need this again to rebuild the receipt links later. Write it down.
        </span>
      </label>

      <div style={{ marginTop: 24, opacity: labelReady ? 1 : 0.45, pointerEvents: labelReady ? "auto" : "none" }}>
        <Upload.Dragger
          accept=".csv,text/csv"
          showUploadList={false}
          disabled={busy || !labelReady}
          beforeUpload={(file) => {
            const reader = new FileReader();
            reader.onload = () => void handle(String(reader.result));
            reader.readAsText(file);
            return false;
          }}
        >
          <p style={{ margin: "1.4rem 0 0.4rem", fontWeight: 500 }}>
            Drop a CSV, or click to choose one
          </p>
          <p className="because" style={{ margin: "0 0 1.4rem" }}>
            It is read in your browser and never uploaded anywhere.
          </p>
        </Upload.Dragger>
      </div>

      {error && <Alert style={{ marginTop: 18 }} type="error" showIcon title={error} />}

      <details style={{ marginTop: 26 }}>
        <summary style={{ cursor: "pointer" }}>What the file must look like</summary>
        <pre className="hex" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{SAMPLE}</pre>
        <p className="because">
          Header required and spelled exactly as above. Amounts are written the way you
          would write them on an invoice; this page converts them using each token&apos;s
          own decimals, read from the chain.
        </p>
      </details>
    </>
  );
}
