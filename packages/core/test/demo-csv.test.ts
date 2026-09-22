import { describe, it, expect } from "vitest";
import { parseCsv, resolveRows, validateRun, tokensForChain, ARC_TESTNET_CHAIN_ID } from "../src/index.js";

const CSV = `invoiceId,token,to,amount
INV-BROWSER-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-BROWSER-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-BROWSER-003,cirBTC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.00001`;

describe("the demo CSV", () => {
  it("raises no warnings for one recipient in three tokens", () => {
    const { rows } = parseCsv(CSV);
    const decimals = {
      "0x3600000000000000000000000000000000000000": 6,
      "0x89b50855aa3be2f677cd6303cec089b5f319d72a": 6,
      "0xf0c4a4ce82a5746abaad9425360ab04fbba432bf": 8,
    };
    const resolved = resolveRows(rows, tokensForChain(ARC_TESTNET_CHAIN_ID), decimals);
    const { errors, warnings } = validateRun(resolved.items);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
