/**
 * The coins in the home page's "Pays in" row: every token a run can pay in,
 * named as the token names itself (cirBTC, not CIRBTC), each with its own
 * icon. test/pays-in.test.ts keeps the list in step with tokensForChain, so
 * the hero never offers a token the product does not pay.
 */
export const PAYS_IN = [
  { symbol: "USDC", icon: "/tokens/usdc.png" },
  { symbol: "EURC", icon: "/tokens/eurc.png" },
  { symbol: "cirBTC", icon: "/tokens/cirbtc.png" },
] as const;
