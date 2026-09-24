import { RUN_COMMITTED_TOPIC, type Address, type Hex, type RawLog } from "@ledgerline/core";

/** Required to come from the anchor this tool trusts — any contract can emit
 *  this topic, and a payer could otherwise stage their own. */
export function runIdFromLogs(logs: RawLog[], anchor?: Address): Hex | undefined {
  if (!anchor) return undefined;
  return logs.find(
    (l) => l.address.toLowerCase() === anchor.toLowerCase() &&
      l.topics[0] === RUN_COMMITTED_TOPIC && l.topics.length >= 2,
  )?.topics[1];
}
