"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Table, type TableColumnsType } from "antd";
import { networkFor, short } from "@/lib/chain";
import {
  connect, knownWallets, watchWalletList,
  type ConnectedWallet, type WalletChoice,
} from "@/lib/wallet";
import { describeError, errorCode } from "@/lib/errors";
import { runsFor, forgetRun, type RunRecord } from "@/lib/history";
import WalletPicker from "@/components/WalletPicker";

export default function RunHistory({ networkName }: { networkName: string | null }) {
  const net = networkFor(networkName);
  const [wallet, setWallet] = useState<ConnectedWallet>();
  const [error, setError] = useState<string>();
  const [rows, setRows] = useState<RunRecord[]>([]);
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [picking, setPicking] = useState(false);

  const refresh = useCallback((w: ConnectedWallet) => {
    setRows(runsFor(w.address, net.chain.id));
  }, [net.chain.id]);

  const connectTo = useCallback(async (choice?: WalletChoice) => {
    setPicking(false);
    setError(undefined);
    try {
      const w = await connect(net, choice);
      setWallet(w);
      refresh(w);
    } catch (err) {
      setError(errorCode(err) === 4001
        ? "Connection cancelled. Press connect again when you're ready."
        : describeError(err));
    }
  }, [net, refresh]);

  const onConnect = useCallback(() => {
    const found = knownWallets();
    setChoices(found);
    if (found.length > 1) { setPicking(true); return; }
    void connectTo(found[0]);
  }, [connectTo]);

  useEffect(() => { if (wallet) refresh(wallet); }, [wallet, refresh]);

  // Ask the installed wallets to announce themselves. Without this the page
  // only ever sees wallets that announced before it mounted, which is none of
  // them on a fresh load.
  useEffect(() => watchWalletList(() => setChoices(knownWallets())), []);

  const columns: TableColumnsType<RunRecord> = [
    {
      title: "Run", dataIndex: "runLabel",
      render: (label: string) => label || <span style={{ opacity: 0.5 }}>unnamed</span>,
    },
    {
      title: "Paid", dataIndex: "itemCount", width: 110,
      render: (n: number) => `${n} invoice${n === 1 ? "" : "s"}`,
    },
    {
      title: "Sent", dataIndex: "seenAt", width: 190,
      render: (ms: number) => new Date(ms).toLocaleString(),
    },
    {
      title: "", dataIndex: "txHash", width: 230,
      render: (txHash: string, r) => (
        <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/run/${txHash}?n=${net.name}&label=${encodeURIComponent(r.runLabel)}`}>
            Open and rebuild links
          </Link>
          <button
            className="linkish"
            onClick={() => {
              forgetRun(txHash, r.payer, r.chainId);
              if (wallet) refresh(wallet);
            }}
          >
            Remove
          </button>
        </span>
      ),
    },
  ];

  return (
    <main className="sheet sheet--wide">
      <div className="masthead">
        <strong>Your payout runs</strong>
        <span>
          Arc {net.name}
          {wallet ? ` · ${short(wallet.address)}` : ""}
        </span>
      </div>

      {!wallet ? (
        <>
          <section className="verdict">
            <h1>Runs you sent from this browser</h1>
            <p>
              Connect the wallet that paid them. This list lives in this browser only —
              Ledgerline has no account and no server that remembers you.
            </p>
          </section>
          {error && <Alert style={{ marginTop: 18 }} type="warning" showIcon title={error} />}
          <Button type="primary" style={{ marginTop: 24 }} onClick={onConnect}>
            Connect a wallet
          </Button>
        </>
      ) : rows.length === 0 ? (
        <>
          <section className="verdict">
            <h1>Nothing recorded for this wallet</h1>
            <p>
              No runs from <span className="hex">{short(wallet.address)}</span> have been sent
              from this browser — or the list was cleared with the site&apos;s data. Neither
              says anything about the chain: a run you sent elsewhere is still there, and
              opening it needs only its transaction hash.
            </p>
          </section>
          <p style={{ marginTop: 22 }}>
            <Link href="/new">Create a payout run</Link>
            {" · "}
            <a href={`${net.explorer}/address/${wallet.address}`} target="_blank" rel="noreferrer">
              Find an earlier one on the explorer
            </a>
          </p>
        </>
      ) : (
        <>
          <Alert
            style={{ marginTop: 22 }}
            type="info"
            title="A shortcut, not a record"
            description={
              <>
                This list is kept in this browser and nowhere else. Clearing site data,
                switching browser or switching machine loses it — and loses nothing that
                matters, because every run below is re-read and re-checked against the chain
                when you open it. The chain is the record; this is just a way not to have to
                remember hashes.
              </>
            }
          />
          <div style={{ marginTop: 24 }}>
            <Table<RunRecord>
              columns={columns}
              dataSource={rows.map((r) => ({ ...r, key: r.txHash }))}
              pagination={rows.length > 25 ? { pageSize: 25 } : false}
              size="middle"
            />
          </div>
        </>
      )}

      <WalletPicker
        choices={choices} open={picking}
        onPick={(c) => void connectTo(c)}
        onCancel={() => setPicking(false)}
      />

      <footer className="footer">
        <Link href="/new">Create a payout run</Link>
      </footer>
    </main>
  );
}
