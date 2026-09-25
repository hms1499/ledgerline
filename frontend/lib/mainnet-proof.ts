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
  /** The same 0.10 USDC through the standard Multicall3, the same day: an
   *  approval, then the batch. 0 of 1 referenced. */
  control: {
    referenced: 0,
    payments: 1,
    approveTx: "0x75663aaf2d6b41ffa656ad63f0e98739de59c24826deedfa6e0f5cdf52896c34",
    batchTx: "0x08c578c541dc40cd23d181e0f637a760e3ef7f71286fdc945196c434caed5905",
    /** Approval 55,438 + batch 58,755. */
    gasUsed: 114_193,
    allowance: "0.10 USDC",
  },
} as const;

export interface ComparisonRow {
  key: string;
  claim: string;
  ours: string;
  ordinary: string;
  /** The two sides do not differ, and the page says so. */
  same?: boolean;
}

const gas = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The proof and its control side by side, for a reader who should not have to
 * click to see the difference. Every cell is a measured figure; /why reads the
 * same two transactions live. The sender row is kept although it does not
 * differ: transferFrom leaves the payer as the sender, and the control is
 * what showed that.
 */
export function controlComparison(): ComparisonRow[] {
  const P = MAINNET_PROOF;
  const C = P.control;
  const n = P.payments.length;
  return [
    { key: "reference", claim: "Payments carrying their invoice", ours: `${n} of ${n}`, ordinary: `${C.referenced} of ${C.payments}` },
    { key: "signed", claim: "Transactions the payer signs", ours: "1", ordinary: "2 — an approval, then the batch" },
    { key: "allowance", claim: "Spending allowance handed to a contract", ours: "None", ordinary: C.allowance },
    { key: "sender", claim: "Sender the recipient sees", ours: "The payer", ordinary: "The payer", same: true },
    { key: "gas", claim: "Gas per payment", ours: gas(P.gasUsed / n), ordinary: gas(C.gasUsed / C.payments) },
  ];
}
