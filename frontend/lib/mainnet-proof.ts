/**
 * The mainnet proof, measured on 2026-09-24 and recorded in
 * docs/notes/2026-09-24-mainnet-proof.md. Facts about one transaction, shown
 * on the home page with a link to check each one. test/mainnet-proof.test.ts
 * keeps this in step with the note, the README and the verifier.
 */
export const MAINNET_PROOF = {
  txHash: "0xaf3e61940847555a93ac9880a44c3f16e08a4ea80d2f43c69a28a949e738e4c0",
  block: 22_453_870,
  date: "2026-09-24",
  payments: ["0.10 USDC", "0.10 EURC", "0.00001 cirBTC"],
  checksPerReceipt: 5,
  /** 0.00559 USDC, rounded for display. */
  feeUsdc: "0.0056",
  gasUsed: 266_370,
  gasPriceGwei: 21,
  /** The same payment through the standard Multicall3: 0 of 1 referenced. */
  control: { referenced: 0, payments: 1 },
} as const;
