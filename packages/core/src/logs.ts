import { decodeAbiParameters, getAddress } from "viem";
import {
  MEMO_TOPIC,
  TRANSFER_TOPIC,
  SYSTEM_EMITTER,
} from "./constants.js";
import type { Address, Hex, MemoEvent, RawLog, TransferEvent } from "./types.js";

function topicToAddress(topic: Hex): Address {
  return getAddress(`0x${topic.slice(-40)}`);
}

/**
 * Memo(address indexed sender, address indexed target, bytes32 callDataHash,
 *      bytes32 indexed memoId, bytes memo, uint256 memoIndex)
 *
 * Indexed: sender, target, memoId. The data section holds callDataHash,
 * the memo bytes, and memoIndex.
 */
export function decodeMemoLogs(logs: RawLog[]): MemoEvent[] {
  const out: MemoEvent[] = [];
  for (const log of logs) {
    if (log.topics[0] !== MEMO_TOPIC) continue;
    if (log.topics.length < 4) continue;

    const [callDataHash, memoData, memoIndex] = decodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes" }, { type: "uint256" }],
      log.data,
    );

    out.push({
      sender: topicToAddress(log.topics[1]!),
      target: topicToAddress(log.topics[2]!),
      memoId: log.topics[3]!,
      callDataHash: callDataHash as Hex,
      memoData: memoData as Hex,
      memoIndex: memoIndex as bigint,
      logIndex: log.logIndex,
    });
  }
  return out;
}

/**
 * Token Transfer events, with the EIP-7708 system emitter excluded.
 *
 * On Arc a single ERC-20 USDC transfer emits two Transfer logs: the 6-decimal
 * one from the token contract, and an 18-decimal one from the system emitter
 * because USDC is the native gas token. EURC and cirBTC emit only the first.
 * Excluding the system emitter keeps USDC from being double counted without
 * halving the others — one rule, no per-token branching.
 */
export function decodeTransferLogs(logs: RawLog[]): TransferEvent[] {
  const out: TransferEvent[] = [];
  for (const log of logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    if (log.address.toLowerCase() === SYSTEM_EMITTER) continue;
    if (log.topics.length < 3) continue;

    const [value] = decodeAbiParameters([{ type: "uint256" }], log.data);

    out.push({
      token: getAddress(log.address),
      from: topicToAddress(log.topics[1]!),
      to: topicToAddress(log.topics[2]!),
      value: value as bigint,
      logIndex: log.logIndex,
    });
  }
  return out;
}
