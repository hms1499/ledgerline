import { describe, it, expect } from "vitest";
import { keccak256, toHex } from "viem";

describe("toolchain", () => {
  it("has a working viem keccak256", () => {
    expect(keccak256(toHex("INV-001"))).toBe(
      "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7",
    );
  });
});
