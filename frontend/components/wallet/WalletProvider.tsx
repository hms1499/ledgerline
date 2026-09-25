"use client";

import { createContext, useCallback, useContext, useEffect, useReducer, useState } from "react";
import {
  connect as connectWallet, disconnect as disconnectWallet, switchChain,
  watchWallet, watchWalletList, knownWallets, NoWalletError,
  type ConnectedWallet, type WalletChoice,
} from "@/lib/wallet";
import { describeError, errorCode } from "@/lib/errors";
import { describeConnectError, type ConnectError } from "@/lib/connect-error";
import { initialSession, leaveWarning, sessionReducer } from "@/lib/wallet-session";
import { useNetwork } from "@/lib/use-network";
import type { NetworkView } from "@/lib/chain";
import WalletPicker from "@/components/WalletPicker";
import NoWalletDialog from "@/components/NoWalletDialog";

export interface WalletApi {
  net: NetworkView;
  wallet?: ConnectedWallet;
  wrongChain: boolean;
  held: boolean;
  connecting: boolean;
  error?: ConnectError;
  switching: boolean;
  switchError?: string;
  connect(): void;
  disconnect(): Promise<void>;
  switchToArc(): Promise<void>;
  /** Set by the send screen while it holds the only copy of a tx hash. */
  setHold(on: boolean): void;
  /** Set by the result screen until the run file is saved. */
  setUnsavedRun(on: boolean): void;
  /** What leaving the page would lose right now, or nothing. */
  leaveWarning?: string;
}

const WalletContext = createContext<WalletApi | null>(null);

export function useWallet(): WalletApi {
  const api = useContext(WalletContext);
  if (!api) throw new Error("useWallet must be used inside WalletProvider");
  return api;
}

/** An onClick for shell links. Client-side navigation never fires
 *  beforeunload, so a link that would lose a payment's hash or an unsaved run
 *  file asks first. Outside the app shell there is nothing to lose. */
export function useLeaveGuard(): (e: React.MouseEvent) => void {
  const warning = useContext(WalletContext)?.leaveWarning;
  return useCallback((e: React.MouseEvent) => {
    if (warning && !window.confirm(warning)) e.preventDefault();
  }, [warning]);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const net = useNetwork();
  const [session, dispatch] = useReducer(sessionReducer<ConnectedWallet>, initialSession<ConnectedWallet>());
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [picking, setPicking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<ConnectError>();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string>();
  const [unsavedRun, setUnsavedRun] = useState(false);
  const [noWallet, setNoWallet] = useState(false);
  const wallet = session.wallet;

  // Wallets announce themselves asynchronously; one that wakes late must
  // still appear in the picker.
  useEffect(() => watchWalletList(() => setChoices(knownWallets())), []);

  // Bound to the connected wallet, so another installed wallet's events do
  // not tear the session down.
  useEffect(() => {
    if (!wallet) return;
    return watchWallet(wallet, {
      accountLost: () => dispatch({ type: "forget" }),
      chainChanged: (chainId) => { setSwitchError(undefined); dispatch({ type: "chain", chainId }); },
    });
  }, [wallet]);

  const connectTo = useCallback(async (choice?: WalletChoice) => {
    setPicking(false);
    setError(undefined);
    setConnecting(true);
    try { dispatch({ type: "connected", wallet: await connectWallet(net, choice) }); }
    catch (err) {
      // No wallet is a next step, not a failure: the dialog says what to get.
      if (err instanceof NoWalletError) setNoWallet(true);
      else setError(describeConnectError(err));
    }
    finally { setConnecting(false); }
  }, [net]);

  const connect = useCallback(() => {
    const found = knownWallets();
    setChoices(found);
    // One wallet is not a choice; no wallet needs connect's own error.
    if (found.length > 1) { setPicking(true); return; }
    void connectTo(found[0]);
  }, [connectTo]);

  // Revoke before forgetting, so the next connect prompts instead of silently
  // reattaching the same account.
  const disconnect = useCallback(async () => {
    if (!session.held) await disconnectWallet(wallet);
    setError(undefined);
    dispatch({ type: "forget" });
  }, [wallet, session.held]);

  const switchToArc = useCallback(async () => {
    if (!wallet) return;
    setSwitching(true);
    setSwitchError(undefined);
    try {
      // Read back, never assumed: a wallet can decline without throwing.
      const id = await switchChain(wallet, net);
      dispatch({ type: "chain", chainId: id });
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

  const setHold = useCallback((on: boolean) => dispatch({ type: "hold", on }), []);

  const api: WalletApi = {
    net, wallet,
    wrongChain: !!wallet && wallet.chainId !== net.chain.id,
    held: session.held,
    connecting, error, switching, switchError,
    connect, disconnect, switchToArc, setHold, setUnsavedRun,
    leaveWarning: leaveWarning({ held: session.held, unsavedRun }),
  };

  return (
    <WalletContext.Provider value={api}>
      {children}
      <WalletPicker choices={choices} open={picking} onPick={(c) => void connectTo(c)} onCancel={() => setPicking(false)} />
      <NoWalletDialog open={noWallet} network={net.name} onClose={() => setNoWallet(false)} />
    </WalletContext.Provider>
  );
}
