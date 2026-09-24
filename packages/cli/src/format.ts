import type { Address, ReconcileRow, ReconcileStatus } from "@ledgerline/core";

const SEVERITY: Record<ReconcileStatus, number> = {
  unlinked: 0,
  unpaid: 1,
  recipient_mismatch: 2,
  amount_mismatch: 3,
  unexpected: 4,
  matched: 5,
};

/** Both fields are read from the token contract. A failed read leaves it out. */
export interface TokenMeta {
  decimals?: number;
  symbol?: string;
}

export function formatAmount(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const v = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Decimals come from the chain or not at all. Without them the amount prints
 * as the raw integer beside the token address — never in a guessed scale,
 * which would misstate a cirBTC amount by a hundredfold.
 */
export function amountText(value: bigint, token: Address, meta: Map<Address, TokenMeta>): string {
  const m = meta.get(token);
  if (m?.decimals === undefined) return `${value} (${short(token)})`;
  return `${formatAmount(value, m.decimals)} ${m.symbol || short(token)}`;
}

export interface FormattedRow {
  status: ReconcileStatus;
  line: string;
}

/**
 * Without a run file the reconciler marks every payment `unexpected`, because
 * there is no intent to compare against. Printed as is, that reads as a
 * warning on payments nobody has checked. It is a payment read from the
 * chain, and says so — the same wording as the web's run page.
 */
function statusLabel(status: ReconcileStatus, hasManifest: boolean): string {
  return status === "unexpected" && !hasManifest ? "paid" : status;
}

export function formatRows(
  rows: ReconcileRow[],
  meta: Map<Address, TokenMeta>,
  hasManifest: boolean,
): FormattedRow[] {
  return [...rows]
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status])
    .map((r) => {
      const parts = [
        statusLabel(r.status, hasManifest).padEnd(20),
        (r.invoiceId ?? "—").padEnd(16),
        r.to ? `${r.to.slice(0, 10)}…` : "—".padEnd(11),
        r.actual !== undefined ? amountText(r.actual, r.token, meta) : "—",
      ];
      if (r.status === "amount_mismatch" && r.expected !== undefined) {
        parts.push(`(expected ${amountText(r.expected, r.token, meta)})`);
      }
      return { status: r.status, line: parts.join("  ") };
    });
}
