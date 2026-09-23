import { describe, it, expect } from "vitest";
import type { Address, Completeness, PaymentRecord, ReconcileRow } from "@ledgerline/core";
import {
  tokensToRead, runStatsView, reviewCount, STAT_LABELS, perTokenTotals, statusBreakdown,
} from "@/lib/run-view";

const USDC = "0x3600000000000000000000000000000000000000" as Address;
const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0" as Address;
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" as Address;
const pay = (token: Address) => ({ token, value: 1n } as unknown as PaymentRecord);
const row = (status: ReconcileRow["status"], token: Address) => ({ status, token } as unknown as ReconcileRow);

describe("tokensToRead — every token the run page prints an amount in", () => {
  it("includes a token that only an unpaid row uses", () => {
    // The defect: metadata was read for paid tokens only, so an owed-but-unpaid
    // cirBTC line rendered its amount with a guessed 6 decimals, 100x too large.
    const out = tokensToRead({ payments: [pay(USDC)], rows: [row("matched", USDC), row("unpaid", CIRBTC)] });
    expect(out.map((t) => t.toLowerCase())).toEqual([USDC.toLowerCase(), CIRBTC.toLowerCase()]);
  });
  it("lists each token once, whatever its case", () => {
    const out = tokensToRead({ payments: [pay(EURC)], rows: [row("matched", EURC.toLowerCase() as Address)] });
    expect(out).toEqual([EURC]);
  });
  it("is empty for an empty run", () => {
    expect(tokensToRead({ payments: [], rows: [] })).toEqual([]);
  });
});

const paid = (token: Address, value: bigint) => ({ token, value } as unknown as PaymentRecord);
const comp = (verdict: Completeness["verdict"], extra: Partial<Completeness> = {}): Completeness =>
  ({ verdict, found: 2, missing: 0, surplus: 0, note: "n", ...extra });
const meta = new Map([
  [USDC.toLowerCase(), { decimals: 6, symbol: "USDC" }],
  [CIRBTC.toLowerCase(), { decimals: 8, symbol: "cirBTC" }],
]);
const stats = (over: Partial<Parameters<typeof runStatsView>[0]> = {}) => runStatsView({
  payments: [paid(USDC, 100_000n), paid(CIRBTC, 1_000n), paid(USDC, 200_000n)],
  rows: [row("matched", USDC), row("matched", CIRBTC), row("matched", USDC)],
  completeness: comp("complete"), hasManifest: true, blockNumber: 1234567n, meta, ...over,
});

describe("runStatsView — the run page's four tiles", () => {
  it("always four, in a fixed order", () => {
    expect(stats().map((s) => s.label)).toEqual([...STAT_LABELS]);
  });

  it("Payments: the count, and one total per token in its own decimals, never pooled", () => {
    expect(stats()[0]).toMatchObject({ value: "3", sub: ["0.3 USDC", "0.00001 cirBTC"] });
  });

  it("Payments: a token without metadata shows its raw integer", () => {
    expect(stats({ payments: [paid(EURC, 5n)], rows: [row("matched", EURC)] })[0]!.sub)
      .toEqual(["5 (0xbEf5…21c1)"]);
  });

  it("Completeness: each verdict has a word and a tone", () => {
    expect(stats({ completeness: comp("complete") })[1]).toMatchObject({ value: "Complete", tone: "success" });
    expect(stats({ completeness: comp("incomplete", { missing: 2 }) })[1]).toMatchObject({ value: "2 missing", tone: "danger" });
    expect(stats({ completeness: comp("over", { surplus: 1 }) })[1]).toMatchObject({ value: "1 not on the list", tone: "danger" });
    expect(stats({ completeness: comp("unknown") })[1]).toMatchObject({ value: "Unknown", tone: "warning" });
  });

  it("Review: all matched, or how many to review, with per-status counts", () => {
    expect(stats()[2]).toMatchObject({ value: "All matched", tone: "success", sub: ["3 matched"] });
    const r = stats({ rows: [row("matched", USDC), row("unpaid", CIRBTC), row("amount_mismatch", USDC)] })[2]!;
    expect(r).toMatchObject({ value: "2 to review", tone: "warning" });
    expect(r.sub).toEqual(["1 not paid, 1 wrong amount, 1 matched"]);
  });

  it("Review: without a run file nothing is 'to review' — every payment is simply read from chain", () => {
    const r = stats({ hasManifest: false, rows: [row("unexpected", USDC), row("unexpected", USDC)] })[2]!;
    expect(r).toMatchObject({ value: "Read from chain", tone: undefined, sub: ["2 paid"] });
    expect(reviewCount([row("unexpected", USDC)], false)).toBe(0);
    expect(reviewCount([row("unexpected", USDC)], true)).toBe(1);
  });

  it("Recorded: the block, formatted", () => {
    expect(stats()[3]).toMatchObject({ value: "Block 1,234,567" });
  });
});

describe("perTokenTotals — the one sum the tiles and the table footer both read", () => {
  it("merges case variants of the same token, keeping the first-seen spelling and order", () => {
    const out = perTokenTotals([
      paid(CIRBTC, 1_000n),
      paid(USDC, 100_000n),
      paid(USDC.toLowerCase() as Address, 200_000n),
      paid(CIRBTC.toUpperCase() as Address, 500n),
    ]);
    expect(out).toEqual([
      { token: CIRBTC, total: 1_500n },
      { token: USDC, total: 300_000n },
    ]);
  });
});

describe("statusBreakdown — the one breakdown text the tiles and the table footer both read", () => {
  it("returns \"\" for no rows", () => {
    expect(statusBreakdown([], true)).toBe("");
    expect(statusBreakdown([], false)).toBe("");
  });
});
