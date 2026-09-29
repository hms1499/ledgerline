/**
 * The arithmetic of a count that counts (spec 2026-09-29 §2.4), apart from
 * React so it can be tested: whole numbers, eased out, never past the value,
 * and exactly the value at the end. Counts only — never an amount.
 */
export const COUNT_MS = 800;

export const easeOutCubic = (u: number): number => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;

/** What a count rolling from `from` to `to` shows `elapsed` ms in. */
export function countAt(from: number, to: number, elapsed: number, duration = COUNT_MS): number {
  if (elapsed >= duration) return to;
  const v = from + (to - from) * easeOutCubic(elapsed / duration);
  return to >= from ? Math.min(to, Math.floor(v)) : Math.max(to, Math.ceil(v));
}

/** What a count shows on its first render: its value when it is already in
 *  the server's HTML or motion is reduced; 0 when it appears on the client
 *  and will count up. */
export const firstShown = (value: number, hydrating: boolean, reduced: boolean): number =>
  hydrating || reduced ? value : 0;
