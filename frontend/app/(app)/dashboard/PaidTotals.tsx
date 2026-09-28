"use client";

import type { Address } from "@ledgerline/core";
import { Col } from "@/components/grid/Grid";
import type { RunRead } from "@/lib/run-reads";
import { allTimeLine, type CoverageLine, type TokenMeta } from "@/lib/dashboard-view";

/** Under the wallet's cards: everything paid from this browser, and what the
 *  figures stand on (spec §3.3). Nothing until every read has settled. */
export default function PaidTotals({ reads, tokens, meta, coverage }: {
  reads: RunRead[] | undefined;
  tokens: Address[];
  meta: Record<string, TokenMeta> | undefined;
  coverage: CoverageLine | undefined;
}) {
  return (
    <Col span={12}>
      {reads && meta && coverage && !coverage.tilesBlank && (
        <p className="all-time">All time, from runs sent from this browser: {allTimeLine(reads, tokens, meta)}</p>
      )}
      {coverage && <p className="coverage-line">{coverage.text}</p>}
    </Col>
  );
}
