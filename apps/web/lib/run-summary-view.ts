import { runIdFor, type Manifest } from "@ledgerline/core";
import { amountText, metaFor } from "@/lib/token-meta";

export interface SummaryItem { token: string; amount: bigint }
export interface SummarySource { items: SummaryItem[]; payer?: string; runId?: string }

/**
 * Which list the side summary describes. On Pay it is the prepared list —
 * exactly what the wallet is about to sign — never the draft it was built
 * from. With nothing prepared on Pay (a wallet change just reset it) it is
 * nothing, so the card never describes a run that is no longer the one
 * on screen.
 */
export function summarySource(
  step: number, draft: { rows: SummaryItem[] } | undefined, manifest: Manifest | undefined,
): SummarySource | undefined {
  if (step === 3) {
    return manifest
      ? { items: manifest.items, payer: manifest.payer, runId: runIdFor(manifest.payer, manifest.clientRunId) }
      : undefined;
  }
  if ((step === 1 || step === 2) && draft) return { items: draft.rows };
  return undefined;
}

export interface RunSummaryView { name: string; payments: string; toPay: string[]; runId?: string }

/** Requested amounts ("To pay"), one line per token in the chain's order. */
export function runSummaryView(
  runLabel: string, src: SummarySource, tokenOrder: string[],
  decimals: Record<string, number>, symbols: Record<string, string>,
): RunSummaryView {
  const totals = new Map<string, { token: string; total: bigint }>();
  for (const i of src.items) {
    const k = i.token.toLowerCase();
    totals.set(k, { token: i.token, total: (totals.get(k)?.total ?? 0n) + i.amount });
  }
  const rank = (t: string) => {
    const i = tokenOrder.findIndex((o) => o.toLowerCase() === t.toLowerCase());
    return i === -1 ? tokenOrder.length : i;
  };
  const toPay = [...totals.values()]
    .sort((a, b) => rank(a.token) - rank(b.token))
    .map(({ token, total }) => amountText(total, token, metaFor(token, decimals, symbols)));
  const n = src.items.length;
  return { name: runLabel, payments: `${n} payment${n === 1 ? "" : "s"}`, toPay, runId: src.runId };
}
