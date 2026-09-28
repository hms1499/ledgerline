"use client";

import { Skeleton } from "antd";
import type { Address } from "@ledgerline/core";
import { Col } from "@/components/grid/Grid";
import StatTile from "@/components/ui/StatTile";
import { describeCoverage, type RunRead } from "@/lib/run-reads";
import {
  allTimeLine, amountText, coverageLine, monthTitle, paidThisMonth, type TokenMeta,
} from "@/lib/dashboard-view";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** This month's tiles, the all-time line and what they stand on (spec §3.3).
 *  Figures appear only once every read has settled, never a half-sum. */
export default function PaidTotals({ reads, tokens, meta, network, now }: {
  reads: RunRead[] | undefined;
  tokens: Address[];
  meta: Record<string, TokenMeta> | undefined;
  network: string;
  /** When the reads settled; undefined while they are in flight. */
  now: Date | undefined;
}) {
  const ready = reads && meta && now ? { reads, meta, now } : undefined;
  const month = ready ? paidThisMonth(ready.reads, tokens, ready.now) : undefined;
  const coverage = ready && month
    ? coverageLine(describeCoverage(ready.reads), month.undated, network, ready.now) : undefined;

  return (
    <>
      <Col span={12}>
        <h2 className="section-title">{now ? `Paid in ${monthTitle(now)}` : "Paid this month"}</h2>
      </Col>
      {tokens.map((token, i) => {
        const m = meta?.[token.toLowerCase()] ?? {};
        const t = month?.totals[i];
        return (
          <Col key={token} span={4} md={12}>
            <StatTile
              label={<span className="keep-case">{m.symbol || token.slice(0, 10)}</span>}
              value={!t ? <Skeleton.Input active /> : coverage?.tilesBlank ? "—" : amountText(t.value, token, m)}
              sub={t && !coverage?.tilesBlank ? `${plural(t.payments, "payment")} · ${plural(t.runs, "run")}` : undefined}
            />
          </Col>
        );
      })}
      <Col span={12}>
        {ready && !coverage?.tilesBlank && (
          <p className="all-time">
            All time, from runs sent from this browser: {allTimeLine(ready.reads, tokens, ready.meta)}
          </p>
        )}
        {coverage && <p className="coverage-line">{coverage.text}</p>}
      </Col>
    </>
  );
}
