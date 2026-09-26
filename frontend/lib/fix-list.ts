import { amountInFile, type ColumnId, type CsvField, type ParsedCsv, type TokenSet } from "@ledgerline/core";
import type { CheckedFile, RowProblem } from "@/lib/review-view";
import type { Batch, CellEdit, SheetEdits } from "@/lib/sheet-edits";

export const GROUP_MIN = 3;
export const RECIPIENT_HELP = "Paste the full address. Check it against the one you were given.";

const FIELDS: readonly CsvField[] = ["invoiceId", "token", "to", "amount"];
const LABEL: Record<CsvField, string> = { invoiceId: "Invoice", token: "Token", to: "Recipient", amount: "Amount" };
const ROW_KEY = { invoiceId: "invoiceId", token: "tokenSymbol", to: "to", amount: "amount" } as const;

export interface Choice { label: string; text: string }
export interface FieldFix { field: CsvField; col: ColumnId; label: string; value: string; choices: Choice[]; help?: string }
export interface LineCard {
  id: string;
  line: number;
  state: "open" | "fixed" | "left-out";
  heading: string;
  messages: { text: string; level: "error" | "warning" }[];
  fields: FieldFix[];
  changes: { label: string; before: string; after: string }[];
  unreadableText?: string;
  blocking: boolean;
  /** Added on the Review step: deleted, not left out. */
  isNew: boolean;
}
export interface GroupRow { line: number; raw: string; choices: Choice[] }
export interface GroupAction { label: string; changes: CellEdit[]; batch: Omit<Batch, "cells"> }
export interface GroupCard {
  id: string;
  key: string;
  field: CsvField;
  col: ColumnId;
  state: "open" | "applied";
  title: string;
  lead?: string;
  examples: string[];
  rows: GroupRow[];
  lines: number[];
  actions: GroupAction[];
  blocking: boolean;
}
export interface FixListView {
  fileProblems: string[];
  groups: GroupCard[];
  cards: LineCard[];
  /** Lines that stop the run, plus one for the file as a whole. */
  blocking: number;
  title?: string;
  summary?: string;
  counts?: string;
  fixFirst?: string;
  /** The element `Fix N problems first` brings into view. */
  firstOpen: string;
}

const slug = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The Review step's problems as cards a payer works down: file problems as
 * text, then one card per problem shared by three or more lines, then one card
 * per line, by line number alone. Fixed and left-out lines keep their card,
 * so nothing moves under the pointer. Every suggestion is a reading core
 * computed; nothing is applied until the payer presses it.
 */
export function fixList({ checked, source, edits, tokens }: {
  checked: CheckedFile; source: ParsedCsv; edits: SheetEdits; tokens: TokenSet;
}): FixListView {
  const problems = checked.problems;
  const fileProblems = checked.fileProblems;
  const { openGroups, appliedGroups, cards } = source.columns
    ? lists(checked, source, source.columns, edits, tokens)
    : { openGroups: [], appliedGroups: [], cards: [] };

  const groups = [...appliedGroups, ...openGroups];
  if (fileProblems.length + groups.length + cards.length === 0) {
    return { fileProblems, groups, cards, blocking: 0, firstOpen: "fix-list" };
  }

  const blockingLines = new Set(problems.filter((p) => p.level === "error").map((p) => p.line)).size;
  const blocking = blockingLines + (fileProblems.length > 0 ? 1 : 0);
  const withProblem = new Set(problems.map((p) => p.line));
  // A line a numbering or a find and replace touched is not "fixed" for it.
  const inColumnBatch = new Set(edits.batches.filter((b) => b.kind === "column")
    .flatMap((b) => b.cells.map(([l, c]) => `${l}:${c}`)));
  const ownCells = (l: number) =>
    (Object.keys(edits.cells[l] ?? {}) as ColumnId[]).some((c) => !inColumnBatch.has(`${l}:${c}`));
  const fixed = Object.keys(edits.cells).map(Number).filter((l) =>
    ownCells(l) && !edits.leftOut.includes(l) && !edits.deleted.includes(l)
    && !edits.newLines.includes(l) && !withProblem.has(l)).length;
  const leftOut = edits.leftOut.length;

  const counts = [
    ...(blockingLines > 0 ? [`${plural(blockingLines, "line stops", "lines stop")} this run`] : []),
    ...(fixed > 0 ? [`${fixed} fixed`] : []),
    ...(leftOut > 0 ? [`${leftOut} left out`] : []),
  ].join(" · ") || undefined;

  const one = blocking === 1;
  const summary =
    blocking > 0
      ? `${plural(blocking, "problem stops", "problems stop")} this run from being paid. Fix ${one ? "it" : "them"} below, or in your file and choose it again.`
    : problems.length > 0 ? "Worth a second look before paying. They do not stop the run."
    : undefined;
  const title = blocking > 0 ? "Fix these lines" : problems.length > 0 ? "Check these lines" : "Your changes";
  const firstOpen = openGroups.find((g) => g.blocking)?.id ?? cards.find((c) => c.blocking)?.id ?? "fix-list";

  return {
    fileProblems, groups, cards, blocking, title, summary, counts, firstOpen,
    ...(blocking > 0 ? { fixFirst: `Fix ${plural(blocking, "problem", "problems")} first` } : {}),
  };
}

