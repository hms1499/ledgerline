import { describe, it, expect } from "vitest";
import { memoIdFor } from "../src/memo.js";

const SALT = "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

describe("memoIdFor", () => {
  it("derives keccak256(runSalt ‖ invoiceId)", () => {
    expect(memoIdFor(SALT, "INV-US-001")).toBe(
      "0x8cf5f36075be5855e3561e3c04cd418ff8b943ad0b3951ad32167836da7fd270",
    );
    expect(memoIdFor(SALT, "INV-EU-002")).toBe(
      "0x9fb8233237109dbd92a4c1e0909917c1617d88ff5b1e13bd16c19a75b96d976d",
    );
  });

  it("is salt-dependent, so observers cannot read invoice ids", () => {
    const other = "0x0000000000000000000000000000000000000000000000000000000000000002" as const;
    expect(memoIdFor(SALT, "INV-US-001")).not.toBe(memoIdFor(other, "INV-US-001"));
  });

  it("rejects a salt that is not 32 bytes", () => {
    expect(() => memoIdFor("0x01", "INV-US-001")).toThrow(/32 bytes/);
  });

  it("rejects an empty invoiceId", () => {
    expect(() => memoIdFor(SALT, "")).toThrow(/empty/);
  });
});
