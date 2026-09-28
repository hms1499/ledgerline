"use client";

import Link from "next/link";
import { Skeleton, Table, Tag, type TableColumnsType } from "antd";
import type { Address } from "@ledgerline/core";
import Tape from "@/components/ui/Tape";
import type { RunRecord } from "@/lib/history";
import type { RunRead } from "@/lib/run-reads";
import { excludedNote, paidLine, runStatus, whenText, type TokenMeta } from "@/lib/dashboard-view";

const RECENT = 5;

export default function RecentRuns({ records, reads, tokens, meta, runHref, allRunsHref }: {
  records: RunRecord[];
  reads: RunRead[] | undefined;
  tokens: Address[];
  meta: Record<string, TokenMeta> | undefined;
  runHref: (txHash: string, runLabel: string) => string;
  allRunsHref: string;
}) {
  const byHash = new Map((reads ?? []).map((r) => [r.txHash.toLowerCase(), r]));
  // A row fills in only when its amounts can be printed in the token's own decimals.
  const readOf = (r: RunRecord) => (meta ? byHash.get(r.txHash.toLowerCase()) : undefined);

  const columns: TableColumnsType<RunRecord> = [
    { title: "Run", dataIndex: "runLabel",
      render: (label: string) => label || <span style={{ color: "var(--ink-soft)" }}>unnamed</span> },
    { title: "When", key: "when", width: 210,
      render: (_, r) => {
        const read = readOf(r);
        return read ? whenText(read, r) : <Skeleton.Input active size="small" />;
      } },
    { title: "Paid", key: "paid",
      render: (_, r) => {
        const read = readOf(r);
        if (!read) return <Skeleton.Input active size="small" />;
        if (read.state === "read") return paidLine(read.summary.paid, tokens, meta!);
        // An attention run's figure leaves out its broken payments; say how
        // many, or it silently disagrees with the run's own page.
        if (read.state === "attention") {
          return `${paidLine(read.summary.paid, tokens, meta!)} · (${excludedNote(read.summary.identityBroken)})`;
        }
        return <span style={{ color: "var(--ink-soft)" }}>—</span>;
      } },
    { title: "Status", key: "status", width: 170,
      render: (_, r) => {
        const read = readOf(r);
        if (!read) return <Skeleton.Button active size="small" />;
        const s = runStatus(read, r);
        return <Tag color={s.color}>{s.label}</Tag>;
      } },
    { title: <span className="sr-only">Open</span>, key: "open", width: 80,
      render: (_, r) => <Link href={runHref(r.txHash, r.runLabel)}>Open</Link> },
  ];

  return (
    <Tape title="Recent runs">
      <Table<RunRecord>
        columns={columns}
        dataSource={records.slice(0, RECENT).map((r) => ({ ...r, key: r.txHash }))}
        pagination={false}
        size="middle"
        scroll={{ x: "max-content" }}
      />
      <p style={{ marginTop: 12, marginBottom: 0 }}><Link href={allRunsHref}>All runs →</Link></p>
    </Tape>
  );
}
