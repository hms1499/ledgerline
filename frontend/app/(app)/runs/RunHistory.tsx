"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Table, type TableColumnsType } from "antd";
import { short } from "@/lib/chain";
import { runsFor, forgetRun, type RunRecord } from "@/lib/history";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Grid, Col } from "@/components/grid/Grid";
import Panel from "@/components/ui/Panel";
import Verdict from "@/components/ui/Verdict";

export default function RunHistory() {
  const { net, wallet, connect } = useWallet();
  const [rows, setRows] = useState<RunRecord[]>([]);

  const refresh = useCallback(() => {
    setRows(wallet ? runsFor(wallet.address, net.chain.id) : []);
  }, [wallet, net.chain.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const columns: TableColumnsType<RunRecord> = [
    {
      title: "Run", dataIndex: "runLabel",
      render: (label: string) => label || <span style={{ color: "var(--ink-soft)" }}>unnamed</span>,
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
      title: <span className="sr-only">Actions</span>, dataIndex: "txHash", width: 230,
      render: (txHash: string, r) => (
        <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/run/${txHash}?n=${net.name}&label=${encodeURIComponent(r.runLabel)}`}>
            Open and rebuild links
          </Link>
          <button
            className="linkish"
            onClick={() => {
              forgetRun(txHash, r.payer, r.chainId);
              refresh();
            }}
          >
            Remove
          </button>
        </span>
      ),
    },
  ];

  return (
    <Grid>
      {!wallet ? (
        <Col span={12}>
          <Panel>
            <Verdict title="Runs you sent from this browser"
              body="Connect the wallet that paid them. This list lives in this browser only — Ledgerline has no account and no server that remembers you." />
            <Button type="primary" style={{ marginTop: 24 }} onClick={connect}>Connect a wallet</Button>
          </Panel>
        </Col>
      ) : rows.length === 0 ? (
        <Col span={12}>
          <Panel>
            <Verdict title="Nothing recorded for this wallet" body={
              <>
                No runs from <span className="hex addr">{short(wallet.address)}</span> have been sent
                from this browser — or the list was cleared with the site&apos;s data. Neither
                says anything about the chain: a run you sent elsewhere is still there, and
                opening it needs only its transaction hash.
              </>
            } />
            <p style={{ marginTop: 22, marginBottom: 0 }}>
              <Link href="/new">Create a payout run</Link>
              {" · "}
              <a href={`${net.explorer}/address/${wallet.address}`} target="_blank" rel="noreferrer">
                Find an earlier one on the explorer
              </a>
            </p>
          </Panel>
        </Col>
      ) : (
        <>
          <Col span={12}>
            <Alert
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
          </Col>
          <Col span={12}>
            <Panel title="Runs sent from this browser">
              <Table<RunRecord>
                columns={columns}
                dataSource={rows.map((r) => ({ ...r, key: r.txHash }))}
                pagination={rows.length > 25 ? { pageSize: 25 } : false}
                size="middle"
                scroll={{ x: "max-content" }}
              />
            </Panel>
          </Col>
        </>
      )}
    </Grid>
  );
}
