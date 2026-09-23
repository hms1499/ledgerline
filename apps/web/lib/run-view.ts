import type {
  Address, Completeness, PaymentRecord, ReconcileResult, ReconcileRow, ReconcileStatus,
} from "@ledgerline/core";
import { SEVERITY, statusView } from "@/lib/reconcile-view";
import { amountText, type TokenMeta } from "@/lib/token-meta";
import type { StatTone } from "@/components/ui/StatTile";

/**
 * Every token the run page prints an amount in: the ones paid, and the ones
 * a loaded run file says were owed but never paid. Reading only the paid ones
 * left an unpaid line's owed amount with no decimals to format it in.
 */
export function tokensToRead(result: Pick<ReconcileResult, "rows" | "payments">): Address[] {
  const seen = new Map<string, Address>();
  for (const t of [...result.payments.map((p) => p.token), ...result.rows.map((r) => r.token)]) {
    if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()];
}

export const STAT_LABELS = ["Payments", "Completeness", "Review", "Recorded"] as const;

export interface StatView {
  key: "payments" | "completeness" | "review" | "recorded";
  label: string;
  value: string;
  tone?: StatTone;
  sub: string[];
}

/**
 * Without a run file every payment is `unexpected` by definition — there is
 * no intent to compare against — so counting those as things to review would
 * contradict the completeness verdict beside them.
 */
export function reviewCount(rows: ReconcileRow[], hasManifest: boolean): number {
  return rows.filter((r) => r.status !== "matched" && !(r.status === "unexpected" && !hasManifest)).length;
}

export function runStatsView({
  payments, rows, completeness: c, hasManifest, blockNumber, meta,
}: {
  payments: PaymentRecord[]; rows: ReconcileRow[]; completeness: Completeness;
  hasManifest: boolean; blockNumber: bigint; meta: Map<string, TokenMeta>;
}): StatView[] {
  // Emitted Transfer values, per token, never pooled (invariant 5).
  const perToken = new Map<string, { token: string; total: bigint }>();
  for (const p of payments) {
    const k = p.token.toLowerCase();
    perToken.set(k, { token: p.token, total: (perToken.get(k)?.total ?? 0n) + p.value });
  }

  const counts = new Map<ReconcileStatus, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const breakdown = [...counts.entries()]
    .sort((a, b) => SEVERITY[a[0]] - SEVERITY[b[0]])
    .map(([s, n]) => `${n} ${statusView(s, hasManifest).label.toLowerCase()}`)
    .join(", ");

  const completeness: Record<Completeness["verdict"], { value: string; tone: StatTone }> = {
    complete: { value: "Complete", tone: "success" },
    incomplete: { value: `${c.missing} missing`, tone: "danger" },
    over: { value: `${c.surplus} not on the list`, tone: "danger" },
    unknown: { value: "Unknown", tone: "warning" },
  };

  const review = reviewCount(rows, hasManifest);

  return [
    {
      key: "payments", label: STAT_LABELS[0], value: String(payments.length),
      sub: [...perToken.values()].map(({ token, total }) =>
        amountText(total, token, meta.get(token.toLowerCase()) ?? {})),
    },
    { key: "completeness", label: STAT_LABELS[1], ...completeness[c.verdict], sub: [] },
    {
      key: "review", label: STAT_LABELS[2],
      value: review ? `${review} to review` : hasManifest ? "All matched" : "Read from chain",
      tone: review ? "warning" : hasManifest ? "success" : undefined,
      sub: breakdown ? [breakdown] : [],
    },
    { key: "recorded", label: STAT_LABELS[3], value: `Block ${blockNumber.toLocaleString("en-US")}`, sub: [] },
  ];
}
