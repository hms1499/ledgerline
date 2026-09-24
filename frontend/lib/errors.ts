/**
 * Wallet rejections are EIP-1193 errors: plain objects carrying `code` and
 * `message`, not Error instances. `String(err)` on one of those renders
 * "[object Object]", which is what a payer saw under the switch button in
 * place of the reason — and a wallet's reason is often the only thing that
 * explains why nothing happened.
 *
 * Providers also nest. viem wraps the provider error in `cause` and puts its
 * own readable line in `shortMessage`; several wallets bury the real one
 * under `data`, `error` or `originalError`.
 */
const MAX_DEPTH = 4;
const NESTED = ["data", "cause", "error", "originalError"] as const;

/** The most specific human-readable line, or "" if there is none. */
export function errorText(err: unknown, depth = 0): string {
  if (typeof err === "string") return err.trim();
  if (!err || typeof err !== "object" || depth > MAX_DEPTH) return "";

  const o = err as Record<string, unknown>;
  // shortMessage before message: viem's is written for a person, and an
  // Error instance's own `message` is reached by the same lookup.
  for (const key of ["shortMessage", "message", "details", "reason"]) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const key of NESTED) {
    const nested = errorText(o[key], depth + 1);
    if (nested) return nested;
  }
  return "";
}

/** The EIP-1193 code, however deeply the wallet buried it. 4001 is a
 *  dismissed prompt, 4902 an unknown chain. */
export function errorCode(err: unknown, depth = 0): number | undefined {
  if (!err || typeof err !== "object" || depth > MAX_DEPTH) return undefined;
  const o = err as Record<string, unknown>;
  if (typeof o.code === "number") return o.code;
  for (const key of NESTED) {
    const nested = errorCode(o[key], depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/**
 * Always something a person can read. Falls back to the raw shape rather than
 * a polite nothing, because an unrecognised error is exactly when the
 * original detail is worth having.
 */
export function describeError(err: unknown): string {
  const text = errorText(err);
  if (text) return text;
  try {
    const dump = JSON.stringify(err);
    if (dump && dump !== "{}" && dump !== "null") {
      return dump.length > 240 ? `${dump.slice(0, 240)}…` : dump;
    }
  } catch { /* circular structure — nothing readable to salvage */ }
  return "The wallet gave no reason.";
}
