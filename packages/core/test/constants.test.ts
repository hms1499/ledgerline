import { describe, it, expect } from "vitest";
import { keccak256, toHex } from "viem";
import {
  MEMO_TOPIC,
  BEFORE_MEMO_TOPIC,
  TRANSFER_TOPIC,
  TRANSFER_SELECTOR,
  SYSTEM_EMITTER,
} from "../src/constants.js";

describe("constants", () => {
  it("derives the Memo event topic from its signature", () => {
    expect(keccak256(toHex("Memo(address,address,bytes32,bytes32,bytes,uint256)")))
      .toBe(MEMO_TOPIC);
  });

  it("derives the BeforeMemo topic", () => {
    expect(keccak256(toHex("BeforeMemo(uint256)"))).toBe(BEFORE_MEMO_TOPIC);
  });

  it("derives the Transfer topic", () => {
    expect(keccak256(toHex("Transfer(address,address,uint256)"))).toBe(TRANSFER_TOPIC);
  });

  it("uses the canonical ERC-20 transfer selector", () => {
    expect(TRANSFER_SELECTOR).toBe("0xa9059cbb");
  });

  it("stores the system emitter lowercased for comparison", () => {
    expect(SYSTEM_EMITTER).toBe(SYSTEM_EMITTER.toLowerCase());
  });
});
