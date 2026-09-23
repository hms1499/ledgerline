import { describe, it, expect } from "vitest";
import { encodeErrorResult } from "viem";
import {
  extractRevertData, explainRevert, explainCallFailure, RUN_EXISTS_SELECTOR, EMPTY_RUN_SELECTOR,
} from "../src/errors.js";

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
    expect(r.message).toMatch(/already been paid/i);
    expect(r.message).toMatch(/run name/i);
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

describe("explainCallFailure — why one payment in a preflight failed", () => {
  // Measured on Arc testnet 2026-09-23: a run simulated from an unfunded
  // payer. Memo reverts with MemoFailed(bytes) wrapping the token's own
  // Error(string).
  const MEASURED_NO_BALANCE =
    "0xed1966a200000000000000000000000000000000000000000000000000000000000000" +
    "20000000000000000000000000000000000000000000000000000000000000008408c379" +
    "a00000000000000000000000000000000000000000000000000000000000000020000000" +
    "000000000000000000000000000000000000000000000000000000002645524332303a20" +
    "7472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000" +
    "000000000000000000000000000000000000000000000000000000000000000000000000" +
    "00000000000000000000000000";

  it("reads an insufficient balance through Memo's wrapper", () => {
    const r = explainCallFailure(MEASURED_NO_BALANCE as `0x${string}`);
    expect(r.message).toMatch(/does not hold enough/i);
    expect(r.detail).toBe("ERC20: transfer amount exceeds balance");
  });

  it("passes an unrecognised token reason through verbatim rather than guessing", () => {
    const data = encodeErrorResult({
      abi: [{ type: "error", name: "MemoFailed", inputs: [{ type: "bytes" }] }],
      errorName: "MemoFailed",
      args: [encodeErrorResult({
        abi: [{ type: "error", name: "Error", inputs: [{ type: "string" }] }],
        errorName: "Error", args: ["some new reason"],
      })],
    });
    const r = explainCallFailure(data);
    expect(r.message).toBe("The token refused this transfer: some new reason");
  });

  it("explains the anchor's own errors", () => {
    expect(explainCallFailure(RUN_EXISTS_SELECTOR).message).toMatch(/already been paid/);
  });

  it("says so when there is no reason at all", () => {
    expect(explainCallFailure("0x").message).toMatch(/without giving a reason/);
  });

  it("does not throw on a wrapper whose payload is cut short", () => {
    // One undecodable row must not take the whole preflight screen with it.
    expect(explainCallFailure("0xed1966a2deadbeef").message).toMatch(/0xed1966a2/);
  });

  it("names an unknown selector instead of inventing a reason", () => {
    expect(explainCallFailure("0xdeadbeef").message).toMatch(/0xdeadbeef/);
  });
});
