import { createPublicClient, http, TransactionReceiptNotFoundError } from "viem";
import { summarizeRun, type Address, type Hex, type RawLog, type RunSummary } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import type { RunRecord } from "@/lib/history";

export const READ_CONCURRENCY = 4;
export const READ_TIMEOUT_MS = 10_000;
/** A date is a courtesy line: one try, short, like lib/paid-at.ts. */
export const BLOCK_TIME_TIMEOUT_MS = 4_000;

export type RunRead =
  | { txHash: string; state: "read" | "attention"; summary: RunSummary; paidAt?: bigint }
  | { txHash: string; state: "not_found" | "reverted" }
  | { txHash: string; state: "unreadable"; reason: string };

export interface ReceiptLike { status: "success" | "reverted"; logs: RawLog[]; blockNumber?: bigint }
/** null means the node has no such transaction. */
export type GetReceipt = (txHash: Hex) => Promise<ReceiptLike | null>;
/** A block's timestamp, in unix seconds. */
export type GetBlockTime = (blockNumber: bigint) => Promise<bigint>;
export interface ReadOptions {
  getReceipt?: GetReceipt; getBlockTime?: GetBlockTime;
  concurrency?: number; timeoutMs?: number; blockTimeoutMs?: number;
}

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
        blockNumber: r.blockNumber,
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

function blockTimeReader(net: NetworkView): GetBlockTime {
  const client = createPublicClient({
    chain: net.chain,
    transport: http(net.defaultRpc, { timeout: BLOCK_TIME_TIMEOUT_MS, retryCount: 0 }),
  });
  return async (blockNumber) => (await client.getBlock({ blockNumber })).timestamp;
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
  getBlockTime?: GetBlockTime, blockTimeoutMs = BLOCK_TIME_TIMEOUT_MS,
): Promise<RunRead[]> {
  // history.ts dedupes on record, but a read must not trust that.
  const seen = new Set<string>();
  const unique = records.filter((r) => {
    const k = r.txHash.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // A run whose date cannot be read is still read: only the month figure
  // loses it (spec §5), so this never throws.
  const dateOf = async (blockNumber: bigint | undefined): Promise<bigint | undefined> => {
    if (!getBlockTime || blockNumber === undefined) return undefined;
    try {
      return await withTimeout(getBlockTime(blockNumber), blockTimeoutMs);
    } catch {
      return undefined;
    }
  };

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
          const state = summary.identityBroken > 0 ? "attention" : "read";
          const paidAt = await dateOf(receipt.blockNumber);
          out[i] = paidAt === undefined ? { txHash, state, summary } : { txHash, state, summary, paidAt };
        }
      } catch (err) {
        out[i] = { txHash, state: "unreadable", reason: err instanceof Error ? err.message : String(err) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out;
}

/** Each run's receipt, fetched by its known hash, and its block's time.
 *  Never searches history. `payer` is the connected wallet (spec §4.1) —
 *  the caller passes it explicitly rather than this reading it off each record. */
export function readRuns(records: Rec[], payer: Address, net: NetworkView, opts: ReadOptions = {}): Promise<RunRead[]> {
  return readRunsWith(
    records, payer, opts.getReceipt ?? receiptReader(net), summarizeRun,
    opts.concurrency ?? READ_CONCURRENCY, opts.timeoutMs ?? READ_TIMEOUT_MS,
    opts.getBlockTime ?? blockTimeReader(net), opts.blockTimeoutMs ?? BLOCK_TIME_TIMEOUT_MS,
  );
}

export interface Coverage { total: number; covered: number; missing: string[]; attention: string[] }

/** A reverted run moved nothing, so its zero is exact: covered, not missing. */
export function describeCoverage(reads: RunRead[]): Coverage {
  const missing = reads.filter((r) => r.state === "not_found" || r.state === "unreadable").map((r) => r.txHash);
  const attention = reads.filter((r) => r.state === "attention").map((r) => r.txHash);
  return { total: reads.length, covered: reads.length - missing.length, missing, attention };
}
