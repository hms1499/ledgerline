import { concatHex, keccak256, pad, toHex } from "viem";
import { TRANSFER_SELECTOR } from "./constants.js";
import { decodeMemoLogs, decodeTransferLogs } from "./logs.js";
import type { Hex, PaymentRecord, RawLog, TransferEvent } from "./types.js";

/** Rebuild the exact calldata `Memo` forwarded: transfer(to, value). */
function rebuildTransferCalldata(t: TransferEvent): Hex {
  return concatHex([
    TRANSFER_SELECTOR,
    pad(t.to, { size: 32 }),
    pad(toHex(t.value), { size: 32 }),
  ]);
}

/**
 * Join each Memo to its Transfer by recomputing keccak256 of the calldata the
 * memo says it forwarded. A match is proof of association, so this never needs
 * to guess from log positions — which matters because EIP-7708 can hoist
 * system logs and nested memos unwind innermost-first.
 *
 * A memo with no matching transfer is `unlinked`: a reference exists with no
 * payment behind it. That is an anomaly, not a user error.
 */
export function joinPayments(logs: RawLog[]): {
  payments: PaymentRecord[];
  unlinkedMemoIds: Hex[];
} {
  const memos = decodeMemoLogs(logs);
  const transfers = decodeTransferLogs(logs);

  const payments: PaymentRecord[] = [];
  const unlinkedMemoIds: Hex[] = [];
  const consumed = new Set<number>();

  for (const memo of memos) {
    const match = transfers.find(
      (t) =>
        !consumed.has(t.logIndex) &&
        t.token.toLowerCase() === memo.target.toLowerCase() &&
        keccak256(rebuildTransferCalldata(t)) === memo.callDataHash,
    );

    if (!match) {
      unlinkedMemoIds.push(memo.memoId);
      continue;
    }

    consumed.add(match.logIndex);
    payments.push({
      memoId: memo.memoId,
      payer: memo.sender,
      token: memo.target,
      to: match.to,
      value: match.value,
      memoData: memo.memoData,
      memoIndex: memo.memoIndex,
      identityBroken: memo.sender.toLowerCase() !== match.from.toLowerCase(),
    });
  }

  return { payments, unlinkedMemoIds };
}
