import type { ColumnId, CsvField, NewColumn, ParsedCsv, ParsedRow, Role, SheetStructure } from "@ledgerline/core";

/** One value the payer typed or pressed, for one cell. */
export interface CellEdit { line: number; col: ColumnId; text: string }

/** A change made to many cells at once, undone at once. A `group` is the fix
 *  list's; a `column` batch is a numbering or a find and replace. */
export interface Batch {
  id: string;
  kind: "group" | "column";
  title: string;
  cells: readonly (readonly [number, ColumnId])[];
}

/**
 * What the payer changed on the Review step, over the file as read. The file
 * itself is never written to: undo is dropping an entry here. Lines are the
 * file's own numbers; a new line is numbered after the file's last.
 */
export interface SheetEdits {
  /** The header line; default the first line with a non-empty cell. */
  headerLine?: number;
  /** Roles set here for the file's columns, over those read from their names. */
  roles: Readonly<Partial<Record<`f${number}`, Role>>>;
  /** Columns the file never had, each with its role and the value of every
   *  line that has no cell of its own there. */
  newColumns: readonly NewColumn[];
  /** Line → column → text, as typed. File lines and new lines alike. */
  cells: Readonly<Record<number, Readonly<Partial<Record<ColumnId, string>>>>>;
  newLines: readonly number[];
  /** Deleted from the file: not in this run, not in the corrected file. */
  deleted: readonly number[];
  /** Left out of this run: still owed, kept in the corrected file. */
  leftOut: readonly number[];
  batches: readonly Batch[];
}

export const NO_EDITS: SheetEdits = {
  roles: {}, newColumns: [], cells: {}, newLines: [], deleted: [], leftOut: [], batches: [],
};

/** The part of the edits core reads the file under. */
export function structureOf(e: SheetEdits): SheetStructure {
  return { headerLine: e.headerLine, roles: e.roles, newColumns: e.newColumns };
}

const fileIndex = (col: ColumnId) => (col.startsWith("f") ? Number(col.slice(1)) : -1);

/**
 * A cell's text: typed here, else as read, else a new column's fill. An
 * unreadable line's cells are only what was typed: its values as split do
 * not line up with the header, so none of them is shown as a column's.
 */
export function cellText(e: SheetEdits, row: ParsedRow | undefined, line: number, col: ColumnId): string {
  const own = e.cells[line]?.[col];
  if (own !== undefined) return own;
  const i = fileIndex(col);
  if (i >= 0) return row && !row.unreadable ? row.cells[i] ?? "" : "";
  return e.newColumns.find((c) => c.id === col)?.fill ?? "";
}

/** The rows the run is checked against: typed cells over the sheet as read,
 *  deleted and left-out lines dropped, new lines added after the file's. */
export function applySheetEdits(sheet: ParsedCsv, e: SheetEdits): ParsedRow[] {
  const columns = sheet.columns;
  if (!columns) return [];
  const gone = (line: number) => e.deleted.includes(line) || e.leftOut.includes(line);
  const read = (row: ParsedRow | undefined, line: number): ParsedRow => {
    const f = (field: CsvField) => cellText(e, row, line, columns[field]).trim();
    return {
      line, invoiceId: f("invoiceId"), tokenSymbol: f("token"), to: f("to"), amount: f("amount"),
      cells: row?.cells ?? [],
    };
  };
  const out: ParsedRow[] = [];
  for (const row of sheet.rows) {
    if (gone(row.line)) continue;
    out.push(e.cells[row.line] ? read(row, row.line) : row);
  }
  for (const line of e.newLines) if (!gone(line)) out.push(read(undefined, line));
  return out;
}

export function editCells(e: SheetEdits, changes: readonly CellEdit[]): SheetEdits {
  const cells = { ...e.cells };
  for (const { line, col, text } of changes) cells[line] = { ...cells[line], [col]: text };
  return { ...e, cells };
}

function dropCells(cells: SheetEdits["cells"], drop: readonly (readonly [number, ColumnId])[]): SheetEdits["cells"] {
  const next: Record<number, Partial<Record<ColumnId, string>>> = { ...cells };
  for (const [line, col] of drop) {
    const row = next[line];
    if (!row || !(col in row)) continue;
    const keep = { ...row };
    delete keep[col];
    if (Object.keys(keep).length === 0) delete next[line];
    else next[line] = keep;
  }
  return next;
}

function withoutCells(batches: readonly Batch[], gone: (line: number, col: ColumnId) => boolean): Batch[] {
  return batches
    .map((b) => ({ ...b, cells: b.cells.filter(([l, c]) => !gone(l, c)) }))
    .filter((b) => b.cells.length > 0);
}

/** Drops one typed cell, taking it out of any batch it was in. */
export function undoCell(e: SheetEdits, line: number, col: ColumnId): SheetEdits {
  return {
    ...e,
    cells: dropCells(e.cells, [[line, col]]),
    batches: withoutCells(e.batches, (l, c) => l === line && c === col),
  };
}

