import {
  parseCsv, resolveRows, validateRun,
  type CsvIssue, type ParsedRow, type ResolvedRow, type RowIssue, type TokenSet,
} from "@ledgerline/core";

export interface CheckedFile {
  rows: ResolvedRow[];
  parsed: ParsedRow[];
  issues: CsvIssue[];
  errors: RowIssue[];
  warnings: RowIssue[];
}

/**
 * A file's text through every check that needs no wallet: read, resolved
 * against the chain's tokens and decimals, validated as a run. `issues` are
 * rows refused outright; `warnings` never stop a run.
 */
export function checkRunFile(text: string, tokens: TokenSet, decimals: Record<string, number>): CheckedFile {
  const csv = parseCsv(text);
  const resolved = resolveRows(csv.rows, tokens, decimals);
  const issues = [...csv.issues, ...resolved.issues];
  const run = validateRun(resolved.items, issues.length);
  return {
    rows: resolved.items, parsed: csv.rows, issues,
    errors: run.errors, warnings: [...csv.warnings, ...run.warnings],
  };
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
