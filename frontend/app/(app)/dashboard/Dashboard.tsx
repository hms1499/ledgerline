"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "antd";
import { tokensForChain, type Address } from "@ledgerline/core";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Grid, Col } from "@/components/grid/Grid";
import Tape from "@/components/ui/Tape";
import OpenRunByHash from "@/components/OpenRunByHash";
import { runsFor, settleRun, markReverted, forgetRun, type RunRecord } from "@/lib/history";
import { readRuns, describeCoverage, type RunRead } from "@/lib/run-reads";
import { readBalances } from "@/lib/balances";
import { readTokenMeta } from "@/lib/token-meta";
import {
  coverageLine, needsYou, paidThisMonth, tokenCards, toMarkReverted, toSettle, type TokenMeta,
} from "@/lib/dashboard-view";
import { withNet } from "@/lib/nav";
import { realFundsNotice } from "@/lib/network-notice";
import NeedsYou from "./NeedsYou";
import GetStarted from "./GetStarted";
import WalletPanel from "./WalletPanel";
import PaidTotals from "./PaidTotals";
import RecentRuns from "./RecentRuns";

// Each read is tagged with the inputs it was read for. Render trusts only a
// result whose tag matches this render's own inputs, so a read for a
// superseded wallet, network or Retry is never painted, not even for one
// frame: a route/search-param change is a transition, and effects after a
// transition flush after paint, so clearing state in an effect is too late.
interface RunsRead { records: RunRecord[]; attempt: number; reads: RunRead[]; at: number }
interface BalancesRead { owner: string; chainId: number; attempt: number; balances: Record<string, bigint> }
interface MetaRead { chainId: number; attempt: number; meta: Record<string, TokenMeta> }

export default function Dashboard() {
  const { net, wallet, connect, wrongChain, switching, switchToArc } = useWallet();
  const search = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  // Bumped by Remove, so the history is read again without a reload.
  const [version, setVersion] = useState(0);
  const [runsRead, setRunsRead] = useState<RunsRead>();
  const [balancesRead, setBalancesRead] = useState<BalancesRead>();
  const [metaRead, setMetaRead] = useState<MetaRead>();

  const records = useMemo<RunRecord[]>(
    () => (wallet ? runsFor(wallet.address, net.chain.id) : []),
    // `version` is not read inside: it only forces a fresh read of the history.
    [wallet, net.chain.id, version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const tokens = useMemo(() => Object.values(tokensForChain(net.chain.id)) as Address[], [net.chain.id]);
  const usdc = tokensForChain(net.chain.id).USDC as Address;

  useEffect(() => {
    if (records.length === 0 || !wallet) return;
    const payer = wallet.address as Address;
    let cancelled = false;
    void readRuns(records, payer, net).then((reads) => {
      // A run recorded at broadcast settles once its receipt shows it paid.
      // A reverted one stays for the payer to see and remove (spec decision 4),
      // marked so the run list says it did not go through.
      for (const h of toSettle(reads)) settleRun(h, payer, net.chain.id, "success");
      for (const h of toMarkReverted(reads)) markReverted(h, payer, net.chain.id);
      if (!cancelled) setRunsRead({ records, attempt, reads, at: Date.now() });
    });
    return () => { cancelled = true; };
  }, [records, wallet, net, attempt]);

  useEffect(() => {
    if (!wallet) return;
    const owner = wallet.address as Address;
    let cancelled = false;
    void readBalances(net, owner, tokens).then((balances) => {
      if (!cancelled) setBalancesRead({ owner, chainId: net.chain.id, attempt, balances });
    });
    return () => { cancelled = true; };
  }, [wallet, net, tokens, attempt]);

  useEffect(() => {
    let cancelled = false;
    void readTokenMeta(net.defaultRpc, net.chain, net.chain.id)
      .then(({ decimals, symbols }) => Object.fromEntries(
        Object.keys(decimals).map((k) => [k, { decimals: decimals[k], symbol: symbols[k] }]),
      ) as Record<string, TokenMeta>)
      // Unreadable metadata prints raw integers, never guessed decimals.
      .catch(() => ({} as Record<string, TokenMeta>))
      .then((meta) => { if (!cancelled) setMetaRead({ chainId: net.chain.id, attempt, meta }); });
    return () => { cancelled = true; };
  }, [net, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const remove = useCallback((txHash: string) => {
    if (!wallet) return;
    forgetRun(txHash, wallet.address, net.chain.id);
    setVersion((v) => v + 1);
  }, [wallet, net.chain.id]);

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
            <p style={{ marginTop: 12, marginBottom: 0 }}>
              You need a browser wallet (MetaMask or Rabby) and a little USDC on Arc for network fees.
            </p>
            <Button type="primary" style={{ marginTop: 20 }} onClick={connect}>Connect a wallet</Button>
            <OpenRunByHash network={net.name} />
          </Tape>
        </Col>
      </Grid>
    );
  }

  // The tag checks (Review Focus 1): each read is trusted only for the
  // wallet, network, history and attempt it was read for.
  const balances = balancesRead
    && balancesRead.owner.toLowerCase() === wallet.address.toLowerCase()
    && balancesRead.chainId === net.chain.id && balancesRead.attempt === attempt
    ? balancesRead.balances : undefined;
  const meta = metaRead && metaRead.chainId === net.chain.id && metaRead.attempt === attempt
    ? metaRead.meta : undefined;
  const runs = runsRead && runsRead.records === records && runsRead.attempt === attempt ? runsRead : undefined;

  // This month's totals and what they stand on, once every run is read.
  const now = runs ? new Date(runs.at) : undefined;
  const month = runs && now ? paidThisMonth(runs.reads, tokens, now) : undefined;
  const coverage = runs && month && now
    ? coverageLine(describeCoverage(runs.reads), month.undated, net.name, now) : undefined;
  const cards = tokenCards({
    chainId: net.chain.id, tokens, balances, meta, now,
    // A wallet with no runs has nothing paid to show beside its balances.
    month: records.length === 0 ? null : month && coverage ? { totals: month.totals, blank: coverage.tilesBlank } : undefined,
  });
  const wallets = <WalletPanel address={wallet.address} cards={cards} newRunHref={withNet("/new", search)} />;

  if (records.length === 0) {
    return (
      <Grid>
        {wallets}
        <Col span={12}>
          <GetStarted address={wallet.address} network={net.name} wrongChain={wrongChain} switching={switching}
            balances={balances} usdc={usdc} newRunHref={withNet("/new", search)}
            tryTestnetHref={realFundsNotice(net)?.tryHref}
            onSwitch={() => void switchToArc()} onRetry={retry} />
        </Col>
      </Grid>
    );
  }

  const items = needsYou({ records, reads: runs?.reads, balances, tokens, usdc, now: runs?.at ?? 0 });
  const runHref = (txHash: string, runLabel: string) =>
    `/run/${txHash}?n=${net.name}&label=${encodeURIComponent(runLabel)}`;

  return (
    <Grid>
      <Col span={12}>
        <NeedsYou items={items} network={net.name} runHref={runHref}
          newRunHref={withNet("/new", search)} onRetry={retry} onRemove={remove} />
      </Col>
      {wallets}
      <PaidTotals reads={runs?.reads} tokens={tokens} meta={meta} coverage={coverage} />
      <Col span={12}>
        <RecentRuns records={records} reads={runs?.reads} tokens={tokens} meta={meta}
          runHref={runHref} allRunsHref={withNet("/runs", search)} />
      </Col>
    </Grid>
  );
}
