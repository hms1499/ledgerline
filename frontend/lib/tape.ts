/**
 * What a tape's bottom edge says (spec §6.1): "torn" — this is a finished
 * answer; "feeding" — the machine is still printing, or waiting for input.
 */
export type TapeState = "torn" | "feeding";

export function tapeClass(state: TapeState = "torn", extra?: string): string {
  return ["tape", state === "feeding" ? "is-feeding" : "", extra ?? ""].filter(Boolean).join(" ");
}
