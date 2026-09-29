"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Alert, Steps } from "antd";
import { readSheet, tokensForChain, type FileLine } from "@ledgerline/core";
import type { ParsedCsv, RunOutcome, TokenSet } from "@ledgerline/core";
import { checkRows, type CheckedFile } from "@/lib/review-view";
import { changeCounts, changeTotal, structureOf, type SheetEdits } from "@/lib/sheet-edits";
import { history, START } from "@/lib/edit-history";
import {
  browserStorage, draftKey, dropDraft, loadDraft, saveDraft, type Draft,
} from "@/lib/draft-store";
import { forgetRun, recordRun } from "@/lib/history";
import { useWallet } from "@/components/wallet/WalletProvider";
import { sendStaysOnScreen, shouldResetPrepared } from "@/lib/wallet-session";
import { Grid, Col } from "@/components/grid/Grid";
import Tape from "@/components/ui/Tape";
import { summarySource, runSummaryView } from "@/lib/run-summary-view";
import { realFundsNotice } from "@/lib/network-notice";
import { chainName } from "@/lib/chain";
import { defaultRunLabel } from "@/lib/run-label";
import StepUpload from "./StepUpload";
import StepPreview from "./StepPreview";
import StepPreflight, { type PreparedRun } from "./StepPreflight";
import StepSend from "./StepSend";
import Result from "./Result";
import RunSummary from "./RunSummary";
import CsvHelp from "./CsvHelp";

/** What the Upload step hands over: the file as read, never written to. */
export interface RunBase {
  text: string;
  /** The file's lines as read, each with its break. */
  lines: FileLine[];
  /** The file's name, or PASTED_ROWS. */
  sourceName: string;
  runLabel: string;
  /** Fixed at upload, with the decimals read for them. */
  tokens: TokenSet;
  decimals: Record<string, number>;
  symbols: Record<string, string>;
}

/** The run as Review shows it: the file, the payer's edits over it, the sheet
 *  they are read as, and everything checked from the two. */
export interface RunDraft extends RunBase, CheckedFile {
  edits: SheetEdits;
  sheet: ParsedCsv;
}

const STEP_TITLES = ["Upload", "Review", "Check", "Pay", "Receipts"];

