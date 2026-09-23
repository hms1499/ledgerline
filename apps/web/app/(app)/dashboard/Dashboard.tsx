"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Skeleton, Table, Tag, type TableColumnsType } from "antd";
import { tokensForChain, paidByToken, type Address, type RunSummary } from "@ledgerline/core";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Grid, Col } from "@/components/grid/Grid";
import { runsFor, type RunRecord } from "@/lib/history";
import { readRuns, describeCoverage, type RunRead } from "@/lib/run-reads";
import { readTokenMeta } from "@/lib/token-meta";
import { coverageView, RUN_STATUS, amountText, paidLine, type TokenMeta } from "@/lib/dashboard-view";
import { withNet } from "@/lib/nav";

const RECENT = 5;

interface Loaded { records: RunRecord[]; reads: RunRead[]; meta: Record<string, TokenMeta> }

export default function Dashboard() {
  const { net, wallet, connect } = useWallet();
  const search = useSearchParams();
  const [loaded, setLoaded] = useState<Loaded>();
  const [attempt, setAttempt] = useState(0);

  const records = useMemo<RunRecord[]>(
    () => (wallet ? runsFor(wallet.address, net.chain.id) : []),
    [wallet, net.chain.id],
  );
  const tokens = useMemo(() => Object.values(tokensForChain(net.chain.id)) as Address[], [net.chain.id]);

  // Reads restart when the wallet, network or history changes. A result is
  // tagged with the `records` it was read for; render below only trusts a
  // result whose tag is === this render's `records`, so a settled result
  // from a superseded wallet or network is never painted, not even for one
  // frame (a route/search-param change is a transition, and effects after a
  // transition flush after paint — clearing state here would be too late).
  useEffect(() => {
    if (records.length === 0) { setLoaded(undefined); return; }
    let cancelled = false;
    void (async () => {
      const [reads, meta] = await Promise.all([
        readRuns(records, net),
        readTokenMeta(net.defaultRpc, net.chain, net.chain.id)
          .then(({ decimals, symbols }) => Object.fromEntries(
            Object.keys(decimals).map((k) => [k, { decimals: decimals[k], symbol: symbols[k] }]),
          ) as Record<string, TokenMeta>)
          .catch(() => ({} as Record<string, TokenMeta>)),
      ]);
      if (!cancelled) setLoaded({ records, reads, meta });
    })();
    return () => { cancelled = true; };
  }, [records, net, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!wallet) {
    return (
      <Grid>
        <Col span={8} md={12}>
          <section className="verdict">
            <h1>Your payouts at a glance</h1>
            <p>
              Connect the wallet that paid them. This overview is built from runs sent from
              this browser and re-read from the chain.
            </p>
          </section>
          <Button type="primary" style={{ marginTop: 24 }} onClick={connect}>Connect a wallet</Button>
        </Col>
      </Grid>
    );
  }

  if (records.length === 0) {
    return (
      <Grid>
        <Col span={12}>
          <section className="verdict">
            <h1>Nothing sent from this browser yet</h1>
            <p>
              A run sent from another browser is still on chain. Open it from the explorer or by
              its transaction hash.
            </p>
          </section>
          <p style={{ marginTop: 22 }}>
            <Link href={withNet("/new", search)} className="button-primary">Create a payout run</Link>
          </p>
        </Col>
      </Grid>
    );
  }

  // Only a result read for this render's own `records` is trusted — one read
  // for a different wallet or network is never painted, even for one frame.
  const current = loaded && loaded.records === records ? loaded : undefined;

  const byHash = new Map((current?.reads ?? []).map((r) => [r.txHash.toLowerCase(), r]));
  const summaries: RunSummary[] = (current?.reads ?? []).flatMap((r) =>
    r.state === "read" || r.state === "attention" ? [r.summary] : []);
  const totals = paidByToken(summaries, tokens);
  const coverage = current ? coverageView(describeCoverage(current.reads), net.name) : undefined;
  const meta = current?.meta ?? {};
  const recent = records.slice(0, RECENT);
  const runHref = (r: RunRecord) =>
    `/run/${r.txHash}?n=${net.name}&label=${encodeURIComponent(r.runLabel)}`;
  const attentionHref = () => {
    const hashes = current ? describeCoverage(current.reads).attention : [];
    const one = hashes.length === 1 ? records.find((r) => r.txHash.toLowerCase() === hashes[0]!.toLowerCase()) : undefined;
    return one ? runHref(one) : withNet("/runs", search);
  };

  const columns: TableColumnsType<RunRecord> = [
    { title: "Run", dataIndex: "runLabel",
      render: (label: string) => label || <span style={{ color: "var(--text-soft)" }}>unnamed</span> },
    { title: "Sent (this browser's clock)", dataIndex: "seenAt", width: 200,
      render: (ms: number) => new Date(ms).toLocaleString() },
    { title: "Paid", key: "paid",
      render: (_, r) => {
        const read = byHash.get(r.txHash.toLowerCase());
        if (!read) return <Skeleton.Input active size="small" />;
        return read.state === "read" || read.state === "attention"
          ? paidLine(read.summary.paid, tokens, meta)
          : <span style={{ color: "var(--text-soft)" }}>—</span>;
      } },
    { title: "Status", key: "status", width: 130,
      render: (_, r) => {
        const read = byHash.get(r.txHash.toLowerCase());
        if (!read) return <Skeleton.Button active size="small" />;
        const s = RUN_STATUS[read.state];
        return <Tag color={s.color}>{s.label}</Tag>;
      } },
    { title: <span className="sr-only">Open</span>, key: "open", width: 80,
      render: (_, r) => <Link href={runHref(r)}>Open</Link> },
  ];

  return (
    <Grid>
      {totals.map((t) => {
        const m = meta[t.token.toLowerCase()] ?? {};
        return (
          <Col key={t.token} span={4} md={12} as="section" className="stat-tile">
            <p className="stat-label">{m.symbol || t.token.slice(0, 10)}</p>
            {!current
              ? <Skeleton.Input active />
              : <p className="stat-value">{coverage?.tilesBlank ? "—" : amountText(t.value, t.token, m)}</p>}
            {current && !coverage?.tilesBlank && (
              <p className="stat-sub">
                {t.payments} payment{t.payments === 1 ? "" : "s"} · {t.runs} run{t.runs === 1 ? "" : "s"}
              </p>
            )}
          </Col>
        );
      })}

      <Col span={12}>
        {coverage?.tone === "plain" && <p className="coverage-line">{coverage.text}</p>}
        {coverage?.tone === "warning" && (
          <Alert type="warning" showIcon title={coverage.text}
            action={coverage.retry ? <Button size="small" onClick={retry}>Retry</Button> : undefined} />
        )}
        {coverage?.attentionNote && (
          <p className="coverage-line">
            {coverage.attentionNote} <Link href={attentionHref()}>Take a look</Link>
          </p>
        )}
      </Col>

      <Col span={12}>
        <h2 className="section-title">Recent runs</h2>
        <Table<RunRecord>
          columns={columns}
          dataSource={recent.map((r) => ({ ...r, key: r.txHash }))}
          pagination={false}
          size="middle"
          scroll={{ x: "max-content" }}
        />
        <p style={{ marginTop: 12 }}>
          <Link href={withNet("/runs", search)}>All runs →</Link>
        </p>
      </Col>
    </Grid>
  );
}
