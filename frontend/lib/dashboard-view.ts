import { paidByToken, type Address, type TokenTotal } from "@ledgerline/core";
import type { Coverage, RunRead } from "@/lib/run-reads";
import type { RunRecord } from "@/lib/history";
import { amountText, type TokenMeta } from "@/lib/token-meta";
import { paidAtText } from "@/lib/receipt-view";
import { short } from "@/lib/chain";

export { amountText };
export type { TokenMeta };

export interface CoverageView {
  tone: "plain" | "warning";
  text: string;
  retry: boolean;
  attentionNote?: string;
  /** No run could be read: a 0 on a tile would be a claim, so show "—". */
  tilesBlank: boolean;
}

const runs = (n: number) => `${n} run${n === 1 ? "" : "s"}`;

// An attention run's clean payments are still counted — only its broken
// payment is left out (parent spec §4.2). The copy must not read as "the
// whole run is excluded" (Important 1).
function attentionNote(n: number): string | undefined {
  if (n === 0) return undefined;
  return n === 1
    ? "1 run has a payment that needs a look. That payment is left out of the totals; the run's other payments are counted."
    : `${n} runs have a payment that needs a look. Those payments are left out of the totals; the runs' other payments are counted.`;
}

export function coverageView(c: Coverage, networkName: string): CoverageView {
  const note = attentionNote(c.attention.length);

  if (c.missing.length === 0) {
    const text = c.total === 1
      ? `From the 1 run sent from this browser, read from Arc ${networkName}.`
      : `From ${c.covered} of ${c.total} runs sent from this browser, read from Arc ${networkName}.`;
    return { tone: "plain", retry: false, tilesBlank: false, attentionNote: note, text };
  }
  if (c.covered === 0) {
    return { tone: "warning", retry: true, tilesBlank: true, attentionNote: note,
      text: `None of the ${runs(c.total)} could be read, so there are no totals to show.` };
  }
  return { tone: "warning", retry: true, tilesBlank: false, attentionNote: note,
    text: `Totals cover ${c.covered} of ${c.total} runs. ${c.missing.length} could not be read.` };
}

/** For an `attention` run's Paid cell (Important 2): how many payments were
 *  left out of that run's own line, since the dashboard and `/run/[tx]`
 *  otherwise disagree on the figure with no explanation. */
export function excludedNote(n: number): string {
  return `${n} payment${n === 1 ? "" : "s"} excluded`;
}

export const RUN_STATUS: Record<RunRead["state"], { label: string; color: "success" | "warning" | "error" | "default" }> = {
  read: { label: "Read", color: "success" },
  attention: { label: "Needs a look", color: "warning" },
  // Also a run sent from this browser that has no receipt yet: "not found"
  // read as "lost" for a payment that may be minutes from landing.
  not_found: { label: "No receipt", color: "default" },
  reverted: { label: "Reverted", color: "error" },
  unreadable: { label: "Couldn't read", color: "warning" },
};

export function paidLine(
  paid: Map<string, { value: bigint }>, order: string[], meta: Record<string, TokenMeta>,
): string {
  const parts = order
    .map((t) => {
      const got = [...paid.entries()].find(([k]) => k.toLowerCase() === t.toLowerCase());
      return got ? amountText(got[1].value, t, meta[t.toLowerCase()] ?? {}) : undefined;
    })
    .filter((s): s is string => !!s);
  return parts.length ? parts.join(" · ") : "Nothing";
}

export type StatusColor = "success" | "warning" | "error" | "default";

