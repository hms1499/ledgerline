import { describe, it, expect } from "vitest";
import { summarizeRun, paidByToken, type RunSummary } from "../src/summary.js";
import type { Address, RawLog } from "../src/types.js";
import mainnet from "./fixtures/mainnet-2pay.json" with { type: "json" };
import testnet from "./fixtures/testnet-usdc-eurc.json" with { type: "json" };

const USDC = "0x3600000000000000000000000000000000000000" as Address;
const EURC_T = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address;
const CIRBTC_T = "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF" as Address;
const MAINNET_PAYER = "0x1111111111111111111111111111111111111111" as Address;
const TESTNET_PAYER = testnet.from as Address;

const mainnetLogs = mainnet.logs as unknown as RawLog[];
const testnetLogs = testnet.logs as unknown as RawLog[];

describe("summarizeRun — what one run paid, from its own logs", () => {
  it("counts USDC once despite the system emitter's second Transfer", () => {
    const s = summarizeRun(mainnetLogs, MAINNET_PAYER);
    expect(s.paid.get(USDC)).toEqual({ value: 3_500_000n, payments: 2 });
    expect(s.payments).toBe(2);
    expect(s.identityBroken).toBe(0);
  });

  it("in one transaction, neither doubles USDC nor halves EURC", () => {
    const s = summarizeRun(testnetLogs, TESTNET_PAYER);
    expect(s.paid.get(USDC)).toEqual({ value: 100_000n, payments: 1 });
    expect(s.paid.get(EURC_T)).toEqual({ value: 100_000n, payments: 1 });
    expect(s.payments).toBe(2);
  });

  it("matches the payer whatever its case", () => {
    const s = summarizeRun(testnetLogs, TESTNET_PAYER.toUpperCase().replace("0X", "0x") as Address);
    expect(s.payments).toBe(2);
  });

  it("ignores a run paid by someone else", () => {
    const s = summarizeRun(mainnetLogs, "0x2222222222222222222222222222222222222222");
    expect(s.paid.size).toBe(0);
    expect(s.payments).toBe(0);
  });

  it("returns nothing for logs without payments", () => {
    const s = summarizeRun([], MAINNET_PAYER);
    expect(s).toEqual({ paid: new Map(), payments: 0, identityBroken: 0 });
  });

  // M2: a broken payment whose memo sender isn't the payer must still be
  // flagged (and excluded), not silently dropped by the payer filter.
  it("flags a broken payment even when the memo sender isn't the payer, as long as the transfer sender is", () => {
    const MEMO_TOPIC = "0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4";
    const usdcTargetTopic = `0x000000000000000000000000${USDC.slice(2).toLowerCase()}`;
    const fakeSenderTopic = "0x000000000000000000000000deaddeaddeaddeaddeaddeaddeaddeaddeaddead";

    const tampered = testnetLogs.map((l) =>
      l.topics[0] === MEMO_TOPIC && l.topics[2]?.toLowerCase() === usdcTargetTopic
        ? { ...l, topics: [l.topics[0]!, fakeSenderTopic, l.topics[2]!, l.topics[3]!] as typeof l.topics }
        : l,
    );

    const s = summarizeRun(tampered, TESTNET_PAYER);
    expect(s.identityBroken).toBe(1);
    expect(s.paid.get(USDC)).toBeUndefined();
    expect(s.paid.get(EURC_T)).toEqual({ value: 100_000n, payments: 1 });
    expect(s.payments).toBe(1);
  });
});

describe("paidByToken — the tiles", () => {
  const run = (entries: [Address, bigint, number][], broken = 0): RunSummary => ({
    paid: new Map(entries.map(([t, value, payments]) => [t, { value, payments }])),
    payments: entries.reduce((n, [, , p]) => n + p, 0),
    identityBroken: broken,
  });

  it("lists every token in the order given, zero when never paid", () => {
    const totals = paidByToken([run([[USDC, 5n, 1]])], [USDC, EURC_T, CIRBTC_T]);
    expect(totals.map((t) => t.token)).toEqual([USDC, EURC_T, CIRBTC_T]);
    expect(totals[1]).toEqual({ token: EURC_T, value: 0n, payments: 0, runs: 0 });
    expect(totals[2]).toEqual({ token: CIRBTC_T, value: 0n, payments: 0, runs: 0 });
  });

  it("sums values and payments, and counts a run once per token it paid", () => {
    const totals = paidByToken(
      [run([[USDC, 5n, 2], [EURC_T, 7n, 1]]), run([[USDC, 1n, 1]]), run([])],
      [USDC, EURC_T],
    );
    expect(totals[0]).toEqual({ token: USDC, value: 6n, payments: 3, runs: 2 });
    expect(totals[1]).toEqual({ token: EURC_T, value: 7n, payments: 1, runs: 1 });
  });

  it("matches tokens given in any case", () => {
    const totals = paidByToken([run([[EURC_T, 7n, 1]])], [EURC_T.toLowerCase() as Address]);
    expect(totals[0]!.value).toBe(7n);
    expect(totals[0]!.token).toBe(EURC_T);
  });

  it("totals a real mainnet run", () => {
    const [usdc] = paidByToken([summarizeRun(mainnetLogs, MAINNET_PAYER)], [USDC]);
    expect(usdc).toEqual({ token: USDC, value: 3_500_000n, payments: 2, runs: 1 });
  });
});
