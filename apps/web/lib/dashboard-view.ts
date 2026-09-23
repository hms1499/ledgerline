import { formatAmount, short } from "@/lib/chain";
import type { Coverage, RunRead } from "@/lib/run-reads";

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
  const attentionNote = c.attention.length === 0 ? undefined
    : c.attention.length === 1
      ? "1 run has a payment that needs a look. It is left out of the totals."
      : `${c.attention.length} runs have a payment that needs a look. They are left out of the totals.`;

  if (c.missing.length === 0) {
    return { tone: "plain", retry: false, tilesBlank: false, attentionNote,
      text: `From ${c.covered} of ${c.total} runs sent from this browser, read from Arc ${networkName}.` };
  }
  if (c.covered === 0) {
    return { tone: "warning", retry: true, tilesBlank: true, attentionNote,
      text: `None of the ${runs(c.total)} could be read, so there are no totals to show.` };
  }
  return { tone: "warning", retry: true, tilesBlank: false, attentionNote,
    text: `Totals cover ${c.covered} of ${c.total} runs. ${c.missing.length} could not be read.` };
}

export const RUN_STATUS: Record<RunRead["state"], { label: string; color: "success" | "warning" | "error" | "default" }> = {
  read: { label: "Read", color: "success" },
  attention: { label: "Needs a look", color: "warning" },
  not_found: { label: "Not found", color: "default" },
  reverted: { label: "Reverted", color: "error" },
  unreadable: { label: "Couldn't read", color: "warning" },
};

export interface TokenMeta { decimals?: number; symbol?: string }

/** Decimals come from the chain or not at all — a guess is how 10^12 errors happen. */
export function amountText(value: bigint, token: string, meta: TokenMeta): string {
  if (meta.decimals === undefined) return `${value} (${short(token)})`;
  return `${formatAmount(value, meta.decimals)} ${meta.symbol || short(token)}`;
}

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
