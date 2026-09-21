import { describe, it, expect } from "vitest";
import { assessBatch } from "../src/compare.js";
import type { Address, RawLog } from "../src/types.js";
import fixture from "./fixtures/mainnet-2pay.json" with { type: "json" };

const logs = fixture.logs as unknown as RawLog[];
const PAYER = "0x1111111111111111111111111111111111111111" as Address;
const MEMO_TOPIC = "0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4";

/** The same two payments, stripped of every reference — an ordinary batch. */
const unreferenced = logs.filter((l) => l.topics[0] !== MEMO_TOPIC);

describe("assessBatch", () => {
  it("counts every payment as referenced in a memo'd run", () => {
    const a = assessBatch(logs, PAYER);
    expect(a.payments).toBe(2);
    expect(a.referenced).toBe(2);
  });

  it("finds no references in an ordinary batch of the same payments", () => {
    const a = assessBatch(unreferenced, PAYER);
    expect(a.payments).toBe(2);
    expect(a.referenced).toBe(0);
  });

  it("still sees the payer behind an unreferenced batch", () => {
    // transferFrom(from, ...) emits Transfer(from, ...), so routing through a
    // standard batcher does not hide the payer. Measured on testnet; the spec
    // claimed otherwise and was wrong.
    const a = assessBatch(unreferenced, PAYER);
    expect(a.payerVisible).toBe(true);
    expect(a.senders).toEqual([PAYER]);
  });

  it("reports the payer hidden when a custodial batcher pays from its own balance", () => {
    const batcher = "0xd9C48e577F49031d0C2193F2a1d9e3C964Ce3212" as Address;
    const custodial = unreferenced.map((l) =>
      l.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        ? { ...l, topics: [l.topics[0]!, `0x000000000000000000000000${batcher.slice(2)}`, l.topics[2]!] }
        : l,
    ) as RawLog[];

    const a = assessBatch(custodial, PAYER);
    expect(a.payerVisible).toBe(false);
    expect(a.senders).toEqual([batcher]);
  });

  it("ignores the system emitter, so USDC is totalled once not twice", () => {
    const a = assessBatch(logs, PAYER);
    expect(a.totals).toEqual([
      { token: "0x3600000000000000000000000000000000000000", value: 3_500_000n },
    ]);
  });

  it("compares the payer case-insensitively", () => {
    const a = assessBatch(logs, PAYER.toUpperCase().replace("0X", "0x") as Address);
    expect(a.payerVisible).toBe(true);
  });

  it("reports an empty transaction as nothing paid, not as a failure", () => {
    const a = assessBatch([], PAYER);
    expect(a).toEqual({
      payments: 0,
      referenced: 0,
      senders: [],
      payerVisible: false,
      totals: [],
    });
  });
});
