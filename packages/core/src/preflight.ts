import { decodeAbiParameters } from "viem";
import { buildRun } from "./build.js";
import { MIN_MAX_FEE_WEI, MIN_PRIORITY_FEE_WEI } from "./constants.js";
import type { Address, Hex, Manifest } from "./types.js";

/**
 * Calldata for simulation. Identical to the real run except allowFailure is
 * true on the payment calls, so eth_call returns a per-payment success flag
 * instead of reverting on the first problem. Works on any RPC — no
 * debug_traceCall needed — and it is the only way to detect Arc's runtime
 * blocklist, which exposes no pre-check.
 */
export function buildPreflightData(manifest: Manifest, anchor: Address): Hex {
  return buildRun(manifest, anchor, { allowFailure: true }).data;
}

export function decodePreflightResult(
  returnData: Hex,
): { success: boolean; returnData: Hex }[] {
  const [results] = decodeAbiParameters(
    [{ type: "tuple[]", components: [{ type: "bool" }, { type: "bytes" }] }],
    returnData,
  );
  return (results as readonly (readonly [boolean, Hex])[]).map(([success, data]) => ({
    success,
    returnData: data,
  }));
}

/**
 * Arc pins its base fee at a 20 Gwei floor and SILENTLY DROPS transactions
 * priced below it — no receipt, no error, no revert. In a payout tool that
 * means reporting success while nothing happened, so the floor here is
 * deliberately above the protocol minimum.
 */
export function gasPolicy(
  suggestedGasPrice: bigint,
  suggestedTip: bigint,
): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
  const scaled = (suggestedGasPrice * 3n) / 2n;
  return {
    maxFeePerGas: scaled > MIN_MAX_FEE_WEI ? scaled : MIN_MAX_FEE_WEI,
    maxPriorityFeePerGas:
      suggestedTip > MIN_PRIORITY_FEE_WEI ? suggestedTip : MIN_PRIORITY_FEE_WEI,
  };
}
