import { describe, it, expect } from "vitest";
import { isTxHash, TX_HASH_HINT } from "@/lib/tx-hash";

const H = "0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5";

describe("isTxHash", () => {
  it("takes a hash as pasted: spaces, a newline, capital hex", () => {
    expect(isTxHash(H)).toBe(true);
    expect(isTxHash(`  ${H}\n`)).toBe(true);
    expect(isTxHash("0x" + H.slice(2).toUpperCase())).toBe(true);
  });
  it("refuses an address, a short hash and anything else", () => {
    expect(isTxHash("0xe48A096B9E74f064b13c17734af29F85E02d732a")).toBe(false);
    expect(isTxHash(H.slice(0, 60))).toBe(false);
    expect(isTxHash(H.slice(2))).toBe(false);
    expect(isTxHash("")).toBe(false);
  });
  it("explains what a hash looks like", () => {
    expect(TX_HASH_HINT).toBe("That is not a transaction hash: it starts with 0x and has 64 more letters and digits.");
  });
});
