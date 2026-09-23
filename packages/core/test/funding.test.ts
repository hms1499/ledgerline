import { describe, it, expect } from "vitest";
import { totalsByToken, fundingFor } from "../src/funding.js";
import type { Address } from "../src/types.js";

const USDC = "0x3600000000000000000000000000000000000000" as Address;
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" as Address;
const R = "0x2222222222222222222222222222222222222222" as Address;

const items = [
  { token: USDC, to: R, amount: 100n },
  { token: EURC, to: R, amount: 7n },
  // Same token, different case: still one total, never two.
  { token: USDC.toLowerCase() as Address, to: R, amount: 50n },
];

describe("totalsByToken", () => {
  it("sums per token, case-insensitively, in first-appearance order", () => {
    expect(totalsByToken(items)).toEqual([
      { token: USDC, need: 150n },
      { token: EURC, need: 7n },
    ]);
  });
});

describe("fundingFor — can this wallet cover the run, token by token", () => {
  it("reports the shortfall per token and never pools tokens", () => {
    const lines = fundingFor(items, { [USDC.toLowerCase()]: 1000n, [EURC.toLowerCase()]: 5n });
    expect(lines).toEqual([
      { token: USDC, need: 150n, hold: 1000n, short: 0n },
      { token: EURC, need: 7n, hold: 5n, short: 2n },
    ]);
  });

  it("treats exactly enough as enough", () => {
    const [usdc] = fundingFor(items, { [USDC.toLowerCase()]: 150n });
    expect(usdc!.short).toBe(0n);
  });

  it("leaves a balance it could not read as unknown, not as zero", () => {
    // Zero would tell the payer they are short when nothing was measured.
    const [, eurc] = fundingFor(items, { [USDC.toLowerCase()]: 1000n });
    expect(eurc).toEqual({ token: EURC, need: 7n, hold: undefined, short: 0n });
  });
});
