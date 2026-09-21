import { joinPayments } from "./join.js";
import { decodeTransferLogs } from "./logs.js";
import type { Address, RawLog } from "./types.js";

/**
 * What one transaction's logs let a recipient establish on their own. Every
 * field is read from the logs, so a side-by-side comparison of two batchers
 * states only what each chain record actually supports.
 */
export interface BatchAssessment {
  /** Non-system Transfer logs: what the chain says moved. */
  payments: number;
  /** Payments joined to a reference by callDataHash. */
  referenced: number;
  /** Distinct Transfer.from values, in first-seen order. */
  senders: Address[];
  /** True when there was a payment and every Transfer.from is the payer. */
  payerVisible: boolean;
  /** Per-token totals, in first-seen order. */
  totals: { token: Address; value: bigint }[];
}

/**
 * Pure. Assess one transaction's payment evidence.
 *
 * `payerVisible` is the claim worth being careful about. `transferFrom(from,
 * ...)` emits `Transfer(from, ...)`, so an ordinary `Multicall3` batch leaves
 * the payer perfectly visible — measured on testnet, against a spec that had
 * claimed otherwise. Only a custodial batcher, paying out of its own balance,
 * replaces the payer with itself. The missing *reference* is the difference
 * that survives against every batcher shape.
 */
export function assessBatch(logs: RawLog[], payer: Address): BatchAssessment {
  const transfers = decodeTransferLogs(logs);
  const { payments: joined } = joinPayments(logs);

  const senders: Address[] = [];
  const totals: { token: Address; value: bigint }[] = [];

  for (const t of transfers) {
    if (!senders.some((s) => s.toLowerCase() === t.from.toLowerCase())) senders.push(t.from);
    const row = totals.find((x) => x.token.toLowerCase() === t.token.toLowerCase());
    if (row) row.value += t.value;
    else totals.push({ token: t.token, value: t.value });
  }

  return {
    payments: transfers.length,
    referenced: joined.length,
    senders,
    payerVisible:
      transfers.length > 0 &&
      transfers.every((t) => t.from.toLowerCase() === payer.toLowerCase()),
    totals,
  };
}
