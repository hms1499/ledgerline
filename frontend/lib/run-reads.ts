import { createPublicClient, http, TransactionReceiptNotFoundError } from "viem";
import { summarizeRun, type Address, type Hex, type RawLog, type RunSummary } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import type { RunRecord } from "@/lib/history";

export const READ_CONCURRENCY = 4;
export const READ_TIMEOUT_MS = 10_000;

export type RunRead =
  | { txHash: string; state: "read" | "attention"; summary: RunSummary }
  | { txHash: string; state: "not_found" | "reverted" }
  | { txHash: string; state: "unreadable"; reason: string };

export interface ReceiptLike { status: "success" | "reverted"; logs: RawLog[] }
/** null means the node has no such transaction. */
export type GetReceipt = (txHash: Hex) => Promise<ReceiptLike | null>;
export interface ReadOptions { getReceipt?: GetReceipt; concurrency?: number; timeoutMs?: number }

type Summarize = (logs: RawLog[], payer: Address) => RunSummary;
type Rec = Pick<RunRecord, "txHash">;

function receiptReader(net: NetworkView): GetReceipt {
  // retryCount: 0 — viem's own retries must not outlive READ_TIMEOUT_MS;
  // withTimeout below is the only retry/timeout policy that governs a read.
  const client = createPublicClient({
    chain: net.chain,
    transport: http(net.defaultRpc, { timeout: READ_TIMEOUT_MS, retryCount: 0 }),
  });
  return async (hash) => {
    try {
      const r = await client.getTransactionReceipt({ hash });
      return {
        status: r.status,
        logs: r.logs.map((l, i) => ({
          address: l.address as Address, topics: l.topics as Hex[], data: l.data as Hex, logIndex: l.logIndex ?? i,
        })),
      };
    } catch (err) {
      if (err instanceof TransactionReceiptNotFoundError) return null;
      throw err;
    }
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`No answer from the network after ${ms / 1000}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Exported for tests: the pool, with the receipt reader and summariser injected.
 *  `payer` is always the connected wallet, passed explicitly (M1) — never a
 *  record's own stored `payer`, which is untrusted localStorage. */
export async function readRunsWith(
  records: Rec[], payer: Address, getReceipt: GetReceipt, summarize: Summarize,
  concurrency = READ_CONCURRENCY, timeoutMs = READ_TIMEOUT_MS,
): Promise<RunRead[]> {
  // history.ts dedupes on record, but a read must not trust that.
  const seen = new Set<string>();
  const unique = records.filter((r) => {
    const k = r.txHash.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const out: RunRead[] = new Array(unique.length);
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const i = next++;
      const { txHash } = unique[i]!;
      try {
        const receipt = await withTimeout(getReceipt(txHash as Hex), timeoutMs);
        if (!receipt) out[i] = { txHash, state: "not_found" };
        else if (receipt.status === "reverted") out[i] = { txHash, state: "reverted" };
        else {
          const summary = summarize(receipt.logs, payer);
          out[i] = { txHash, state: summary.identityBroken > 0 ? "attention" : "read", summary };
        }
      } catch (err) {
        out[i] = { txHash, state: "unreadable", reason: err instanceof Error ? err.message : String(err) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out;
}

/** Each run's receipt, fetched by its known hash. Never searches history.
 *  `payer` is the connected wallet (spec §4.1) — the caller passes it
 *  explicitly rather than this reading it off each record. */
export function readRuns(records: Rec[], payer: Address, net: NetworkView, opts: ReadOptions = {}): Promise<RunRead[]> {
  return readRunsWith(
    records, payer, opts.getReceipt ?? receiptReader(net), summarizeRun,
    opts.concurrency ?? READ_CONCURRENCY, opts.timeoutMs ?? READ_TIMEOUT_MS,
  );
}

export interface Coverage { total: number; covered: number; missing: string[]; attention: string[] }

/** A reverted run moved nothing, so its zero is exact: covered, not missing. */
export function describeCoverage(reads: RunRead[]): Coverage {
  const missing = reads.filter((r) => r.state === "not_found" || r.state === "unreadable").map((r) => r.txHash);
  const attention = reads.filter((r) => r.state === "attention").map((r) => r.txHash);
  return { total: reads.length, covered: reads.length - missing.length, missing, attention };
}
