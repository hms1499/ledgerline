import { amountInFile, readAmount, type CsvField, type Delimiter, type ParsedCsv } from "@ledgerline/core";
import type { RunEdits } from "@/lib/run-edits";
import { PASTED_ROWS } from "@/lib/run-file";

/** The file's lines, each with the break that ended it, so a line not edited
 *  goes back byte for byte. Numbered as `parseCsv` numbers them. */
function linesOf(text: string): { body: string; end: string }[] {
  const out: { body: string; end: string }[] = [];
  const re = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push({ body: m[1]!, end: m[2]! });
    if (m[2] === "") break;
  }
  return out;
}

const cellText = (value: string, delimiter: Delimiter) =>
  /["\r\n]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value;

/** An edited amount in the file's own convention: `0,10` in a `;` file, so a
 *  comma-decimal Numbers stores a number, not text. */
function amountCell(text: string, delimiter: Delimiter): string {
  const read = readAmount(text, delimiter);
  return read.ok ? amountInFile(read.amount, delimiter) : text.trim();
}

/**
 * The payer's file with their fixes in it, to replace the one in their
 * spreadsheet. Lines not edited, the header and every extra column are kept
 * as they were. A left-out line is kept unchanged: it is still owed.
 */
export function correctedCsv(text: string, source: ParsedCsv, edits: RunEdits): string {
  if (!source.columns) return text;
  const columns = source.columns;
  const lines = linesOf(text);
  for (const row of source.rows) {
    const e = edits.cells[row.line];
    if (!e || edits.removed.includes(row.line)) continue;
    const cells = row.unreadable ? source.header.map(() => "") : [...row.cells];
    for (const f of Object.keys(e) as CsvField[]) {
      const value = e[f]!.trim();
      cells[Number(columns[f].slice(1))] = f === "amount" ? amountCell(value, source.delimiter) : value;
    }
    lines[row.line - 1]!.body = cells.map((c) => cellText(c, source.delimiter)).join(source.delimiter);
  }
  return lines.map((l) => l.body + l.end).join("");
}

export function correctedFile(d: {
  text: string; source: ParsedCsv; edits: RunEdits; sourceName: string;
}): { name: string; text: string; type: string } {
  if (d.sourceName === PASTED_ROWS) {
    return {
      name: "pasted-rows-corrected.tsv",
      text: correctedCsv(d.text, d.source, d.edits),
      type: "text/tab-separated-values",
    };
  }

  // Extract extension from filename (case-insensitive)
  const extMatch = /\.([^.]+)$/.exec(d.sourceName);
  const ext = extMatch ? extMatch[1]!.toLowerCase() : "";

  // Determine final extension and type based on the original extension
  let finalExt: string;
  let finalType: string;
  if (ext === "csv") {
    finalExt = "csv";
    finalType = "text/csv";
  } else if (ext === "tsv") {
    finalExt = "tsv";
    finalType = "text/tab-separated-values";
  } else {
    // For .txt, other extensions, or no extension: use .csv
    finalExt = "csv";
    finalType = "text/csv";
  }

  // Get base name: remove any extension
  const baseName = d.sourceName.replace(/\.[^.]+$/, "");

  return {
    name: `${baseName}-corrected.${finalExt}`,
    text: correctedCsv(d.text, d.source, d.edits),
    type: finalType,
  };
}
