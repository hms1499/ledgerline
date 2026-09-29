/**
 * The walkthrough's fixed data: the file it uploads, what one take spends,
 * what stops a take before it starts, and the words on screen.
 * Spec: docs/superpowers/specs/2026-09-29-walkthrough-video-design.md §2–§3.
 */
import type { DemoNetwork } from "./demo-wallet.js";

/** What one take pays, in each token's base units (USDC and EURC 6
 *  decimals, cirBTC 8), once the file's two mistakes are fixed. */
export const SPEND = { USDC: 20_000n, EURC: 10_000n, cirBTC: 10n } as const;
/** Kept back in USDC for fees: a run costs about 0.007 USDC on Arc. */
export const FEE_BUFFER_USDC = 20_000n;

const DECIMALS = { USDC: 6, EURC: 6, cirBTC: 8 } as const;
type Symbol = keyof typeof DECIMALS;

const figure = (v: bigint, d: number) => {
  const base = 10n ** BigInt(d);
  const frac = (v % base).toString().padStart(d, "0").replace(/0+$/, "");
  return `${v / base}${frac ? `.${frac}` : ""}`;
};

/** `USD` is an unknown token the Review step offers to fix; `1000` EURC is
 *  more than the demo wallet holds on either network (testnet held 37.2
 *  EURC on 2026-09-29), which brings up the Safe treasury block. */
export function walkthroughCsv(recipient: string): string {
  return [
    "invoiceId,token,to,amount",
    `INV-V-001,USDC,${recipient},0.01`,
    `INV-V-002,USD,${recipient},0.01`,
    `INV-V-003,EURC,${recipient},1000`,
    `INV-V-004,cirBTC,${recipient},0.0000001`,
  ].join("\n") + "\n";
}

export function shortfalls(held: Record<Symbol, bigint>): string[] {
  const need: Record<Symbol, bigint> = { USDC: SPEND.USDC + FEE_BUFFER_USDC, EURC: SPEND.EURC, cirBTC: SPEND.cirBTC };
  return (Object.keys(need) as Symbol[])
    .filter((s) => held[s] < need[s])
    .map((s) => `${s}: holds ${figure(held[s], DECIMALS[s])}, needs ${figure(need[s], DECIMALS[s])}${s === "USDC" ? " including fees" : ""}`);
}

/**
 * A take's run name: its UTC day and minute. Each run name gives the run its
 * own salt and its own run id, so a name used twice with the same list is
 * refused on chain (RunExists). Numbering takes from the folders on disk
 * brought a paid name back once its folder was deleted; the clock cannot.
 */
export function runNameAt(now: Date, taken: readonly string[]): string {
  const iso = now.toISOString();
  const name = `video-${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  if (taken.includes(name)) throw new Error(`a take named ${name} already exists; wait a minute and record again`);
  return name;
}

const CHAIN: Record<DemoNetwork, number> = { mainnet: 5042, testnet: 5042002 };

export function assertChain(chainId: number, network: DemoNetwork): void {
  if (chainId !== CHAIN[network]) {
    throw new Error(`wrong chain: the RPC reports ${chainId}, Arc ${network} is ${CHAIN[network]}`);
  }
}

export const CAPTIONS = {
  home: ["Ledgerline", "Pay a list of invoices on Arc in one transaction"],
  tokens: ["Ledgerline", "USDC, EURC and cirBTC, each payment carrying its invoice"],
  upload: ["1 · Upload", "A payout list as CSV: one line per invoice"],
  review: ["2 · Review", "Mistakes are found in your browser and fixed in place"],
  fixed: ["2 · Review", "One click, and the line names a real token"],
  funding: ["3 · Fund", "Before anything is signed: can this wallet pay it?"],
  safe: ["3 · Fund", "Paying from a Safe? It says exactly what to send, and where"],
  trim: ["3 · Fund", "Or change the line. Every token is now covered"],
  check: ["4 · Check", "Every payment is tried against Arc before money moves"],
  pay: ["5 · Pay", "One transaction pays every invoice, in three tokens"],
  paid: ["5 · Pay", "Paid, with a receipt link for each recipient"],
  receipt: ["6 · Receipt", "The recipient's browser checks the payment against the chain"],
  checks: ["6 · Receipt", "Six checks. None of them asks Ledgerline anything"],
  withoutFile: ["7 · Reconcile", "Without the payer's file, the run still reads from the chain"],
  run: ["7 · Reconcile", "The payer's saved file matches what was recorded on chain"],
  matched: ["7 · Reconcile", "Every invoice matched to the payment that settled it"],
  dashboard: ["8 · Dashboard", "What needs you, and what each token paid this month"],
} as const satisfies Record<string, readonly [string, string]>;
export type CaptionKey = keyof typeof CAPTIONS;
