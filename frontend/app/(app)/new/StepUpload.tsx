"use client";

import { useRef, useState } from "react";
import { Alert, Button, Input, Upload, type InputRef } from "antd";
import { readLines, tokensForChain } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import { describeError } from "@/lib/errors";
import type { RunBase } from "./CreateRun";
import { readTokenMeta } from "@/lib/token-meta";
import { PASTED_ROWS, RUN_FILE_ACCEPT, spreadsheetRefusal } from "@/lib/run-file";

export default function StepUpload({
  net, runLabel, onRunLabel, onReady,
}: {
  net: NetworkView;
  runLabel: string;
  onRunLabel: (label: string) => void;
  onReady: (base: RunBase) => void;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // A file chosen before the run had a name is kept, so it need not be chosen again.
  const [pending, setPending] = useState<{ name: string; text: string }>();
  const [askedForName, setAskedForName] = useState(false);
  const [pasted, setPasted] = useState("");
  const nameRef = useRef<InputRef>(null);
  const named = runLabel.trim().length > 0;

  const handle = async (name: string, text: string) => {
    setBusy(true);
    setError(undefined);
    try {
      // Decimals come from the chain before any amount is interpreted.
      const { decimals, symbols } = await readTokenMeta(net.defaultRpc, net.chain, net.chain.id);
      onReady({
        text, lines: readLines(text), sourceName: name, runLabel: runLabel.trim(),
        tokens: tokensForChain(net.chain.id), decimals, symbols,
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
    void handle(name, text);
  };

  const readFile = async (file: File) => {
    setError(undefined);
    try {
      const refusal = spreadsheetRefusal(file.name, new Uint8Array(await file.slice(0, 8).arrayBuffer()));
      if (refusal) {
        setError(refusal);
        return;
      }
      receive(file.name, new TextDecoder("utf-8", { ignoreBOM: true }).decode(await file.arrayBuffer()));
    } catch (err) {
      setError(describeError(err));
    }
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
          accept={RUN_FILE_ACCEPT}
          showUploadList={false}
          disabled={busy}
          beforeUpload={(file) => {
            void readFile(file);
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

      <label style={{ display: "block", marginTop: 22 }}>
        <span style={{ display: "block", fontSize: "0.87rem", marginBottom: 6 }}>
          Or paste the rows from Numbers, Excel or Google Sheets
        </span>
        <Input.TextArea
          value={pasted}
          disabled={busy}
          autoSize={{ minRows: 3, maxRows: 8 }}
          spellCheck={false}
          aria-describedby="paste-help"
          onChange={(e) => setPasted(e.target.value)}
        />
        <span id="paste-help" className="because">
          Select the cells, header row included, and copy them. Amounts are read as the sheet shows them.
        </span>
      </label>
      <Button
        style={{ marginTop: 10 }}
        disabled={!pasted.trim() || busy}
        onClick={() => {
          setError(undefined);
          receive(PASTED_ROWS, pasted);
        }}
      >
        Read the pasted rows
      </Button>

      {pending && (
        <div style={{ marginTop: 14 }}>
          <Button type="primary" disabled={!named || busy} loading={busy} onClick={() => void handle(pending.name, pending.text)}>
            Continue with {pending.name}
          </Button>
        </div>
      )}

      {error && <Alert style={{ marginTop: 18 }} type="error" showIcon title={error} />}
    </>
  );
}
