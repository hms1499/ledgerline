import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256 } from "viem";
import { normalizeRunLabel, saltMessageFor, saltFromSignature } from "../src/salt.js";
import { memoIdFor } from "../src/memo.js";

describe("normalizeRunLabel", () => {
  it("trims and collapses inner whitespace so a stray space cannot change the salt", () => {
    expect(normalizeRunLabel("  Payroll   2026-09 ")).toBe("Payroll 2026-09");
  });

  it("preserves case, because the label is shown to people", () => {
    expect(normalizeRunLabel("Payroll SEPT")).toBe("Payroll SEPT");
  });

  it("refuses an empty label, which would make every run share one salt", () => {
    expect(() => normalizeRunLabel("   ")).toThrow(/empty/i);
  });
});

describe("saltMessageFor", () => {
  it("binds the salt to the network and the label", () => {
    expect(saltMessageFor(5042002, "Payroll 2026-09")).toBe(
      "ledgerline-run-salt:v1:5042002:Payroll 2026-09",
    );
  });

  it("normalises the label before building the message", () => {
    expect(saltMessageFor(5042, "  Payroll  2026-09 ")).toBe(
      saltMessageFor(5042, "Payroll 2026-09"),
    );
  });

  it("gives a different message per chain, so testnet never reuses a mainnet salt", () => {
    expect(saltMessageFor(5042, "x")).not.toBe(saltMessageFor(5042002, "x"));
  });
});

describe("saltFromSignature", () => {
  it("is the keccak of the signature", () => {
    const sig = ("0x" + "ab".repeat(65)) as `0x${string}`;
    expect(saltFromSignature(sig)).toBe(keccak256(sig));
  });

  it("returns 32 bytes, which memoIdFor requires", () => {
    const sig = ("0x" + "cd".repeat(65)) as `0x${string}`;
    const salt = saltFromSignature(sig);
    expect(salt).toHaveLength(66);
    expect(() => memoIdFor(salt, "INV-1")).not.toThrow();
  });
});

describe("end to end", () => {
  const account = privateKeyToAccount(("0x" + "11".repeat(32)) as `0x${string}`);

  it("reproduces the same salt from the same key and label", async () => {
    const msg = saltMessageFor(5042002, "Payroll 2026-09");
    const a = saltFromSignature(await account.signMessage({ message: msg }));
    const b = saltFromSignature(await account.signMessage({ message: msg }));
    expect(b).toBe(a);
  });

  it("gives a different salt for a different label", async () => {
    const a = saltFromSignature(
      await account.signMessage({ message: saltMessageFor(5042002, "Payroll 2026-09") }));
    const b = saltFromSignature(
      await account.signMessage({ message: saltMessageFor(5042002, "Payroll 2026-10") }));
    expect(b).not.toBe(a);
  });

  it("gives a different salt for a different payer", async () => {
    const other = privateKeyToAccount(("0x" + "22".repeat(32)) as `0x${string}`);
    const msg = saltMessageFor(5042002, "Payroll 2026-09");
    const a = saltFromSignature(await account.signMessage({ message: msg }));
    const b = saltFromSignature(await other.signMessage({ message: msg }));
    expect(b).not.toBe(a);
  });
});