export default function CreateRun() {
  const [step, setStep] = useState(0);
  // The step the page opened on arrives with the page (page-in); every step
  // after it enters on its own (spec 2026-09-29 §2.1). Set during render, so
  // the new step's first frame already carries the class.
  const [openedOn] = useState(step);
  const [stepMoved, setStepMoved] = useState(false);
  if (!stepMoved && step !== openedOn) setStepMoved(true);
  const [base, setBase] = useState<RunBase>();
  const [hist, dispatch] = useReducer(history, START);
  const edits = hist.now;
  const [drafted, setDrafted] = useState<{ key: string; offer?: Draft }>();
  const [draftStatus, setDraftStatus] = useState<"saved" | "refused">();

  // A file's draft is found by its hash, and offered, never applied, until the payer says so.
  useEffect(() => {
    setDrafted(undefined);
    setDraftStatus(undefined);
    if (!base) return;
    let live = true;
    void draftKey(base.text).then((key) => {
      if (!live) return;
      const found = loadDraft(browserStorage(), key, Date.now());
      setDrafted({ key, offer: found && changeTotal(changeCounts(found.edits)) > 0 ? found : undefined });
    });
    return () => { live = false; };
  }, [base]);

  // Saved half a second after the last change; nothing is written over a draft not yet answered.
  useEffect(() => {
    if (!drafted || drafted.offer) return;
    const t = setTimeout(() => {
      const store = browserStorage();
      if (changeTotal(changeCounts(edits)) === 0) { dropDraft(store, drafted.key); setDraftStatus(undefined); return; }
      setDraftStatus(saveDraft(store, drafted.key, edits, Date.now()) ? "saved" : "refused");
    }, 500);
    return () => clearTimeout(t);
  }, [edits, drafted]);
  const forgetDraft = () => { if (drafted) dropDraft(browserStorage(), drafted.key); };
  const draft = useMemo<RunDraft | undefined>(() => {
    if (!base) return undefined;
    const sheet = readSheet(base.lines, structureOf(edits));
    return { ...base, edits, sheet, ...checkRows(sheet, edits, base.tokens, base.decimals) };
  }, [base, edits]);
  const [prepared, setPrepared] = useState<PreparedRun>();
  const [outcome, setOutcome] = useState<Extract<RunOutcome, { state: "confirmed" }>>();
  const { net, wallet, wrongChain, held, error: walletError, switchError, connect, connecting, setHold } = useWallet();
  // Owned here, so "Choose another file" returns to a filled field. Set after
  // mount: the server's clock and time zone are not the payer's.
  const [runLabel, setRunLabel] = useState("");
  useEffect(() => { setRunLabel((l) => l || defaultRunLabel(new Date())); }, []);

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
                  {`Your wallet is on ${chainName(wallet.chainId)}. This run pays on Arc ${net.name}. Press "Switch" at the top of the page — your wallet will ask you to confirm.`}
                </p>
                {switchError && <p role="status" style={{ margin: "12px 0 0" }}>{switchError}</p>}
              </>
            }
          />
        </Col>
      )}

      {/* First in the DOM, so a phone reads what is about to be signed before
          the Send button; on the right at lg through `start` and dense packing. */}
      {source && draft && (step === 1 ? (
        <Col span={12}>
          <RunSummary line
            view={runSummaryView(draft.runLabel, source, tokenOrder, draft.decimals, draft.symbols, changeCounts(edits))}
            network={net.name} payer={source.payer ?? wallet?.address} />
        </Col>
      ) : (
        <Col start={9} span={4} md={12} sticky>
          <RunSummary
            view={runSummaryView(draft.runLabel, source, tokenOrder, draft.decimals, draft.symbols, changeCounts(edits))}
            network={net.name} payer={source.payer ?? wallet?.address} />
        </Col>
      ))}

      <Col span={step === 4 || step === 1 ? 12 : 8} md={12}>
        {/* Only the Review step names itself here: every other step opens
            with its own heading (StepUpload, StepPreflight, StepSend,
            Result), so an untitled Tape there would double it up. Review's
            table had no heading of its own, which is what left it opening
            as a blank band. */}
        {/* The whole flow is a tape still feeding; the Result tears it off (spec §6.1). */}
        <Tape state={step === 4 ? "torn" : "feeding"} title={step === 1 ? "Payments in this run" : undefined}>
          <div key={step} className={stepMoved ? "step-in" : undefined}>
            {step === 0 && (
              <StepUpload net={net} runLabel={runLabel} onRunLabel={setRunLabel}
                onReady={(b) => { setBase(b); dispatch({ type: "reset" }); setStep(1); }} />
            )}
            {step === 1 && draft && (
              <StepPreview
                draft={draft} net={net}
                onEdits={(e) => dispatch({ type: "set", edits: e })}
                onUndo={hist.past.length > 0 ? () => dispatch({ type: "undo" }) : undefined}
                onRedo={hist.future.length > 0 ? () => dispatch({ type: "redo" }) : undefined}
                offer={drafted?.offer}
                onContinue={() => {
                  if (drafted?.offer) dispatch({ type: "reset", edits: drafted.offer.edits });
                  setDrafted((d) => d && { key: d.key });
                }}
                onStartOver={() => { forgetDraft(); setDrafted((d) => d && { key: d.key }); }}
                draftStatus={draftStatus}
                // A draft not yet answered is not this session's to drop: leaving
                // asked nothing about it, and the file brings the offer back.
                onBack={() => { if (!drafted?.offer) forgetDraft(); setStep(0); }}
                onNext={() => setStep(2)}
                wallet={wallet} walletError={walletError} onConnect={connect} connecting={connecting}
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
                // Recorded the moment the wallet returns a hash, marked as
                // awaiting its receipt. A reload, Back or a closed tab during the
                // wait for a receipt would otherwise lose the only handle on
                // money that may have moved, and a payer who cannot find a run
                // re-sends it under a new name, which nothing on chain refuses.
                // The list never calls such a run paid; the chain decides when
                // the run is opened.
                onSent={(txHash) => recordRun({
                  txHash, payer: wallet.address, chainId: net.chain.id,
                  runLabel: draft?.runLabel ?? "", seenAt: Date.now(),
                  itemCount: prepared.manifest.items.length, awaitingReceipt: true,
                })}
                // A reverted run moved nothing and is safe to send again, so it
                // leaves the list, as it never entered it before.
                onReverted={(txHash) => forgetRun(txHash, wallet.address, net.chain.id)}
                onDone={(o) => {
                  if (o.state !== "confirmed") return;
                  setOutcome(o);
                  setStep(4);
                  forgetDraft();
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
          </div>
        </Tape>
      </Col>

      {step === 0 && (
        <Col span={4} md={12}>
          <CsvHelp />
        </Col>
      )}
    </Grid>
  );
}
