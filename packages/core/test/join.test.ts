import { describe, it, expect } from "vitest";
import { joinPayments } from "../src/join.js";
import type { RawLog } from "../src/types.js";
import fixture from "./fixtures/mainnet-2pay.json" with { type: "json" };

const logs = fixture.logs as unknown as RawLog[];

describe("joinPayments", () => {
  it("joins both payments by callDataHash", () => {
    const { payments, unlinkedMemoIds } = joinPayments(logs);
    expect(payments).toHaveLength(2);
    expect(unlinkedMemoIds).toEqual([]);
  });

  it("carries the invoice reference and the real amounts", () => {
    const { payments } = joinPayments(logs);
    expect(payments[0]!.memoId).toBe(
      "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7",
    );
    expect(payments[0]!.value).toBe(1_000_000n);
    expect(payments[1]!.value).toBe(2_500_000n);
  });

  it("records the payer as the EOA, not the batching contract", () => {
    const { payments } = joinPayments(logs);
    for (const p of payments) {
      expect(p.payer.toLowerCase()).toBe("0x1111111111111111111111111111111111111111");
      expect(p.identityBroken).toBe(false);
    }
  });

  it("is independent of log order", () => {
    const shuffled = [...logs].reverse();
    const a = joinPayments(logs).payments.map((p) => p.memoId).sort();
    const b = joinPayments(shuffled).payments.map((p) => p.memoId).sort();
    expect(b).toEqual(a);
  });

  it("reports a memo with no matching transfer as unlinked", () => {
    const withoutTransfers = logs.filter(
      (l) => l.topics[0] !== "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );
    const { payments, unlinkedMemoIds } = joinPayments(withoutTransfers);
    expect(payments).toEqual([]);
    expect(unlinkedMemoIds).toHaveLength(2);
  });

  it("does not join a transfer whose amount was tampered with", () => {
    const tampered = logs.map((l) =>
      l.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        ? { ...l, data: ("0x" + (999n).toString(16).padStart(64, "0")) as `0x${string}` }
        : l,
    );
    const { unlinkedMemoIds } = joinPayments(tampered as RawLog[]);
    expect(unlinkedMemoIds).toHaveLength(2);
  });
});