/** A run's status in the payer's words (spec §3.3). "Read" used to mean paid. */
export function runStatus(read: RunRead, record: Pick<RunRecord, "awaitingReceipt">): { label: string; color: StatusColor } {
  switch (read.state) {
    case "read": return { label: "Paid", color: "success" };
    case "attention": {
      const n = read.summary.identityBroken;
      return { label: n === 1 ? "Check one payment" : `Check ${n} payments`, color: "warning" };
    }
    case "not_found":
      return record.awaitingReceipt ? { label: "Waiting", color: "default" } : { label: "Not found", color: "default" };
    case "reverted": return { label: "Didn't go through", color: "error" };
    case "unreadable": return { label: "Couldn't check", color: "warning" };
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/** True when a block's timestamp falls in `now`'s calendar month, in the
 *  viewer's own time zone (spec decision 2). */
export function inMonth(paidAt: bigint, now: Date): boolean {
  const d = new Date(Number(paidAt) * 1000);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** "September 2026": the heading over the month's tiles. */
export function monthTitle(now: Date): string {
  return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

type Counted = Extract<RunRead, { state: "read" | "attention" }>;
const counted = (reads: RunRead[]): Counted[] =>
  reads.filter((r): r is Counted => r.state === "read" || r.state === "attention");

/** This month's totals per token, from runs whose block is dated this month.
 *  A read run with no date is counted in `undated`, never guessed into a month. */
export function paidThisMonth(reads: RunRead[], tokens: Address[], now: Date): { totals: TokenTotal[]; undated: number } {
  const all = counted(reads);
  const dated = all.filter((r) => r.paidAt !== undefined);
  return {
    totals: paidByToken(dated.filter((r) => inMonth(r.paidAt!, now)).map((r) => r.summary), tokens),
    undated: all.length - dated.length,
  };
}

/** The all-time line under the tiles: tokens actually paid, in tile order. */
export function allTimeLine(reads: RunRead[], tokens: Address[], meta: Record<string, TokenMeta>): string {
  const paid = paidByToken(counted(reads).map((r) => r.summary), tokens).filter((t) => t.value > 0n);
  return paid.length
    ? paid.map((t) => amountText(t.value, t.token, meta[t.token.toLowerCase()] ?? {})).join(" · ")
    : "nothing yet";
}

export interface CoverageLine {
  text: string;
  /** No run could be read: a 0 on a tile would be a claim, so show "—". */
  tilesBlank: boolean;
}

/** The plain line under the totals (spec §3.3). Retry lives in Needs you, so
 *  this line only says what the figures stand on. */
export function coverageLine(c: Coverage, undated: number, networkName: string, now: Date): CoverageLine {
  if (c.total > 0 && c.covered === 0) {
    return { tilesBlank: true, text: `None of the ${runs(c.total)} could be read, so there are no totals to show.` };
  }
  const parts = [c.total === 1
    ? `From the 1 run sent from this browser, read from Arc ${networkName}.`
    : `From ${c.total} runs sent from this browser, read from Arc ${networkName}.`];
  const m = c.missing.length;
  if (m > 0) parts.push(`${runs(m)} could not be read and ${m === 1 ? "is" : "are"} not counted.`);
  const month = MONTHS[now.getMonth()];
  if (undated > 0) {
    parts.push(undated === 1
      ? `1 run's date could not be read, so it is left out of ${month}.`
      : `${undated} runs' dates could not be read, so they are left out of ${month}.`);
  }
  const note = attentionNote(c.attention.length);
  if (note) parts.push(note);
  return { tilesBlank: false, text: parts.join(" ") };
}

/** The runs whose read may settle their history entry: successes only. A
 *  reverted run stays until the payer removes it (spec decision 4). */
export function toSettle(reads: RunRead[]): string[] {
  return counted(reads).map((r) => r.txHash);
}

/** The When column: the block's time, "Sending…" while a sent run waits for
 *  its receipt, otherwise "—". Never the browser's clock. */
export function whenText(read: RunRead, record: Pick<RunRecord, "awaitingReceipt">, timeZone?: string): string {
  if ((read.state === "read" || read.state === "attention") && read.paidAt !== undefined) {
    return paidAtText(read.paidAt, timeZone);
  }
  if (read.state === "not_found" && record.awaitingReceipt) return "Sending…";
  return "—";
}

/** One wallet figure: "12.4 USDC", or "— USDC" when its balance could not be read. */
export function balanceText(value: bigint | undefined, token: string, meta: TokenMeta): string {
  if (value === undefined) return `— ${meta.symbol || short(token)}`;
  return amountText(value, token, meta);
}
