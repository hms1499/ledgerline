"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Skeleton, Table, Tag, type TableColumnsType } from "antd";
import { tokensForChain, paidByToken, type Address, type RunSummary } from "@ledgerline/core";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Grid, Col } from "@/components/grid/Grid";
import StatTile from "@/components/ui/StatTile";
import Tape from "@/components/ui/Tape";
import { runsFor, type RunRecord } from "@/lib/history";
import { readRuns, describeCoverage, type RunRead } from "@/lib/run-reads";
import { readTokenMeta } from "@/lib/token-meta";
import { coverageView, excludedNote, RUN_STATUS, amountText, paidLine, type TokenMeta } from "@/lib/dashboard-view";
import { withNet } from "@/lib/nav";
import OpenRunByHash from "@/components/OpenRunByHash";

const RECENT = 5;

interface Loaded { records: RunRecord[]; reads: RunRead[]; meta: Record<string, TokenMeta>; attempt: number }

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
    // records is only ever non-empty when wallet was connected (useMemo
    // above), but TS can't see that cross-variable invariant — guard here.
    if (records.length === 0 || !wallet) { setLoaded(undefined); return; }
    const payer = wallet.address as Address;
    let cancelled = false;
    void (async () => {
      const [reads, meta] = await Promise.all([
        readRuns(records, payer, net),
        readTokenMeta(net.defaultRpc, net.chain, net.chain.id)
          .then(({ decimals, symbols }) => Object.fromEntries(
            Object.keys(decimals).map((k) => [k, { decimals: decimals[k], symbol: symbols[k] }]),
          ) as Record<string, TokenMeta>)
          .catch(() => ({} as Record<string, TokenMeta>)),
      ]);
      if (!cancelled) setLoaded({ records, reads, meta, attempt });
    })();
    return () => { cancelled = true; };
  }, [records, net, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!wallet) {
    return (
      <Grid>
        <Col span={12}>
          <Tape>
            <section className="verdict">
              <h2>Your payouts at a glance</h2>
              <p>
                Connect the wallet that paid them. This overview is built from runs sent from
                this browser and re-read from the chain.
              </p>
            </section>
            <Button type="primary" style={{ marginTop: 20 }} onClick={connect}>Connect a wallet</Button>
            <OpenRunByHash network={net.name} />
          </Tape>
        </Col>
      </Grid>
    );
  }

  if (records.length === 0) {
    return (
      <Grid>
        <Col span={12}>
          <Tape>
            <section className="verdict">
              <h2>Nothing sent from this browser yet</h2>
              <p>
                A run sent from another browser is still on chain. Open it from the explorer or by
                its transaction hash.
              </p>
            </section>
            <p style={{ marginTop: 20, marginBottom: 0 }}>
              <Link href={withNet("/new", search)} className="button-primary">Create a payout run</Link>
            </p>
            <OpenRunByHash network={net.name} />
          </Tape>
        </Col>
      </Grid>
    );
  }

  // Only a result read for this render's own `records` is trusted — one read
  // for a different wallet or network is never painted, even for one frame.
  const current = loaded && loaded.records === records ? loaded : undefined;
  // A Retry bumps `attempt` and re-runs the effect above, but `loaded` keeps
  // showing the previous attempt's (stale) result until the new read
  // settles — up to ~130s of silence otherwise (Important 3). `retrying`
  // catches that window so the Retry button and tiles can say so.
  const retrying = !!current && current.attempt !== attempt;

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
      render: (label: string) => label || <span style={{ color: "var(--ink-soft)" }}>unnamed</span> },
    { title: "Sent (this browser's clock)", dataIndex: "seenAt", width: 200,
      render: (ms: number) => new Date(ms).toLocaleString() },
    { title: "Paid", key: "paid",
      render: (_, r) => {
        const read = byHash.get(r.txHash.toLowerCase());
        if (!read) return <Skeleton.Input active size="small" />;
        if (read.state === "read") return paidLine(read.summary.paid, tokens, meta);
        // Dashboard vs /run/[tx] disagree on an attention run (M2/Important
        // 2): both sum the same joinPayments, but the dashboard counts only
        // clean payer payments. Label what was left out rather than
        // silently showing a lower figure than the run page.
        if (read.state === "attention") {
          return `${paidLine(read.summary.paid, tokens, meta)} · (${excludedNote(read.summary.identityBroken)})`;
        }
        return <span style={{ color: "var(--ink-soft)" }}>—</span>;
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
          <Col key={t.token} span={4} md={12}>
            <StatTile
              label={<span className="keep-case">{m.symbol || t.token.slice(0, 10)}</span>}
              value={!current || retrying
                ? <Skeleton.Input active />
                : coverage?.tilesBlank ? "—" : amountText(t.value, t.token, m)}
              sub={current && !retrying && !coverage?.tilesBlank
                ? `${t.payments} payment${t.payments === 1 ? "" : "s"} · ${t.runs} run${t.runs === 1 ? "" : "s"}`
                : undefined}
            />
          </Col>
        );
      })}

      <Col span={12}>
        {coverage?.tone === "plain" && <p className="coverage-line">{coverage.text}</p>}
        {coverage?.tone === "warning" && (
          <Alert type="warning" showIcon title={coverage.text}
            action={coverage.retry
              ? <Button size="small" loading={retrying} onClick={retry}>Retry</Button>
              : undefined} />
        )}
        {coverage?.attentionNote && (
          <p className="coverage-line">
            {coverage.attentionNote} <Link href={attentionHref()}>Take a look</Link>
          </p>
        )}
      </Col>

      <Col span={12}>
        <Tape title="Recent runs">
        <Table<RunRecord>
          columns={columns}
          dataSource={recent.map((r) => ({ ...r, key: r.txHash }))}
          pagination={false}
          size="middle"
          scroll={{ x: "max-content" }}
        />
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          <Link href={withNet("/runs", search)}>All runs →</Link>
        </p>
        </Tape>
      </Col>
    </Grid>
  );
}
