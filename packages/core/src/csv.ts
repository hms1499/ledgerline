import { getAddress, isAddress } from "viem";
import type { TokenSet } from "./constants.js";
import type { ManifestItem } from "./types.js";

/** One row as it appears in the file. Every value is still text: an amount
 *  is read by `readAmount` in `resolveRows`, with the file's delimiter, then
 *  scaled by the token's on-chain decimals. */
export interface ParsedRow {
  /** 1-based line in the file, counting the header. Errors are useless without it. */
  line: number;
  invoiceId: string;
  tokenSymbol: string;
  to: string;
  /** As written: `0,10` in a `;` file stays `0,10`. */
  amount: string;
  /** Every value on the line as read, extra columns included, so a corrected
   *  file keeps them. Never updated by an edit: edits overlay the four fields
   *  above, and a corrected file writes them over a copy of these. */
  cells: string[];
  /** Set when the line could not be split into the header's columns. Its four
   *  fields are then empty, and `text` is the line as written. */
  unreadable?: { message: string; text: string };
}

export type CsvField = "invoiceId" | "token" | "to" | "amount";

export interface CsvIssue {
  line: number;
  message: string;
  /** The field to fix. None when the fix is not one value (a line that
   *  could not be read, a token whose decimals were not read). */
  field?: CsvField;
  /** Each amount the text could mean, dot-decimal, when `readAmount` found any. */
  readings?: string[];
  kind?: AmountKind;
}

export interface ParsedCsv {
  rows: ParsedRow[];
  /** Problems with the file as a whole. A row's problems come from `resolveRows`. */
  issues: CsvIssue[];
  /** The file's field separator, read from its header line. */
  delimiter: Delimiter;
  /** The header line's names, as written. */
  header: string[];
  /** 1-based line of the header; 0 for a file with no line to name columns. */
  headerLine: number;
  /** What every column holds, the file's then the new ones, read from their
   *  names and any roles set on the Review step. Empty with no header. */
  roles: Record<ColumnId, Role>;
  /** Where each field sits. Undefined when the columns do not name all four once. */
  columns?: Record<CsvField, ColumnId>;
}

/** A tab is what a spreadsheet puts on the clipboard when cells are copied. */
export type Delimiter = "," | ";" | "\t";

/** A column of the sheet: `f<i>` is the file's column at index i on the
 *  header line; `n<k>` is the k-th column added on the Review step. */
export type ColumnId = `f${number}` | `n${number}`;

/** What a column holds for the run, or nothing. */
export type Role = CsvField | "unused";

/** One line of a file and the break that ended it (`""` for the last). */
export interface FileLine { body: string; end: string }

/** A column the file never had, added on the Review step. `fill` is the value
 *  of every line that has no cell of its own there. */
export interface NewColumn { id: `n${number}`; name: string; role: Role; fill: string }

/** How to read a file's lines as a table: which line names the columns, and
 *  which column holds what. */
export interface SheetStructure {
  /** 1-based. Default: the first line with a non-empty cell. */
  headerLine?: number;
  /** Roles for the file's columns, over those read from their names. */
  roles?: Readonly<Partial<Record<`f${number}`, Role>>>;
  newColumns?: readonly NewColumn[];
}

const FIELDS: readonly CsvField[] = ["invoiceId", "token", "to", "amount"];

/** What a spreadsheet calls each field, once lowercased and stripped of
 *  spaces, `_`, `-` and `.`. A column is matched by name, never by place:
 *  a reordered column can no longer be read as the wrong field. */
const ALIASES: Record<CsvField, readonly string[]> = {
  invoiceId: ["invoiceid", "invoice", "invoiceno", "invoicenumber", "reference", "ref"],
  token: ["token", "currency", "asset"],
  to: ["to", "recipient", "address", "wallet", "recipientaddress", "walletaddress"],
  amount: ["amount", "value"],
};

/** How a field is named to a person. */
const FIELD_WORD: Record<CsvField, string> = {
  invoiceId: "invoice reference", token: "token", to: "recipient", amount: "amount",
};

