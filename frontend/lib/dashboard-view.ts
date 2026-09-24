import type { Coverage, RunRead } from "@/lib/run-reads";
import { amountText, type TokenMeta } from "@/lib/token-meta";

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

export function coverageView(c: Coverage, networkName: string): CoverageView {
  // An attention run's clean payments are still counted — only its broken
  // payment is left out (spec §4.2). The copy must not read as "the whole
  // run is excluded" (Important 1).
  const attentionNote = c.attention.length === 0 ? undefined
    : c.attention.length === 1
      ? "1 run has a payment that needs a look. That payment is left out of the totals; the run's other payments are counted."
      : `${c.attention.length} runs have a payment that needs a look. Those payments are left out of the totals; the runs' other payments are counted.`;

  if (c.missing.length === 0) {
    const text = c.total === 1
      ? `From the 1 run sent from this browser, read from Arc ${networkName}.`
      : `From ${c.covered} of ${c.total} runs sent from this browser, read from Arc ${networkName}.`;
    return { tone: "plain", retry: false, tilesBlank: false, attentionNote, text };
  }
  if (c.covered === 0) {
    return { tone: "warning", retry: true, tilesBlank: true, attentionNote,
      text: `None of the ${runs(c.total)} could be read, so there are no totals to show.` };
  }
  return { tone: "warning", retry: true, tilesBlank: false, attentionNote,
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
  not_found: { label: "Not found", color: "default" },
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
