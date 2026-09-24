import { describe, it, expect } from "vitest";
import { encodeErrorResult, type Hex } from "viem";
import { preflightRows } from "@/lib/preflight-view";

const noBalance = encodeErrorResult({
  abi: [{ type: "error", name: "Error", inputs: [{ type: "string" }] }],
  errorName: "Error", args: ["ERC20: transfer amount exceeds balance"],
});

const outcome = (success: boolean, returnData: Hex = "0x") => ({ success, returnData });

describe("preflightRows — one line per call in the simulated run", () => {
  it("labels call zero as recording the list and the rest by invoice", () => {
    const rows = preflightRows([outcome(true), outcome(true)], ["INV-1"]);
    expect(rows.map((r) => r.label)).toEqual(["Record the list on chain", "INV-1"]);
    expect(rows.every((r) => r.ok && !r.reason)).toBe(true);
  });

  it("carries the reason a payment failed, beside the invoice it belongs to", () => {
    const rows = preflightRows([outcome(true), outcome(true), outcome(false, noBalance)], ["INV-1", "INV-2"]);
    expect(rows[2]).toMatchObject({
      label: "INV-2", ok: false,
      reason: "The paying wallet does not hold enough of this token to cover this payment.",
      detail: "ERC20: transfer amount exceeds balance",
    });
  });
});