/** "a", "a or b", "a, b or c". */
const orList = (words: readonly string[]) =>
  words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`;

const normalise = (name: string) => name.trim().toLowerCase().replace(/[\s_.-]/g, "");
/** The field a column's name says it holds, if any. */
export const fieldFor = (name: string): CsvField | undefined =>
  FIELDS.find((f) => ALIASES[f].includes(normalise(name)));

/** A tab outside quotes wins: no column name we read contains one, and it is
 *  how cells copied from a spreadsheet arrive. Otherwise `;` only when the
 *  first line uses it and no `,`, both outside quotes: the file Excel writes
 *  where a comma is the decimal mark. */
function delimiterOf(header: string): Delimiter {
  let quoted = false;
  let comma = false;
  let semi = false;
  for (const ch of header) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "\t") return "\t";
    else if (!quoted && ch === ",") comma = true;
    else if (!quoted && ch === ";") semi = true;
  }
  return semi && !comma ? ";" : ",";
}

/** How an amount could be misread, so lines with the same doubt can be
 *  settled together. */
export type AmountKind = "thousands-marks" | "dot-or-thousands" | "comma-or-thousands";

/** `amount` and every entry of `readings` are dot-decimal text. */
export type AmountReading =
  | { ok: true; amount: string; warning?: string; readings?: string[]; kind?: AmountKind }
  | { ok: false; message: string; readings?: string[]; kind?: AmountKind };

/** Dot-decimal text as a person writes it in this file: a `;` file's decimal
 *  mark is the comma. */
export function amountInFile(amount: string, delimiter: Delimiter): string {
  return delimiter === ";" ? amount.replace(".", ",") : amount;
}

/**
 * An amount's text as this file means it, before any token's decimals.
 *
 * Never guesses. Where the text has two readings (one group of three digits
 * after a mark: `1,000`, `1.000`), both are returned for the payer to choose,
 * and only a `;` file's `1,000` is read, as the decimal its convention says,
 * with a warning. Where it has one (`1,250.50`), that one is offered, not
 * applied. Anything this function has no rule for is passed on as written:
 * `toBaseUnits` says what it cannot read.
 */
export function readAmount(text: string, delimiter: Delimiter): AmountReading {
  const t = text.trim();
  const inFile = (a: string) => amountInFile(a, delimiter);
  const both = (whole: string, frac: string): [string, string] => {
    const decimals = frac.replace(/0+$/, "");
    return [decimals ? `${whole}.${decimals}` : whole, whole + frac];
  };

  if (delimiter === ";") {
    if (/^\d*,?\d*$/.test(t)) {
      const g = /^([1-9]\d{0,2}),(\d{3})$/.exec(t);
      if (!g) return { ok: true, amount: t.replace(",", ".") };
      const [small, large] = both(g[1]!, g[2]!);
      return {
        ok: true, amount: small, kind: "comma-or-thousands", readings: [small, large],
        warning: `In a file separated by ";", the comma marks decimals, so "${t}" is read as ${inFile(small)}, not ${large}. If you meant ${large}, write it without the comma.`,
      };
    }
    // A dot that cannot group thousands can only be the decimal: Numbers
    // writes one so when the cell was text in a comma-decimal region.
    if (/^\d*\.\d+$/.test(t)) {
      const g = /^([1-9]\d{0,2})\.(\d{3})$/.exec(t);
      if (!g) return { ok: true, amount: t };
      const [small, large] = both(g[1]!, g[2]!);
      return {
        ok: false, kind: "dot-or-thousands", readings: [small, large],
        message: `In a file separated by ";", "${t}" could mean ${inFile(small)} or ${large}. Write ${large} for the larger amount, or ${inFile(small)} for the smaller.`,
      };
    }
    if (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t)) {
      const plain = t.replace(/\./g, "").replace(",", ".");
      return {
        ok: false, kind: "thousands-marks", readings: [plain],
        message: `"${t}" has marks between the thousands. Write it as ${inFile(plain)}.`,
      };
    }
    return {
      ok: false,
      message: `In a file separated by ";", write amounts with a comma for decimals and no other marks, like 1250,50. Found "${t}".`,
    };
  }

  const g = /^([1-9]\d{0,2}),(\d{3})$/.exec(t);
  if (g) {
    const [small, large] = both(g[1]!, g[2]!);
    return {
      ok: false, kind: "comma-or-thousands", readings: [small, large],
      message: `"${t}" could mean ${small} or ${large}. Write ${large} for the larger amount, or ${small} for the smaller.`,
    };
  }
  if (/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(t)) {
    const plain = t.replace(/,/g, "");
    return {
      ok: false, kind: "thousands-marks", readings: [plain],
      message: `"${t}" has marks between the thousands. Write it as ${plain}.`,
    };
  }
  return { ok: true, amount: t };
}

/**
 * The file's lines, each with the break that ended it, so a line not edited
 * can be written back byte for byte. The one place lines are numbered:
 * reading and writing a file cannot disagree about which line is which.
 */
export function readLines(text: string): FileLine[] {
  const out: FileLine[] = [];
  const re = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push({ body: m[1]!, end: m[2]! });
    if (m[2] === "") break;
  }
  return out;
}

/** A line with nothing in it: empty, or only delimiters (`,,,,,` is how a
 *  spreadsheet writes an empty row). It holds no data, so skipping it
 *  guesses nothing. */
export function isBlankLine(body: string, delimiter: Delimiter): boolean {
  return body.trim() === "" || splitCells(body, delimiter).every((c) => c.trim() === "");
}

/**
 * Minimal RFC 4180. A real CSV library would be a dependency for 40 lines of
 * behaviour we can state exactly, and this file is on the path where a wrong
 * answer sends money to the wrong place.
 *
 * Reads a file's lines as a table under a structure: the header line, which
 * column holds what, and columns added on the Review step. Splits and maps;
 * reads no meaning. A column that holds nothing we pay is kept in `cells` and
 * otherwise ignored. Every data line is returned, even one that cannot be
 * split into the header's columns, so the payer can see it and fix it. What a
 * value means (an amount, a token, an address) is `resolveRows`' job.
 */
export function readSheet(lines: readonly FileLine[], structure: SheetStructure = {}): ParsedCsv {
  const rows: ParsedRow[] = [];
  // Excel writes a BOM; left in place it becomes part of the first header name.
  const bodies = lines.map((l, i) => (i === 0 ? l.body.replace(/^﻿/, "") : l.body));
  const blank = (b: string) => isBlankLine(b, delimiterOf(b));

  const chosen = structure.headerLine;
  const headerIndex = chosen !== undefined && chosen >= 1 && chosen <= bodies.length && !blank(bodies[chosen - 1]!)
    ? chosen - 1
    : bodies.findIndex((b) => !blank(b));
  if (headerIndex === -1) {
    return { rows, issues: [{ line: 1, message: "The file is empty." }], delimiter: ",", header: [], headerLine: 0, roles: {} };
  }

  const headerLine = headerIndex + 1;
  const delimiter = delimiterOf(bodies[headerIndex]!);
  const header = splitCells(bodies[headerIndex]!, delimiter);
  const names = header.map((h) => h.trim());
  const newColumns = structure.newColumns ?? [];

  const roles: Record<ColumnId, Role> = {};
  names.forEach((name, i) => { roles[`f${i}`] = structure.roles?.[`f${i}`] ?? fieldFor(name) ?? "unused"; });
  for (const c of newColumns) roles[c.id] = c.role;
  const nameOf = (id: ColumnId) =>
    id.startsWith("f") ? names[Number(id.slice(1))]! : newColumns.find((c) => c.id === id)!.name;

  const at: Partial<Record<CsvField, ColumnId>> = {};
  for (const id of Object.keys(roles) as ColumnId[]) {
    const role = roles[id];
    if (role === undefined || role === "unused") continue;
    const seen = at[role];
    if (seen !== undefined) {
      return {
        rows, delimiter, header, headerLine, roles,
        issues: [{
          line: headerLine,
          message: `Two columns could be the ${FIELD_WORD[role]}: "${nameOf(seen)}" and "${nameOf(id)}". Mark one not used.`,
        }],
      };
    }
    at[role] = id;
  }

  const missing = FIELDS.filter((f) => at[f] === undefined);
  if (missing.length > 0) {
    const named = names.filter((n) => n !== "");
    const it = missing.length === 1 ? "it" : "them";
    const message = named.length === 1 && Object.keys(at).length === 0
      ? `Line ${headerLine}, "${named[0]}", does not name columns. If the names are on a later line, use that line as the header.`
      : `No column is the ${orList(missing.map((f) => FIELD_WORD[f]))}. Choose ${it} under a column's name, or add ${it}.`;
    return { rows, delimiter, header, headerLine, roles, issues: [{ line: headerLine, message }] };
  }
  const columns = at as Record<CsvField, ColumnId>;

  const fills = new Map<ColumnId, string>(newColumns.map((c) => [c.id, c.fill.trim()]));
  const mark = { ",": "a comma", ";": "a semicolon", "\t": "a tab" }[delimiter];
  for (let i = headerIndex + 1; i < bodies.length; i++) {
    const raw = bodies[i]!;
    if (isBlankLine(raw, delimiter)) continue;
    const line = i + 1;
    const cells = splitCells(raw, delimiter);

    if (cells.length !== names.length) {
      rows.push({
        line, invoiceId: "", tokenSymbol: "", to: "", amount: "", cells,
        unreadable: {
          message: `This line has ${cells.length} value${cells.length === 1 ? "" : "s"} but the first line names ${names.length} columns. A value that contains ${mark} needs quotes around it.`,
          text: raw,
        },
      });
      continue;
    }

    const cell = (f: CsvField) => {
      const id = columns[f];
      return id.startsWith("f") ? cells[Number(id.slice(1))]!.trim() : fills.get(id) ?? "";
    };
    rows.push({
      line, invoiceId: cell("invoiceId"), tokenSymbol: cell("token"), to: cell("to"), amount: cell("amount"), cells,
    });
  }

  return { rows, issues: [], delimiter, header, headerLine, roles, columns };
}

