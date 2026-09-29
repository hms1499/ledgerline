import { describe, it, expect } from "vitest";
import { assertChain, CAPTIONS, FEE_BUFFER_USDC, nextRunName, shortfalls, SPEND, walkthroughCsv } from "./walkthrough.js";

const R = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

describe("walkthroughCsv", () => {
  it("has the two mistakes the video fixes, and pays the spend once they are fixed", () => {
    expect(walkthroughCsv(R)).toBe([
      "invoiceId,token,to,amount",
      `INV-V-001,USDC,${R},0.01`,
      `INV-V-002,USD,${R},0.01`,
      `INV-V-003,EURC,${R},25`,
      `INV-V-004,cirBTC,${R},0.0000001`,
    ].join("\n") + "\n");
    expect(SPEND).toEqual({ USDC: 20_000n, EURC: 10_000n, cirBTC: 10n });
  });
});

describe("shortfalls", () => {
  it("names each token the wallet cannot cover, fees counted in USDC", () => {
    const enough = { USDC: SPEND.USDC + FEE_BUFFER_USDC, EURC: SPEND.EURC, cirBTC: SPEND.cirBTC };
    expect(shortfalls(enough)).toEqual([]);
    expect(shortfalls({ ...enough, USDC: SPEND.USDC })).toEqual(["USDC: holds 0.02, needs 0.04 including fees"]);
    expect(shortfalls({ ...enough, cirBTC: 9n })).toEqual(["cirBTC: holds 0.00000009, needs 0.0000001"]);
  });
});

describe("nextRunName", () => {
  it("numbers the day's takes, never reusing a name", () => {
    expect(nextRunName("2026-09-29", [])).toBe("video-2026-09-29-t1");
    expect(nextRunName("2026-09-29", ["video-2026-09-29-t1", "video-2026-09-29-t3", "video-2026-09-28-t7"]))
      .toBe("video-2026-09-29-t4");
  });
});

describe("assertChain", () => {
  it("stops a take whose RPC is on the wrong chain", () => {
    expect(() => assertChain(5042, "mainnet")).not.toThrow();
    expect(() => assertChain(5042002, "mainnet")).toThrow(/wrong chain/);
    expect(() => assertChain(5042, "testnet")).toThrow(/wrong chain/);
  });
});

describe("CAPTIONS", () => {
  const JARGON = /\b(manifests?|anchor\w*|salt|merkle|preflight|commit\w*|root|run label)\b/i;
  it("each fits one line and speaks plainly", () => {
    for (const [key, [step, text]] of Object.entries(CAPTIONS)) {
      expect(text.length, key).toBeLessThanOrEqual(80);
      expect(step.length, key).toBeLessThanOrEqual(14);
      expect(text, key).not.toMatch(JARGON);
    }
  });
});
