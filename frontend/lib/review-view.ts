import {
  parseCsv, resolveRows, validateRun,
  type AmountKind, type CsvField, type CsvIssue, type ParsedCsv, type ParsedRow,
  type ResolvedRow, type RowIssue, type TokenSet,
} from "@ledgerline/core";
import { applyEdits, NO_EDITS, type RunEdits } from "@/lib/run-edits";

export const ALL_LEFT_OUT = "Every line is left out of this run. Put one back to pay it.";

/** One problem with one line, as the fix list shows it. */
export interface RowProblem {
  line: number;
  field?: CsvField;
  message: string;
  level: "error" | "warning";
  readings?: string[];
  kind?: AmountKind;
}

export interface CheckedFile {
  rows: ResolvedRow[];
  /** Every row as checked (edits applied, left-out lines dropped), by line. */
  parsed: ParsedRow[];
  issues: CsvIssue[];
  errors: RowIssue[];
  warnings: RowIssue[];
  /** Problems with the file as a whole: its first line, no payments, too many. */
  fileProblems: string[];
  /** Problems with single lines, by line, a line's errors before its warnings. */
  problems: RowProblem[];
}

/**
 * The file as read, with the payer's edits over it, through every check that
 * needs no wallet. The same rules read an edited value as a value in the
 * file: there is no second validator.
 */
export function checkRows(
  source: ParsedCsv, edits: RunEdits, tokens: TokenSet, decimals: Record<string, number>,
): CheckedFile {
  const parsed = applyEdits(source.rows, edits);
  const resolved = resolveRows(parsed, tokens, decimals, source.delimiter);
  const issues = [...source.issues, ...resolved.issues];
  const run = validateRun(resolved.items, issues.length);

  const allLeftOut = parsed.length === 0 && source.rows.length > 0;
  const fileProblems = [
    ...source.issues.map((i) => i.message),
    ...(allLeftOut ? [ALL_LEFT_OUT] : run.errors.filter((e) => e.line === undefined).map((e) => e.message)),
  ];
  // Stable sort: a line's errors were listed before its warnings, and stay so.
  const problems: RowProblem[] = [
    ...resolved.issues.map((i) => ({ ...i, level: "error" as const })),
    ...run.errors.filter((e) => e.line !== undefined)
      .map((e) => ({ line: e.line!, field: e.field, message: e.message, level: "error" as const })),
    ...resolved.warnings.map((w) => ({ ...w, level: "warning" as const })),
    ...run.warnings.filter((w) => w.line !== undefined)
      .map((w) => ({ line: w.line!, field: w.field, message: w.message, level: "warning" as const })),
  ].sort((a, b) => a.line - b.line);

  return {
    rows: resolved.items, parsed, issues,
    errors: run.errors, warnings: [...resolved.warnings, ...run.warnings],
    fileProblems, problems,
  };
}

/** A file's text through every check that needs no wallet, with no edits. */
export function checkRunFile(text: string, tokens: TokenSet, decimals: Record<string, number>): CheckedFile {
  return checkRows(parseCsv(text), NO_EDITS, tokens, decimals);
}

export interface ReviewItem {
  key: string;
  /** "Line 5 · INV-4", "Line 1", or "This file". */
  where: string;
  message: string;
  level: "error" | "warning";
}

export interface ReviewView {
  items: ReviewItem[];
  /** Errors that stop the run: one per line, plus one for the file as a whole. */
  blocking: number;
  title?: string;
  summary?: string;
  /** The primary button's label while anything blocks. */
  fixFirst?: string;
}

/**
 * The review step's problems as one list a person can work down: sorted by
 * line, a line's errors before its warnings, each naming its invoice when the
 * file gave one. Problems with the whole file carry no line and come first.
 */
export function reviewView({
  issues, errors, warnings, parsed,
}: { issues: CsvIssue[]; errors: RowIssue[]; warnings: RowIssue[]; parsed: ParsedRow[] }): ReviewView {
  const invoiceAt = new Map(parsed.map((r) => [r.line, r.invoiceId]));
  const raw = [
    ...issues.map((i) => ({ line: i.line as number | undefined, invoiceId: undefined as string | undefined, message: i.message, level: "error" as const })),
    ...errors.map((e) => ({ line: e.line, invoiceId: e.invoiceId, message: e.message, level: "error" as const })),
    ...warnings.map((w) => ({ line: w.line, invoiceId: w.invoiceId, message: w.message, level: "warning" as const })),
  ];
  if (raw.length === 0) return { items: [], blocking: 0 };

  // Stable sort: equal keys keep the order they were found in.
  raw.sort((a, b) =>
    (a.line ?? 0) - (b.line ?? 0) || (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));

  const items = raw.map((r, n): ReviewItem => {
    const invoice = r.invoiceId || (r.line !== undefined ? invoiceAt.get(r.line) : undefined);
    const where = r.line === undefined ? "This file" : invoice ? `Line ${r.line} · ${invoice}` : `Line ${r.line}`;
    return { key: `${n}-${where}`, where, message: r.message, level: r.level };
  });

  const blocking = new Set(raw.filter((r) => r.level === "error").map((r) => r.line ?? "file")).size;
  if (blocking === 0) {
    return {
      items, blocking,
      title: "Check these lines",
      summary: "Worth a second look before paying. They do not stop the run.",
    };
  }
  const one = blocking === 1;
  return {
    items, blocking,
    title: "Fix these lines",
    summary: `${blocking} ${one ? "problem stops" : "problems stop"} this run from being paid. Fix ${one ? "it" : "them"} in the file and choose it again.`,
    fixFirst: `Fix ${blocking} ${one ? "problem" : "problems"} first`,
  };
}
