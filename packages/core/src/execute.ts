import { TransactionNotFoundError } from "viem";
import { buildRun, type BuiltRun } from "./build.js";
import { MIN_MAX_FEE_WEI, tokensForChain } from "./constants.js";
import { explainCallFailure, explainRevert } from "./errors.js";
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
  /** The chain the client is actually talking to. Checked before anything
   *  else — USDC shares its predeploy address across mainnet and testnet, so
   *  a wrong-chain client would otherwise read a real balance and sign. */
  chainId(): Promise<number>;
  balanceOf(token: Address, owner: Address): Promise<bigint>;
  decimalsOf(token: Address): Promise<number>;
  /** eth_call from `from`. Returns the raw return data. */
  simulate(from: Address, to: Address, data: Hex): Promise<Hex>;
  gasPrice(): Promise<bigint>;
  priorityFee(): Promise<bigint>;
  estimateGas(from: Address, to: Address, data: Hex): Promise<bigint>;
  /** null when the node genuinely does not know the hash — which on Arc
   *  usually means the mempool dropped it for being priced below the floor.
   *  `gasPrice` is populated instead of `maxFeePerGas` for a legacy
   *  transaction, so the floor can still be checked. */
  findTransaction(hash: Hex): Promise<{ maxFeePerGas?: bigint; gasPrice?: bigint } | null>;
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
  | {
      state: "blocked";
      reason: "chain" | "balance" | "preflight" | "fees" | "signature";
      details: string;
    }
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
  /**
   * Called the moment the broadcast fee is known to be under the floor —
   * before the wait for a receipt, not after it. The wait can run for
   * minutes, and holding back the likeliest reason no receipt is coming
   * leaves the payer watching a spinner that knows more than they do.
   */
  onFeeWarning?: (warning: string) => void;
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
  onFeeWarning,
  sleep = defaultSleep,
}: ExecuteRunArgs): Promise<RunOutcome> {
  const say = (s: RunStage) => onProgress?.(s);
  const payer = manifest.payer;

  // 0. Chain guard, before anything else. USDC keeps the same predeploy
  //    address on mainnet and testnet, so a client pointed at the wrong
  //    chain would otherwise read a real balance, pass preflight, and sign
  //    for real money — silently turning a rehearsal into a live payout.
  let clientChainId: number;
  try {
    clientChainId = await io.chainId();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      state: "blocked",
      reason: "chain",
      details: `Could not read the client's chain id: ${message}. Nothing was signed.`,
    };
  }
  if (clientChainId !== manifest.chainId) {
    return {
      state: "blocked",
      reason: "chain",
      details:
        `The client is on chain ${clientChainId}, but this manifest targets chain ` +
        `${manifest.chainId}. Refusing to read balances or sign. This is how a testnet ` +
        `rehearsal would otherwise end up pointing at real money.`,
    };
  }

  // 1. Balances, per token and never pooled.
  say("balances");
  const needed = new Map<string, bigint>();
  for (const item of manifest.items) {
    const key = item.token.toLowerCase();
    needed.set(key, (needed.get(key) ?? 0n) + item.amount);
  }
  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      state: "blocked",
      reason: "balance",
      details: `Could not read balances: ${message}. Nothing was signed.`,
    };
  }

  // 2. Preflight. allowFailure=true so one bad row reports itself instead of
  //    reverting the simulation, and it is the only way to see Arc's runtime
  //    blocklist, which has no pre-check.
  say("preflight");
  let built: BuiltRun;
  try {
    built = buildRun(manifest, anchor);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      state: "blocked",
      reason: "preflight",
      details: `Could not build the run: ${message}. Nothing was signed.`,
    };
  }
  try {
    const returnData = await io.simulate(payer, built.to, buildPreflightData(manifest, anchor));
    const outcomes = decodePreflightResult(returnData);
    const expected = manifest.items.length + 1; // items + the anchor commit
    if (outcomes.length !== expected) {
      return {
        state: "blocked",
        reason: "preflight",
        details:
          `Simulation returned ${outcomes.length} outcomes but the run has ` +
          `${manifest.items.length} items (expected ${expected}, including the anchor ` +
          `commit). Nothing was signed.`,
      };
    }
    const failed = outcomes
      .map((o, i) => ({
        ok: o.success,
        label: i === 0 ? "the anchor commit" : manifest.items[i - 1]!.invoiceId,
        why: o.success ? "" : explainCallFailure(o.returnData).message,
      }))
      .filter((o) => !o.ok);
    if (failed.length > 0) {
      return {
        state: "blocked",
        reason: "preflight",
        details: `Simulation failed — ${failed.map((f) => `${f.label}: ${f.why}`).join(" ")} Nothing was signed.`,
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
  let tx: PreparedTx;
  try {
    const fees = gasPolicy(await io.gasPrice(), await io.priorityFee());
    const estimate = await io.estimateGas(payer, built.to, built.data);
    tx = {
      to: built.to,
      data: built.data,
      gas: (estimate * 12n) / 10n,
      ...fees,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      state: "blocked",
      reason: "fees",
      details: `Could not determine the gas price or gas estimate: ${message}. Nothing was signed.`,
    };
  }

  // 3b. Gas affordability. Gas on Arc is paid in USDC, so a run that has
  //     exactly enough USDC for its payouts (or pays no USDC at all) can
  //     still stall for want of gas. Checked on top of, never instead of,
  //     the phase-1 balance check above.
  try {
    const usdc = tokensForChain(manifest.chainId).USDC;
    const usdcDecimals = await io.decimalsOf(usdc);
    const usdcBalance = await io.balanceOf(usdc, payer);

    // tx.gas * tx.maxFeePerGas is a cost in Arc's native 18-decimal unit
    // (msg.value semantics). USDC's balanceOf returns usdcDecimals decimals
    // (6, today) — the SAME balance expressed 10^(18 - usdcDecimals) apart.
    // Convert the wei figure DOWN into USDC units; never compare the two
    // directly, and round the converted cost UP so the check is never
    // optimistic by a rounding unit.
    const gasCostWei = tx.gas * tx.maxFeePerGas;
    const weiPerUsdcUnit = 10n ** BigInt(18 - usdcDecimals);
    const gasCostInUsdcUnits = (gasCostWei + weiPerUsdcUnit - 1n) / weiPerUsdcUnit;

    const usdcNeededForPayouts = needed.get(usdc.toLowerCase()) ?? 0n;
    const totalUsdcNeeded = usdcNeededForPayouts + gasCostInUsdcUnits;

    if (usdcBalance < totalUsdcNeeded) {
      return {
        state: "blocked",
        reason: "balance",
        details:
          `Short of USDC for gas: this run needs ${usdcNeededForPayouts} base units of USDC ` +
          `for payouts plus ${gasCostInUsdcUnits} base units for gas (${usdcDecimals} ` +
          `decimals), ${totalUsdcNeeded} total, but the payer holds ${usdcBalance}. ` +
          `Nothing was signed.`,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      state: "blocked",
      reason: "fees",
      details: `Could not verify the payer holds enough USDC to cover gas: ${message}. Nothing was signed.`,
    };
  }

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
  let broadcast: { maxFeePerGas?: bigint; gasPrice?: bigint } | null = null;
  let observeError: string | undefined;
  for (let i = 0; i < dropCheck.attempts; i++) {
    try {
      broadcast = await io.findTransaction(txHash);
    } catch (err) {
      // The node did not answer — that is not the same fact as "the node
      // answered and has never heard of this hash". We hold a real txHash
      // and genuinely do not know its fate, so this must surface as
      // pending, never as dropped: a dropped run misreported as pending is
      // the safe direction, and the reverse is not (a payout believed dead
      // gets re-run under a new label, which nothing protects against).
      observeError = err instanceof Error ? err.message : String(err);
      break;
    }
    if (broadcast) break;
    if (i < dropCheck.attempts - 1) await sleep(dropCheck.delayMs);
  }

  if (observeError) {
    return {
      state: "pending",
      txHash,
      sentMaxFeePerGas: tx.maxFeePerGas,
      feeWarning:
        `Could not reach the chain to check whether this transaction was broadcast: ` +
        `${observeError}. We hold a real transaction hash (${txHash}) but do not know its ` +
        `fate — check an explorer before treating this run as failed or re-running it under ` +
        `a new label.`,
    };
  }

  if (!broadcast) {
    return { state: "dropped", txHash, sentMaxFeePerGas: tx.maxFeePerGas };
  }

  const broadcastMaxFeePerGas = broadcast.maxFeePerGas;
  // Whatever the node reported the fee as, checked against the same floor —
  // maxFeePerGas for an EIP-1559 transaction, gasPrice for a legacy one.
  const observedFee = broadcast.maxFeePerGas ?? broadcast.gasPrice;
  const feeWarning =
    observedFee === undefined
      ? `Could not verify the broadcast fee: the node returned neither maxFeePerGas nor ` +
        `gasPrice for this transaction. Arc drops transactions under 20 Gwei with no ` +
        `receipt or error, so confirm on an explorer before treating this as final.`
      : observedFee < MIN_MAX_FEE_WEI
        ? `This transaction was broadcast at ${observedFee} wei per gas, below the 25 Gwei ` +
          `floor. Arc drops transactions under 20 Gwei without a receipt or an error, so it ` +
          `may never be included.`
        : undefined;

  // 6. A receipt, or an honest pending. Never a claim of success without one.
  //
  // Say what is already known before starting a wait measured in minutes. A
  // fee under the floor is the likeliest reason a receipt will never arrive,
  // and on Arc it arrives as silence rather than an error — so silence from
  // us on top of it is the one thing that helps least.
  if (feeWarning) onFeeWarning?.(feeWarning);
  say("confirming");
  const receipt = await io.waitForReceipt(txHash, receiptTimeoutMs);
  if (!receipt) {
    return { state: "pending", txHash, sentMaxFeePerGas: tx.maxFeePerGas, feeWarning };
  }
  if (receipt.status === "reverted") {
    return { state: "reverted", txHash, receipt };
  }
  return {
    state: "confirmed",
    txHash,
    receipt,
    sentMaxFeePerGas: tx.maxFeePerGas,
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
  getChainId(): Promise<number>;
  readContract(args: unknown): Promise<unknown>;
  call(args: unknown): Promise<{ data?: Hex }>;
  getGasPrice(): Promise<bigint>;
  estimateMaxPriorityFeePerGas(): Promise<bigint>;
  estimateGas(args: unknown): Promise<bigint>;
  getTransaction(args: { hash: Hex }): Promise<{ maxFeePerGas?: bigint; gasPrice?: bigint }>;
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
    chainId: () => client.getChainId(),

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
        const tx = await client.getTransaction({ hash });
        return { maxFeePerGas: tx.maxFeePerGas, gasPrice: tx.gasPrice };
      } catch (err) {
        // "The node has never heard of this hash" is an answer, not a
        // failure — but only when it is genuinely that. viem throws
        // TransactionNotFoundError for the not-found case specifically;
        // anything else (a timeout, a 5xx, a dropped socket) is a failure to
        // observe the chain, not an observation, and must not be reported as
        // one — see C1.
        if (err instanceof TransactionNotFoundError) return null;
        throw err;
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
