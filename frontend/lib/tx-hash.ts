export const TX_HASH_HINT =
  "That is not a transaction hash: it starts with 0x and has 64 more letters and digits.";

/** A transaction hash as a person pastes one: surrounding space ignored,
 *  either case of hex. An address (40 hex) is refused. */
export function isTxHash(input: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(input.trim());
}
