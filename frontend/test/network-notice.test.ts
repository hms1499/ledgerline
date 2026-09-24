import { describe, it, expect } from "vitest";
import { networkFor } from "@/lib/chain";
import { realFundsNotice } from "@/lib/network-notice";

const JARGON = /\b(manifests?|anchor\w*|salt|merkle|preflight|commit\w*|root|run label)\b/i;

describe("realFundsNotice — said before a mainnet payment, never on testnet", () => {
  it("says nothing on testnet, where tokens have no value", () => {
    expect(realFundsNotice(networkFor("testnet"))).toBeUndefined();
  });

  it("on mainnet, says real money moves and offers testnet to try first", () => {
    const n = realFundsNotice(networkFor("mainnet"));
    expect(n).toBeDefined();
    expect(n!.title).toMatch(/real money/i);
    expect(n!.body).toMatch(/recipient/i);
    expect(n!.tryHref).toBe("/new?n=testnet");
  });

  it("warns that the sample file's recipients are placeholders", () => {
    expect(realFundsNotice(networkFor("mainnet"))!.body).toMatch(/sample/i);
  });

  it("uses the payer's words, not the protocol's", () => {
    const n = realFundsNotice(networkFor("mainnet"))!;
    expect(n.title).not.toMatch(JARGON);
    expect(n.body).not.toMatch(JARGON);
  });
});
