/** One row as it appears in the file. `amount` is still text: converting it
 *  needs the token's on-chain decimals, which is Task 2's job. */
export interface ParsedRow {
  /** 1-based line in the file, counting the header. Errors are useless without it. */
  line: number;
  invoiceId: string;
  tokenSymbol: string;
  to: string;
  amount: string;
}

export interface CsvIssue {
  line: number;
  message: string;
}

export interface ParsedCsv {
  rows: ParsedRow[];
  issues: CsvIssue[];
}

const COLUMNS = ["invoiceid", "token", "to", "amount"] as const;

/**
 * Minimal RFC 4180. A real CSV library would be a dependency for 40 lines of
 * behaviour we can state exactly, and this file is on the path where a wrong
 * answer sends money to the wrong place.
 *
 * The header is required and its names are checked. A silently reordered
 * column is a wrong-payment bug, not a formatting preference.
 */
export function parseCsv(text: string): ParsedCsv {
  const issues: CsvIssue[] = [];
  const rows: ParsedRow[] = [];

  // Excel writes a BOM; left in place it becomes part of the first header name.
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n");

  const headerIndex = lines.findIndex((l) => l.trim() !== "");
  if (headerIndex === -1) {
    return { rows, issues: [{ line: 1, message: "The file is empty." }] };
  }

  const header = splitLine(lines[headerIndex]!).map((h) => h.trim().toLowerCase());
  if (header.length !== COLUMNS.length || !COLUMNS.every((c, i) => header[i] === c)) {
    return {
      rows,
      issues: [{
        line: headerIndex + 1,
        message: `The header must read exactly: invoiceId,token,to,amount — found "${lines[headerIndex]!.trim()}".`,
      }],
    };
  }

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === "") continue;
    const line = i + 1;
    const cells = splitLine(raw);

    if (cells.length !== COLUMNS.length) {
      issues.push({
        line,
        message: `Expected ${COLUMNS.length} columns, found ${cells.length}.`,
      });
      continue;
    }

    rows.push({
      line,
      invoiceId: cells[0]!.trim(),
      tokenSymbol: cells[1]!.trim(),
      to: cells[2]!.trim(),
      amount: cells[3]!.trim(),
    });
  }

  return { rows, issues };
}

/** One line into fields, honouring double quotes and the doubled-quote escape. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}
