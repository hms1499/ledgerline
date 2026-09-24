import { describe, it, expect } from "vitest";
import { contractLine } from "@/lib/site-footer";

describe("contractLine", () => {
  it("names the contract by its short address and links its explorer page", () => {
    expect(contractLine({ anchor: "0xd4838881EcBa8320d456B8B65A07A0ac167F0890", explorer: "https://explorer.arc.io" }))
      .toEqual({
        short: "0xd483…0890",
        href: "https://explorer.arc.io/address/0xd4838881EcBa8320d456B8B65A07A0ac167F0890",
      });
  });
  it("says nothing when this deployment has no contract configured", () => {
    expect(contractLine({ anchor: undefined, explorer: "https://explorer.arc.io" })).toBeUndefined();
  });
});
