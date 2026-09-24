"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Alert, Steps } from "antd";
import { tokensForChain } from "@ledgerline/core";
import type { ResolvedRow, CsvIssue, RowIssue, RunOutcome } from "@ledgerline/core";
import { recordRun } from "@/lib/history";
import { useWallet } from "@/components/wallet/WalletProvider";
import { sendStaysOnScreen, shouldResetPrepared } from "@/lib/wallet-session";
import { Grid, Col } from "@/components/grid/Grid";
import Panel from "@/components/ui/Panel";
import { summarySource, runSummaryView } from "@/lib/run-summary-view";
import { realFundsNotice } from "@/lib/network-notice";
import StepUpload from "./StepUpload";
import StepPreview from "./StepPreview";
import StepPreflight, { type PreparedRun } from "./StepPreflight";
import StepSend from "./StepSend";
import Result from "./Result";
import RunSummary from "./RunSummary";
import CsvHelp from "./CsvHelp";

export interface RunDraft {
  rows: ResolvedRow[];
  runLabel: string;
  issues: CsvIssue[];
  errors: RowIssue[];
  warnings: RowIssue[];
  decimals: Record<string, number>;
  symbols: Record<string, string>;
}

const STEP_TITLES = ["Upload", "Review", "Check", "Pay", "Receipts"];

export default function CreateRun() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<RunDraft>();
  const [prepared, setPrepared] = useState<PreparedRun>();
  const [outcome, setOutcome] = useState<Extract<RunOutcome, { state: "confirmed" }>>();
  const { net, wallet, wrongChain, held, error: walletError, switchError, connect, setHold } = useWallet();

  // A prepared run belongs to one account on one chain; the provider tells us
  // when either changes. A confirmed run, or one being sent, is kept.
  const prevWallet = useRef(wallet);
  useEffect(() => {
    if (shouldResetPrepared(prevWallet.current, wallet, { confirmed: !!outcome, held })) {
      setPrepared(undefined);
      setStep((s) => Math.min(s, 1));
    }
    prevWallet.current = wallet;
  }, [wallet, outcome, held]);

  const source = summarySource(step, draft, prepared?.manifest);
  const tokenOrder = Object.values(tokensForChain(net.chain.id)) as string[];
  // Until the run is paid: after that there is nothing left to warn about.
  const notice = step < 4 ? realFundsNotice(net) : undefined;

  return (
    <Grid dense={!!source}>
      <Col span={12}>
        <Steps className="hide-sm" current={step} items={STEP_TITLES.map((title) => ({ title }))} />
        <p className="only-sm step-line">Step {step + 1} of {STEP_TITLES.length} · {STEP_TITLES[step]}</p>
      </Col>

      {notice && (
        <Col span={12}>
          <Alert
            type="warning"
            showIcon
            title={notice.title}
            description={
              <>
                {notice.body}{" "}
                <Link href={notice.tryHref}>Try it on testnet first</Link>, where tokens have no value.
              </>
            }
          />
        </Col>
      )}

      {wrongChain && wallet && (
        <Col span={12}>
          <Alert
            type="warning"
            showIcon
            title={`This wallet is not on Arc ${net.name}`}
            description={
              <>
                <p style={{ margin: 0 }}>
                  {`Ledgerline pays on Arc ${net.name}, chain ${net.chain.id}. Your wallet is on chain ${wallet.chainId || "an unreadable network"}. Use "Switch to Arc ${net.name}" at the top of the page — your wallet will ask you to confirm.`}
                </p>
                {switchError && <p role="status" style={{ margin: "12px 0 0" }}>{switchError}</p>}
              </>
            }
          />
        </Col>
      )}

      {/* First in the DOM, so a phone reads what is about to be signed before
          the Send button; on the right at lg through `start` and dense packing. */}
      {source && draft && (
        <Col start={9} span={4} md={12} sticky>
          <RunSummary
            view={runSummaryView(draft.runLabel, source, tokenOrder, draft.decimals, draft.symbols)}
            network={net.name}
            payer={source.payer ?? wallet?.address}
          />
        </Col>
      )}

      <Col span={step === 4 ? 12 : 8} md={12}>
        {/* Only the Review step names itself here: every other step opens
            with its own heading (StepUpload, StepPreflight, StepSend,
            Result), so an untitled Panel there would double it up. Review's
            table had no heading of its own, which is what left it opening
            as a blank band. */}
        <Panel title={step === 1 ? "Payments in this run" : undefined}>
          {step === 0 && (
            <StepUpload net={net} onReady={(d) => { setDraft(d); setStep(1); }} />
          )}
          {step === 1 && draft && (
            <StepPreview
              draft={draft} net={net}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
              wallet={wallet} walletError={walletError} onConnect={connect}
              wrongChain={wrongChain}
            />
          )}
          {step === 2 && draft && wallet && !wrongChain && (
            <StepPreflight
              draft={draft} net={net} wallet={wallet}
              onBack={() => setStep(1)}
              onReady={(p) => { setPrepared(p); setStep(3); }}
            />
          )}
          {step === 3 && prepared && wallet && sendStaysOnScreen({ wrongChain, held }) && (
            <StepSend
              prepared={prepared} net={net} wallet={wallet}
              onDone={(o) => {
                if (o.state !== "confirmed") return;
                setOutcome(o);
                setStep(4);
                // Only a confirmed run is worth remembering: a list that
                // included attempts without receipts would be a list of things
                // that might not have happened.
                recordRun({
                  txHash: o.txHash, payer: wallet.address, chainId: net.chain.id,
                  runLabel: draft?.runLabel ?? "", seenAt: Date.now(),
                  itemCount: prepared.manifest.items.length,
                });
              }}
              onBusy={setHold}
            />
          )}
          {step === 4 && outcome && prepared && draft && (
            <Result outcome={outcome} prepared={prepared} draft={draft} net={net} />
          )}
        </Panel>
      </Col>

      {step === 0 && (
        <Col span={4} md={12}>
          <CsvHelp />
        </Col>
      )}
    </Grid>
  );
}