function lists(
  checked: CheckedFile, source: ParsedCsv, columns: Record<CsvField, ColumnId>, edits: SheetEdits, tokens: TokenSet,
): { openGroups: GroupCard[]; appliedGroups: GroupCard[]; cards: LineCard[] } {
  const inFile = (a: string) => amountInFile(a, source.delimiter);
  const symbols = Object.keys(tokens);
  const spell = (raw: string) => symbols.find((s) => s.toLowerCase() === raw.toLowerCase());
  const roleOf = new Map<ColumnId, CsvField>(
    (Object.entries(columns) as [CsvField, ColumnId][]).map(([f, c]) => [c, f]),
  );
  const current = new Map(checked.parsed.map((r) => [r.line, r]));
  const original = new Map(source.rows.map((r) => [r.line, r]));
  const resolved = new Map(checked.rows.map((r) => [r.line, r]));
  const problems = checked.problems;
  const value = (line: number, f: CsvField) => current.get(line)?.[ROW_KEY[f]] ?? "";
  const unit = (line: number) => spell(value(line, "token"));
  const amountChoice = (line: number, reading: string): Choice => {
    const sym = unit(line);
    return { label: `${inFile(reading)}${sym ? ` ${sym}` : ""}`, text: inFile(reading) };
  };

  // Open groups: the same problem and the same fix on three or more lines.
  const keyOf = (p: RowProblem) =>
    p.field === "token" ? `token:${value(p.line, "token").toLowerCase()}`
    : p.field === "amount" && p.kind ? `amount:${p.kind}:${p.level}`
    : undefined;
  const byKey = new Map<string, RowProblem[]>();
  for (const p of problems) {
    const k = keyOf(p);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  const groupBatches = edits.batches.filter((b) => b.kind === "group");
  const appliedKeys = new Set(groupBatches.map((b) => b.id));
  const inOpenGroup = new Set<string>();
  const openGroups: GroupCard[] = [];
  for (const [key, ps] of byKey) {
    if (ps.length < GROUP_MIN) continue;
    for (const p of ps) inOpenGroup.add(`${p.line}:${p.field}`);
    const field = ps[0]!.field!;
    const col = columns[field];
    const lines = ps.map((p) => p.line);
    const n = lines.length;
    const raw = (l: number) => value(l, field);
    const first = raw(lines[0]!);
    const blocking = ps.some((p) => p.level === "error");
    const act = (label: string, text: (p: RowProblem) => string, title: string): GroupAction => ({
      label,
      changes: ps.map((p) => ({ line: p.line, col, text: text(p) })),
      batch: { id: key, kind: "group", title },
    });

    let title: string;
    let lead: string | undefined;
    let actions: GroupAction[];
    if (field === "token") {
      title = first ? `${n} lines use the token "${first}".` : `${n} lines have no token.`;
      lead = "Change all to";
      actions = symbols.map((s) => act(s, () => s, `Token changed to ${s} on ${n} lines.`));
    } else if (ps[0]!.kind === "thousands-marks") {
      title = `${n} amounts have marks between the thousands, like ${first}.`;
      actions = [act("Read all without the marks", (p) => inFile(p.readings![0]!), `${n} amounts read without the marks.`)];
    } else if (!blocking) {
      title = `${n} amounts like ${first} are read as decimals.`;
      actions = [act("All are thousands", (p) => inFile(p.readings![1]!), `${n} amounts read as thousands.`)];
    } else {
      title = `${n} amounts like ${first} could be read two ways.`;
      actions = [
        act("All are thousands", (p) => inFile(p.readings![1]!), `${n} amounts read as thousands.`),
        act("All are decimals", (p) => inFile(p.readings![0]!), `${n} amounts read as decimals.`),
      ];
    }

    const rows: GroupRow[] = ps.map((p) => ({
      line: p.line,
      raw: raw(p.line),
      choices: field === "token"
        ? symbols.map((s) => ({ label: s, text: s }))
        : (p.readings ?? []).map((r) => amountChoice(p.line, r)),
    }));
    const examples = ps.slice(0, 2).map((p) => {
      const readings = p.readings?.map(inFile).join(" or ");
      const sym = unit(p.line);
      return readings ? `line ${p.line}: ${raw(p.line)} → ${readings}${sym ? ` ${sym}` : ""}` : `line ${p.line}: ${raw(p.line) || "(empty)"}`;
    });
    const id = `fix-group-${slug(key)}${appliedKeys.has(key) ? "-more" : ""}`;
    openGroups.push({ id, key, field, col, state: "open", title, lead, examples, rows, lines, actions, blocking });
  }

  const appliedGroups: GroupCard[] = groupBatches.map((b) => {
    const field = roleOf.get(b.cells[0]![1]) ?? "token";
    return {
      id: `fix-group-${slug(b.id)}`, key: b.id, field, col: columns[field], state: "applied", title: b.title,
      examples: [], rows: [], lines: [...new Set(b.cells.map(([l]) => l))], actions: [], blocking: false,
    };
  });

  // Cells a batch wrote are undone with the batch, not on a line's card.
  const inBatch = new Set(edits.batches.flatMap((b) => b.cells.map(([l, c]) => `${l}:${c}`)));

  const fieldFix = (line: number, field: CsvField, p?: RowProblem): FieldFix => ({
    field,
    col: columns[field],
    label: LABEL[field],
    value: value(line, field),
    choices: field === "token" ? symbols.map((s) => ({ label: s, text: s }))
      : field === "amount" && p?.readings ? p.readings.map((r) => amountChoice(line, r))
      : [],
    ...(field === "to" ? { help: RECIPIENT_HELP } : {}),
  });
  const after = (line: number, f: CsvField) =>
    f === "to" ? resolved.get(line)?.to ?? value(line, f)
    : f === "token" ? spell(value(line, f)) ?? value(line, f)
    : value(line, f);

  const cards: LineCard[] = [];
  const touched = new Set<number>([
    ...problems.map((p) => p.line), ...Object.keys(edits.cells).map(Number), ...edits.leftOut,
  ]);
  for (const line of [...touched].sort((a, b) => a - b)) {
    if (edits.deleted.includes(line)) continue;
    const isNew = edits.newLines.includes(line);
    const orig = original.get(line);
    if (!orig && !isNew) continue;
    const invoice = current.get(line)?.invoiceId ?? orig?.invoiceId ?? "";
    const heading = `Line ${line}${isNew ? " · new" : ""}${invoice ? ` · ${invoice}` : ""}`;
    const id = `fix-line-${line}`;
    const base = { id, line, messages: [], fields: [], changes: [], blocking: false, isNew };

    if (edits.leftOut.includes(line)) {
      cards.push({ ...base, state: "left-out", heading: `${heading} · left out of this run` });
      continue;
    }
    const row = current.get(line);
    if (!row) continue;
    const all = problems.filter((p) => p.line === line);
    const own = all.filter((p) => !(p.field && inOpenGroup.has(`${line}:${p.field}`)));
    const edited = [...new Set((Object.keys(edits.cells[line] ?? {}) as ColumnId[])
      .filter((c) => !inBatch.has(`${line}:${c}`))
      .map((c) => roleOf.get(c))
      .filter((f): f is CsvField => f !== undefined))];
    const change = (f: CsvField) => ({
      label: LABEL[f], before: !orig || orig.unreadable ? "" : orig[ROW_KEY[f]], after: after(line, f),
    });
    if (own.length > 0) {
      // Still open. An edit whose field lost its input is shown as a change,
      // so the card never hides it: the problem it raised may have no field
      // (a recipient already paid). A field still wrong keeps its input and
      // adds nothing, so a blur that commits it moves nothing under the pointer.
      const fields = row.unreadable ? FIELDS : FIELDS.filter((f) => own.some((p) => p.field === f));
      cards.push({
        ...base, state: "open", heading,
        messages: own.map((p) => ({ text: p.message, level: p.level })),
        fields: fields.map((f) => fieldFix(line, f, own.find((p) => p.field === f))),
        changes: edited.filter((f) => !fields.includes(f)).map(change),
        ...(row.unreadable ? { unreadableText: row.unreadable.text } : {}),
        blocking: own.some((p) => p.level === "error"),
      });
      continue;
    }
    if (edited.length === 0) continue;
    cards.push({
      ...base, state: "fixed",
      heading: `${heading} · ${all.length === 0 ? "ready to pay" : "changed"}`,
      changes: edited.map(change),
    });
  }

  return { openGroups, appliedGroups, cards };
}

/** The id of one line's row inside an open group's list. */
export const rowId = (line: number, field: CsvField) => `fix-row-${line}-${field}`;

/**
 * Where focus goes after a line in an open group is fixed on its own, since
 * the pressed button leaves with its line: the next line of that group, or the
 * one before when it was the last, so the payer keeps their place. If the
 * group broke up, that line's own card. The list itself, never the page.
 */
export function afterRowFix(view: FixListView, key: string, lines: number[], line: number): {
  focus: string; said: string;
} {
  const group = view.groups.find((g) => g.key === key && g.state === "open");
  const at = lines.indexOf(line);
  const order = [...lines.slice(at + 1), ...lines.slice(0, Math.max(at, 0)).reverse()];
  let focus = "fix-list";
  for (const l of order) {
    if (group?.lines.includes(l)) { focus = rowId(l, group.field); break; }
    const card = view.cards.find((c) => c.line === l);
    if (card) { focus = card.id; break; }
  }
  const said = group ? `Line ${line} changed. ${plural(group.lines.length, "line", "lines")} left in this group.` : `Line ${line} changed.`;
  return { focus, said };
}
