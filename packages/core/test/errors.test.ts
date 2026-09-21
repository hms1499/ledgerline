import { describe, it, expect } from "vitest";
import { extractRevertData, explainRevert, RUN_EXISTS_SELECTOR, EMPTY_RUN_SELECTOR } from "../src/errors.js";

describe("selectors", () => {
  it("matches the selectors the chain actually returns", () => {
    // Measured against Arc testnet: a replayed run reverts with 0xc0d6b579.
    expect(RUN_EXISTS_SELECTOR).toBe("0xc0d6b579");
    expect(EMPTY_RUN_SELECTOR).toBe("0x0e203b22");
  });
});

describe("extractRevertData", () => {
  it("finds data on the error itself", () => {
    expect(extractRevertData({ data: "0xc0d6b579" })).toBe("0xc0d6b579");
  });

  it("finds data nested under cause, as viem wraps it", () => {
    const err = { message: "execution reverted", cause: { cause: { data: "0xc0d6b579" } } };
    expect(extractRevertData(err)).toBe("0xc0d6b579");
  });

  it("finds data on a viem-shaped { data: { data } } object", () => {
    expect(extractRevertData({ cause: { data: { data: "0xc0d6b579" } } })).toBe("0xc0d6b579");
  });

  it("returns undefined when there is no revert data", () => {
    expect(extractRevertData(new Error("boom"))).toBeUndefined();
    expect(extractRevertData(undefined)).toBeUndefined();
    expect(extractRevertData({ data: "not hex" })).toBeUndefined();
  });

  it("does not loop forever on a cyclic error", () => {
    const a: Record<string, unknown> = {};
    a.cause = a;
    expect(extractRevertData(a)).toBeUndefined();
  });
});

describe("explainRevert", () => {
  it("names RunExists and says what it means", () => {
    const r = explainRevert({ cause: { data: "0xc0d6b579" } });
    expect(r.name).toBe("RunExists");
    expect(r.message).toMatch(/already been committed/i);
    expect(r.message).toMatch(/run label/i);
  });

  it("names EmptyRun", () => {
    expect(explainRevert({ data: "0x0e203b22" }).name).toBe("EmptyRun");
  });

  it("reports an unknown selector honestly rather than guessing", () => {
    const r = explainRevert({ data: "0xdeadbeef" });
    expect(r.name).toBeUndefined();
    expect(r.message).toMatch(/0xdeadbeef/);
  });

  it("falls back to the error message when there is no revert data", () => {
    expect(explainRevert(new Error("network down")).message).toMatch(/network down/);
  });
});
