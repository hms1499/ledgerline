import type { Address, ReconcileResult } from "@ledgerline/core";

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
