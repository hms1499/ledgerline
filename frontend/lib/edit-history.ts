import { NO_EDITS, type SheetEdits } from "@/lib/sheet-edits";

export interface EditHistory { now: SheetEdits; past: readonly SheetEdits[]; future: readonly SheetEdits[] }
export type HistoryAction =
  | { type: "set"; edits: SheetEdits }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; edits?: SheetEdits };

const LIMIT = 100;
export const START: EditHistory = { now: NO_EDITS, past: [], future: [] };

/** Ctrl+Z and Ctrl+Shift+Z over whole `SheetEdits` values: the model is
 *  immutable, so a step back is simply the value before. */
export function history(h: EditHistory, a: HistoryAction): EditHistory {
  switch (a.type) {
    case "set":
      return a.edits === h.now ? h : { now: a.edits, past: [...h.past, h.now].slice(-LIMIT), future: [] };
    case "undo":
      return h.past.length === 0 ? h : { now: h.past.at(-1)!, past: h.past.slice(0, -1), future: [h.now, ...h.future] };
    case "redo":
      return h.future.length === 0 ? h : { now: h.future[0]!, past: [...h.past, h.now], future: h.future.slice(1) };
    case "reset":
      return { now: a.edits ?? NO_EDITS, past: [], future: [] };
  }
}
