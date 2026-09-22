"use client";

import { useCallback, useEffect, useState } from "react";
import { Steps } from "antd";
import { createPublicClient, http, type Address } from "viem";
import { tokensForChain, type ResolvedRow, type CsvIssue, type RowIssue, type RunOutcome } from "@ledgerline/core";
import { networkFor, short } from "@/lib/chain";
import { connect, watchWallet, EoaRequiredError, type ConnectedWallet } from "@/lib/wallet";
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

/** The title and body of a connect-failure Alert. Kept together so the two
 *  can never drift apart the way a bare string once let them. */
export interface ConnectError {
  /** "info" for an outcome that says nothing about the wallet itself;
   *  "error" for a genuine reason this wallet cannot sign a Ledgerline run. */
  type: "info" | "error";
  title: string;
  description: string;
}

/**
 * Three cases, each with its own title, because a title is a claim and only
 * one of these three is a claim about the wallet's compatibility:
 *
 * - A dismissed wallet prompt (EIP-1193 code 4001) is the ordinary, expected
 *   outcome of asking someone to connect. It says nothing about the wallet.
 * - `EoaRequiredError` is the one genuine, deliberate compatibility claim —
 *   assertEoa found real contract code at the address, so this wallet truly
 *   cannot sign a Ledgerline run. Checked by type, not by matching the
 *   message text, which is product copy and free to change.
 * - Everything else (no injected provider, a dropped RPC, a rejected chain
 *   switch that isn't 4001, ...) is a connection that failed for a reason
 *   that has nothing to do with wallet compatibility, and must not be
 *   reported as though it did.
 */
function describeConnectError(err: unknown): ConnectError {
  const code = (err as { code?: number } | null)?.code;
  if (code === 4001) {
    return {
      type: "info",
      title: "Connection cancelled",
      description: "Click connect again when you're ready.",
    };
  }
  if (err instanceof EoaRequiredError) {
    return {
      type: "error",
      title: "This wallet cannot sign a Ledgerline run",
      description: err.message,
    };
  }
  return {
    type: "error",
    title: "Couldn't connect to your wallet",
    description: err instanceof Error ? err.message : String(err),
  };
}

export default function CreateRun({ networkName }: { networkName: string | null }) {
  const net = networkFor(networkName);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<RunDraft>();
  const [wallet, setWallet] = useState<ConnectedWallet>();
  const [walletError, setWalletError] = useState<ConnectError>();
  const [prepared, setPrepared] = useState<PreparedRun>();
  const [outcome, setOutcome] = useState<Extract<RunOutcome, { state: "confirmed" }>>();

  // An account or chain change invalidates everything signed against the old one.
  useEffect(() => watchWallet(() => { setWallet(undefined); setStep((s) => Math.min(s, 1)); }), []);

  const onConnect = useCallback(async () => {
    setWalletError(undefined);
    try { setWallet(await connect(net)); }
    catch (err) { setWalletError(describeConnectError(err)); }
  }, [net]);

  return (
    <main className="sheet sheet--wide">
      <div className="masthead">
        <strong>New payout run</strong>
        <span>
          Arc {net.name}
          {wallet ? (
            <>
              {" · "}
              <a href={`${net.explorer}/address/${wallet.address}`} target="_blank" rel="noreferrer">
                {short(wallet.address)}
              </a>
            </>
          ) : (
            <>
              {" · "}
              <button className="linkish" onClick={onConnect}>connect a wallet</button>
            </>
          )}
        </span>
      </div>

      <Steps
        style={{ marginTop: 28 }}
        current={step}
        items={[
          { title: "Upload" }, { title: "Preview" },
          { title: "Preflight" }, { title: "Sign" }, { title: "Receipts" },
        ]}
      />

      <div style={{ marginTop: 28 }}>
        {step === 0 && (
          <StepUpload net={net} onReady={(d) => { setDraft(d); setStep(1); }} />
        )}
        {step === 1 && draft && (
          <StepPreview
            draft={draft} net={net}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
            wallet={wallet} walletError={walletError} onConnect={onConnect}
          />
        )}
        {step === 2 && draft && wallet && (
          <StepPreflight
            draft={draft} net={net} wallet={wallet}
            onBack={() => setStep(1)}
            onReady={(p) => { setPrepared(p); setStep(3); }}
          />
        )}
        {step === 3 && prepared && wallet && (
          <StepSend
            prepared={prepared} net={net} wallet={wallet}
            onDone={(o) => { if (o.state === "confirmed") { setOutcome(o); setStep(4); } }}
          />
        )}
        {step === 4 && outcome && prepared && draft && (
          <Result outcome={outcome} prepared={prepared} draft={draft} net={net} />
        )}
      </div>
    </main>
  );
}
