"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Steps } from "antd";
import { createPublicClient, http, type Address } from "viem";
import { tokensForChain, type ResolvedRow, type CsvIssue, type RowIssue, type RunOutcome } from "@ledgerline/core";
import { networkFor, short } from "@/lib/chain";
import { describeError, errorCode } from "@/lib/errors";
import { recordRun } from "@/lib/history";
import { describeConnectError, type ConnectError } from "@/lib/connect-error";
import {
  connect, disconnect, switchChain, watchWallet, watchWalletList, knownWallets,
  type ConnectedWallet, type WalletChoice,
} from "@/lib/wallet";
import StepUpload from "./StepUpload";
import StepPreview from "./StepPreview";
import StepPreflight, { type PreparedRun } from "./StepPreflight";
import StepSend from "./StepSend";
import Result from "./Result";
import WalletPicker from "@/components/WalletPicker";

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

export default function CreateRun({ networkName }: { networkName: string | null }) {
  const net = networkFor(networkName);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<RunDraft>();
  const [wallet, setWallet] = useState<ConnectedWallet>();
  const [walletError, setWalletError] = useState<ConnectError>();
  const [prepared, setPrepared] = useState<PreparedRun>();
  const [outcome, setOutcome] = useState<Extract<RunOutcome, { state: "confirmed" }>>();
  /** True while StepSend holds the only copy of a transaction hash. */
  const [sending, setSending] = useState(false);
  const [forgetQueued, setForgetQueued] = useState(false);
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [picking, setPicking] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string>();

  const wrongChain = !!wallet && wallet.chainId !== net.chain.id;

  const drop = useCallback(() => {
    setWallet(undefined);
    setWalletError(undefined);
    // Everything from the preflight signature onward is bound to one account:
    // the run salt IS that account's signature, every memoId derives from it,
    // and the root commits to those memoIds. So the prepared run goes with the
    // wallet — keeping it would leave a commitment on screen that the next
    // account did not make and cannot reproduce.
    //
    // A confirmed run is the exception, because it is a fact about a block
    // rather than about whoever is connected now, and the result screen holds
    // the payer's only copy of the receipt links.
    if (outcome) return;
    setPrepared(undefined);
    setStep((s) => Math.min(s, 1));
  }, [outcome]);

  /**
   * Dropping the wallet unmounts StepSend, and between "your wallet signed it"
   * and "here is the receipt" that screen holds the only copy of a transaction
   * hash for money that has already moved. Losing it is precisely the failure
   * the never-report-success-without-a-receipt rule exists to prevent. So a
   * disconnect asked for mid-send — by the button here, or by the wallet
   * switching accounts underneath us — is queued and applied once the run has
   * settled, rather than refused or obeyed immediately.
   */
  const forgetWallet = useCallback(() => {
    if (sending) { setForgetQueued(true); return; }
    drop();
  }, [sending, drop]);

  useEffect(() => {
    if (forgetQueued && !sending) { setForgetQueued(false); drop(); }
  }, [forgetQueued, sending, drop]);

  /**
   * A chain change is a state, not a failure: the wallet stays connected and
   * the screen offers to switch. It does invalidate a prepared run, because
   * the salt message includes the chain id and the manifest records it — so
   * a run prepared on one chain cannot be signed on another.
   */
  const onChainChanged = useCallback((chainId: number) => {
    setWallet((w) => (w ? { ...w, chainId } : w));
    setSwitchError(undefined);
    if (sending || outcome) return;
    setPrepared(undefined);
    setStep((s) => Math.min(s, 1));
  }, [sending, outcome]);

  // Bound to the connected wallet, so a change in some other installed wallet
  // does not tear this screen down.
  useEffect(() => {
    if (!wallet) return;
    return watchWallet(wallet, { accountLost: forgetWallet, chainChanged: onChainChanged });
  }, [wallet, forgetWallet, onChainChanged]);

  const onSwitch = useCallback(async () => {
    if (!wallet) return;
    setSwitching(true);
    setSwitchError(undefined);
    try {
      const id = await switchChain(wallet, net);
      // Read back, never assumed: a wallet can decline without throwing, and
      // a screen that believes a switch it never made would let the payer
      // sign against the wrong chain.
      setWallet((w) => (w ? { ...w, chainId: id } : w));
      if (id !== net.chain.id) {
        setSwitchError(`The wallet is still on chain ${id || "unknown"}. Switch it to Arc ${net.name} from the wallet itself, then try again.`);
      }
    } catch (err) {
      setSwitchError(errorCode(err) === 4001
        ? "You dismissed the network prompt. Nothing changed — press the button again when you're ready."
        : describeError(err));
    } finally {
      setSwitching(false);
    }
  }, [wallet, net]);

  // Wallets announce themselves asynchronously, and one that wakes up late
  // must still appear in the picker.
  useEffect(() => watchWalletList(() => setChoices(knownWallets())), []);

  const connectTo = useCallback(async (choice?: WalletChoice) => {
    setPicking(false);
    setWalletError(undefined);
    try { setWallet(await connect(net, choice)); }
    catch (err) { setWalletError(describeConnectError(err)); }
  }, [net]);

  const onConnect = useCallback(() => {
    const found = knownWallets();
    setChoices(found);
    // One wallet is not a choice, and no wallet needs connect's own error
    // rather than an empty dialog.
    if (found.length > 1) { setPicking(true); return; }
    void connectTo(found[0]);
  }, [connectTo]);

  // Revoke before forgetting, so the next connect actually prompts instead of
  // silently reattaching the same account — a disconnect that leaves you
  // unable to pick a different account has not disconnected anything.
  const onDisconnect = useCallback(async () => {
    await disconnect(wallet);
    forgetWallet();
  }, [wallet, forgetWallet]);

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
                {wallet.info.name === "Browser wallet"
                  ? short(wallet.address)
                  : `${wallet.info.name} ${short(wallet.address)}`}
              </a>
              {" · "}
              <button
                className="linkish"
                onClick={() => void onDisconnect()}
                disabled={sending}
                title={sending
                  ? "This run is in flight. Disconnecting now would take its transaction hash off the screen."
                  : undefined}
              >
                disconnect
              </button>
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
          { title: "Upload" }, { title: "Review" },
          { title: "Check" }, { title: "Pay" }, { title: "Receipts" },
        ]}
      />

      {wrongChain && wallet && (
        <Alert
          style={{ marginTop: 22 }}
          type="warning"
          showIcon
          title={`This wallet is not on Arc ${net.name}`}
          description={
            <>
              <p style={{ marginTop: 0 }}>
                Ledgerline pays on Arc {net.name}, chain {net.chain.id}. Your wallet is on{" "}
                chain {wallet.chainId || "an unreadable network"}. Nothing can be signed or
                sent until it moves — your wallet will ask you to confirm.
              </p>
              <Button type="primary" loading={switching} onClick={() => void onSwitch()}>
                Switch to Arc {net.name}
              </Button>
              {switchError && (
                <p style={{ marginBottom: 0, marginTop: 12 }}>{switchError}</p>
              )}
            </>
          }
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
            wallet={wallet} walletError={walletError} onConnect={onConnect}
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
            onBusy={setSending}
          />
        )}
        {step === 4 && outcome && prepared && draft && (
          <Result outcome={outcome} prepared={prepared} draft={draft} net={net} />
        )}
      </div>

      <WalletPicker
        choices={choices} open={picking}
        onPick={(c) => void connectTo(c)}
        onCancel={() => setPicking(false)}
      />
    </main>
  );
}
