/**
 * The coins in the home page's "Pays in" row: every token a run can pay in,
 * named as the token names itself (cirBTC, not CIRBTC), each stamped with its
 * currency's sign. test/pays-in.test.ts keeps the list in step with
 * tokensForChain, so the hero never offers a token the product does not pay.
 */
export const PAYS_IN = [
  { symbol: "USDC", glyph: "$" },
  { symbol: "EURC", glyph: "€" },
  { symbol: "cirBTC", glyph: "₿" },
] as const;
