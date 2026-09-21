import type { Address, ReconcileRow, ReconcileStatus } from "@ledgerline/core";

const SEVERITY: Record<ReconcileStatus, number> = {
  unlinked: 0,
  unpaid: 1,
  recipient_mismatch: 2,
  amount_mismatch: 3,
  unexpected: 4,
  matched: 5,
};

export function formatAmount(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const v = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export interface FormattedRow {
  status: ReconcileStatus;
  line: string;
}

export function formatRows(
  rows: ReconcileRow[],
  decimalsByToken: Map<Address, number>,
): FormattedRow[] {
  return [...rows]
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status])
    .map((r) => {
      const d = decimalsByToken.get(r.token) ?? 6;
      const parts = [
        r.status.padEnd(20),
        (r.invoiceId ?? "—").padEnd(16),
        r.to ? `${r.to.slice(0, 10)}…` : "—".padEnd(11),
        r.actual !== undefined ? formatAmount(r.actual, d) : "—",
      ];
      if (r.status === "amount_mismatch" && r.expected !== undefined) {
        parts.push(`(expected ${formatAmount(r.expected, d)})`);
      }
      return { status: r.status, line: parts.join("  ") };
    });
}
