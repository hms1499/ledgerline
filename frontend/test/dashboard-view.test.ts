import { describe, it, expect } from "vitest";
import { getAddress } from "viem";
import { tokensForChain, type Address, type RunSummary } from "@ledgerline/core";
import type { RunRead } from "@/lib/run-reads";
import {
  excludedNote, amountText, paidLine,
  runStatus, inMonth, monthTitle, paidThisMonth, allTimeLine, coverageLine, toSettle, toMarkReverted, whenText, balanceText,
  needsYou, feeHelp, setupSteps, STALE_AFTER_MS,
} from "@/lib/dashboard-view";
import type { RunRecord } from "@/lib/history";
import { FAUCET_URL } from "@/lib/wallet-help";

describe("excludedNote — the Paid cell's note for an attention run (Important 2)", () => {
  it("singular", () => {
    expect(excludedNote(1)).toBe("1 payment excluded");
  });

  it("plural", () => {
    expect(excludedNote(2)).toBe("2 payments excluded");
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
    expect(coverageLine({ total: 3, covered: 3, missing: [], attention: ["0x1", "0x2"] }, 0, "testnet", NOW).text).toContain(
      "2 runs have a payment that needs a look. Those payments are left out of the totals; the runs' other payments are counted.");
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

  it("marks reverted runs instead, so the run list says they did not go through", () => {
    expect(toMarkReverted([
      read("0x1", sum(1n)),
      { txHash: "0x3", state: "reverted" },
      { txHash: "0x4", state: "not_found" },
    ])).toEqual(["0x3"]);
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

describe("needsYou — what the payer has to do", () => {
  const PAYER = "0x5955000000000000000000000000000000000017";
  const T0 = new Date(2026, 8, 28, 14, 2).getTime(); // 14:02 local
  const record = (txHash: string, over: Partial<RunRecord> = {}): RunRecord => ({
    txHash, payer: PAYER, chainId: 5_042_002, runLabel: `Run ${txHash}`, seenAt: T0, itemCount: 1, ...over,
  });
  const FULL = { [T.USDC.toLowerCase()]: 5n, [T.EURC.toLowerCase()]: 0n, [T.cirBTC.toLowerCase()]: 0n };
  const base = { tokens: TOKENS, usdc: T.USDC as Address, now: T0 + 60_000 };

  it("says nothing until both the runs and the balances have been read", () => {
    const records = [record("0x1")];
    expect(needsYou({ ...base, records, reads: undefined, balances: FULL })).toBeUndefined();
    expect(needsYou({ ...base, records, reads: [read("0x1", sum(1n))], balances: undefined })).toBeUndefined();
  });

  it("an empty list when everything settled clean (an unpaid EURC balance is not a problem)", () => {
    expect(needsYou({ ...base, records: [record("0x1")], reads: [read("0x1", sum(1n))], balances: FULL })).toEqual([]);
  });

  it("a run that did not go through, named or unnamed", () => {
    const items = needsYou({ ...base, records: [record("0x1"), record("0x2", { runLabel: "" })],
      reads: [{ txHash: "0x1", state: "reverted" }, { txHash: "0x2", state: "reverted" }], balances: FULL })!;
    expect(items.map((i) => [i.kind, i.text, i.txHash])).toEqual([
      ["reverted", "Run 0x1 did not go through. No money moved.", "0x1"],
      ["reverted", "An unnamed run did not go through. No money moved.", "0x2"],
    ]);
  });

  it("a sent run with no receipt waits, then warns at exactly ten minutes", () => {
    const records = [record("0x1", { awaitingReceipt: true })];
    const reads: RunRead[] = [{ txHash: "0x1", state: "not_found" }];
    expect(needsYou({ ...base, records, reads, balances: FULL, now: T0 + STALE_AFTER_MS - 1 })![0]!.text)
      .toBe("Run 0x1 is waiting for the network (sent 14:02).");
    expect(needsYou({ ...base, records, reads, balances: FULL, now: T0 + STALE_AFTER_MS })![0]!.text).toBe(
      "Still no receipt for Run 0x1 after 10 minutes. Open your wallet's activity before sending this run again: " +
      "if it is still pending there, sending again could pay twice.");
  });

  it("a browser clock behind the recorded time still reads as waiting, never negative minutes", () => {
    const items = needsYou({ ...base, records: [record("0x1", { awaitingReceipt: true })],
      reads: [{ txHash: "0x1", state: "not_found" }], balances: FULL, now: T0 - 5 * 60_000 })!;
    expect(items[0]!.text).toBe("Run 0x1 is waiting for the network (sent 14:02).");
  });

  it("a missing receipt for a run not sent from here is not an item", () => {
    expect(needsYou({ ...base, records: [record("0x1")], reads: [{ txHash: "0x1", state: "not_found" }], balances: FULL }))
      .toEqual([]);
  });

  it("payments that need a look, in the singular and the plural", () => {
    const items = needsYou({ ...base, records: [record("0x1"), record("0x2")], balances: FULL, reads: [
      { txHash: "0x1", state: "attention", summary: sum(1n, 0n, 1) },
      { txHash: "0x2", state: "attention", summary: sum(1n, 0n, 2) },
    ] })!;
    expect(items.map((i) => i.text)).toEqual([
      "One payment in Run 0x1 needs a look.",
      "2 payments in Run 0x2 need a look.",
    ]);
  });

  it("unreadable runs make one item with their count", () => {
    const items = needsYou({ ...base, records: [record("0x1"), record("0x2")], balances: FULL, reads: [
      { txHash: "0x1", state: "unreadable", reason: "x" }, { txHash: "0x2", state: "unreadable", reason: "y" },
    ] })!;
    expect(items).toEqual([{ kind: "unreadable", key: "unreadable", text: "Couldn't reach Arc to check 2 runs." }]);
  });

  it("a balance that failed to read is not a zero: it asks for Retry, and never says No USDC", () => {
    const noUsdc = { [T.EURC.toLowerCase()]: 0n, [T.cirBTC.toLowerCase()]: 0n };
    const items = needsYou({ ...base, records: [record("0x1")], reads: [read("0x1", sum(1n))], balances: noUsdc })!;
    expect(items.map((i) => i.kind)).toEqual(["balances"]);
    expect(items[0]!.text).toBe("Couldn't read this wallet's balances.");
  });

  it("no USDC at all means no fee can be paid", () => {
    const items = needsYou({ ...base, records: [record("0x1")], reads: [read("0x1", sum(1n))],
      balances: { ...FULL, [T.USDC.toLowerCase()]: 0n } })!;
    expect(items).toEqual([{ kind: "no_fee", key: "no_fee",
      text: "No USDC left for network fees. Arc takes its fee in USDC, so no run can be sent." }]);
  });

  it("orders by kind, then keeps the history's newest-first order within a kind", () => {
    const records = ["0x1", "0x2", "0x3", "0x4", "0x5"].map((h) => record(h, { awaitingReceipt: h === "0x3" }));
    const items = needsYou({ ...base, records, balances: { [T.USDC.toLowerCase()]: 0n }, reads: [
      { txHash: "0x1", state: "unreadable", reason: "x" },
      { txHash: "0x2", state: "attention", summary: sum(1n, 0n, 1) },
      { txHash: "0x3", state: "not_found" },
      { txHash: "0x4", state: "reverted" },
      { txHash: "0x5", state: "reverted" },
    ] })!;
    expect(items.map((i) => i.kind)).toEqual(["reverted", "reverted", "waiting", "attention", "unreadable", "balances", "no_fee"]);
    expect(items.slice(0, 2).map((i) => i.txHash)).toEqual(["0x4", "0x5"]);
  });

  it("matches a read to its record whatever the hash's case", () => {
    const items = needsYou({ ...base, records: [record("0xAB")], reads: [{ txHash: "0xab", state: "reverted" }], balances: FULL })!;
    expect(items[0]!.text).toBe("Run 0xAB did not go through. No money moved.");
  });
});

describe("feeHelp / setupSteps — getting a first run out", () => {
  it("testnet links the faucet; mainnet has words only, since no link is verified", () => {
    expect(feeHelp("testnet")).toEqual({ text: "Get free test USDC at", link: { text: "faucet.circle.com", href: FAUCET_URL } });
    expect(feeHelp("mainnet")).toEqual({ text: "Add USDC to this wallet on Arc mainnet." });
  });

  const usdc = T.USDC as Address;
  const states = (s: ReturnType<typeof setupSteps>) => s.map((x) => [x.key, x.state]);

  it("four steps, in order, with the network named", () => {
    const s = setupSteps({ wrongChain: false, balances: { [usdc.toLowerCase()]: 5n }, usdc, network: "testnet" });
    expect(s.map((x) => x.title)).toEqual(["Wallet connected", "On Arc testnet", "USDC for network fees", "Send your first run"]);
    expect(states(s)).toEqual([["wallet", "done"], ["network", "done"], ["fees", "done"], ["first", "todo"]]);
  });

  it("the wrong network and an empty wallet are to do", () => {
    const s = setupSteps({ wrongChain: true, balances: { [usdc.toLowerCase()]: 0n }, usdc, network: "mainnet" });
    expect(states(s).slice(1, 3)).toEqual([["network", "todo"], ["fees", "todo"]]);
  });

  it("fees are loading while balances are read, and unknown when USDC's read failed", () => {
    expect(setupSteps({ wrongChain: false, balances: undefined, usdc, network: "testnet" })[2]!.state).toBe("loading");
    expect(setupSteps({ wrongChain: false, balances: {}, usdc, network: "testnet" })[2]!.state).toBe("unknown");
  });
});
