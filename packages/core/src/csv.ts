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
  /** The file's field separator, read from its first line. */
  delimiter: "," | ";";
}

type Field = "invoiceId" | "token" | "to" | "amount";
const FIELDS: readonly Field[] = ["invoiceId", "token", "to", "amount"];

/** What a spreadsheet calls each field, once lowercased and stripped of
 *  spaces, `_`, `-` and `.`. A column is matched by name, never by place:
 *  a reordered column can no longer be read as the wrong field. */
const ALIASES: Record<Field, readonly string[]> = {
  invoiceId: ["invoiceid", "invoice", "invoiceno", "invoicenumber", "reference", "ref"],
  token: ["token", "currency", "asset"],
  to: ["to", "recipient", "address", "wallet", "recipientaddress", "walletaddress"],
  amount: ["amount", "value"],
};

/** How a field is named to a person. */
const FIELD_WORD: Record<Field, string> = {
  invoiceId: "invoice reference", token: "token", to: "recipient", amount: "amount",
};

const normalise = (name: string) => name.trim().toLowerCase().replace(/[\s_.-]/g, "");
const fieldFor = (name: string): Field | undefined =>
  FIELDS.find((f) => ALIASES[f].includes(normalise(name)));

/** `;` only when the first line uses it and no `,`, both outside quotes: the
 *  file Excel writes where a comma is the decimal mark. */
function delimiterOf(header: string): "," | ";" {
  let quoted = false;
  let comma = false;
  let semi = false;
  for (const ch of header) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ",") comma = true;
    else if (!quoted && ch === ";") semi = true;
  }
  return semi && !comma ? ";" : ",";
}

/**
 * Minimal RFC 4180. A real CSV library would be a dependency for 40 lines of
 * behaviour we can state exactly, and this file is on the path where a wrong
 * answer sends money to the wrong place.
 *
 * The first line is required and names the columns. They are matched by name,
 * in any order; a column that names nothing we pay is ignored.
 *
 * In a `;` file the comma is the decimal mark, so `0,10` is 0.10. A `.` there
 * is refused rather than read: in the locales that write `;` files, `1.000` is
 * one thousand, and this reader never guesses an amount.
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
    return { rows, issues: [{ line: 1, message: "The file is empty." }], delimiter: "," };
  }

  const delimiter = delimiterOf(lines[headerIndex]!);
  const names = splitLine(lines[headerIndex]!, delimiter).map((h) => h.trim());
  const headerLine = headerIndex + 1;

  const at: Partial<Record<Field, number>> = {};
  for (let i = 0; i < names.length; i++) {
    const field = fieldFor(names[i]!);
    if (!field) continue;
    const seen = at[field];
    if (seen !== undefined) {
      return {
        rows, delimiter,
        issues: [{
          line: headerLine,
          message: `Two columns could be the ${FIELD_WORD[field]}: "${names[seen]}" and "${names[i]}". Keep one.`,
        }],
      };
    }
    at[field] = i;
  }

  const missing = FIELDS.filter((f) => at[f] === undefined);
  if (missing.length > 0) {
    const found = names.filter((n) => n !== "").join(", ") || "nothing";
    return {
      rows, delimiter,
      issues: [{
        line: headerLine,
        message: `The first line must name the columns invoiceId, token, to and amount, in any order. Missing: ${missing.join(", ")}. Found: ${found}.`,
      }],
    };
  }

  const mark = delimiter === ";" ? "a semicolon" : "a comma";
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === "") continue;
    const line = i + 1;
    const cells = splitLine(raw, delimiter);

    if (cells.length !== names.length) {
      issues.push({
        line,
        message: `This line has ${cells.length} value${cells.length === 1 ? "" : "s"} but the first line names ${names.length} columns. A value that contains ${mark} needs quotes around it.`,
      });
      continue;
    }

    const cell = (f: Field) => cells[at[f]!]!.trim();
    let amount = cell("amount");
    if (delimiter === ";") {
      if (!/^\d*,?\d*$/.test(amount)) {
        issues.push({
          line,
          message: `In a file separated by ";", write amounts with a comma for decimals and no other marks, like 1250,50. Found "${amount}".`,
        });
        continue;
      }
      amount = amount.replace(",", ".");
    }

    rows.push({
      line,
      invoiceId: cell("invoiceId"),
      tokenSymbol: cell("token"),
      to: cell("to"),
      amount,
    });
  }

  return { rows, issues, delimiter };
}

/** One line into fields, honouring double quotes and the doubled-quote escape. */
function splitLine(line: string, delimiter: "," | ";"): string[] {
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
    } else if (ch === delimiter) {
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
