import { describe, it, expect } from "vitest";
import type { Address, PaymentRecord, ReconcileRow } from "@ledgerline/core";
import { tokensToRead } from "@/lib/run-view";

const USDC = "0x3600000000000000000000000000000000000000" as Address;
const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0" as Address;
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" as Address;
const pay = (token: Address) => ({ token, value: 1n } as unknown as PaymentRecord);
const row = (status: ReconcileRow["status"], token: Address) => ({ status, token } as unknown as ReconcileRow);

describe("tokensToRead — every token the run page prints an amount in", () => {
  it("includes a token that only an unpaid row uses", () => {
    // The defect: metadata was read for paid tokens only, so an owed-but-unpaid
    // cirBTC line rendered its amount with a guessed 6 decimals, 100x too large.
    const out = tokensToRead({ payments: [pay(USDC)], rows: [row("matched", USDC), row("unpaid", CIRBTC)] });
    expect(out.map((t) => t.toLowerCase())).toEqual([USDC.toLowerCase(), CIRBTC.toLowerCase()]);
  });
  it("lists each token once, whatever its case", () => {
    const out = tokensToRead({ payments: [pay(EURC)], rows: [row("matched", EURC.toLowerCase() as Address)] });
    expect(out).toEqual([EURC]);
  });
  it("is empty for an empty run", () => {
    expect(tokensToRead({ payments: [], rows: [] })).toEqual([]);
  });
});