/** A batch id not in use: `<prefix>:1`, `<prefix>:2`… */
export function nextBatchId(e: SheetEdits, prefix: string): string {
  let n = 1;
  while (e.batches.some((b) => b.id === `${prefix}:${n}`)) n++;
  return `${prefix}:${n}`;
}

/** Many cells in one step, undone in one step. A batch with the same id is replaced. */
export function applyBatch(e: SheetEdits, batch: Omit<Batch, "cells">, changes: readonly CellEdit[]): SheetEdits {
  if (changes.length === 0) return e;
  const next = editCells(e, changes);
  return {
    ...next,
    batches: [
      ...next.batches.filter((b) => b.id !== batch.id),
      { ...batch, cells: changes.map((c) => [c.line, c.col] as const) },
    ],
  };
}

export function undoBatch(e: SheetEdits, id: string): SheetEdits {
  const batch = e.batches.find((b) => b.id === id);
  if (!batch) return e;
  return { ...e, cells: dropCells(e.cells, batch.cells), batches: e.batches.filter((b) => b !== batch) };
}

/**
 * A line card's Undo: drops the line's typed cells and takes it out of any
 * group. A numbering or a find and replace is left to its own Undo, which
 * lists it: dropping one line's share of it here would surprise.
 */
export function undoLine(e: SheetEdits, line: number): SheetEdits {
  const kept = new Set(
    e.batches.filter((b) => b.kind === "column").flatMap((b) => b.cells.filter(([l]) => l === line).map(([, c]) => c)),
  );
  const drop = (Object.keys(e.cells[line] ?? {}) as ColumnId[]).filter((c) => !kept.has(c));
  return {
    ...e,
    cells: dropCells(e.cells, drop.map((c) => [line, c] as const)),
    batches: withoutCells(e.batches, (l, c) => l === line && !kept.has(c)),
  };
}

export function leaveOut(e: SheetEdits, line: number): SheetEdits {
  return e.leftOut.includes(line) ? e : { ...e, leftOut: [...e.leftOut, line] };
}

export function putBack(e: SheetEdits, line: number): SheetEdits {
  return { ...e, leftOut: e.leftOut.filter((l) => l !== line) };
}

/** A new line goes with its cells; a file line is marked, and stays in place. */
export function deleteLine(e: SheetEdits, line: number): SheetEdits {
  if (e.newLines.includes(line)) {
    const cols = Object.keys(e.cells[line] ?? {}) as ColumnId[];
    return {
      ...e,
      cells: dropCells(e.cells, cols.map((c) => [line, c] as const)),
      batches: withoutCells(e.batches, (l) => l === line),
      newLines: e.newLines.filter((l) => l !== line),
      leftOut: e.leftOut.filter((l) => l !== line),
    };
  }
  if (e.deleted.includes(line)) return e;
  return { ...e, deleted: [...e.deleted, line], leftOut: e.leftOut.filter((l) => l !== line) };
}

export function restoreLine(e: SheetEdits, line: number): SheetEdits {
  return { ...e, deleted: e.deleted.filter((l) => l !== line) };
}

/** `lineCount` is `readLines(text).length`. */
export function addLine(e: SheetEdits, lineCount: number): { edits: SheetEdits; line: number } {
  const line = Math.max(lineCount, ...e.newLines) + 1;
  return { edits: { ...e, newLines: [...e.newLines, line] }, line };
}

function assignRole(e: SheetEdits, col: ColumnId, role: Role): SheetEdits {
  if (col.startsWith("n")) {
    return { ...e, newColumns: e.newColumns.map((c) => (c.id === col ? { ...c, role } : c)) };
  }
  return { ...e, roles: { ...e.roles, [col as `f${number}`]: role } };
}

/**
 * Gives a column a role. Any column that held it is marked not used, so a
 * role is never held twice. `roles` is the sheet's, as read now.
 */
export function setRole(e: SheetEdits, roles: Readonly<Record<ColumnId, Role>>, col: ColumnId, role: Role): SheetEdits {
  let next = assignRole(e, col, role);
  if (role !== "unused") {
    for (const [other, held] of Object.entries(roles) as [ColumnId, Role][]) {
      if (other !== col && held === role) next = assignRole(next, other, "unused");
    }
  }
  return next;
}

/** Back to what the column's name says. */
export function clearRole(e: SheetEdits, col: `f${number}`): SheetEdits {
  const roles = { ...e.roles };
  delete roles[col];
  return { ...e, roles };
}

export function addColumn(e: SheetEdits, role: Role, fill: string): { edits: SheetEdits; col: `n${number}` } {
  const k = Math.max(0, ...e.newColumns.map((c) => Number(c.id.slice(1)))) + 1;
  const col = `n${k}` as const;
  const name = role === "unused" ? `Column ${k}` : role;
  return { edits: { ...e, newColumns: [...e.newColumns, { id: col, name, role, fill }] }, col };
}

