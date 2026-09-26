import {
  amountInFile, readAmount, type ColumnId, type Delimiter, type FileLine, type ParsedCsv,
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

/**
 * The payer's file with their changes in it, to replace the one in their
 * spreadsheet. Lines not edited, the header and every extra column are kept
 * as they were. A left-out line is kept unchanged: it is still owed. A
 * deleted line is not written.
 */
export function correctedCsv(lines: readonly FileLine[], sheet: ParsedCsv, edits: SheetEdits): string {
  const out = lines.map((l) => ({ ...l }));
  const columns = sheet.columns;
  if (columns) {
    for (const row of sheet.rows) {
      const typed = edits.cells[row.line];
      if (!typed || edits.leftOut.includes(row.line)) continue;
      const cells = row.unreadable ? sheet.header.map(() => "") : [...row.cells];
      for (const [col, text] of Object.entries(typed) as [ColumnId, string][]) {
        if (!col.startsWith("f")) continue;
        cells[Number(col.slice(1))] = col === columns.amount ? amountCell(text.trim(), sheet.delimiter) : text.trim();
      }
      out[row.line - 1]!.body = cells.map((c) => cellText(c, sheet.delimiter)).join(sheet.delimiter);
    }
  }
  return out.filter((_, i) => !edits.deleted.includes(i + 1)).map((l) => l.body + l.end).join("");
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
