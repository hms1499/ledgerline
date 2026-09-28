import { describe, it, expect } from "vitest";
import { getAddress } from "viem";
import { tokensForChain, type Address, type RunSummary } from "@ledgerline/core";
import type { RunRead } from "@/lib/run-reads";
import {
  coverageView, excludedNote, RUN_STATUS, amountText, paidLine,
  runStatus, inMonth, monthTitle, paidThisMonth, allTimeLine, coverageLine, toSettle, whenText, balanceText,
} from "@/lib/dashboard-view";

describe("coverageView — the line under the tiles", () => {
  it("all read: plain text naming the network", () => {
    const v = coverageView({ total: 12, covered: 12, missing: [], attention: [] }, "testnet");
    expect(v).toMatchObject({ tone: "plain", retry: false, tilesBlank: false });
    expect(v.text).toBe("From 12 of 12 runs sent from this browser, read from Arc testnet.");
  });

  it("all read, exactly one run: singular phrasing (M5)", () => {
    const v = coverageView({ total: 1, covered: 1, missing: [], attention: [] }, "testnet");
    expect(v).toMatchObject({ tone: "plain", retry: false, tilesBlank: false });
    expect(v.text).toBe("From the 1 run sent from this browser, read from Arc testnet.");
  });

  it("some missing: a warning with Retry, figures still shown", () => {
    const v = coverageView({ total: 12, covered: 11, missing: ["0x1"], attention: [] }, "testnet");
    expect(v).toMatchObject({ tone: "warning", retry: true, tilesBlank: false });
    expect(v.text).toBe("Totals cover 11 of 12 runs. 1 could not be read.");
  });

  it("none readable: the tiles go blank rather than claim zero", () => {
    const v = coverageView({ total: 3, covered: 0, missing: ["0x1", "0x2", "0x3"], attention: [] }, "mainnet");
    expect(v).toMatchObject({ tone: "warning", retry: true, tilesBlank: true });
    expect(v.text).toBe("None of the 3 runs could be read, so there are no totals to show.");
  });

  it("a run needing a look adds a note, in the singular and the plural (Important 1)", () => {
    expect(coverageView({ total: 2, covered: 2, missing: [], attention: ["0x1"] }, "testnet").attentionNote)
      .toBe("1 run has a payment that needs a look. That payment is left out of the totals; the run's other payments are counted.");
    expect(coverageView({ total: 3, covered: 3, missing: [], attention: ["0x1", "0x2"] }, "testnet").attentionNote)
      .toBe("2 runs have a payment that needs a look. Those payments are left out of the totals; the runs' other payments are counted.");
  });
});

describe("excludedNote — the Paid cell's note for an attention run (Important 2)", () => {
  it("singular", () => {
    expect(excludedNote(1)).toBe("1 payment excluded");
  });

  it("plural", () => {
    expect(excludedNote(2)).toBe("2 payments excluded");
  });
});

describe("RUN_STATUS", () => {
  it("names every state", () => {
    expect(Object.keys(RUN_STATUS).sort()).toEqual(["attention", "not_found", "read", "reverted", "unreadable"]);
    expect(RUN_STATUS.attention.label).toBe("Needs a look");
  });
});

describe("amountText / paidLine", () => {
  const T1 = "0x3600000000000000000000000000000000000000";
  const T2 = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

  it("formats with the chain's decimals and symbol", () => {
    expect(amountText(100_000n, T1, { decimals: 6, symbol: "USDC" })).toBe("0.1 USDC");
  });

  it("never guesses decimals: raw integer and a short address", () => {
    expect(amountText(100_000n, T2, {})).toBe("100000 (0x89B5…D72a)");
  });

  it("lists a run's tokens in the tile order, skipping unpaid ones", () => {
    const paid = new Map([[T2, { value: 100_000n }], [T1, { value: 100_000n }]]);
    const meta = { [T1.toLowerCase()]: { decimals: 6, symbol: "USDC" }, [T2.toLowerCase()]: { decimals: 6, symbol: "EURC" } };
    expect(paidLine(paid, [T1, T2, "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF"], meta)).toBe("0.1 USDC · 0.1 EURC");
    expect(paidLine(new Map(), [T1], meta)).toBe("Nothing");
  });
});