/** A file's text read as it stands: its first line with a cell is the header. */
export function parseCsv(text: string): ParsedCsv {
  return readSheet(readLines(text));
}

/** One line into fields, honouring double quotes and the doubled-quote escape. */
export function splitCells(line: string, delimiter: Delimiter): string[] {
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
  symbol = "this token",
): { ok: true; value: bigint } | { ok: false; reason: string } {
  const t = text.trim();
  if (t === "") return { ok: false, reason: "The amount is empty. Enter the amount owed." };
  if (!/^\d*\.?\d*$/.test(t) || t === ".") {
    return {
      ok: false,
      reason: `"${text}" is not an amount this page can read. Write it with digits and a dot only, like 1000 or 12.50.`,
    };
  }

  const [whole = "", frac = ""] = t.split(".");
  if (frac.length > decimals) {
    return {
      ok: false,
      reason: `"${text}" has ${frac.length} decimal places, but ${symbol} has ${decimals}. Round it yourself, so the amount paid is exactly what you mean.`,
    };
  }

  const value = BigInt((whole || "0") + frac.padEnd(decimals, "0"));
  if (value === 0n) {
    return { ok: false, reason: "The amount is zero. Enter the amount owed, or remove this line." };
  }
  return { ok: true, value };
}

/**
 * Parsed text into manifest items.
 *
 * `decimals` is keyed by lowercased token address and can only come from
 * `decimals()` on chain. Requiring it here is how the "never hardcode
 * decimals" rule becomes a type signature instead of a comment.
 *
 * Every field a row gets wrong is reported at once, each naming its field,
 * so a payer fixing a line sees everything that line needs. `delimiter` is
 * the file's: it decides what an amount's marks mean (`readAmount`).
 */
