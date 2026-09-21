import { concatHex, keccak256, toHex } from "viem";
import type { Hex } from "./types.js";

/**
 * memoId = keccak256(runSalt ‖ utf8(invoiceId))
 *
 * Salted so that an observer reading the chain sees a payment and its amount
 * but cannot recover the invoice id, and therefore cannot reconstruct
 * counterparty relationships or payment cycles. The recipient holds the salt
 * and can verify their own line. Borrowed from Request Network's design.
 */
export function memoIdFor(runSalt: Hex, invoiceId: string): Hex {
  if (runSalt.length !== 66) {
    throw new Error(`runSalt must be 32 bytes, got ${(runSalt.length - 2) / 2}`);
  }
  if (invoiceId.length === 0) {
    throw new Error("invoiceId must not be empty");
  }
  return keccak256(concatHex([runSalt, toHex(invoiceId)]));
}
