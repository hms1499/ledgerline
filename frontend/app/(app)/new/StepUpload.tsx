"use client";

import { useRef, useState } from "react";
import { Alert, Button, Input, Upload, type InputRef } from "antd";
import { parseCsv, resolveRows, validateRun, tokensForChain } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import { describeError } from "@/lib/errors";
import type { RunDraft } from "./CreateRun";
import { readTokenMeta } from "@/lib/token-meta";

export default function StepUpload({
  net, runLabel, onRunLabel, onReady,
}: {
  net: NetworkView;
  runLabel: string;
  onRunLabel: (label: string) => void;
  onReady: (draft: RunDraft) => void;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // A file chosen before the run had a name is kept, so it need not be chosen again.
  const [pending, setPending] = useState<{ name: string; text: string }>();
  const [askedForName, setAskedForName] = useState(false);
  const nameRef = useRef<InputRef>(null);
  const named = runLabel.trim().length > 0;

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
        parsed: rows,
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

  const receive = (name: string, text: string) => {
    if (!runLabel.trim()) {
      setPending({ name, text });
      setAskedForName(true);
      nameRef.current?.focus();
      return;
    }
    void handle(text);
  };

  return (
    <>
      <section className="verdict">
        <h2>A run starts with a file and a name</h2>
        <p>
          The name is what lets the same payroll run again next month. Paying the same
          list twice under the same name is refused on chain, so a double-click or a retry
          can never pay anyone twice.
        </p>
      </section>

      <label style={{ display: "block", marginTop: 22, maxWidth: "32rem" }}>
        <span style={{ display: "block", fontSize: "0.87rem", marginBottom: 6 }}>
          Run name
        </span>
        <Input
          ref={nameRef}
          value={runLabel}
          status={askedForName && !named ? "error" : undefined}
          aria-describedby="run-name-help"
          onChange={(e) => onRunLabel(e.target.value)}
        />
        {askedForName && !named ? (
          <span id="run-name-help" className="because field-error" role="alert">Name the run first</span>
        ) : (
          <span id="run-name-help" className="because">Saved in the run file you download after paying.</span>
        )}
      </label>

      <div style={{ marginTop: 24 }}>
        <Upload.Dragger
          accept=".csv,text/csv"
          showUploadList={false}
          disabled={busy}
          beforeUpload={(file) => {
            const reader = new FileReader();
            reader.onload = () => receive(file.name, String(reader.result));
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

      {pending && (
        <div style={{ marginTop: 14 }}>
          <Button type="primary" disabled={!named || busy} loading={busy} onClick={() => void handle(pending.text)}>
            Continue with {pending.name}
          </Button>
        </div>
      )}

      {error && <Alert style={{ marginTop: 18 }} type="error" showIcon title={error} />}
    </>
  );
}
