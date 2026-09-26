import type { CsvField, ParsedRow } from "@ledgerline/core";

/** One value the payer typed or pressed, for one field of one line. */
export interface CellEdit { line: number; field: CsvField; text: string }

/** A change made to many lines at once, kept so it can be undone at once. */
export interface AppliedGroup { key: string; field: CsvField; lines: number[]; title: string }

/**
 * What the payer changed on the Review step, over the file as read. The file
 * itself is never written to: undo is dropping an entry here.
 */
export interface RunEdits {
  cells: Readonly<Record<number, Partial<Record<CsvField, string>>>>;
  /** Lines left out of this run. Still owed: the corrected file keeps them. */
  removed: readonly number[];
  groups: readonly AppliedGroup[];
}

export const NO_EDITS: RunEdits = { cells: {}, removed: [], groups: [] };

const ROW_KEY = { invoiceId: "invoiceId", token: "tokenSymbol", to: "to", amount: "amount" } as const;

/** The rows the run is checked against: edited values over the file's, and
 *  left-out lines dropped. An unreadable line that was typed in again is
 *  read from what was typed alone. */
export function applyEdits(rows: readonly ParsedRow[], edits: RunEdits): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const row of rows) {
    if (edits.removed.includes(row.line)) continue;
    const e = edits.cells[row.line];
    if (!e) { out.push(row); continue; }
    const { unreadable: _, ...rest } = row;
    const next: ParsedRow = { ...rest };
    for (const f of Object.keys(e) as CsvField[]) next[ROW_KEY[f]] = e[f]!.trim();
    out.push(next);
  }
  return out;
}

export function withEdits(edits: RunEdits, changes: readonly CellEdit[]): RunEdits {
  const cells = { ...edits.cells };
  for (const { line, field, text } of changes) cells[line] = { ...cells[line], [field]: text };
  return { ...edits, cells };
}

function dropFields(
  cells: RunEdits["cells"], lines: readonly number[], field?: CsvField,
): RunEdits["cells"] {
  const next = { ...cells };
  for (const line of lines) {
    if (!next[line]) continue;
    if (field === undefined) { delete next[line]; continue; }
    const { [field]: _, ...keep } = next[line]!;
    if (Object.keys(keep).length === 0) delete next[line];
    else next[line] = keep;
  }
  return next;
}

export function applyGroup(edits: RunEdits, action: { edits: CellEdit[]; applied: AppliedGroup }): RunEdits {
  const next = withEdits(edits, action.edits);
  return { ...next, groups: [...next.groups, action.applied] };
}

export function undoGroup(edits: RunEdits, key: string): RunEdits {
  const group = edits.groups.find((g) => g.key === key);
  if (!group) return edits;
  return {
    ...edits,
    cells: dropFields(edits.cells, group.lines, group.field),
    groups: edits.groups.filter((g) => g !== group),
  };
}

export function undoLine(edits: RunEdits, line: number): RunEdits {
  return {
    ...edits,
    cells: dropFields(edits.cells, [line]),
    groups: edits.groups
      .map((g) => ({ ...g, lines: g.lines.filter((l) => l !== line) }))
      .filter((g) => g.lines.length > 0),
  };
}

export function leaveOut(edits: RunEdits, line: number): RunEdits {
  return edits.removed.includes(line) ? edits : { ...edits, removed: [...edits.removed, line] };
}

export function putBack(edits: RunEdits, line: number): RunEdits {
  return { ...edits, removed: edits.removed.filter((l) => l !== line) };
}

export function changeCounts(edits: RunEdits): { edited: number; leftOut: number } {
  const edited = Object.keys(edits.cells).map(Number).filter((l) => !edits.removed.includes(l)).length;
  return { edited, leftOut: edits.removed.length };
}

const lines = (n: number) => `${n} line${n === 1 ? "" : "s"}`;

/** For the side summary, through Check and Pay. */
export function changesText({ edited, leftOut }: { edited: number; leftOut: number }): string | undefined {
  const parts = [
    ...(edited > 0 ? [`${lines(edited)} edited here`] : []),
    ...(leftOut > 0 ? [`${leftOut} left out`] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** For the Result screen: the spreadsheet is what the payer opens next month. */
export function correctionReminder({ edited, leftOut }: { edited: number; leftOut: number }): string | undefined {
  const did =
    edited > 0 && leftOut > 0 ? `You edited ${lines(edited)} and left ${leftOut} out of this run.`
    : edited > 0 ? `You edited ${lines(edited)}.`
    : leftOut > 0 ? `You left ${lines(leftOut)} out of this run.`
    : undefined;
  return did && `${did} Download the corrected file to update your spreadsheet.`;
}