export function resolveRows(
  rows: ParsedRow[],
  tokens: TokenSet,
  decimals: Record<string, number>,
  delimiter: Delimiter = ",",
): { items: ResolvedRow[]; issues: CsvIssue[]; warnings: CsvIssue[] } {
  const items: ResolvedRow[] = [];
  const issues: CsvIssue[] = [];
  const warnings: CsvIssue[] = [];

  const bySymbol = new Map<string, `0x${string}`>(
    Object.entries(tokens).map(([symbol, address]) => [symbol.toLowerCase(), address]),
  );
  const spelled = new Map<string, string>(Object.keys(tokens).map((s) => [s.toLowerCase(), s]));

  for (const row of rows) {
    const { line } = row;
    if (row.unreadable) {
      issues.push({ line, message: row.unreadable.message });
      continue;
    }

    const problems: CsvIssue[] = [];
    if (row.invoiceId === "") {
      problems.push({ line, field: "invoiceId", message: "The invoice reference is empty. Every payment needs one." });
    }

    const token = bySymbol.get(row.tokenSymbol.toLowerCase());
    if (!token) {
      problems.push({
        line, field: "token",
        message: `"${row.tokenSymbol}" is not a token this page pays. Use one of: ${Object.keys(tokens).join(", ")}.`,
      });
    }
    const d = token ? decimals[token.toLowerCase()] : undefined;
    if (token && d === undefined) {
      problems.push({ line, message: `No on-chain decimals were read for ${row.tokenSymbol}.` });
    }

    if (!isAddress(row.to)) {
      problems.push({
        line, field: "to",
        message: `"${row.to}" is not a wallet address. Use the full address: 0x followed by 40 letters and digits.`,
      });
    }

    let value: bigint | undefined;
    const read = readAmount(row.amount, delimiter);
    if (!read.ok) {
      problems.push({ line, field: "amount", message: read.message, readings: read.readings, kind: read.kind });
    } else {
      if (read.warning) {
        warnings.push({ line, field: "amount", message: read.warning, readings: read.readings, kind: read.kind });
      }
      // With the token unknown its form is still checked. 18 is more places
      // than any token here has, so only a malformed amount fails; the token's
      // own precision is checked once the token is known.
      const scaled = toBaseUnits(read.amount, d ?? 18, spelled.get(row.tokenSymbol.toLowerCase()));
      if (!scaled.ok) problems.push({ line, field: "amount", message: scaled.reason });
      else if (d !== undefined) value = scaled.value;
    }

    if (problems.length > 0 || !token || value === undefined) {
      issues.push(...problems);
      continue;
    }
    items.push({ line, invoiceId: row.invoiceId, token, to: getAddress(row.to), amount: value });
  }

  return { items, issues, warnings };
}
