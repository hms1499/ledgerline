import { amountInFile, type CsvField, type ParsedCsv, type TokenSet } from "@ledgerline/core";
import type { CheckedFile, RowProblem } from "@/lib/review-view";
import type { AppliedGroup, CellEdit, RunEdits } from "@/lib/run-edits";

export const GROUP_MIN = 3;
export const RECIPIENT_HELP = "Paste the full address. Check it against the one you were given.";

const FIELDS: readonly CsvField[] = ["invoiceId", "token", "to", "amount"];
const LABEL: Record<CsvField, string> = { invoiceId: "Invoice", token: "Token", to: "Recipient", amount: "Amount" };
const ROW_KEY = { invoiceId: "invoiceId", token: "tokenSymbol", to: "to", amount: "amount" } as const;

export interface Choice { label: string; text: string }
export interface FieldFix { field: CsvField; label: string; value: string; choices: Choice[]; help?: string }
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
}
export interface GroupRow { line: number; raw: string; choices: Choice[] }
export interface GroupAction { label: string; edits: CellEdit[]; applied: AppliedGroup }
export interface GroupCard {
  id: string;
  key: string;
  field: CsvField;
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
  checked: CheckedFile; source: ParsedCsv; edits: RunEdits; tokens: TokenSet;
}): FixListView {
  const inFile = (a: string) => amountInFile(a, source.delimiter);
  const symbols = Object.keys(tokens);
  const spell = (raw: string) => symbols.find((s) => s.toLowerCase() === raw.toLowerCase());
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
  const appliedKeys = new Set(edits.groups.map((g) => g.key));
  const inOpenGroup = new Set<string>();
  const openGroups: GroupCard[] = [];
  for (const [key, ps] of byKey) {
    if (ps.length < GROUP_MIN) continue;
    for (const p of ps) inOpenGroup.add(`${p.line}:${p.field}`);
    const field = ps[0]!.field!;
    const lines = ps.map((p) => p.line);
    const n = lines.length;
    const raw = (l: number) => value(l, field);
    const first = raw(lines[0]!);
    const blocking = ps.some((p) => p.level === "error");
    const act = (label: string, text: (p: RowProblem) => string, title: string): GroupAction => ({
      label,
      edits: ps.map((p) => ({ line: p.line, field, text: text(p) })),
      applied: { key, field, lines, title },
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
    openGroups.push({ id, key, field, state: "open", title, lead, examples, rows, lines, actions, blocking });
  }

  const appliedGroups: GroupCard[] = edits.groups.map((g) => ({
    id: `fix-group-${slug(g.key)}`, key: g.key, field: g.field, state: "applied", title: g.title,
    examples: [], rows: [], lines: g.lines, actions: [], blocking: false,
  }));

  // Fields each line had changed by an applied group: those need no line card.
  const byGroup = new Map<number, Set<CsvField>>();
  for (const g of edits.groups) for (const l of g.lines) byGroup.set(l, new Set([...(byGroup.get(l) ?? []), g.field]));

  const fieldFix = (line: number, field: CsvField, p?: RowProblem): FieldFix => ({
    field,
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
    ...problems.map((p) => p.line), ...Object.keys(edits.cells).map(Number), ...edits.removed,
  ]);
  for (const line of [...touched].sort((a, b) => a - b)) {
    const orig = original.get(line);
    if (!orig) continue;
    const invoice = current.get(line)?.invoiceId ?? orig.invoiceId;
    const heading = invoice ? `Line ${line} · ${invoice}` : `Line ${line}`;
    const id = `fix-line-${line}`;
    const base = { id, line, messages: [], fields: [], changes: [], blocking: false };

    if (edits.removed.includes(line)) {
      cards.push({ ...base, state: "left-out", heading: `${heading} · left out of this run` });
      continue;
    }
    const all = problems.filter((p) => p.line === line);
    const own = all.filter((p) => !(p.field && inOpenGroup.has(`${line}:${p.field}`)));
    const row = current.get(line)!;
    // The line's own edits; a group's change is undone on the group's card.
    const edited = (Object.keys(edits.cells[line] ?? {}) as CsvField[]).filter((f) => !byGroup.get(line)?.has(f));
    const change = (f: CsvField) => ({
      label: LABEL[f], before: orig.unreadable ? "" : orig[ROW_KEY[f]], after: after(line, f),
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

  const groups = [...appliedGroups, ...openGroups];
  const fileProblems = checked.fileProblems;
  if (fileProblems.length + groups.length + cards.length === 0) {
    return { fileProblems, groups, cards, blocking: 0, firstOpen: "fix-list" };
  }

  const blockingLines = new Set(problems.filter((p) => p.level === "error").map((p) => p.line)).size;
  const blocking = blockingLines + (fileProblems.length > 0 ? 1 : 0);
  const withProblem = new Set(problems.map((p) => p.line));
  const fixed = Object.keys(edits.cells).map(Number)
    .filter((l) => !edits.removed.includes(l) && !withProblem.has(l)).length;
  const leftOut = edits.removed.length;

  const counts = [
    ...(blockingLines > 0 ? [`${plural(blockingLines, "line stops", "lines stop")} this run`] : []),
    ...(fixed > 0 ? [`${fixed} fixed`] : []),
    ...(leftOut > 0 ? [`${leftOut} left out`] : []),
  ].join(" · ") || undefined;

  const one = blocking === 1;
  const summary =
    blocking > 0
      ? `${plural(blocking, "problem stops", "problems stop")} this run from being paid. ${
        blockingLines > 0 ? `Fix ${one ? "it" : "them"} below, or in your file and choose it again.` : `Fix ${one ? "it" : "them"} in the file and choose it again.`}`
    : problems.length > 0 ? "Worth a second look before paying. They do not stop the run."
    : undefined;
  const title = blocking > 0 ? "Fix these lines" : problems.length > 0 ? "Check these lines" : "Your changes";
  const firstOpen = openGroups.find((g) => g.blocking)?.id ?? cards.find((c) => c.blocking)?.id ?? "fix-list";

  return {
    fileProblems, groups, cards, blocking, title, summary, counts, firstOpen,
    ...(blocking > 0 ? { fixFirst: `Fix ${plural(blocking, "problem", "problems")} first` } : {}),
  };
}