const T = tokensForChain(5_042_002);
const TOKENS = [T.USDC, T.EURC, T.cirBTC] as Address[];
const META = {
  [T.USDC.toLowerCase()]: { decimals: 6, symbol: "USDC" },
  [T.EURC.toLowerCase()]: { decimals: 6, symbol: "EURC" },
  [T.cirBTC.toLowerCase()]: { decimals: 8, symbol: "cirBTC" },
};
/** Seconds for a local wall-clock time, so a test holds in any time zone. */
const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
  BigInt(Math.floor(new Date(y, mo, d, h, mi, s).getTime() / 1000));
const NOW = new Date(2026, 8, 28, 12, 0); // 28 September 2026, local
const sum = (usdc: bigint, eurc = 0n, identityBroken = 0): RunSummary => {
  const paid = new Map<Address, { value: bigint; payments: number }>();
  if (usdc) paid.set(getAddress(T.USDC), { value: usdc, payments: 1 });
  if (eurc) paid.set(getAddress(T.EURC), { value: eurc, payments: 1 });
  return { paid, payments: paid.size, identityBroken };
};
const read = (txHash: string, s: RunSummary, paidAt?: bigint): RunRead =>
  paidAt === undefined ? { txHash, state: "read", summary: s } : { txHash, state: "read", summary: s, paidAt };

describe("runStatus — a run's status in the payer's words", () => {
  it("names each state plainly", () => {
    expect(runStatus(read("0x1", sum(1n)), {})).toEqual({ label: "Paid", color: "success" });
    expect(runStatus({ txHash: "0x1", state: "attention", summary: sum(1n, 0n, 1) }, {}))
      .toEqual({ label: "Check one payment", color: "warning" });
    expect(runStatus({ txHash: "0x1", state: "attention", summary: sum(1n, 0n, 3) }, {}))
      .toEqual({ label: "Check 3 payments", color: "warning" });
    expect(runStatus({ txHash: "0x1", state: "reverted" }, {})).toEqual({ label: "Didn't go through", color: "error" });
    expect(runStatus({ txHash: "0x1", state: "unreadable", reason: "x" }, {})).toEqual({ label: "Couldn't check", color: "warning" });
  });

  it("a missing receipt is Waiting for a run sent from here, Not found otherwise", () => {
    expect(runStatus({ txHash: "0x1", state: "not_found" }, { awaitingReceipt: true })).toEqual({ label: "Waiting", color: "default" });
    expect(runStatus({ txHash: "0x1", state: "not_found" }, {})).toEqual({ label: "Not found", color: "default" });
  });
});

describe("inMonth / monthTitle — the payer's own calendar month", () => {
  it("the first and last second of this month count; the seconds either side do not", () => {
    expect(inMonth(at(2026, 8, 1, 0, 0, 0), NOW)).toBe(true);
    expect(inMonth(at(2026, 8, 30, 23, 59, 59), NOW)).toBe(true);
    expect(inMonth(at(2026, 7, 31, 23, 59, 59), NOW)).toBe(false);
    expect(inMonth(at(2026, 9, 1, 0, 0, 0), NOW)).toBe(false);
  });

  it("the same month of another year does not count", () => {
    expect(inMonth(at(2025, 8, 15), NOW)).toBe(false);
  });

  it("names the month in full", () => {
    expect(monthTitle(NOW)).toBe("September 2026");
    expect(monthTitle(new Date(2027, 0, 1))).toBe("January 2027");
  });
});

