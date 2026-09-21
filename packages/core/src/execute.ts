import { buildRun } from "./build.js";
import { MIN_MAX_FEE_WEI } from "./constants.js";
import { explainRevert } from "./errors.js";
import { buildPreflightData, decodePreflightResult, gasPolicy } from "./preflight.js";
import type { Address, Hex, Manifest, RawLog } from "./types.js";

/**
 * The one file in core that touches the network, and deliberately so.
 *
 * The script and the browser perform the same sequence, differing only at the
 * ends: signing with a private key versus a wallet, writing a file versus
 * offering a download. This project has already paid once for keeping two
 * copies of a sequence like that — testnet-run.ts and mainnet-run.ts were
 * merged because "two near-identical scripts drift, and drift costs real
 * money". The duplicated middle here contains the gas floor, so the argument
 * is stronger, not weaker.
 *
 * reconcile() stays pure. Invariant #1 is about the reconciler.
 */

export interface RunReceipt {
  status: "success" | "reverted";
  blockNumber: bigint;
  gasUsed: bigint;
  /** Kept because Arc charges gas in USDC and the script reports the cost. */
  effectiveGasPrice: bigint;
  logs: RawLog[];
}

/** Narrow on purpose. A fake in a test implements exactly this, and
 *  ioFromPublicClient adapts viem to it. */
export interface ExecuteIO {
  balanceOf(token: Address, owner: Address): Promise<bigint>;
  decimalsOf(token: Address): Promise<number>;
  /** eth_call from `from`. Returns the raw return data. */
  simulate(from: Address, to: Address, data: Hex): Promise<Hex>;
  gasPrice(): Promise<bigint>;
  priorityFee(): Promise<bigint>;
  estimateGas(from: Address, to: Address, data: Hex): Promise<bigint>;
  /** null when the node does not know the hash — which on Arc usually means
   *  the mempool dropped it for being priced below the floor. */
  findTransaction(hash: Hex): Promise<{ maxFeePerGas?: bigint } | null>;
  /** null when no receipt arrived inside the timeout. */
  waitForReceipt(hash: Hex, timeoutMs: number): Promise<RunReceipt | null>;
}

