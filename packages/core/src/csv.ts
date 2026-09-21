import { getAddress, isAddress } from "viem";
import type { TokenSet } from "./constants.js";
import type { ManifestItem } from "./types.js";

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
  // Split on newlines before quote-aware parsing: a quoted field containing a
  // literal newline (RFC 4180 permits it) will fragment. That's intentional — the
  // four columns are invoiceId, token (symbol), address, and amount; none
  // legitimately contains a newline, so multi-line quoted fields fail closed via
  // the column-count check below rather than producing bogus data.
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

export interface ResolvedRow extends ManifestItem {
  line: number;
}

/**
 * Decimal text to base units, by string arithmetic. No floating point: at six
 * decimals a double already loses digits on values a payroll reaches, and a
 * rounding error here is a wrong payment.
 *
 * Refuses rather than rounds. Silently truncating "0.0000001" for a 6-decimal
 * token would pay zero and report success.
 */
export function toBaseUnits(
  text: string,
  decimals: number,
): { ok: true; value: bigint } | { ok: false; reason: string } {
  const t = text.trim();
  if (t === "") return { ok: false, reason: "Amount is empty." };
  if (!/^\d*\.?\d*$/.test(t) || t === ".") {
    return {
      ok: false,
      reason: `"${text}" is not a plain decimal number. Scientific notation, thousands separators and negative values are not accepted.`,
    };
  }

  const [whole = "", frac = ""] = t.split(".");
  if (frac.length > decimals) {
    return {
      ok: false,
      reason: `"${text}" has ${frac.length} decimal places but this token has ${decimals} decimal place${decimals === 1 ? "" : "s"}. Rounding a payment is not something this tool will do quietly.`,
    };
  }

  const value = BigInt((whole || "0") + frac.padEnd(decimals, "0"));
  if (value === 0n) {
    return { ok: false, reason: "Amount is zero, which is legal on chain but meaningless in a payout." };
  }
  return { ok: true, value };
}

/**
 * Parsed text into manifest items.
 *
 * `decimals` is keyed by lowercased token address and can only come from
 * `decimals()` on chain. Requiring it here is how the "never hardcode
 * decimals" rule becomes a type signature instead of a comment.
 */
export function resolveRows(
  rows: ParsedRow[],
  tokens: TokenSet,
  decimals: Record<string, number>,
): { items: ResolvedRow[]; issues: CsvIssue[] } {
  const items: ResolvedRow[] = [];
  const issues: CsvIssue[] = [];

  const bySymbol = new Map<string, `0x${string}`>(
    Object.entries(tokens).map(([symbol, address]) => [symbol.toLowerCase(), address]),
  );

  for (const row of rows) {
    if (row.invoiceId === "") {
      issues.push({ line: row.line, message: "Invoice reference is empty." });
      continue;
    }

    const token = bySymbol.get(row.tokenSymbol.toLowerCase());
    if (!token) {
      issues.push({
        line: row.line,
        message: `Unknown token "${row.tokenSymbol}". This chain has ${[...bySymbol.keys()].join(", ")}.`,
      });
      continue;
    }

    const d = decimals[token.toLowerCase()];
    if (d === undefined) {
      issues.push({
        line: row.line,
        message: `No on-chain decimals were read for ${row.tokenSymbol}.`,
      });
      continue;
    }

    if (!isAddress(row.to)) {
      issues.push({ line: row.line, message: `"${row.to}" is not a valid address.` });
      continue;
    }

    const amount = toBaseUnits(row.amount, d);
    if (!amount.ok) {
      issues.push({ line: row.line, message: amount.reason });
      continue;
    }

    items.push({
      line: row.line,
      invoiceId: row.invoiceId,
      token,
      to: getAddress(row.to),
      amount: amount.value,
    });
  }

  return { items, issues };
}
