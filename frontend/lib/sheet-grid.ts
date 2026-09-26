import {
  isBlankLine, splitCells,
  type ColumnId, type CsvField, type Delimiter, type FileLine, type ParsedCsv, type Role, type TokenSet,
} from "@ledgerline/core";
import type { CheckedFile } from "@/lib/review-view";
import type { SheetEdits } from "@/lib/sheet-edits";

export interface GridColumn { id: ColumnId; name: string; role: Role; isNew: boolean }
export interface GhostColumn { role: CsvField; rule: string }
export interface GridCell { col: ColumnId; id: string; text: string; edited: boolean; was?: string; problem?: string }
export interface GridRow {
  line: number;
  label: string;
  state: "row" | "left-out" | "deleted";
  isNew: boolean;
  cells: GridCell[];
  /** A problem with the line as a whole, or why it could not be read. */
  message?: string;
  /** The line as written, when it does not split into the header's columns. */
  raw?: string;
}
export interface GridView {
  columns: GridColumn[];
  ghosts: GhostColumn[];
  rows: GridRow[];
  /** Lines above the header with anything in them. */
  above: { line: number; text: string }[];
  delimiter: Delimiter;
}

const FIELDS: readonly CsvField[] = ["invoiceId", "token", "to", "amount"];

export const cellId = (line: number, col: ColumnId) => `cell-${line}-${col}`;

/** What the template asks of a column, for a ghost column's menu. */
export function templateRule(role: CsvField, delimiter: Delimiter, symbols: readonly string[]): string {
  switch (role) {
    case "invoiceId": return "Every line needs its own reference.";
    case "token": return `One of ${symbols.join(", ")}.`;
    case "to": return "A wallet address: 0x and 40 letters and digits.";
    case "amount": return `As on an invoice: ${delimiter === ";" ? "1250,50" : "1250.50"}.`;
  }
}

/**
 * The file as the grid and the phone cards show it: every line from the
 * header down, split with the header's delimiter whether or not the header
 * names all four roles, each cell with what was typed over it and the
 * problem core found there; new lines after the file's.
 */
export function sheetGrid({ lines, sheet, edits, checked, tokens }: {
  lines: readonly FileLine[]; sheet: ParsedCsv; edits: SheetEdits; checked: CheckedFile; tokens: TokenSet;
}): GridView {
  const d = sheet.delimiter;
  if (sheet.headerLine === 0) return { columns: [], ghosts: [], rows: [], above: [], delimiter: d };
  const body = (i: number) => (i === 0 ? lines[0]!.body.replace(/^﻿/, "") : lines[i]!.body);

  const columns: GridColumn[] = [
    ...sheet.header.map((n, i) => ({
      id: `f${i}` as const, name: n.trim() || `Column ${i + 1}`, role: sheet.roles[`f${i}`] ?? "unused", isNew: false,
    })),
    ...edits.newColumns.map((c) => ({ id: c.id, name: c.name, role: c.role, isNew: true })),
  ];
  const held = new Set<Role>(Object.values(sheet.roles));
  const symbols = Object.keys(tokens);
  const ghosts = FIELDS.filter((f) => !held.has(f)).map((role) => ({ role, rule: templateRule(role, d, symbols) }));
  const fieldOf = new Map<ColumnId, CsvField>(
    columns.filter((c) => c.role !== "unused").map((c) => [c.id, c.role as CsvField]),
  );

  const problemAt = new Map<string, string>();
  const lineMessage = new Map<number, string>();
  for (const p of checked.problems) {
    if (p.field) {
      const k = `${p.line}:${p.field}`;
      if (!problemAt.has(k)) problemAt.set(k, p.message);
    } else if (!lineMessage.has(p.line)) lineMessage.set(p.line, p.message);
  }

  const fills = new Map<ColumnId, string>(edits.newColumns.map((c) => [c.id, c.fill]));
  const width = sheet.header.length;
  const row = (line: number, raw: string[] | undefined, isNew: boolean): GridRow => {
    const readable = raw !== undefined && raw.length === width;
    const cells = columns.map(({ id }): GridCell => {
      const own = edits.cells[line]?.[id];
      const read = id.startsWith("f") ? (readable ? raw![Number(id.slice(1))] ?? "" : "") : fills.get(id) ?? "";
      const field = fieldOf.get(id);
      const problem = field ? problemAt.get(`${line}:${field}`) : undefined;
      return {
        col: id, id: cellId(line, id), text: own ?? read, edited: own !== undefined,
        ...(own !== undefined ? { was: read } : {}),
        ...(problem ? { problem } : {}),
      };
    });
    const state = edits.deleted.includes(line) ? "deleted" : edits.leftOut.includes(line) ? "left-out" : "row";
    const message = lineMessage.get(line);
    return { line, label: isNew ? `${line} new` : `${line}`, state, isNew, cells, ...(message ? { message } : {}) };
  };

  const rows: GridRow[] = [];
  for (let i = sheet.headerLine; i < lines.length; i++) {
    const b = body(i);
    if (isBlankLine(b, d)) continue;
    const raw = splitCells(b, d);
    const r = row(i + 1, raw, false);
    rows.push(raw.length === width ? r : {
      ...r, raw: b,
      message: r.message ?? `This line has ${raw.length} values but the header names ${width} columns.`,
    });
  }
  for (const line of edits.newLines) rows.push(row(line, undefined, true));

  const above: { line: number; text: string }[] = [];
  for (let i = 0; i < sheet.headerLine - 1; i++) {
    const b = body(i);
    if (!isBlankLine(b, d)) above.push({ line: i + 1, text: b });
  }
  return { columns, ghosts, rows, above, delimiter: d };
}
