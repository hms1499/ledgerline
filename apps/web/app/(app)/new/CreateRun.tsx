"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Steps } from "antd";
import { createPublicClient, http, type Address } from "viem";
import { tokensForChain, type ResolvedRow, type CsvIssue, type RowIssue, type RunOutcome } from "@ledgerline/core";
import { recordRun } from "@/lib/history";
import { useWallet } from "@/components/wallet/WalletProvider";
import { shouldResetPrepared } from "@/lib/wallet-session";
import StepUpload from "./StepUpload";
import StepPreview from "./StepPreview";
import StepPreflight, { type PreparedRun } from "./StepPreflight";
import StepSend from "./StepSend";
import Result from "./Result";

export interface RunDraft {
  rows: ResolvedRow[];
  runLabel: string;
  issues: CsvIssue[];
  errors: RowIssue[];
  warnings: RowIssue[];
  decimals: Record<string, number>;
  symbols: Record<string, string>;
}

const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/** Read every token's decimals and symbol from the chain. Nothing downstream
 *  may assume 6 or 8 — that assumption is how a payout ends up off by 10^12. */
export async function readTokenMeta(
  rpc: string, chain: Parameters<typeof createPublicClient>[0]["chain"], chainId: number,
): Promise<{ decimals: Record<string, number>; symbols: Record<string, string> }> {
  const client = createPublicClient({ chain, transport: http(rpc) });
  const tokens = tokensForChain(chainId);
  const decimals: Record<string, number> = {};
  const symbols: Record<string, string> = {};
  await Promise.all(
    Object.values(tokens).map(async (address) => {
      const [d, s] = await Promise.all([
        client.readContract({ address: address as Address, abi: erc20Abi, functionName: "decimals" }),
        client.readContract({ address: address as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => ""),
      ]);
      decimals[(address as string).toLowerCase()] = Number(d);
      symbols[(address as string).toLowerCase()] = s as string;
    }),
  );
  return { decimals, symbols };
}

const STEP_TITLES = ["Upload", "Review", "Check", "Pay", "Receipts"];

export default function CreateRun() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<RunDraft>();
  const [prepared, setPrepared] = useState<PreparedRun>();
  const [outcome, setOutcome] = useState<Extract<RunOutcome, { state: "confirmed" }>>();
  const { net, wallet, wrongChain, held, error: walletError, connect, setHold } = useWallet();

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

  return (
    <div className="sheet sheet--wide">
      <Steps className="hide-sm" style={{ marginTop: 28 }} current={step} items={STEP_TITLES.map((title) => ({ title }))} />
      <p className="only-sm step-line">Step {step + 1} of {STEP_TITLES.length} · {STEP_TITLES[step]}</p>

      {wrongChain && wallet && (
        <Alert
          style={{ marginTop: 22 }}
          type="warning"
          showIcon
          title={`This wallet is not on Arc ${net.name}`}
          description={`Ledgerline pays on Arc ${net.name}, chain ${net.chain.id}. Your wallet is on chain ${wallet.chainId || "an unreadable network"}. Use "Switch to Arc ${net.name}" at the top of the page — your wallet will ask you to confirm.`}
        />
      )}

      <div style={{ marginTop: 28 }}>
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
        {step === 3 && prepared && wallet && !wrongChain && (
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
      </div>
    </div>
  );
}
