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

/**
 * Splits `tokensToRead`'s tokens into ones a payment on this transaction
 * actually used, and ones only a loaded run file names. A paid token emitted
 * a Transfer on this chain, so a metadata read failing for it is a real RPC
 * problem and should still throw. A file-only token is named by data the
 * payer typed or uploaded, not by anything the chain confirmed — a run file
 * for the wrong network, say — so a failed read there should degrade to the
 * no-decimals display rather than take down the whole page (§3.4).
 */
export function splitTokensToRead(
  result: Pick<ReconcileResult, "rows" | "payments">,
): { paid: Address[]; fileOnly: Address[] } {
  const paidTokens = new Set(result.payments.map((p) => p.token.toLowerCase()));
  const paid: Address[] = [];
  const fileOnly: Address[] = [];
  for (const t of tokensToRead(result)) {
    (paidTokens.has(t.toLowerCase()) ? paid : fileOnly).push(t);
  }
  return { paid, fileOnly };
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

/**
 * Emitted Transfer values, per token, never pooled (invariant 5). The one sum
 * the tiles and the table footer both read — computed once so a later edit to
 * either display cannot make the page disagree with itself.
 */
export function perTokenTotals(payments: PaymentRecord[]): { token: string; total: bigint }[] {
  const seen = new Map<string, { token: string; total: bigint }>();
  for (const p of payments) {
    const k = p.token.toLowerCase();
    const entry = seen.get(k);
    if (entry) entry.total += p.value;
    else seen.set(k, { token: p.token, total: p.value });
  }
  return [...seen.values()];
}

/** The one status breakdown text the tiles and the table footer both read. */
export function statusBreakdown(rows: ReconcileRow[], hasManifest: boolean): string {
  const counts = new Map<ReconcileStatus, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => SEVERITY[a[0]] - SEVERITY[b[0]])
    .map(([s, n]) => `${n} ${statusView(s, hasManifest).label.toLowerCase()}`)
    .join(", ");
}

export function runStatsView({
  payments, rows, completeness: c, hasManifest, blockNumber, meta,
}: {
  payments: PaymentRecord[]; rows: ReconcileRow[]; completeness: Completeness;
  hasManifest: boolean; blockNumber: bigint; meta: Map<string, TokenMeta>;
}): StatView[] {
  const totals = perTokenTotals(payments);
  const breakdown = statusBreakdown(rows, hasManifest);

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
      sub: totals.map(({ token, total }) => amountText(total, token, meta.get(token.toLowerCase()) ?? {})),
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
