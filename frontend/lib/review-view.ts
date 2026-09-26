import {
  parseCsv, resolveRows, validateRun,
  type AmountKind, type CsvField, type ParsedCsv, type ParsedRow,
  type ResolvedRow, type TokenSet,
} from "@ledgerline/core";
import { applySheetEdits, NO_EDITS, type SheetEdits } from "@/lib/sheet-edits";

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
 * The sheet as read, with the payer's typed cells over it, through every
 * check that needs no wallet. The same rules read a typed value as a value
 * in the file: there is no second validator.
 */
export function checkRows(
  sheet: ParsedCsv, edits: SheetEdits, tokens: TokenSet, decimals: Record<string, number>,
): CheckedFile {
  const parsed = applySheetEdits(sheet, edits);
  const resolved = resolveRows(parsed, tokens, decimals, sheet.delimiter);
  const issues = [...sheet.issues, ...resolved.issues];
  const run = validateRun(resolved.items, issues.length);

  const allLeftOut = sheet.issues.length === 0 && parsed.length === 0 && edits.leftOut.length > 0;
  const fileProblems = [
    ...sheet.issues.map((i) => i.message),
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
