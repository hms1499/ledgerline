import {
  parseCsv, resolveRows, validateRun,
  type AmountKind, type CsvField, type ParsedCsv, type ParsedRow,
  type ResolvedRow, type TokenSet,
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

  return { rows: resolved.items, parsed, fileProblems, problems };
}

/** A file's text through every check that needs no wallet, with no edits. */
export function checkRunFile(text: string, tokens: TokenSet, decimals: Record<string, number>): CheckedFile {
  return checkRows(parseCsv(text), NO_EDITS, tokens, decimals);
}
