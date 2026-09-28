import { describe, it, expect } from "vitest";
import type { Address } from "viem";
import { readBalancesWith } from "@/lib/balances";

const A = "0x3600000000000000000000000000000000000000" as Address;
const B = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address;

describe("readBalancesWith — what the wallet holds, per token", () => {
  it("keys each balance by the lowercased token address", async () => {
    const got = await readBalancesWith([A, B], async (t) => (t === A ? 5n : 7n));
    expect(got).toEqual({ [A.toLowerCase()]: 5n, [B.toLowerCase()]: 7n });
  });

  it("leaves a token out when its read fails: unknown, never zero", async () => {
    const got = await readBalancesWith([A, B], async (t) => {
      if (t === B) throw new Error("rpc down");
      return 0n;
    });
    expect(got).toEqual({ [A.toLowerCase()]: 0n });
    expect(B.toLowerCase() in got).toBe(false);
  });
});