/** A new column goes with its cells and its share of any batch. */
export function dropColumn(e: SheetEdits, col: `n${number}`): SheetEdits {
  const cells: Record<number, Partial<Record<ColumnId, string>>> = {};
  for (const [line, row] of Object.entries(e.cells)) {
    const keep = { ...row };
    delete keep[col];
    if (Object.keys(keep).length > 0) cells[Number(line)] = keep;
  }
  return {
    ...e,
    newColumns: e.newColumns.filter((c) => c.id !== col),
    cells,
    batches: withoutCells(e.batches, (_, c) => c === col),
  };
}

/**
 * Adds the invoice column with a reference on each line given, in order:
 * `<prefix>-1`, `<prefix>-2`… The caller passes every line not deleted,
 * left-out lines included: they are still owed.
 */
export function numberInvoices(e: SheetEdits, lines: readonly number[], prefix: string): SheetEdits {
  const { edits, col } = addColumn(e, "invoiceId", "");
  const changes = lines.map((line, i) => ({ line, col, text: `${prefix}-${i + 1}` }));
  return applyBatch(edits, {
    id: `number:${col}`, kind: "column", title: `Invoices numbered ${prefix}-1 to ${prefix}-${lines.length}`,
  }, changes);
}

/** Every cell of one column that holds `find`, with it replaced. Plain text,
 *  case-sensitive. Nothing for an empty `find`. */
export function replaceInColumn(
  values: readonly { line: number; text: string }[], col: ColumnId, find: string, replace: string,
): CellEdit[] {
  if (find === "") return [];
  return values
    .filter((v) => v.text.includes(find))
    .map((v) => ({ line: v.line, col, text: v.text.split(find).join(replace) }));
}

/**
 * Reads the table from another line. Every column-keyed change was made
 * under the old header's columns, so they go: roles, new columns, typed
 * cells, batches, new lines. Deleted and left-out lines below it stay.
 */
export function useAsHeader(e: SheetEdits, line: number): SheetEdits {
  return {
    ...NO_EDITS,
    headerLine: line,
    deleted: e.deleted.filter((l) => l > line),
    leftOut: e.leftOut.filter((l) => l > line),
  };
}

/** How many changes `useAsHeader` drops, for its confirmation. */
export function droppedByHeader(e: SheetEdits): number {
  const cells = Object.values(e.cells).reduce((n, r) => n + Object.keys(r).length, 0);
  return Object.keys(e.roles).length + e.newColumns.length + cells + e.newLines.length;
}

export interface ChangeCounts {
  /** Typed cells on file lines still in the run. */
  cells: number;
  /** Roles set and columns added. */
  columns: number;
  added: number;
  deleted: number;
  leftOut: number;
  /** The header line, when it was moved. */
  header?: number;
}

export function changeCounts(e: SheetEdits): ChangeCounts {
  const counted = (line: number) => !e.deleted.includes(line) && !e.leftOut.includes(line) && !e.newLines.includes(line);
  const cells = Object.entries(e.cells)
    .filter(([line]) => counted(Number(line)))
    .reduce((n, [, r]) => n + Object.keys(r).length, 0);
  return {
    cells,
    columns: Object.keys(e.roles).length + e.newColumns.length,
    added: e.newLines.length,
    deleted: e.deleted.length,
    leftOut: e.leftOut.length,
    ...(e.headerLine !== undefined ? { header: e.headerLine } : {}),
  };
}

export const changeTotal = (c: ChangeCounts) =>
  c.cells + c.columns + c.added + c.deleted + c.leftOut + (c.header !== undefined ? 1 : 0);

/** Whether the corrected file differs from the file chosen. Leaving a line
 *  out alone does not change it. */
export const fileChanged = (c: ChangeCounts) =>
  c.cells + c.columns + c.added + c.deleted > 0 || c.header !== undefined;

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** For the summary, through Check and Pay. */
export function changesText(c: ChangeCounts): string | undefined {
  const parts = [
    ...(c.cells > 0 ? [n(c.cells, "cell")] : []),
    ...(c.columns > 0 ? [`${n(c.columns, "column")} changed`] : []),
    ...(c.header !== undefined ? [`header on line ${c.header}`] : []),
    ...(c.added > 0 ? [`${n(c.added, "line")} added`] : []),
    ...(c.deleted > 0 ? [`${c.deleted} deleted`] : []),
    ...(c.leftOut > 0 ? [`${c.leftOut} left out`] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** For the Result screen: the spreadsheet is what the payer opens next month. */
export function correctionReminder(c: ChangeCounts): string | undefined {
  const did = changesText(c);
  return did && `Changed here: ${did}. Download the corrected file to update your spreadsheet.`;
}

/** The confirmation before `useAsHeader` drops changes. */
export function headerWarning(dropped: number): string {
  return `The ${dropped} change${dropped === 1 ? "" : "s"} made under the current header's columns will be dropped.`;
}