describe("paidThisMonth / allTimeLine", () => {
  const reads: RunRead[] = [
    read("0x1", sum(100_000n, 50_000n), at(2026, 8, 23)),
    read("0x2", sum(200_000n), at(2026, 7, 20)),
    read("0x3", sum(300_000n)),
    { txHash: "0x4", state: "reverted" },
    { txHash: "0x5", state: "unreadable", reason: "x" },
  ];

  it("sums only runs dated this month, every token in order, zero when unpaid", () => {
    const m = paidThisMonth(reads, TOKENS, NOW);
    expect(m.totals.map((t) => t.value)).toEqual([100_000n, 50_000n, 0n]);
    expect(m.totals.map((t) => t.runs)).toEqual([1, 1, 0]);
  });

  it("counts a read run with no date as undated, never guessing its month", () => {
    expect(paidThisMonth(reads, TOKENS, NOW).undated).toBe(1);
  });

  it("an attention run's clean payments count toward the month", () => {
    const m = paidThisMonth([{ txHash: "0x6", state: "attention", summary: sum(70_000n, 0n, 1), paidAt: at(2026, 8, 2) }], TOKENS, NOW);
    expect(m.totals[0]!.value).toBe(70_000n);
  });

  it("the all-time line sums every read run, paid tokens only", () => {
    expect(allTimeLine(reads, TOKENS, META)).toBe("0.6 USDC · 0.05 EURC");
    expect(allTimeLine([{ txHash: "0x4", state: "reverted" }], TOKENS, META)).toBe("nothing yet");
  });
});

describe("coverageLine — what the totals stand on, in plain text", () => {
  it("one run, all read", () => {
    expect(coverageLine({ total: 1, covered: 1, missing: [], attention: [] }, 0, "testnet", NOW))
      .toEqual({ tilesBlank: false, text: "From the 1 run sent from this browser, read from Arc testnet." });
  });

  it("says what is missing and what has no date", () => {
    expect(coverageLine({ total: 12, covered: 11, missing: ["0x1"], attention: [] }, 1, "testnet", NOW).text).toBe(
      "From 12 runs sent from this browser, read from Arc testnet. 1 run could not be read and is not counted. " +
      "1 run's date could not be read, so it is left out of September.");
    expect(coverageLine({ total: 5, covered: 3, missing: ["0x1", "0x2"], attention: [] }, 2, "mainnet", NOW).text).toBe(
      "From 5 runs sent from this browser, read from Arc mainnet. 2 runs could not be read and are not counted. " +
      "2 runs' dates could not be read, so they are left out of September.");
  });

  it("keeps the note that a payment needing a look is left out", () => {
    expect(coverageLine({ total: 2, covered: 2, missing: [], attention: ["0x1"] }, 0, "testnet", NOW).text).toContain(
      "1 run has a payment that needs a look. That payment is left out of the totals; the run's other payments are counted.");
  });

  it("none readable: the tiles go blank rather than claim zero", () => {
    expect(coverageLine({ total: 3, covered: 0, missing: ["0x1", "0x2", "0x3"], attention: [] }, 0, "testnet", NOW))
      .toEqual({ tilesBlank: true, text: "None of the 3 runs could be read, so there are no totals to show." });
  });
});

describe("toSettle — a reverted run is never taken off the list here", () => {
  it("returns successes only", () => {
    expect(toSettle([
      read("0x1", sum(1n)),
      { txHash: "0x2", state: "attention", summary: sum(1n, 0n, 1) },
      { txHash: "0x3", state: "reverted" },
      { txHash: "0x4", state: "not_found" },
      { txHash: "0x5", state: "unreadable", reason: "x" },
    ])).toEqual(["0x1", "0x2"]);
  });
});

describe("whenText / balanceText", () => {
  it("dates a paid run by its block, in the viewer's zone", () => {
    expect(whenText(read("0x1", sum(1n), 1_790_145_433n), {}, "Asia/Ho_Chi_Minh")).toBe("23 Sep 2026, 13:37 GMT+7");
  });

  it("a sent run waiting for its receipt is Sending…; anything else undated is —", () => {
    expect(whenText({ txHash: "0x1", state: "not_found" }, { awaitingReceipt: true })).toBe("Sending…");
    expect(whenText({ txHash: "0x1", state: "not_found" }, {})).toBe("—");
    expect(whenText(read("0x1", sum(1n)), {})).toBe("—");
    expect(whenText({ txHash: "0x1", state: "reverted" }, {})).toBe("—");
  });

  it("a wallet figure in the token's decimals, or — when it could not be read", () => {
    expect(balanceText(36_807_197n, T.USDC, META[T.USDC.toLowerCase()]!)).toBe("36.807197 USDC");
    expect(balanceText(undefined, T.USDC, META[T.USDC.toLowerCase()]!)).toBe("— USDC");
    expect(balanceText(undefined, T.USDC, {})).toBe("— 0x3600…0000");
  });
});
