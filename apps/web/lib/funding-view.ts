import type { Address, FundingLine } from "@ledgerline/core";
import { short } from "@/lib/chain";
import { amountFigure } from "@/lib/token-meta";

export interface FundingRow {
  key: string;
  symbol: string;
  need: string;
  hold?: string;
  state: "ok" | "short" | "unknown";
  shortBy?: string;
}

/**
 * The preview's answer to "can I pay this?", per token in its own decimals.
 *
 * The fee warning covers the one case that is certain rather than estimated:
 * Arc charges gas in USDC, so a wallet left with no USDC at all after the
 * payouts cannot send the transaction, however small the fee. A near-zero
 * remainder is not flagged — this screen has no fee estimate, and the
 * executor checks payouts plus the real fee before it signs.
 */
export function fundingView({
  lines, usdc, usdcHold, decimals, symbols,
}: {
  lines: FundingLine[];
  usdc: Address;
  /** Read separately, since a run may pay no USDC and still needs it for gas. */
  usdcHold: bigint | undefined;
  decimals: Record<string, number>;
  symbols: Record<string, string>;
}): { rows: FundingRow[]; short: number; feeWarning?: string } {
  const rows = lines.map((l): FundingRow => {
    const key = l.token.toLowerCase();
    const m = { decimals: decimals[key] };
    const row: FundingRow = {
      key,
      symbol: symbols[key] || short(l.token),
      need: amountFigure(l.need, l.token, m),
      hold: l.hold === undefined ? undefined : amountFigure(l.hold, l.token, m),
      state: l.hold === undefined ? "unknown" : l.short > 0n ? "short" : "ok",
    };
    if (l.short > 0n) row.shortBy = amountFigure(l.short, l.token, m);
    return row;
  });

  let feeWarning: string | undefined;
  if (usdcHold !== undefined) {
    const paidInUsdc = lines.find((l) => l.token.toLowerCase() === usdc.toLowerCase())?.need ?? 0n;
    // Exactly equal: the payouts are covered with nothing left for gas. Below
    // that, the USDC row already says it is short, and saying it twice is noise.
    if (usdcHold === paidInUsdc) {
      feeWarning = paidInUsdc > 0n
        ? "These payouts would use every USDC in the wallet, and Arc takes the network fee in USDC too. Add a little more USDC than the total."
        : "Arc takes the network fee in USDC, and this wallet holds none. Add a little USDC before sending, even though the run pays no USDC.";
    }
  }

  return { rows, short: rows.filter((r) => r.state === "short").length, feeWarning };
}