export interface PreparedTx {
  to: Address;
  data: Hex;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export type RunStage =
  | "balances" | "preflight" | "fees" | "signing" | "broadcast" | "confirming";

export type RunOutcome =
  | { state: "blocked"; reason: "balance" | "preflight" | "signature"; details: string }
  | { state: "dropped"; txHash: Hex; sentMaxFeePerGas: bigint }
  | { state: "pending"; txHash: Hex; sentMaxFeePerGas: bigint; feeWarning?: string }
  | { state: "reverted"; txHash: Hex; receipt: RunReceipt }
  | {
      state: "confirmed";
      txHash: Hex;
      receipt: RunReceipt;
      sentMaxFeePerGas: bigint;
      broadcastMaxFeePerGas?: bigint;
      feeWarning?: string;
    };

export interface ExecuteRunArgs {
  manifest: Manifest;
  anchor: Address;
  io: ExecuteIO;
  send: (tx: PreparedTx) => Promise<Hex>;
  onProgress?: (stage: RunStage) => void;
  /** How hard to look for the broadcast transaction before calling it dropped. */
  dropCheck?: { attempts: number; delayMs: number };
  receiptTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function executeRun({
  manifest, anchor, io, send, onProgress,
  dropCheck = { attempts: 6, delayMs: 1_500 },
  receiptTimeoutMs = 180_000,
  sleep = defaultSleep,
}: ExecuteRunArgs): Promise<RunOutcome> {
  const say = (s: RunStage) => onProgress?.(s);
  const payer = manifest.payer;

  // 1. Balances, per token and never pooled.
  say("balances");
  const needed = new Map<string, bigint>();
  for (const item of manifest.items) {
    const key = item.token.toLowerCase();
    needed.set(key, (needed.get(key) ?? 0n) + item.amount);
  }
  for (const [key, need] of needed) {
    const token = manifest.items.find((i) => i.token.toLowerCase() === key)!.token;
    const [balance, decimals] = await Promise.all([
      io.balanceOf(token, payer),
      io.decimalsOf(token),
    ]);
    if (balance < need) {
      return {
        state: "blocked",
        reason: "balance",
        details: `Short of ${token}: need ${need} base units, hold ${balance} (${decimals} decimals). Nothing was signed.`,
      };
    }
  }

  // 2. Preflight. allowFailure=true so one bad row reports itself instead of
  //    reverting the simulation, and it is the only way to see Arc's runtime
  //    blocklist, which has no pre-check.
  say("preflight");
  const built = buildRun(manifest, anchor);
  try {
    const returnData = await io.simulate(payer, built.to, buildPreflightData(manifest, anchor));
    const outcomes = decodePreflightResult(returnData);
    const failed = outcomes
      .map((o, i) => ({ ok: o.success, label: i === 0 ? "the anchor commit" : manifest.items[i - 1]!.invoiceId }))
      .filter((o) => !o.ok);
    if (failed.length > 0) {
      return {
        state: "blocked",
        reason: "preflight",
        details: `Simulation failed for ${failed.map((f) => f.label).join(", ")}. Nothing was signed.`,
      };
    }
  } catch (err) {
    const { name, message } = explainRevert(err);
    return {
      state: "blocked",
      reason: "preflight",
      details: `Simulation reverted${name ? ` with ${name}` : ""}: ${message}. Nothing was signed.`,
    };
  }

  // 3. Fees. The floor is the whole point: below 20 Gwei Arc drops silently.
  say("fees");
  const fees = gasPolicy(await io.gasPrice(), await io.priorityFee());
  const estimate = await io.estimateGas(payer, built.to, built.data);
  const tx: PreparedTx = {
    to: built.to,
    data: built.data,
    gas: (estimate * 12n) / 10n,
    ...fees,
  };

  // 4. Sign and broadcast.
  say("signing");
  let txHash: Hex;
  try {
    txHash = await send(tx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { state: "blocked", reason: "signature", details: message };
  }

  // 5. Read back what was ACTUALLY broadcast. We set the fee correctly, but a
  //    browser wallet owns its own fee interface and the user can edit it.
  say("broadcast");
  let broadcast: { maxFeePerGas?: bigint } | null = null;
  for (let i = 0; i < dropCheck.attempts; i++) {
    broadcast = await io.findTransaction(txHash);
    if (broadcast) break;
    if (i < dropCheck.attempts - 1) await sleep(dropCheck.delayMs);
  }

  if (!broadcast) {
    return { state: "dropped", txHash, sentMaxFeePerGas: fees.maxFeePerGas };
  }

  const broadcastMaxFeePerGas = broadcast.maxFeePerGas;
  const feeWarning =
    broadcastMaxFeePerGas !== undefined && broadcastMaxFeePerGas < MIN_MAX_FEE_WEI
      ? `This transaction was broadcast at ${broadcastMaxFeePerGas} wei per gas, below the 25 Gwei floor. Arc drops transactions under 20 Gwei without a receipt or an error, so it may never be included.`
      : undefined;

  // 6. A receipt, or an honest pending. Never a claim of success without one.
  say("confirming");
  const receipt = await io.waitForReceipt(txHash, receiptTimeoutMs);
  if (!receipt) {
    return { state: "pending", txHash, sentMaxFeePerGas: fees.maxFeePerGas, feeWarning };
  }
  if (receipt.status === "reverted") {
    return { state: "reverted", txHash, receipt };
  }
  return {
    state: "confirmed",
    txHash,
    receipt,
    sentMaxFeePerGas: fees.maxFeePerGas,
    broadcastMaxFeePerGas,
    feeWarning,
  };
}

const balanceAbi = [{
  type: "function", name: "balanceOf", stateMutability: "view",
  inputs: [{ type: "address" }], outputs: [{ type: "uint256" }],
}] as const;

const decimalsAbi = [{
  type: "function", name: "decimals", stateMutability: "view",
  inputs: [], outputs: [{ type: "uint8" }],
}] as const;

/** Minimal shape of viem's PublicClient that this adapter needs. */
interface ViemLikeClient {
  readContract(args: unknown): Promise<unknown>;
  call(args: unknown): Promise<{ data?: Hex }>;
  getGasPrice(): Promise<bigint>;
  estimateMaxPriorityFeePerGas(): Promise<bigint>;
  estimateGas(args: unknown): Promise<bigint>;
  getTransaction(args: { hash: Hex }): Promise<{ maxFeePerGas?: bigint }>;
  waitForTransactionReceipt(args: unknown): Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    gasUsed: bigint;
    effectiveGasPrice: bigint;
    logs: { address: string; topics: string[]; data: string; logIndex: number | null }[];
  }>;
}

/** viem throws when a hash is unknown; ExecuteIO says null, because "the node
 *  has never heard of this" is an answer, not a failure. */
export function ioFromPublicClient(client: ViemLikeClient): ExecuteIO {
  return {
    balanceOf: (token, owner) =>
      client.readContract({
        address: token, abi: balanceAbi, functionName: "balanceOf", args: [owner],
      }) as Promise<bigint>,

    decimalsOf: async (token) =>
      Number(await client.readContract({
        address: token, abi: decimalsAbi, functionName: "decimals",
      })),

    simulate: async (from, to, data) => {
      const r = await client.call({ account: from, to, data });
      return (r.data ?? "0x") as Hex;
    },

    gasPrice: () => client.getGasPrice(),
    priorityFee: () => client.estimateMaxPriorityFeePerGas(),
    estimateGas: (account, to, data) => client.estimateGas({ account, to, data }),

    findTransaction: async (hash) => {
      try {
        return await client.getTransaction({ hash });
      } catch {
        return null;
      }
    },

    waitForReceipt: async (hash, timeout) => {
      try {
        const r = await client.waitForTransactionReceipt({ hash, timeout });
        return {
          status: r.status,
          blockNumber: r.blockNumber,
          gasUsed: r.gasUsed,
          effectiveGasPrice: r.effectiveGasPrice,
          logs: r.logs.map((l, i) => ({
            address: l.address as Address,
            topics: l.topics as Hex[],
            data: l.data as Hex,
            logIndex: l.logIndex ?? i,
          })),
        };
      } catch {
        return null;
      }
    },
  };
}
