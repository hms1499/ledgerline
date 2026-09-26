import {
  amountInFile, fieldFor, readAmount, type ColumnId, type Delimiter, type FileLine, type ParsedCsv, type Role,
} from "@ledgerline/core";
import type { SheetEdits } from "@/lib/sheet-edits";
import { PASTED_ROWS } from "@/lib/run-file";

const cellText = (value: string, delimiter: Delimiter) =>
  /["\r\n]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value;

/** An edited amount in the file's own convention: `0,10` in a `;` file, so a
 *  comma-decimal Numbers stores a number, not text. */
function amountCell(text: string, delimiter: Delimiter): string {
  const read = readAmount(text, delimiter);
  return read.ok ? amountInFile(read.amount, delimiter) : text.trim();
}

const BOM = "﻿";

/**
 * How the header names a column so the file reads back the same: a role
 * under a name that does not say it gets the role's name, and a column
 * marked not used whose name says a role is told apart from it.
 */
export function headerName(name: string, role: Role): string {
  const read = fieldFor(name);
  if (role === "unused") return read ? `${name} (not used)` : name;
  return read === role ? name : role;
}

/**
 * The payer's file with their changes in it, to replace the one in their
 * spreadsheet. Read back with no edits, it is the run on screen. Lines above
 * the header are not part of the table and are not written. A line nothing
 * was typed on, when no column was added, and every blank line, are written
 * byte for byte. A deleted line is not written; a left-out line keeps its
 * own cells, since it is still owed.
 */
export function correctedCsv(lines: readonly FileLine[], sheet: ParsedCsv, edits: SheetEdits): string {
  const columns = sheet.columns;
  if (!columns || sheet.headerLine === 0) return lines.map((l) => l.body + l.end).join("");
  const d = sheet.delimiter;
  const h = sheet.headerLine - 1;
  const eol = lines.find((l) => l.end !== "")?.end ?? "\n";
  const bom = lines[0]?.body.startsWith(BOM) ? BOM : "";
  const newCols = edits.newColumns;
  const fileCols = sheet.header.map((_, i) => `f${i}` as const);
  const own = (line: number, col: ColumnId) => edits.cells[line]?.[col];
  const write = (cells: string[]) => cells.map((c) => cellText(c, d)).join(d);
  const value = (col: ColumnId, text: string) => (col === columns.amount ? amountCell(text.trim(), d) : text.trim());
  const extra = (line: number) => newCols.map((c) => value(c.id, own(line, c.id) ?? c.fill));

  const out: FileLine[] = [];
  const names = sheet.header.map((n, i) => headerName(n.trim(), sheet.roles[`f${i}`] ?? "unused"));
  const renamed = names.some((n, i) => n !== sheet.header[i]!.trim());
  out.push({
    body: renamed || newCols.length > 0
      ? write([...names, ...newCols.map((c) => headerName(c.name, c.role))])
      : lines[h]!.body.replace(/^﻿/, ""),
    end: lines[h]!.end,
  });

  const byLine = new Map(sheet.rows.map((r) => [r.line, r]));
  for (let i = h + 1; i < lines.length; i++) {
    const line = i + 1;
    if (edits.deleted.includes(line)) continue;
    const row = byLine.get(line);
    const typed = Object.keys(edits.cells[line] ?? {}).length > 0;
    const leftOut = edits.leftOut.includes(line);
    if (!row || (newCols.length === 0 && (!typed || leftOut))) { out.push(lines[i]!); continue; }
    if (row.unreadable && (!typed || leftOut)) { out.push(lines[i]!); continue; }
    const base = row.unreadable ? sheet.header.map(() => "") : row.cells;
    const cells = leftOut ? [...base] : fileCols.map((col, k) => {
      const t = own(line, col);
      return t === undefined ? base[k] ?? "" : value(col, t);
    });
    out.push({ body: write([...cells, ...extra(line)]), end: lines[i]!.end });
  }

  // New lines go before the empty line a final break leaves, if any.
  const tail = out.length > 1 && out.at(-1)!.body === "" && out.at(-1)!.end === "" ? out.pop() : undefined;
  for (const line of edits.newLines) {
    if (edits.deleted.includes(line)) continue;
    out.push({ body: write([...fileCols.map((col) => value(col, own(line, col) ?? "")), ...extra(line)]), end: eol });
  }
  if (tail) out.push(tail);
  // A line that had no break, and is no longer the last, gets one.
  for (let k = 0; k < out.length - 1; k++) if (out[k]!.end === "") out[k] = { ...out[k]!, end: eol };

  return bom + out.map((l) => l.body + l.end).join("");
}

export function correctedFile(d: {
  lines: readonly FileLine[]; sheet: ParsedCsv; edits: SheetEdits; sourceName: string;
}): { name: string; text: string; type: string } {
  const text = correctedCsv(d.lines, d.sheet, d.edits);
  if (d.sourceName === PASTED_ROWS) {
    return { name: "pasted-rows-corrected.tsv", text, type: "text/tab-separated-values" };
  }
  const extMatch = /\.([^.]+)$/.exec(d.sourceName);
  const ext = extMatch ? extMatch[1]!.toLowerCase() : "";
  const tsv = ext === "tsv";
  const baseName = d.sourceName.replace(/\.[^.]+$/, "");
  return {
    name: `${baseName}-corrected.${tsv ? "tsv" : "csv"}`,
    text,
    type: tsv ? "text/tab-separated-values" : "text/csv",
  };
}
