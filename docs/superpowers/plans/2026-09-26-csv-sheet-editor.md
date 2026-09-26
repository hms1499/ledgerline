# CSV Sheet Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A payer turns the file they have into a run on the Review step: choose the header line, give columns their roles against the template, add a column the file never had, edit any cell, add and delete lines, undo anything, keep a draft across a reload, and download a corrected file that reads back as the run on screen.

**Architecture:** Core learns to read a file's lines as a *sheet* under a structure (`readSheet(lines, { headerLine, roles, newColumns })`); `parseCsv` becomes `readSheet(readLines(text))`. The frontend keeps the file as read (`lines`) and one immutable overlay, `SheetEdits`: typed cells keyed by line and `ColumnId`, new lines, deleted and left-out lines, batches. Everything on screen is derived by pure functions in `frontend/lib/` (`applySheetEdits`, `checkRows`, `fixList`, `changesView`, `sheetGrid`, `correctedCsv`); components only lay them out. Structure (header, roles, new columns) is read in core, because it decides which problems a file has; typed values are overlaid in the frontend, exactly as `applyEdits` does today.

**Tech Stack:** TypeScript, viem 2.56, vitest 2, Next.js 16.3.5 (App Router), React 19.3, antd 6.6.5, Playwright (MCP) for browser passes.

**Spec:** `docs/superpowers/specs/2026-09-26-csv-sheet-editor-design.md`. Read it, and `docs/superpowers/specs/2026-09-26-inline-row-fixes-design.md` whose overlay and fix list this extends, before any task.

## Global Constraints

- Nothing in `CLAUDE.md`'s invariants changes. `packages/core/src/execute.ts`, `build.ts`, `salt.ts` and `toBaseUnits` are not edited. The Check step reads the chain as it does today.
- The file as read is never written to. Undo is dropping an entry from `SheetEdits`. Ctrl+Z is a stack of `SheetEdits` values.
- One validator: every rule about what a value or a header means lives in `packages/core`. The UI never re-implements a check.
- Nothing is applied that the payer did not press. An amount is never guessed; a recipient address is never suggested; a token for a whole column is chosen with one button per chain token.
- A line is its line number in the file as read; new lines are numbered after the file's last line. Nothing renumbers.
- Tokens and decimals are fixed at upload (`RunBase.tokens`, `RunBase.decimals`), as today.
- The interface stays English. New copy passes `frontend/test/plain-language.test.ts`.
- No new dependencies.
- Rules in `frontend/app/styles/` that set `font-*` or `display` on something antd also styles start with `html`.
- The page never scrolls sideways at 390px or 1280px. Every tap target on a phone is at least 44px high.
- Focus never falls to `<body>` after an action on the Review step.
- One commit per task, conventional prefix, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Commands: core tests `cd packages/core && npx vitest run`, core types `cd packages/core && npx tsc --noEmit -p .`, frontend tests `cd frontend && npx vitest run`, frontend types `cd frontend && npx tsc --noEmit`, build `pnpm build` from the repo root, serve `cd frontend && pnpm start -p 3055`.

## Review Focus

1. **A typed cell that holds the file's delimiter or a quote, in a `;` file** (`Design; "Sept"`). The corrected file must quote it and read back to the same text. Test in Task 4.
2. **Ctrl+Z pressed while a cell editor is open.** It must undo the text in the input (the browser's own undo), not the last sheet change. Test in Task 10.
3. **Changing the header line after cells were typed.** The confirmation names how many changes go; Cancel keeps every one. Test in Task 2 (`droppedByHeader`) and Task 10 (browser).
4. **A line added by mistake and left empty.** It must show in Problems with its messages and a way to delete it, and it blocks the run until then. Test in Task 3.
5. **A left-out line in a file that gained a column.** The corrected file must give it the new column's value, so it reads back with the header's column count. Test in Task 4.

---

## File map

| File | Change |
|---|---|
| `packages/core/src/csv.ts` | `ColumnId`, `Role`, `FileLine`, `NewColumn`, `SheetStructure`; `readLines`, `splitCells`, `isBlankLine`, `fieldFor` exported; `readSheet`; `parseCsv` = `readSheet(readLines(text))`; `ParsedCsv.headerLine`, `.roles`, `.columns` keyed by `ColumnId`; header messages that name the grid (Task 9) |
| `packages/core/test/csv.test.ts` | `readLines`, `readSheet` tests; the `columns` test and the header-message tests updated |
| `frontend/lib/sheet-edits.ts` | **new**: `SheetEdits`, its operations and undo, `applySheetEdits`, `cellText`, counts and copy |
| `frontend/lib/run-edits.ts` | **deleted** (Task 3) |
| `frontend/lib/review-view.ts` | `checkRows(sheet, SheetEdits, …)` |
| `frontend/lib/fix-list.ts` | cells keyed by `ColumnId`; group actions are batches; new and deleted lines |
| `frontend/lib/corrected-file.ts` | `correctedCsv(lines, sheet, edits)`: header names, new columns, lines above the header, new and deleted lines |
| `frontend/lib/draft-store.ts` | **new**: drafts in `localStorage`, keyed by the file's hash |
| `frontend/lib/changes-view.ts` | **new**: the Changes tab's entries, each with its undo |
| `frontend/lib/sheet-grid.ts` | **new**: what the grid and the phone cards show |
| `frontend/lib/run-summary-view.ts` | `changes` from `ChangeCounts` |
| `frontend/lib/use-narrow.ts` | **new**: the `sm` breakpoint as a hook |
| `frontend/app/(app)/new/SheetGrid.tsx` | **new**: the grid (desktop and tablet) |
| `frontend/app/(app)/new/CellEditor.tsx` | **new**: the one open cell |
| `frontend/app/(app)/new/LineMenu.tsx` | **new**: a line's ⋯ menu |
| `frontend/app/(app)/new/ColumnHead.tsx` | **new**: a column's name and role chip; a ghost column's menu |
| `frontend/app/(app)/new/FindReplace.tsx` | **new**: find and replace in one column |
| `frontend/app/(app)/new/ChangesList.tsx` | **new**: the Changes tab |
| `frontend/app/(app)/new/SheetCards.tsx` | **new**: one card per line on a phone |
| `frontend/app/(app)/new/CreateRun.tsx` | `RunBase.lines`; `SheetEdits` state with an undo stack; drafts |
| `frontend/app/(app)/new/StepUpload.tsx` | hands over `lines` |
| `frontend/app/(app)/new/StepPreview.tsx` | grid or cards; Problems \| Changes; restore prompt; header confirm |
| `frontend/app/(app)/new/FixList.tsx`, `LineCard.tsx` | batches and `ColumnId`; free text moves to the grid; `Show in table` |
| `frontend/app/(app)/new/RunSummary.tsx` | a one-line variant for the Review step |
| `frontend/app/(app)/new/Result.tsx` | the corrected file's new inputs; the reminder's counts |
| `frontend/app/styles/tape.css` | grid, chips, ghost columns, cards |
| `frontend/test/fixtures/personas.ts` | **new**: the six persona files, byte-exact |
| `frontend/test/sheet-edits.test.ts`, `draft-store.test.ts`, `changes-view.test.ts`, `sheet-grid.test.ts` | **new** |
| `frontend/test/run-edits.test.ts` | **deleted** (Task 3) |
| `frontend/test/review-view.test.ts`, `fix-list.test.ts`, `corrected-file.test.ts`, `run-summary-view.test.ts`, `plain-language.test.ts` | ported to `SheetEdits` |

Column ids used in tests: a file `invoiceId,token,to,amount` has `f0` invoiceId, `f1` token, `f2` to, `f3` amount.

---

### Task 1: Core reads a file's lines as a sheet

**Files:**
- Modify: `packages/core/src/csv.ts`
- Test: `packages/core/test/csv.test.ts`
- Modify (keep green): `frontend/lib/corrected-file.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces, all exported from `@ledgerline/core`:
  - `type ColumnId = \`f${number}\` | \`n${number}\``; `type Role = CsvField | "unused"`
  - `interface FileLine { body: string; end: string }`
  - `interface NewColumn { id: \`n${number}\`; name: string; role: Role; fill: string }`
  - `interface SheetStructure { headerLine?: number; roles?: Readonly<Partial<Record<\`f${number}\`, Role>>>; newColumns?: readonly NewColumn[] }`
  - `readLines(text: string): FileLine[]`
  - `splitCells(body: string, delimiter: Delimiter): string[]`
  - `isBlankLine(body: string, delimiter: Delimiter): boolean`
  - `fieldFor(name: string): CsvField | undefined`
  - `readSheet(lines: readonly FileLine[], structure?: SheetStructure): ParsedCsv`
  - `ParsedCsv` gains `headerLine: number` (0 for an empty file) and `roles: Record<ColumnId, Role>`; `columns?: Record<CsvField, ColumnId>`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/csv.test.ts`, change the import to:

```ts
import { parseCsv, readLines, readSheet } from "../src/csv.js";
```

Replace the test `"keeps the header as written and where each field sits, for a corrected file"` with:

```ts
  it("keeps the header as written and where each field sits, for a corrected file", () => {
    const { header, columns, roles, headerLine } = parseCsv(`Name,Amount,Recipient,Invoice ID,Currency\nAn,1,0x,INV-1,USDC`);
    expect(header).toEqual(["Name", "Amount", "Recipient", "Invoice ID", "Currency"]);
    expect(columns).toEqual({ invoiceId: "f3", token: "f4", to: "f2", amount: "f1" });
    expect(roles).toEqual({ f0: "unused", f1: "amount", f2: "to", f3: "invoiceId", f4: "token" });
    expect(headerLine).toBe(1);
    expect(parseCsv("id,coin\n1,2").columns).toBeUndefined();
  });
```

Add, after the `parseCsv` describe block:

```ts
const ADDR = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

describe("readLines", () => {
  it("keeps each line's break, so a file can be written back byte for byte", () => {
    const text = "﻿a,b\r\nc,d\ne";
    const lines = readLines(text);
    expect(lines).toEqual([{ body: "﻿a,b", end: "\r\n" }, { body: "c,d", end: "\n" }, { body: "e", end: "" }]);
    expect(lines.map((l) => l.body + l.end).join("")).toBe(text);
  });

  it("numbers lines as splitting on line breaks would", () => {
    expect(readLines("a\n")).toEqual([{ body: "a", end: "\n" }, { body: "", end: "" }]);
    expect(readLines("")).toEqual([{ body: "", end: "" }]);
  });
});

describe("readSheet", () => {
  it("reads a file as parseCsv does when given no structure", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USDC,${ADDR},1`;
    expect(readSheet(readLines(text))).toEqual(parseCsv(text));
  });

  it("reads a later line as the header, and its delimiter from that line", () => {
    const text = `ledgerline-sample\r\ninvoiceId;token;to;amount\r\nINV-1;USDC;${ADDR};0.10`;
    expect(parseCsv(text).issues[0]!.message).toMatch(/Missing: invoiceId, token, to, amount/);
    const s = readSheet(readLines(text), { headerLine: 2 });
    expect(s.issues).toEqual([]);
    expect(s.delimiter).toBe(";");
    expect(s.headerLine).toBe(2);
    expect(s.rows).toEqual([{
      line: 3, invoiceId: "INV-1", tokenSymbol: "USDC", to: ADDR, amount: "0.10", cells: ["INV-1", "USDC", ADDR, "0.10"],
    }]);
  });

  it("gives a column a role its name does not, and takes one away", () => {
    const text = `Name,Wallet,Amount (USDC),Invoice #,Currency\nAn,${ADDR},5,INV-1,USDC`;
    const s = readSheet(readLines(text), { roles: { f2: "amount", f3: "invoiceId" } });
    expect(s.columns).toEqual({ invoiceId: "f3", token: "f4", to: "f1", amount: "f2" });
    expect(s.roles).toEqual({ f0: "unused", f1: "to", f2: "amount", f3: "invoiceId", f4: "token" });
    expect(s.rows[0]).toMatchObject({ invoiceId: "INV-1", tokenSymbol: "USDC", to: ADDR, amount: "5" });
    const off = readSheet(readLines(text), { roles: { f2: "amount", f3: "invoiceId", f4: "unused" } });
    expect(off.issues[0]!.message).toMatch(/Missing: token\./);
    expect(off.roles.f4).toBe("unused");
  });

  it("reads a new column's value on every line, and lets it hold a role", () => {
    const text = `wallet,amount\n${ADDR},100\n${ADDR},250`;
    const s = readSheet(readLines(text), { newColumns: [
      { id: "n1", name: "token", role: "token", fill: "USDC" },
      { id: "n2", name: "invoiceId", role: "invoiceId", fill: "" },
    ] });
    expect(s.issues).toEqual([]);
    expect(s.columns).toEqual({ invoiceId: "n2", token: "n1", to: "f0", amount: "f1" });
    expect(s.rows.map((r) => [r.tokenSymbol, r.invoiceId])).toEqual([["USDC", ""], ["USDC", ""]]);
  });

  it("names both columns when two hold one role, and reads the file once one is not used", () => {
    const text = `Amount,Value,invoiceId,token,to\n1,2,INV-1,USDC,${ADDR}`;
    expect(readSheet(readLines(text)).issues[0]!.message)
      .toBe('Two columns could be the amount: "Amount" and "Value". Keep one.');
    expect(readSheet(readLines(text), { roles: { f1: "unused" } }).issues).toEqual([]);
  });

  it("reads a line of empty cells as blank, as a spreadsheet writes an empty row", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USDC,${ADDR},1\n,,,\nINV-2,USDC,${ADDR},2`;
    expect(parseCsv(text).rows.map((r) => r.line)).toEqual([2, 4]);
  });

  it("looks past lines of empty cells for the header", () => {
    expect(parseCsv(`,,,\ninvoiceId,token,to,amount\nINV-1,USDC,${ADDR},1`).headerLine).toBe(2);
  });

  it("falls back to the first line with a cell when the chosen header line is blank or past the end", () => {
    const lines = readLines(`invoiceId,token,to,amount\n\nINV-1,USDC,${ADDR},1`);
    expect(readSheet(lines, { headerLine: 2 }).headerLine).toBe(1);
    expect(readSheet(lines, { headerLine: 9 }).headerLine).toBe(1);
  });

  it("says an empty file is empty, with no header and no roles", () => {
    expect(readSheet(readLines("\n\n"))).toMatchObject({ headerLine: 0, roles: {}, rows: [] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/core && npx vitest run test/csv.test.ts`
Expected: FAIL — `readLines is not a function` / `readSheet is not a function`, and the `columns` test expects `"f3"` but receives `3`.

- [ ] **Step 3: Implement in `packages/core/src/csv.ts`**

3a. Replace the `ParsedCsv` interface with:

```ts
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
```

3b. Directly after the `Delimiter` type, add:

```ts
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
```

3c. Change `const fieldFor = (name: string): CsvField | undefined =>` to `export const fieldFor = (name: string): CsvField | undefined =>`, and add a doc line above it: `/** The field a column's name says it holds, if any. */`.

3d. Rename the private `splitLine` to `splitCells` and export it (its body does not change):

```ts
/** One line into fields, honouring double quotes and the doubled-quote escape. */
export function splitCells(line: string, delimiter: Delimiter): string[] {
```

3e. Replace the whole `parseCsv` function (from its doc comment through its closing brace) with:

```ts
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
          message: `Two columns could be the ${FIELD_WORD[role]}: "${nameOf(seen)}" and "${nameOf(id)}". Keep one.`,
        }],
      };
    }
    at[role] = id;
  }

  const missing = FIELDS.filter((f) => at[f] === undefined);
  if (missing.length > 0) {
    const found = names.filter((n) => n !== "").join(", ") || "nothing";
    return {
      rows, delimiter, header, headerLine, roles,
      issues: [{
        line: headerLine,
        message: `The first line must name the columns invoiceId, token, to and amount, in any order. Missing: ${missing.join(", ")}. Found: ${found}.`,
      }],
    };
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
```

- [ ] **Step 4: Keep the frontend green**

In `frontend/lib/corrected-file.ts`, `correctedCsv` indexes cells by `columns[f]`, now a `ColumnId`. Change the one line

```ts
      cells[columns[f]] = f === "amount" ? amountCell(value, source.delimiter) : value;
```

to

```ts
      cells[Number(columns[f].slice(1))] = f === "amount" ? amountCell(value, source.delimiter) : value;
```

(Task 3 rewrites this file; this keeps it compiling until then. Every column is a file column until Task 2's operations exist.)

- [ ] **Step 5: Run everything**

Run: `cd packages/core && npx vitest run && npx tsc --noEmit -p .`
Expected: every test PASS, including the 241 that were there; no type errors.
Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/csv.ts packages/core/test/csv.test.ts frontend/lib/corrected-file.ts
git commit -m "feat(core): read a file's lines as a sheet, under a header line, roles and new columns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `SheetEdits`, the overlay and its operations

**Files:**
- Create: `frontend/lib/sheet-edits.ts`
- Test: `frontend/test/sheet-edits.test.ts`

**Interfaces:**
- Consumes (Task 1): `ColumnId`, `Role`, `NewColumn`, `SheetStructure`, `ParsedCsv`, `ParsedRow`, `CsvField`, `readLines`, `readSheet`.
- Produces, from `@/lib/sheet-edits`:
  - `interface CellEdit { line: number; col: ColumnId; text: string }`
  - `interface Batch { id: string; kind: "group" | "column"; title: string; cells: readonly (readonly [number, ColumnId])[] }`
  - `interface SheetEdits { headerLine?: number; roles: Readonly<Partial<Record<\`f${number}\`, Role>>>; newColumns: readonly NewColumn[]; cells: Readonly<Record<number, Readonly<Partial<Record<ColumnId, string>>>>>; newLines: readonly number[]; deleted: readonly number[]; leftOut: readonly number[]; batches: readonly Batch[] }`
  - `NO_EDITS: SheetEdits`; `structureOf(e): SheetStructure`
  - `cellText(e, row: ParsedRow | undefined, line, col): string`; `applySheetEdits(sheet, e): ParsedRow[]`
  - `editCells(e, changes)`, `undoCell(e, line, col)`, `applyBatch(e, batch: Omit<Batch, "cells">, changes)`, `undoBatch(e, id)`, `undoLine(e, line)`, `nextBatchId(e, prefix): string`
  - `leaveOut(e, line)`, `putBack(e, line)`, `deleteLine(e, line)`, `restoreLine(e, line)`, `addLine(e, lineCount): { edits; line }`
  - `setRole(e, roles: Readonly<Record<ColumnId, Role>>, col, role)`, `clearRole(e, col: \`f${number}\`)`, `addColumn(e, role, fill): { edits; col: \`n${number}\` }`, `dropColumn(e, col: \`n${number}\`)`, `numberInvoices(e, lines, prefix)`
  - `replaceInColumn(values: readonly { line: number; text: string }[], col, find, replace): CellEdit[]`
  - `useAsHeader(e, line)`, `droppedByHeader(e): number`
  - `interface ChangeCounts { cells: number; columns: number; added: number; deleted: number; leftOut: number; header?: number }`; `changeCounts(e)`, `changeTotal(c)`, `fileChanged(c)`, `changesText(c)`, `correctionReminder(c)`

- [ ] **Step 1: Write the failing tests**

Create `frontend/test/sheet-edits.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readLines, readSheet } from "@ledgerline/core";
import {
  NO_EDITS, structureOf, applySheetEdits, editCells, applyBatch, undoBatch, undoCell, undoLine,
  leaveOut, putBack, deleteLine, restoreLine, addLine, setRole, addColumn, dropColumn, numberInvoices,
  replaceInColumn, useAsHeader, droppedByHeader, changeCounts, changeTotal, fileChanged, changesText,
  correctionReminder, type SheetEdits,
} from "@/lib/sheet-edits";

const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const LINES = readLines(`invoiceId,token,to,amount,Note\nINV-1,USD,${A},10,a\nINV-2,USDC,nope,5,b\nINV-3,USD,${A},1,c`);
const sheet = (e: SheetEdits = NO_EDITS) => readSheet(LINES, structureOf(e));
const rows = (e: SheetEdits) => applySheetEdits(sheet(e), e);

describe("applySheetEdits", () => {
  it("returns the rows as read when nothing is edited", () => {
    expect(rows(NO_EDITS)).toEqual(sheet().rows);
  });

  it("reads a typed cell over the cell as read, trimmed, and leaves the file alone", () => {
    const e = editCells(NO_EDITS, [{ line: 2, col: "f1", text: " USDC " }]);
    expect(rows(e)[0]!.tokenSymbol).toBe("USDC");
    expect(sheet(e).rows[0]!.tokenSymbol).toBe("USD");
  });

  it("drops deleted and left-out lines, and brings them back", () => {
    const e = leaveOut(deleteLine(NO_EDITS, 3), 4);
    expect(rows(e).map((r) => r.line)).toEqual([2]);
    expect(rows(putBack(restoreLine(e, 3), 4)).map((r) => r.line)).toEqual([2, 3, 4]);
  });

  it("reads an unreadable line from what was typed alone", () => {
    const lines = readLines(`invoiceId,token,to,amount\nINV-1,USDC`);
    const e = editCells(NO_EDITS, [{ line: 2, col: "f0", text: "INV-9" }]);
    const [row] = applySheetEdits(readSheet(lines), e);
    expect(row).toMatchObject({ line: 2, invoiceId: "INV-9", tokenSymbol: "", to: "", amount: "" });
    expect(row!.unreadable).toBeUndefined();
  });

  it("reads a new line from its typed cells, numbered after the file's last line", () => {
    const { edits, line } = addLine(NO_EDITS, LINES.length);
    expect(line).toBe(5);
    const e = editCells(edits, [
      { line, col: "f0", text: "INV-4" }, { line, col: "f1", text: "EURC" },
      { line, col: "f2", text: A }, { line, col: "f3", text: "7" },
    ]);
    expect(rows(e).at(-1)).toEqual({ line: 5, invoiceId: "INV-4", tokenSymbol: "EURC", to: A, amount: "7", cells: [] });
    expect(addLine(e, LINES.length).line).toBe(6);
  });

  it("reads a new column's fill on every line, and a typed cell over it", () => {
    const lines = readLines(`wallet,amount,invoiceId\n${A},100,I-1\n${A},250,I-2`);
    const { edits, col } = addColumn(NO_EDITS, "token", "USDC");
    const e = editCells(edits, [{ line: 3, col, text: "EURC" }]);
    expect(applySheetEdits(readSheet(lines, structureOf(e)), e).map((r) => r.tokenSymbol)).toEqual(["USDC", "EURC"]);
  });
});

describe("batches and undo", () => {
  const group = { id: "token:usd", kind: "group" as const, title: "Token changed to USDC on 2 lines." };
  const changes = [{ line: 2, col: "f1" as const, text: "USDC" }, { line: 4, col: "f1" as const, text: "USDC" }];

  it("applies a batch in one step and undoes it in one step", () => {
    const e = applyBatch(NO_EDITS, group, changes);
    expect(rows(e).map((r) => r.tokenSymbol)).toEqual(["USDC", "USDC", "USDC"]);
    expect(undoBatch(e, "token:usd")).toEqual(NO_EDITS);
  });

  it("undoes a batch without touching another cell on the same line", () => {
    const e = editCells(applyBatch(NO_EDITS, group, changes), [{ line: 2, col: "f3", text: "11" }]);
    expect(undoBatch(e, "token:usd").cells).toEqual({ 2: { f3: "11" } });
  });

  it("undoes one cell, taking it out of its batch", () => {
    const e = undoCell(applyBatch(NO_EDITS, group, changes), 2, "f1");
    expect(e.cells).toEqual({ 4: { f1: "USDC" } });
    expect(e.batches[0]!.cells).toEqual([[4, "f1"]]);
    expect(undoCell(e, 4, "f1").batches).toEqual([]);
  });

  it("undoes a line, taking it out of a group but leaving a numbering to its own undo", () => {
    let e = applyBatch(NO_EDITS, group, changes);
    e = numberInvoices(e, [2, 3, 4], "Payroll");
    e = undoLine(e, 2);
    expect(e.cells[2]).toEqual({ n1: "Payroll-1" });
    expect(e.batches.map((b) => b.id)).toEqual(["token:usd", "number:n1"]);
    expect(e.batches[0]!.cells).toEqual([[4, "f1"]]);
  });
});

describe("lines, columns and the header", () => {
  it("deletes a new line outright, and marks a file line deleted", () => {
    const { edits, line } = addLine(NO_EDITS, LINES.length);
    expect(deleteLine(editCells(edits, [{ line, col: "f0", text: "X" }]), line)).toEqual(NO_EDITS);
    expect(deleteLine(NO_EDITS, 3).deleted).toEqual([3]);
  });

  it("takes a deleted line off the left-out list", () => {
    expect(deleteLine(leaveOut(NO_EDITS, 3), 3)).toMatchObject({ deleted: [3], leftOut: [] });
  });

  it("moves a role to a column, marking the column that held it not used", () => {
    const e = setRole(NO_EDITS, sheet().roles, "f4", "invoiceId");
    expect(e.roles).toEqual({ f4: "invoiceId", f0: "unused" });
    expect(sheet(e).columns?.invoiceId).toBe("f4");
  });

  it("gives a new column a role through the same move", () => {
    const { edits, col } = addColumn(NO_EDITS, "unused", "");
    const e = setRole(edits, sheet(edits).roles, col, "amount");
    expect(e.newColumns[0]!.role).toBe("amount");
    expect(e.roles).toEqual({ f3: "unused" });
  });

  it("drops a new column with its cells and its batch", () => {
    expect(dropColumn(numberInvoices(NO_EDITS, [2, 3], "P"), "n1")).toEqual(NO_EDITS);
  });

  it("numbers invoices on the lines given, in order, as one batch in a new column", () => {
    const e = numberInvoices(NO_EDITS, [2, 4, 7], "Oct");
    expect(e.newColumns).toEqual([{ id: "n1", name: "invoiceId", role: "invoiceId", fill: "" }]);
    expect(e.cells).toEqual({ 2: { n1: "Oct-1" }, 4: { n1: "Oct-2" }, 7: { n1: "Oct-3" } });
    expect(e.batches).toEqual([{
      id: "number:n1", kind: "column", title: "Invoices numbered Oct-1 to Oct-3",
      cells: [[2, "n1"], [4, "n1"], [7, "n1"]],
    }]);
  });

  it("replaces plain text in one column's cells, only where it occurs", () => {
    const values = [{ line: 2, text: "$1,250.00" }, { line: 3, text: "980" }, { line: 4, text: "$$5" }];
    expect(replaceInColumn(values, "f3", "$", "")).toEqual([
      { line: 2, col: "f3", text: "1,250.00" }, { line: 4, col: "f3", text: "5" },
    ]);
    expect(replaceInColumn(values, "f3", "", "x")).toEqual([]);
  });

  it("reads the table from another line, dropping what was keyed to the old header's columns", () => {
    let e = addColumn(NO_EDITS, "token", "USDC").edits;
    e = editCells(e, [{ line: 3, col: "f0", text: "X" }]);
    e = leaveOut(deleteLine(e, 4), 3);
    expect(droppedByHeader(e)).toBe(2);
    expect(useAsHeader(e, 2)).toEqual({ ...NO_EDITS, headerLine: 2, deleted: [4], leftOut: [3] });
  });
});

describe("what changed, in words", () => {
  it("counts cells, columns, lines added, deleted and left out", () => {
    let e = editCells(NO_EDITS, [
      { line: 2, col: "f1", text: "USDC" }, { line: 2, col: "f3", text: "1" }, { line: 3, col: "f2", text: A },
    ]);
    e = addColumn(e, "unused", "").edits;
    const added = addLine(e, LINES.length);
    e = editCells(added.edits, [{ line: added.line, col: "f0", text: "N" }]);
    e = deleteLine(leaveOut(e, 3), 4);
    const c = changeCounts(e);
    expect(c).toEqual({ cells: 2, columns: 1, added: 1, deleted: 1, leftOut: 1 });
    expect(changeTotal(c)).toBe(6);
    expect(fileChanged(c)).toBe(true);
    expect(fileChanged(changeCounts(leaveOut(NO_EDITS, 2)))).toBe(false);
  });

  it("says nothing when nothing changed", () => {
    expect(changesText(changeCounts(NO_EDITS))).toBeUndefined();
    expect(correctionReminder(changeCounts(NO_EDITS))).toBeUndefined();
  });

  it("names the changes for the summary, and reminds the payer to update the spreadsheet", () => {
    const c = { cells: 6, columns: 2, added: 1, deleted: 1, leftOut: 1 };
    expect(changesText(c)).toBe("6 cells · 2 columns changed · 1 line added · 1 deleted · 1 left out");
    expect(changesText({ cells: 1, columns: 0, added: 0, deleted: 0, leftOut: 0, header: 5 })).toBe("1 cell · header on line 5");
    expect(correctionReminder(c)).toBe(
      "Changed here: 6 cells · 2 columns changed · 1 line added · 1 deleted · 1 left out. Download the corrected file to update your spreadsheet.",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/sheet-edits.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/sheet-edits"`.

- [ ] **Step 3: Implement `frontend/lib/sheet-edits.ts`**

```ts
import type { ColumnId, CsvField, NewColumn, ParsedCsv, ParsedRow, Role, SheetStructure } from "@ledgerline/core";

/** One value the payer typed or pressed, for one cell. */
export interface CellEdit { line: number; col: ColumnId; text: string }

/** A change made to many cells at once, undone at once. A `group` is the fix
 *  list's; a `column` batch is a numbering or a find and replace. */
export interface Batch {
  id: string;
  kind: "group" | "column";
  title: string;
  cells: readonly (readonly [number, ColumnId])[];
}

/**
 * What the payer changed on the Review step, over the file as read. The file
 * itself is never written to: undo is dropping an entry here. Lines are the
 * file's own numbers; a new line is numbered after the file's last.
 */
export interface SheetEdits {
  /** The header line; default the first line with a non-empty cell. */
  headerLine?: number;
  /** Roles set here for the file's columns, over those read from their names. */
  roles: Readonly<Partial<Record<`f${number}`, Role>>>;
  /** Columns the file never had, each with its role and the value of every
   *  line that has no cell of its own there. */
  newColumns: readonly NewColumn[];
  /** Line → column → text, as typed. File lines and new lines alike. */
  cells: Readonly<Record<number, Readonly<Partial<Record<ColumnId, string>>>>>;
  newLines: readonly number[];
  /** Deleted from the file: not in this run, not in the corrected file. */
  deleted: readonly number[];
  /** Left out of this run: still owed, kept in the corrected file. */
  leftOut: readonly number[];
  batches: readonly Batch[];
}

export const NO_EDITS: SheetEdits = {
  roles: {}, newColumns: [], cells: {}, newLines: [], deleted: [], leftOut: [], batches: [],
};

/** The part of the edits core reads the file under. */
export function structureOf(e: SheetEdits): SheetStructure {
  return { headerLine: e.headerLine, roles: e.roles, newColumns: e.newColumns };
}

const fileIndex = (col: ColumnId) => (col.startsWith("f") ? Number(col.slice(1)) : -1);

/**
 * A cell's text: typed here, else as read, else a new column's fill. An
 * unreadable line's cells are only what was typed: its values as split do
 * not line up with the header, so none of them is shown as a column's.
 */
export function cellText(e: SheetEdits, row: ParsedRow | undefined, line: number, col: ColumnId): string {
  const own = e.cells[line]?.[col];
  if (own !== undefined) return own;
  const i = fileIndex(col);
  if (i >= 0) return row && !row.unreadable ? row.cells[i] ?? "" : "";
  return e.newColumns.find((c) => c.id === col)?.fill ?? "";
}

/** The rows the run is checked against: typed cells over the sheet as read,
 *  deleted and left-out lines dropped, new lines added after the file's. */
export function applySheetEdits(sheet: ParsedCsv, e: SheetEdits): ParsedRow[] {
  const columns = sheet.columns;
  if (!columns) return [];
  const gone = (line: number) => e.deleted.includes(line) || e.leftOut.includes(line);
  const read = (row: ParsedRow | undefined, line: number): ParsedRow => {
    const f = (field: CsvField) => cellText(e, row, line, columns[field]).trim();
    return {
      line, invoiceId: f("invoiceId"), tokenSymbol: f("token"), to: f("to"), amount: f("amount"),
      cells: row?.cells ?? [],
    };
  };
  const out: ParsedRow[] = [];
  for (const row of sheet.rows) {
    if (gone(row.line)) continue;
    out.push(e.cells[row.line] ? read(row, row.line) : row);
  }
  for (const line of e.newLines) if (!gone(line)) out.push(read(undefined, line));
  return out;
}

export function editCells(e: SheetEdits, changes: readonly CellEdit[]): SheetEdits {
  const cells = { ...e.cells };
  for (const { line, col, text } of changes) cells[line] = { ...cells[line], [col]: text };
  return { ...e, cells };
}

function dropCells(cells: SheetEdits["cells"], drop: readonly (readonly [number, ColumnId])[]): SheetEdits["cells"] {
  const next: Record<number, Partial<Record<ColumnId, string>>> = { ...cells };
  for (const [line, col] of drop) {
    const row = next[line];
    if (!row || !(col in row)) continue;
    const keep = { ...row };
    delete keep[col];
    if (Object.keys(keep).length === 0) delete next[line];
    else next[line] = keep;
  }
  return next;
}

function withoutCells(batches: readonly Batch[], gone: (line: number, col: ColumnId) => boolean): Batch[] {
  return batches
    .map((b) => ({ ...b, cells: b.cells.filter(([l, c]) => !gone(l, c)) }))
    .filter((b) => b.cells.length > 0);
}

/** Drops one typed cell, taking it out of any batch it was in. */
export function undoCell(e: SheetEdits, line: number, col: ColumnId): SheetEdits {
  return {
    ...e,
    cells: dropCells(e.cells, [[line, col]]),
    batches: withoutCells(e.batches, (l, c) => l === line && c === col),
  };
}

/** A batch id not in use: `<prefix>:1`, `<prefix>:2`… */
export function nextBatchId(e: SheetEdits, prefix: string): string {
  let n = 1;
  while (e.batches.some((b) => b.id === `${prefix}:${n}`)) n++;
  return `${prefix}:${n}`;
}

/** Many cells in one step, undone in one step. A batch with the same id is replaced. */
export function applyBatch(e: SheetEdits, batch: Omit<Batch, "cells">, changes: readonly CellEdit[]): SheetEdits {
  if (changes.length === 0) return e;
  const next = editCells(e, changes);
  return {
    ...next,
    batches: [
      ...next.batches.filter((b) => b.id !== batch.id),
      { ...batch, cells: changes.map((c) => [c.line, c.col] as const) },
    ],
  };
}

export function undoBatch(e: SheetEdits, id: string): SheetEdits {
  const batch = e.batches.find((b) => b.id === id);
  if (!batch) return e;
  return { ...e, cells: dropCells(e.cells, batch.cells), batches: e.batches.filter((b) => b !== batch) };
}

/**
 * A line card's Undo: drops the line's typed cells and takes it out of any
 * group. A numbering or a find and replace is left to its own Undo, which
 * lists it: dropping one line's share of it here would surprise.
 */
export function undoLine(e: SheetEdits, line: number): SheetEdits {
  const kept = new Set(
    e.batches.filter((b) => b.kind === "column").flatMap((b) => b.cells.filter(([l]) => l === line).map(([, c]) => c)),
  );
  const drop = (Object.keys(e.cells[line] ?? {}) as ColumnId[]).filter((c) => !kept.has(c));
  return {
    ...e,
    cells: dropCells(e.cells, drop.map((c) => [line, c] as const)),
    batches: withoutCells(e.batches, (l, c) => l === line && !kept.has(c)),
  };
}

export function leaveOut(e: SheetEdits, line: number): SheetEdits {
  return e.leftOut.includes(line) ? e : { ...e, leftOut: [...e.leftOut, line] };
}

export function putBack(e: SheetEdits, line: number): SheetEdits {
  return { ...e, leftOut: e.leftOut.filter((l) => l !== line) };
}

/** A new line goes with its cells; a file line is marked, and stays in place. */
export function deleteLine(e: SheetEdits, line: number): SheetEdits {
  if (e.newLines.includes(line)) {
    const cols = Object.keys(e.cells[line] ?? {}) as ColumnId[];
    return {
      ...e,
      cells: dropCells(e.cells, cols.map((c) => [line, c] as const)),
      batches: withoutCells(e.batches, (l) => l === line),
      newLines: e.newLines.filter((l) => l !== line),
      leftOut: e.leftOut.filter((l) => l !== line),
    };
  }
  if (e.deleted.includes(line)) return e;
  return { ...e, deleted: [...e.deleted, line], leftOut: e.leftOut.filter((l) => l !== line) };
}

export function restoreLine(e: SheetEdits, line: number): SheetEdits {
  return { ...e, deleted: e.deleted.filter((l) => l !== line) };
}

/** `lineCount` is `readLines(text).length`. */
export function addLine(e: SheetEdits, lineCount: number): { edits: SheetEdits; line: number } {
  const line = Math.max(lineCount, ...e.newLines) + 1;
  return { edits: { ...e, newLines: [...e.newLines, line] }, line };
}

function assignRole(e: SheetEdits, col: ColumnId, role: Role): SheetEdits {
  if (col.startsWith("n")) {
    return { ...e, newColumns: e.newColumns.map((c) => (c.id === col ? { ...c, role } : c)) };
  }
  return { ...e, roles: { ...e.roles, [col as `f${number}`]: role } };
}

/**
 * Gives a column a role. Any column that held it is marked not used, so a
 * role is never held twice. `roles` is the sheet's, as read now.
 */
export function setRole(e: SheetEdits, roles: Readonly<Record<ColumnId, Role>>, col: ColumnId, role: Role): SheetEdits {
  let next = assignRole(e, col, role);
  if (role !== "unused") {
    for (const [other, held] of Object.entries(roles) as [ColumnId, Role][]) {
      if (other !== col && held === role) next = assignRole(next, other, "unused");
    }
  }
  return next;
}

/** Back to what the column's name says. */
export function clearRole(e: SheetEdits, col: `f${number}`): SheetEdits {
  const roles = { ...e.roles };
  delete roles[col];
  return { ...e, roles };
}

export function addColumn(e: SheetEdits, role: Role, fill: string): { edits: SheetEdits; col: `n${number}` } {
  const k = Math.max(0, ...e.newColumns.map((c) => Number(c.id.slice(1)))) + 1;
  const col = `n${k}` as const;
  const name = role === "unused" ? `Column ${k}` : role;
  return { edits: { ...e, newColumns: [...e.newColumns, { id: col, name, role, fill }] }, col };
}

/** A new column goes with its cells and its share of any batch. */
export function dropColumn(e: SheetEdits, col: `n${number}`): SheetEdits {
  const cells: Record<number, Partial<Record<ColumnId, string>>> = {};
  for (const [line, row] of Object.entries(e.cells)) {
    const keep = { ...row };
    delete keep[col];
    if (Object.keys(keep).length > 0) cells[Number(line)] = keep;
  }
  return {
    ...e,
    newColumns: e.newColumns.filter((c) => c.id !== col),
    cells,
    batches: withoutCells(e.batches, (_, c) => c === col),
  };
}

/**
 * Adds the invoice column with a reference on each line given, in order:
 * `<prefix>-1`, `<prefix>-2`… The caller passes every line not deleted,
 * left-out lines included: they are still owed.
 */
export function numberInvoices(e: SheetEdits, lines: readonly number[], prefix: string): SheetEdits {
  const { edits, col } = addColumn(e, "invoiceId", "");
  const changes = lines.map((line, i) => ({ line, col, text: `${prefix}-${i + 1}` }));
  return applyBatch(edits, {
    id: `number:${col}`, kind: "column", title: `Invoices numbered ${prefix}-1 to ${prefix}-${lines.length}`,
  }, changes);
}

/** Every cell of one column that holds `find`, with it replaced. Plain text,
 *  case-sensitive. Nothing for an empty `find`. */
export function replaceInColumn(
  values: readonly { line: number; text: string }[], col: ColumnId, find: string, replace: string,
): CellEdit[] {
  if (find === "") return [];
  return values
    .filter((v) => v.text.includes(find))
    .map((v) => ({ line: v.line, col, text: v.text.split(find).join(replace) }));
}

/**
 * Reads the table from another line. Every column-keyed change was made
 * under the old header's columns, so they go: roles, new columns, typed
 * cells, batches, new lines. Deleted and left-out lines below it stay.
 */
export function useAsHeader(e: SheetEdits, line: number): SheetEdits {
  return {
    ...NO_EDITS,
    headerLine: line,
    deleted: e.deleted.filter((l) => l > line),
    leftOut: e.leftOut.filter((l) => l > line),
  };
}

/** How many changes `useAsHeader` drops, for its confirmation. */
export function droppedByHeader(e: SheetEdits): number {
  const cells = Object.values(e.cells).reduce((n, r) => n + Object.keys(r).length, 0);
  return Object.keys(e.roles).length + e.newColumns.length + cells + e.newLines.length;
}

export interface ChangeCounts {
  /** Typed cells on file lines still in the run. */
  cells: number;
  /** Roles set and columns added. */
  columns: number;
  added: number;
  deleted: number;
  leftOut: number;
  /** The header line, when it was moved. */
  header?: number;
}

export function changeCounts(e: SheetEdits): ChangeCounts {
  const counted = (line: number) => !e.deleted.includes(line) && !e.leftOut.includes(line) && !e.newLines.includes(line);
  const cells = Object.entries(e.cells)
    .filter(([line]) => counted(Number(line)))
    .reduce((n, [, r]) => n + Object.keys(r).length, 0);
  return {
    cells,
    columns: Object.keys(e.roles).length + e.newColumns.length,
    added: e.newLines.length,
    deleted: e.deleted.length,
    leftOut: e.leftOut.length,
    ...(e.headerLine !== undefined ? { header: e.headerLine } : {}),
  };
}

export const changeTotal = (c: ChangeCounts) =>
  c.cells + c.columns + c.added + c.deleted + c.leftOut + (c.header !== undefined ? 1 : 0);

/** Whether the corrected file differs from the file chosen. Leaving a line
 *  out alone does not change it. */
export const fileChanged = (c: ChangeCounts) =>
  c.cells + c.columns + c.added + c.deleted > 0 || c.header !== undefined;

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** For the summary, through Check and Pay. */
export function changesText(c: ChangeCounts): string | undefined {
  const parts = [
    ...(c.cells > 0 ? [n(c.cells, "cell")] : []),
    ...(c.columns > 0 ? [`${n(c.columns, "column")} changed`] : []),
    ...(c.header !== undefined ? [`header on line ${c.header}`] : []),
    ...(c.added > 0 ? [`${n(c.added, "line")} added`] : []),
    ...(c.deleted > 0 ? [`${c.deleted} deleted`] : []),
    ...(c.leftOut > 0 ? [`${c.leftOut} left out`] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** For the Result screen: the spreadsheet is what the payer opens next month. */
export function correctionReminder(c: ChangeCounts): string | undefined {
  const did = changesText(c);
  return did && `Changed here: ${did}. Download the corrected file to update your spreadsheet.`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/sheet-edits.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/sheet-edits.ts frontend/test/sheet-edits.test.ts
git commit -m "feat(web): SheetEdits, an overlay of cells, columns and lines over the file as read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Review step runs on `SheetEdits`

No behaviour a payer can see changes, except that a new line's card offers `Delete this line`. This task swaps the model under the existing fix list, table and corrected file, and deletes `run-edits.ts`.

**Files:**
- Modify: `frontend/lib/review-view.ts`, `frontend/lib/fix-list.ts`, `frontend/lib/corrected-file.ts`, `frontend/lib/run-summary-view.ts`
- Modify: `frontend/app/(app)/new/CreateRun.tsx`, `StepUpload.tsx`, `StepPreview.tsx`, `FixList.tsx`, `LineCard.tsx`, `Result.tsx`
- Delete: `frontend/lib/run-edits.ts`, `frontend/test/run-edits.test.ts`
- Test: `frontend/test/review-view.test.ts`, `fix-list.test.ts`, `corrected-file.test.ts`, `run-summary-view.test.ts`, `plain-language.test.ts`

**Interfaces:**
- Consumes (Task 1): `readLines`, `readSheet`, `FileLine`, `ColumnId`, `ParsedCsv`. (Task 2): everything in `@/lib/sheet-edits`.
- Produces:
  - `checkRows(sheet: ParsedCsv, edits: SheetEdits, tokens: TokenSet, decimals: Record<string, number>): CheckedFile` (`@/lib/review-view`)
  - `fixList({ checked, source: ParsedCsv, edits: SheetEdits, tokens })`; `FieldFix.col: ColumnId`; `GroupCard.col: ColumnId`; `GroupAction { label; changes: CellEdit[]; batch: Omit<Batch, "cells"> }`; `LineCard.isNew: boolean` (`@/lib/fix-list`)
  - `correctedCsv(lines: readonly FileLine[], sheet: ParsedCsv, edits: SheetEdits): string`; `correctedFile(d: { lines: readonly FileLine[]; sheet: ParsedCsv; edits: SheetEdits; sourceName: string })` (`@/lib/corrected-file`)
  - `RunBase { text: string; lines: FileLine[]; sourceName: string; runLabel: string; tokens: TokenSet; decimals: Record<string, number>; symbols: Record<string, string> }`; `RunDraft extends RunBase, CheckedFile { edits: SheetEdits; sheet: ParsedCsv }` (`CreateRun.tsx`)
  - `runSummaryView(…, changes?: ChangeCounts)`

- [ ] **Step 1: Port the tests**

1a. Replace `frontend/test/review-view.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { readLines, readSheet, tokensForChain } from "@ledgerline/core";
import { checkRows, ALL_LEFT_OUT } from "@/lib/review-view";
import { NO_EDITS, editCells, leaveOut, deleteLine, structureOf, type SheetEdits } from "@/lib/sheet-edits";

const TOKENS = tokensForChain(5042002);
const DECIMALS = {
  [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8,
};
const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

describe("checkRows", () => {
  const check = (text: string, edits: SheetEdits = NO_EDITS) =>
    checkRows(readSheet(readLines(text), structureOf(edits)), edits, TOKENS, DECIMALS);

  it("gives every row problem its line, field and level, in line order", () => {
    const c = check(`invoiceId,token,to,amount\nINV-1,USD,${A},1\nINV-2,USDC,${A},1\nINV-3,USDC,${A},2`);
    expect(c.problems.map((p) => [p.line, p.field, p.level])).toEqual([
      [2, "token", "error"], [4, undefined, "warning"],
    ]);
    expect(c.fileProblems).toEqual([]);
  });

  it("keeps the file's own problems apart from the rows'", () => {
    expect(check(`id,coin\n1,2`).fileProblems[0]).toMatch(/^The first line must name the columns/);
    expect(check(`invoiceId,token,to,amount\n`).fileProblems).toEqual(["This file has no payments in it."]);
  });

  it("re-reads a line from its typed cell, through the same rules", () => {
    const c = check(`invoiceId,token,to,amount\nINV-1,USD,${A},1`, editCells(NO_EDITS, [{ line: 2, col: "f1", text: "USDC" }]));
    expect(c.problems).toEqual([]);
    expect(c.rows.map((r) => r.line)).toEqual([2]);
  });

  it("refuses 0,10 typed into a comma file, and reads 0.10 typed into a semicolon file", () => {
    const comma = check(`invoiceId,token,to,amount\nINV-1,USDC,${A},x`, editCells(NO_EDITS, [{ line: 2, col: "f3", text: "0,10" }]));
    expect(comma.rows).toEqual([]);
    expect(comma.problems[0]).toMatchObject({ line: 2, field: "amount", level: "error" });
    const semi = check(`invoiceId;token;to;amount\nINV-1;USDC;${A};x`, editCells(NO_EDITS, [{ line: 2, col: "f3", text: "0.10" }]));
    expect(semi.rows[0]!.amount).toBe(100_000n);
  });

  it("says every line is left out, not that the file is empty", () => {
    const c = check(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`, leaveOut(NO_EDITS, 2));
    expect(c.fileProblems).toEqual([ALL_LEFT_OUT]);
    expect(ALL_LEFT_OUT).toBe("Every line is left out of this run. Put one back to pay it.");
  });

  it("says a file whose every line is deleted has no payments", () => {
    const c = check(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`, deleteLine(NO_EDITS, 2));
    expect(c.fileProblems).toEqual(["This file has no payments in it."]);
  });
});
```

1b. Replace `frontend/test/corrected-file.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { parseCsv, readLines, readSheet, tokensForChain } from "@ledgerline/core";
import { correctedCsv, correctedFile } from "@/lib/corrected-file";
import { NO_EDITS, deleteLine, editCells, leaveOut, structureOf, type SheetEdits } from "@/lib/sheet-edits";
import { checkRows } from "@/lib/review-view";
import { PASTED_ROWS } from "@/lib/run-file";

const TOKENS = tokensForChain(5042002);
const DECIMALS = { [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8 };
const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const fix = (text: string, edits: SheetEdits) => {
  const lines = readLines(text);
  return correctedCsv(lines, readSheet(lines, structureOf(edits)), edits);
};
const file = (text: string, sourceName: string) =>
  correctedFile({ lines: readLines(text), sheet: parseCsv(text), edits: NO_EDITS, sourceName });

describe("correctedCsv", () => {
  it("gives back the file byte for byte when nothing is edited", () => {
    const text = `﻿Name,invoiceId,token,to,amount\r\n"Nguyen, An",INV-1,USDC,${A},1\r\n`;
    expect(fix(text, NO_EDITS)).toBe(text);
  });

  it("rewrites only the edited line, keeping the BOM, the line endings and the extra columns", () => {
    const text = `﻿Name,invoiceId,token,to,amount\r\nAn,INV-1,USD,${A},1\r\nBinh,INV-2,USDC,${A},2\r\n`;
    const out = fix(text, editCells(NO_EDITS, [{ line: 2, col: "f2", text: "USDC" }]));
    expect(out).toBe(`﻿Name,invoiceId,token,to,amount\r\nAn,INV-1,USDC,${A},1\r\nBinh,INV-2,USDC,${A},2\r\n`);
  });

  it("quotes an edited value that holds the delimiter or a quote, and it reads back the same", () => {
    const text = `invoiceId,token,to,amount\n,USDC,${A},1`;
    const out = fix(text, editCells(NO_EDITS, [{ line: 2, col: "f0", text: 'INV, "A"' }]));
    expect(out).toBe(`invoiceId,token,to,amount\n"INV, ""A""",USDC,${A},1`);
    expect(parseCsv(out).rows[0]!.invoiceId).toBe('INV, "A"');
  });

  it("writes an amount in the file's decimal mark, so a comma-decimal sheet stores a number", () => {
    const text = `invoiceId;token;to;amount\nINV-1;USDC;${A};1.000`;
    expect(fix(text, editCells(NO_EDITS, [{ line: 2, col: "f3", text: "0.10" }])))
      .toBe(`invoiceId;token;to;amount\nINV-1;USDC;${A};0,10`);
  });

  it("keeps a left-out line as it was, even with an edit typed into it first", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USD,${A},1`;
    expect(fix(text, leaveOut(editCells(NO_EDITS, [{ line: 2, col: "f1", text: "USDC" }]), 2))).toBe(text);
  });

  it("does not write a deleted line", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USDC,${A},1\nTotal,,,1\n`;
    expect(fix(text, deleteLine(NO_EDITS, 3))).toBe(`invoiceId,token,to,amount\nINV-1,USDC,${A},1\n`);
  });

  it("writes an unreadable line out in the header's columns once it is typed in again", () => {
    const text = `invoiceId,token,to,amount,Note\nINV-1,USDC`;
    const e = editCells(NO_EDITS, [
      { line: 2, col: "f0", text: "INV-1" }, { line: 2, col: "f1", text: "USDC" },
      { line: 2, col: "f2", text: A }, { line: 2, col: "f3", text: "5" },
    ]);
    expect(fix(text, e)).toBe(`invoiceId,token,to,amount,Note\nINV-1,USDC,${A},5,`);
  });

  it("reads back to exactly the rows on screen", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USD,${A},"1,250.50"\nINV-2,USDC,nope,2\nINV-3,EURC,${A},3\nINV-4,USDC,${A},x`;
    const lines = readLines(text);
    const e = leaveOut(editCells(NO_EDITS, [
      { line: 2, col: "f1", text: "USDC" }, { line: 2, col: "f3", text: "1250.50" },
      { line: 3, col: "f2", text: A.toLowerCase() },
    ]), 5);
    const sheet = readSheet(lines, structureOf(e));
    const onScreen = checkRows(sheet, e, TOKENS, DECIMALS).rows;
    const reread = checkRows(parseCsv(correctedCsv(lines, sheet, e)), NO_EDITS, TOKENS, DECIMALS).rows;
    expect(reread).toEqual(onScreen);
  });
});

describe("correctedFile", () => {
  it("names the file after the one chosen, in its own format", () => {
    const f = file(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`, "September.csv");
    expect(f.name).toBe("September-corrected.csv");
    expect(f.type).toBe("text/csv");
  });

  it("names pasted rows as a tab-separated file", () => {
    const f = file(`invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t${A}\t1`, PASTED_ROWS);
    expect(f.name).toBe("pasted-rows-corrected.tsv");
    expect(f.type).toBe("text/tab-separated-values");
  });

  it("keeps a tab-separated .csv file as .csv, not .tsv", () => {
    const f = file(`invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t${A}\t1`, "X.csv");
    expect(f.name).toBe("X-corrected.csv");
    expect(f.type).toBe("text/csv");
  });

  it("keeps the original extension when .tsv, case-insensitive", () => {
    const f = file(`invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t${A}\t1`, "Payroll.TSV");
    expect(f.name).toBe("Payroll-corrected.tsv");
    expect(f.type).toBe("text/tab-separated-values");
  });

  it("names a file with no extension as .csv", () => {
    const f = file(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`, "Payroll");
    expect(f.name).toBe("Payroll-corrected.csv");
    expect(f.type).toBe("text/csv");
  });
});
```

1c. In `frontend/test/fix-list.test.ts`:

- Replace the import lines for `@ledgerline/core` and `@/lib/run-edits`, and the `view` helper, with:

```ts
import { readLines, readSheet, tokensForChain } from "@ledgerline/core";
import { afterRowFix, fixList, rowId, RECIPIENT_HELP, type GroupAction } from "@/lib/fix-list";
import { checkRows } from "@/lib/review-view";
import {
  NO_EDITS, addLine, applyBatch, deleteLine, editCells, leaveOut, numberInvoices, structureOf, type SheetEdits,
} from "@/lib/sheet-edits";
```

```ts
function view(text: string, edits: SheetEdits = NO_EDITS) {
  const source = readSheet(readLines(text), structureOf(edits));
  return fixList({ checked: checkRows(source, edits, TOKENS, DECIMALS), source, edits, tokens: TOKENS });
}
/** Every file here is `invoiceId,token,to,amount` (or `;`), so a field is a column. */
const COL = { invoiceId: "f0", token: "f1", to: "f2", amount: "f3" } as const;
const edit = (changes: { line: number; field: keyof typeof COL; text: string }[]) =>
  editCells(NO_EDITS, changes.map(({ line, field, text }) => ({ line, col: COL[field], text })));
const apply = (a: GroupAction) => applyBatch(NO_EDITS, a.batch, a.changes);
```

- Replace every `withEdits(NO_EDITS, ` with `edit(` and every `applyGroup(NO_EDITS, ` with `apply(`.
- In `"puts three or more lines with the same unknown token in one card, with no line cards"`, replace
  `expect(g.actions[0]!.edits).toEqual([2, 3, 4].map((line) => ({ line, field: "token", text: "USDC" })));`
  with
  `expect(g.actions[0]!.changes).toEqual([2, 3, 4].map((line) => ({ line, col: "f1", text: "USDC" })));`
  and add after it `expect(g.col).toBe("f1");`
- In `"never groups addresses"`, the expected field becomes
  `[{ field: "to", col: "f2", label: "Recipient", value: "nope", choices: [], help: RECIPIENT_HELP }]`.
- In `"offers both readings for a group of 1.000-style amounts, with the file's own marks"`, replace `a.edits.map` with `a.changes.map`.
- In `"shows only the fields with a problem, with buttons carrying the token and no grouping mark"`, the expected field gains `col: "f3"` after `field: "amount"`.
- Add to `describe("fixList: line cards")`:

```ts
  it("gives a new line left empty a card with its problems, which blocks the run", () => {
    const text = csv(`INV-1,USDC,${A},1`);
    const { edits, line } = addLine(NO_EDITS, readLines(text).length);
    const v = view(text, edits);
    expect(v.cards).toEqual([expect.objectContaining({
      line, isNew: true, state: "open", heading: `Line ${line} · new`, blocking: true,
    })]);
    expect(v.cards[0]!.fields.map((f) => f.field)).toEqual(["invoiceId", "token", "to", "amount"]);
    expect(v.fixFirst).toBe("Fix 1 problem first");
  });

  it("shows no card for a deleted line, whatever was typed on it", () => {
    const text = csv(`INV-1,USDC,nope,1`, `INV-2,USDC,${A},2`);
    expect(view(text, deleteLine(edit([{ line: 2, field: "to", text: A }]), 2)).cards).toEqual([]);
  });

  it("leaves cells a numbering wrote to its own undo, not to line cards", () => {
    const text = `wallet,amount,token\n${A},1,USDC\n${B},2,USDC`;
    expect(view(text, numberInvoices(NO_EDITS, [2, 3], "Oct")).cards).toEqual([]);
  });
```

1d. In `frontend/test/run-summary-view.test.ts`, in `describe("runSummaryView: changes made here")`, replace

```ts
    const v = runSummaryView("Payroll", { items: [] }, [], {}, {}, { edited: 3, leftOut: 1 });
    expect(v.changes).toBe("3 lines edited here · 1 left out");
```

with

```ts
    const v = runSummaryView("Payroll", { items: [] }, [], {}, {}, { cells: 3, columns: 0, added: 0, deleted: 0, leftOut: 1 });
    expect(v.changes).toBe("3 cells · 1 left out");
```

1e. In `frontend/test/plain-language.test.ts`:
- Replace `import { NO_EDITS, changesText, correctionReminder } from "@/lib/run-edits";` with `import { NO_EDITS, changesText, correctionReminder } from "@/lib/sheet-edits";`
- Replace `{ edited: 1, leftOut: 1 }` (the `runSummaryView` call) with `{ cells: 1, columns: 1, added: 1, deleted: 1, leftOut: 1, header: 2 }`.
- Replace `plain(changesText({ edited: 3, leftOut: 1 }));` and `plain(correctionReminder({ edited: 3, leftOut: 1 }));` with:

```ts
    const counts = { cells: 3, columns: 2, added: 1, deleted: 1, leftOut: 1, header: 5 };
    plain(changesText(counts));
    plain(correctionReminder(counts));
```

- Add `"Delete this line"` to the list of labels checked with `plain(label)`.

1f. Delete `frontend/test/run-edits.test.ts`: `git rm frontend/test/run-edits.test.ts`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run`
Expected: FAIL — `checkRows` still takes `RunEdits`, `correctedCsv` takes `(text, source, edits)`, `fixList` has no `col`/`isNew`/`changes`/`batch`.

- [ ] **Step 3: `frontend/lib/review-view.ts`**

Replace the imports and `checkRows` with:

```ts
import {
  parseCsv, resolveRows, validateRun,
  type AmountKind, type CsvField, type ParsedCsv, type ParsedRow,
  type ResolvedRow, type TokenSet,
} from "@ledgerline/core";
import { applySheetEdits, NO_EDITS, type SheetEdits } from "@/lib/sheet-edits";
```

```ts
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
```

`checkRunFile` keeps its body (`checkRows(parseCsv(text), NO_EDITS, tokens, decimals)`).

- [ ] **Step 4: `frontend/lib/fix-list.ts`**

Replace the whole file with:

```ts
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
```

- [ ] **Step 5: `frontend/lib/corrected-file.ts`**

Replace the imports, `linesOf` and `correctedCsv`, and `correctedFile`'s signature, so the file reads:

```ts
import {
  amountInFile, readAmount, type ColumnId, type Delimiter, type FileLine, type ParsedCsv,
} from "@ledgerline/core";
import type { SheetEdits } from "@/lib/sheet-edits";
import { PASTED_ROWS } from "@/lib/run-file";

const cellText = (value: string, delimiter: Delimiter) =>
  /["\r\n]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value;

/** An edited amount in the file's own convention: `0,10` in a `;` file, so a
 *  comma-decimal Numbers stores a number, not text. */
function amountCell(text: string, delimiter: Delimiter): string {
  const read = readAmount(text, delimiter);
  return read.ok ? amountInFile(read.amount, delimiter) : text.trim();
}

/**
 * The payer's file with their changes in it, to replace the one in their
 * spreadsheet. Lines not edited, the header and every extra column are kept
 * as they were. A left-out line is kept unchanged: it is still owed. A
 * deleted line is not written.
 */
export function correctedCsv(lines: readonly FileLine[], sheet: ParsedCsv, edits: SheetEdits): string {
  const out = lines.map((l) => ({ ...l }));
  const columns = sheet.columns;
  if (columns) {
    for (const row of sheet.rows) {
      const typed = edits.cells[row.line];
      if (!typed || edits.leftOut.includes(row.line)) continue;
      const cells = row.unreadable ? sheet.header.map(() => "") : [...row.cells];
      for (const [col, text] of Object.entries(typed) as [ColumnId, string][]) {
        if (!col.startsWith("f")) continue;
        cells[Number(col.slice(1))] = col === columns.amount ? amountCell(text.trim(), sheet.delimiter) : text.trim();
      }
      out[row.line - 1]!.body = cells.map((c) => cellText(c, sheet.delimiter)).join(sheet.delimiter);
    }
  }
  return out.filter((_, i) => !edits.deleted.includes(i + 1)).map((l) => l.body + l.end).join("");
}

export function correctedFile(d: {
  lines: readonly FileLine[]; sheet: ParsedCsv; edits: SheetEdits; sourceName: string;
}): { name: string; text: string; type: string } {
  const text = correctedCsv(d.lines, d.sheet, d.edits);
  if (d.sourceName === PASTED_ROWS) {
    return { name: "pasted-rows-corrected.tsv", text, type: "text/tab-separated-values" };
  }
  const extMatch = /\.([^.]+)$/.exec(d.sourceName);
  const ext = extMatch ? extMatch[1]!.toLowerCase() : "";
  const tsv = ext === "tsv";
  const baseName = d.sourceName.replace(/\.[^.]+$/, "");
  return {
    name: `${baseName}-corrected.${tsv ? "tsv" : "csv"}`,
    text,
    type: tsv ? "text/tab-separated-values" : "text/csv",
  };
}
```

- [ ] **Step 6: `frontend/lib/run-summary-view.ts`**

Change `import { changesText } from "@/lib/run-edits";` to `import { changesText, type ChangeCounts } from "@/lib/sheet-edits";`, and in `runSummaryView`'s parameters replace `changes?: { edited: number; leftOut: number },` with `changes?: ChangeCounts,`.

- [ ] **Step 7: The components**

7a. `CreateRun.tsx`:
- Replace `import { tokensForChain } from "@ledgerline/core";` with `import { readSheet, tokensForChain, type FileLine } from "@ledgerline/core";`
- Replace `import { NO_EDITS, type RunEdits, changeCounts } from "@/lib/run-edits";` with `import { NO_EDITS, changeCounts, structureOf, type SheetEdits } from "@/lib/sheet-edits";`
- Replace `RunBase`, `RunDraft`, the `edits` state and the `draft` memo with:

```ts
/** What the Upload step hands over: the file as read, never written to. */
export interface RunBase {
  text: string;
  /** The file's lines as read, each with its break. */
  lines: FileLine[];
  /** The file's name, or PASTED_ROWS. */
  sourceName: string;
  runLabel: string;
  /** Fixed at upload, with the decimals read for them. */
  tokens: TokenSet;
  decimals: Record<string, number>;
  symbols: Record<string, string>;
}

/** The run as Review shows it: the file, the payer's edits over it, the sheet
 *  they are read as, and everything checked from the two. */
export interface RunDraft extends RunBase, CheckedFile {
  edits: SheetEdits;
  sheet: ParsedCsv;
}
```

```ts
  const [edits, setEdits] = useState<SheetEdits>(NO_EDITS);
  const draft = useMemo<RunDraft | undefined>(() => {
    if (!base) return undefined;
    const sheet = readSheet(base.lines, structureOf(edits));
    return { ...base, edits, sheet, ...checkRows(sheet, edits, base.tokens, base.decimals) };
  }, [base, edits]);
```

7b. `StepUpload.tsx`: replace `import { parseCsv, tokensForChain } from "@ledgerline/core";` with `import { readLines, tokensForChain } from "@ledgerline/core";`, and in `handle` replace `text, source: parseCsv(text), sourceName: name, runLabel: runLabel.trim(),` with `text, lines: readLines(text), sourceName: name, runLabel: runLabel.trim(),`.

7c. `StepPreview.tsx`:
- Replace `import { changeCounts, type RunEdits } from "@/lib/run-edits";` with `import { changeCounts, changeTotal, fileChanged, type SheetEdits } from "@/lib/sheet-edits";`
- `onEdits: (edits: RunEdits) => void;` becomes `onEdits: (edits: SheetEdits) => void;`
- The `fixList` call becomes `fixList({ checked: draft, source: draft.sheet, edits: draft.edits, tokens: draft.tokens })`.
- Replace `const changed = changes.edited + changes.leftOut;` with `const changed = changeTotal(changes);`
- Replace `{changes.edited > 0 && (` (the download button's guard) with `{fileChanged(changes) && (`.

7d. `FixList.tsx`:
- Replace the `@/lib/run-edits` import with:

```ts
import {
  applyBatch, deleteLine, editCells, leaveOut, putBack, undoBatch, undoLine, type CellEdit, type SheetEdits,
} from "@/lib/sheet-edits";
```

- In `GroupCardView`, the row button's `onClick` becomes `onClick={() => onApplyOne(r.line, [{ line: r.line, col: group.col, text: c.text }])}`.
- In `FixList`, `edits: RunEdits; onEdits: (e: RunEdits) => void;` becomes `edits: SheetEdits; onEdits: (e: SheetEdits) => void;`
- Add, after the `rowFix` effect, a focus for a deleted card:

```ts
  // A new line deleted from its card takes the card with it: focus the list.
  const deleted = useRef(false);
  useEffect(() => {
    if (!deleted.current) return;
    deleted.current = false;
    document.getElementById("fix-list")?.focus();
  }, [view]);
```

- The group and card callbacks become:

```tsx
        <GroupCardView key={g.id} group={g}
          onApply={(a) => onEdits(applyBatch(edits, a.batch, a.changes))}
          onApplyOne={(line, changes) => {
            rowFix.current = { key: g.key, lines: g.lines, line };
            onEdits(editCells(edits, changes));
          }}
          onUndo={() => onEdits(undoBatch(edits, g.key))} />
```

```tsx
        <LineCardView key={c.id} card={c}
          onApply={(changes) => onEdits(editCells(edits, changes))}
          onUndo={() => onEdits(undoLine(edits, c.line))}
          onLeaveOut={() => onEdits(leaveOut(edits, c.line))}
          onPutBack={() => onEdits(putBack(edits, c.line))}
          onDelete={() => { deleted.current = true; onEdits(deleteLine(edits, c.line)); }} />
```

(`GroupAction` no longer has `edits`; `onApply`'s parameter type stays `GroupAction`.)

7e. `LineCard.tsx`:
- Replace `import type { CellEdit } from "@/lib/run-edits";` with `import type { CellEdit } from "@/lib/sheet-edits";`
- In `FieldInput`, both `onApply([{ line, field: fix.field, text }], …)` calls become `onApply([{ line, col: fix.col, text }], …)` (the typed text in `commit`, and `c.text` in the choice button).
- Add `onDelete: () => void;` to `LineCardView`'s props and destructuring.
- Replace the open card's last button with:

```tsx
      {card.isNew ? (
        <Button size="small" type="text" onClick={onDelete}>Delete this line</Button>
      ) : (
        <Button size="small" type="text" onClick={() => { pending.current = true; onLeaveOut(); }}>
          Leave out of this run
        </Button>
      )}
```

7f. `Result.tsx`: replace `import { changeCounts, correctionReminder } from "@/lib/run-edits";` with `import { changeCounts, correctionReminder } from "@/lib/sheet-edits";`. `correctedFile(draft)` needs no change: a `RunDraft` has `lines`, `sheet`, `edits` and `sourceName`.

7g. `git rm frontend/lib/run-edits.ts`

- [ ] **Step 8: Run everything**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors. `grep -rn "run-edits\|RunEdits\|withEdits\|applyGroup\|undoGroup" frontend/lib frontend/app frontend/test` prints nothing.
Run: `cd packages/core && npx vitest run`
Expected: PASS.

- [ ] **Step 9: Browser regression**

Build and serve (`pnpm build`, then `cd frontend && pnpm start -p 3055` in the background). Feed `.superpowers/ux-audit/fix-numbers.csv` through the page's file input (the `DataTransfer` approach) at 1280. Check: `All are thousands` → `✓ 9 amounts read as thousands.` and Undo restores the group; typing a good address on line 11 and clicking into line 12 turns line 11 `✓ … ready to pay`; Leave out and Undo on line 12; `Download the corrected file` gives amounts `1000` and the left-out line unchanged. Stop the server. Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 10: Commit**

```bash
git add -A frontend/lib frontend/app frontend/test
git commit -m "refactor(web): the Review step runs on SheetEdits; run-edits is gone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The corrected file reads back as the run on screen

**Files:**
- Create: `frontend/test/fixtures/personas.ts`
- Modify: `frontend/lib/corrected-file.ts`
- Test: `frontend/test/corrected-file.test.ts`

**Interfaces:**
- Consumes (Task 1): `fieldFor`, `readLines`, `readSheet`, `parseCsv`, `FileLine`, `Role`. (Task 2): `SheetEdits` and its operations. (Task 3): `correctedCsv`, `correctedFile`, `checkRows`.
- Produces: `headerName(name: string, role: Role): string` (`@/lib/corrected-file`); `PERSONAS`, `A`, `B`, `C`, `D` (`frontend/test/fixtures/personas.ts`, used again in Tasks 7 and 12).

Rules (spec §7): lines above the header are not written; a column holding a role keeps its name when `fieldFor` reads that name as that role, and is otherwise written as the role's name; a `not used` column whose name `fieldFor` would read as a role is written `<name> (not used)`; new columns are appended under their role's name; a line with no typed cell, when no column was added, is written byte for byte, as is a blank line always; a deleted line is not written; a left-out line keeps its own cells and gains new columns' values; new lines are appended in the file's delimiter and line ending, and a last line with no break gets one before them; a BOM on line 1 stays at the start.

- [ ] **Step 1: Add the persona fixtures**

Create `frontend/test/fixtures/personas.ts`:

```ts
/**
 * Six files a payer realistically brings (spec 2026-09-26-csv-sheet-editor §1),
 * byte-exact: BOMs, line endings and missing final breaks included. The same
 * files, written out, are `.superpowers/ux-audit/persona-*.csv`.
 */
export const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
export const B = "0x52908400098527886E0F7030069857D2E4169EE7";
export const C = "0x1111111111111111111111111111111111111111";
export const D = "0x2222222222222222222222222222222222222222";

export const PERSONAS = {
  /** P1: Google Sheets; the currency lives in a header, $ formatting, an empty row and a Total. */
  gsheets: "Name,Email,Wallet Address,Amount (USDC),Invoice #,Notes\n"
    + `Alice Nguyen,alice@example.com,${A},"$1,250.00",INV-2026-09-01,"Design, Sept"\n`
    + `Bob Tran,bob@example.com,${B},$980.00,INV-2026-09-02,\n`
    + `Chi Le,chi@example.com,${C},"$2,400.50",INV-2026-09-03,Backend\n`
    + ",,,,,\nTotal,,,\"$4,630.50\",,\n",
  /** P2: Excel in German: BOM, CRLF, `;`, German headers, EUR, 1.234,56. */
  excelDe: "﻿Empfänger;Wallet;Währung;Betrag;Rechnung\r\n"
    + `Anna Schmidt;${A};EUR;1.234,56;RE-0917\r\n`
    + `Ben Müller;${B};EUR;850,00;RE-0918\r\n`
    + `Clara Wolf;${C};EUR;2.000,00;RE-0919\r\n`,
  /** P3: the app's own sample after Numbers: a title line, CRLF, no final break. */
  numbers: `ledgerline-sample\r\ninvoiceId;token;to;amount\r\nINV-US-001;USDC;${A};0.10\r\n`
    + `INV-EU-002;EURC;${A};0.10\r\nINV-BTC-003;cirBTC;${A};0.000001`,
  /** P4: last month's clean file, reused. */
  nextMonth: "invoiceId,token,to,amount\n"
    + `PAY-2026-09-01,USDC,${A},1200\nPAY-2026-09-02,USDC,${B},950\nPAY-2026-09-03,EURC,${C},800\n`,
  /** P5: a payroll platform's report: metadata above the header, bank rows, USDT. */
  platform: "Contractor payments report\nPeriod: 2026-09-01 to 2026-09-30\nGenerated: 2026-10-01 09:12 UTC\n\n"
    + "Contractor,Invoice ID,Payment method,Currency,Amount,Crypto wallet\n"
    + `Dana Pham,INV-771,Crypto,USDC,1500.00,${A}\nEvan Ho,INV-772,Bank transfer,USD,2100.00,\n`
    + `Fiona Vo,INV-773,Crypto,USDT,700.00,${B}\nGia Lam,INV-774,Crypto,EURC,640.00,${C}\n`,
  /** P6: the smallest real list: one currency, no invoice numbers. */
  twoColumns: `wallet,amount\n${A},100\n${B},250\n${C},75\n`,
} as const;
```

- [ ] **Step 2: Write the failing tests**

In `frontend/test/corrected-file.test.ts`, extend the imports:

```ts
import { parseCsv, readLines, readSheet, tokensForChain, type ColumnId, type ResolvedRow } from "@ledgerline/core";
import { correctedCsv, correctedFile, headerName } from "@/lib/corrected-file";
import {
  NO_EDITS, addColumn, addLine, applyBatch, cellText, deleteLine, editCells, leaveOut, nextBatchId,
  numberInvoices, replaceInColumn, setRole, structureOf, useAsHeader, type SheetEdits,
} from "@/lib/sheet-edits";
import { A, B, C, D, PERSONAS } from "./fixtures/personas";
```

(and drop the file's own `const A = …`, now imported), then add:

```ts
const payable = (rows: ResolvedRow[]) => rows.map(({ invoiceId, token, to, amount }) => ({ invoiceId, token, to, amount }));

/** The run on screen, the corrected file, and that file read back with no edits. */
function roundTrip(text: string, edits: SheetEdits) {
  const lines = readLines(text);
  const sheet = readSheet(lines, structureOf(edits));
  const onScreen = checkRows(sheet, edits, TOKENS, DECIMALS);
  const written = correctedCsv(lines, sheet, edits);
  return { onScreen, written, reread: checkRows(parseCsv(written), NO_EDITS, TOKENS, DECIMALS) };
}

/** One column's cells, as the grid shows them, for a find and replace. */
function columnValues(text: string, e: SheetEdits, col: ColumnId) {
  const sheet = readSheet(readLines(text), structureOf(e));
  return sheet.rows.map((r) => ({ line: r.line, text: cellText(e, r, r.line, col) }));
}

const rolesOf = (text: string, e: SheetEdits) => readSheet(readLines(text), structureOf(e)).roles;

describe("headerName", () => {
  it("keeps a name that says its role, names a role the name does not say, and marks a not-used name that says one", () => {
    expect(headerName("Wallet Address", "to")).toBe("Wallet Address");
    expect(headerName("Amount (USDC)", "amount")).toBe("amount");
    expect(headerName("Currency", "unused")).toBe("Currency (not used)");
    expect(headerName("Notes", "unused")).toBe("Notes");
  });
});

describe("the corrected file, for the files payers bring", () => {
  it("P1, Google Sheets: roles, a token column, $ removed, marks read, the Total line deleted", () => {
    const t = PERSONAS.gsheets;
    let e = setRole(NO_EDITS, rolesOf(t, NO_EDITS), "f3", "amount");
    e = setRole(e, rolesOf(t, e), "f4", "invoiceId");
    e = addColumn(e, "token", "USDC").edits;
    e = deleteLine(e, 6);
    e = applyBatch(e, { id: nextBatchId(e, "replace"), kind: "column", title: '"$" → "" in Amount (USDC)' },
      replaceInColumn(columnValues(t, e, "f3"), "f3", "$", ""));
    e = editCells(e, [{ line: 2, col: "f3", text: "1250.00" }, { line: 4, col: "f3", text: "2400.50" }]);
    const { onScreen, written, reread } = roundTrip(t, e);
    expect(onScreen.fileProblems).toEqual([]);
    expect(onScreen.problems.filter((p) => p.level === "error")).toEqual([]);
    expect(onScreen.rows).toHaveLength(3);
    expect(written.split("\n")[0]).toBe("Name,Email,Wallet Address,amount,invoiceId,Notes,token");
    expect(written).toContain(`Alice Nguyen,alice@example.com,${A},1250.00,INV-2026-09-01,"Design, Sept",USDC\n`);
    expect(written).toContain("\n,,,,,\n");
    expect(written).not.toContain("Total");
    expect(reread.fileProblems).toEqual([]);
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("P2, Excel in German: roles, EUR to EURC on every line, thousands marks read", () => {
    const t = PERSONAS.excelDe;
    let e = setRole(NO_EDITS, rolesOf(t, NO_EDITS), "f2", "token");
    e = setRole(e, rolesOf(t, e), "f3", "amount");
    e = setRole(e, rolesOf(t, e), "f4", "invoiceId");
    e = applyBatch(e, { id: "token:eur", kind: "group", title: "Token changed to EURC on 3 lines." },
      [2, 3, 4].map((line) => ({ line, col: "f2" as const, text: "EURC" })));
    e = editCells(e, [{ line: 2, col: "f3", text: "1234,56" }, { line: 4, col: "f3", text: "2000,00" }]);
    const { onScreen, written, reread } = roundTrip(t, e);
    expect(onScreen.problems.filter((p) => p.level === "error")).toEqual([]);
    expect(onScreen.rows).toHaveLength(3);
    expect(written.startsWith("﻿Empfänger;Wallet;token;amount;invoiceId\r\n")).toBe(true);
    expect(written).toContain(`Anna Schmidt;${A};EURC;1234,56;RE-0917\r\n`);
    expect(reread.fileProblems).toEqual([]);
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("P3, Numbers: the title line is not written, and the rest is kept byte for byte", () => {
    const { onScreen, written, reread } = roundTrip(PERSONAS.numbers, useAsHeader(NO_EDITS, 2));
    expect(onScreen.rows).toHaveLength(3);
    expect(written).toBe(PERSONAS.numbers.slice("ledgerline-sample\r\n".length));
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("P4, next month: an amount changed, the month moved, one person gone, one joined", () => {
    const t = PERSONAS.nextMonth;
    let e = editCells(NO_EDITS, [{ line: 2, col: "f3", text: "1300" }]);
    e = applyBatch(e, { id: nextBatchId(e, "replace"), kind: "column", title: '"2026-09" → "2026-10" in invoiceId' },
      replaceInColumn(columnValues(t, e, "f0"), "f0", "2026-09", "2026-10"));
    e = deleteLine(e, 3);
    const added = addLine(e, readLines(t).length);
    e = editCells(added.edits, [
      { line: added.line, col: "f0", text: "PAY-2026-10-04" }, { line: added.line, col: "f1", text: "USDC" },
      { line: added.line, col: "f2", text: D }, { line: added.line, col: "f3", text: "640" },
    ]);
    const { onScreen, written, reread } = roundTrip(t, e);
    expect(onScreen.rows.map((r) => r.invoiceId)).toEqual(["PAY-2026-10-01", "PAY-2026-10-03", "PAY-2026-10-04"]);
    expect(written).toBe(
      `invoiceId,token,to,amount\nPAY-2026-10-01,USDC,${A},1300\nPAY-2026-10-03,EURC,${C},800\nPAY-2026-10-04,USDC,${D},640\n`,
    );
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("P5, a platform report: header on line 5, the wallet column named, bank and USDT lines left out", () => {
    const t = PERSONAS.platform;
    let e = useAsHeader(NO_EDITS, 5);
    e = setRole(e, rolesOf(t, e), "f5", "to");
    e = leaveOut(leaveOut(e, 7), 8);
    const { onScreen, written, reread } = roundTrip(t, e);
    expect(onScreen.fileProblems).toEqual([]);
    expect(onScreen.rows.map((r) => r.invoiceId)).toEqual(["INV-771", "INV-774"]);
    expect(written.split("\n")[0]).toBe("Contractor,Invoice ID,Payment method,Currency,Amount,to");
    expect(written).toContain("Evan Ho,INV-772,Bank transfer,USD,2100.00,\n");
    expect(reread.fileProblems).toEqual([]);
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("P6, two columns: a token on every line and numbered invoices", () => {
    const t = PERSONAS.twoColumns;
    const e = numberInvoices(addColumn(NO_EDITS, "token", "USDC").edits, [2, 3, 4], "October");
    const { onScreen, written, reread } = roundTrip(t, e);
    expect(onScreen.rows.map((r) => r.invoiceId)).toEqual(["October-1", "October-2", "October-3"]);
    expect(written).toBe(
      `wallet,amount,token,invoiceId\n${A},100,USDC,October-1\n${B},250,USDC,October-2\n${C},75,USDC,October-3\n`,
    );
    expect(payable(reread.rows)).toEqual(payable(onScreen.rows));
  });

  it("quotes a typed cell holding the file's delimiter or a quote, in a ; file, and reads it back", () => {
    const t = `invoiceId;token;to;amount;Note\nINV-1;USDC;${A};1;x`;
    const out = fix(t, editCells(NO_EDITS, [{ line: 2, col: "f4", text: 'Design; "Sept"' }]));
    expect(out).toBe(`invoiceId;token;to;amount;Note\nINV-1;USDC;${A};1;"Design; ""Sept"""`);
    expect(parseCsv(out).rows[0]!.cells[4]).toBe('Design; "Sept"');
  });

  it("gives a left-out line a new column's value, so it reads back with the header's columns", () => {
    const t = `wallet,amount,invoiceId\n${A},100,I-1\n${B},250,I-2\n`;
    const e = leaveOut(addColumn(NO_EDITS, "token", "USDC").edits, 3);
    expect(fix(t, e)).toBe(`wallet,amount,invoiceId,token\n${A},100,I-1,USDC\n${B},250,I-2,USDC\n`);
  });

  it("breaks the last line before a new line when the file had no final break", () => {
    const t = `invoiceId,token,to,amount\nINV-1,USDC,${A},1`;
    const { edits, line } = addLine(NO_EDITS, readLines(t).length);
    const e = editCells(edits, [
      { line, col: "f0", text: "INV-2" }, { line, col: "f1", text: "EURC" }, { line, col: "f2", text: B }, { line, col: "f3", text: "2" },
    ]);
    expect(fix(t, e)).toBe(`invoiceId,token,to,amount\nINV-1,USDC,${A},1\nINV-2,EURC,${B},2\n`);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/corrected-file.test.ts`
Expected: FAIL — `headerName` is not exported; P1, P2, P5, P6 and the new-column tests write the header and lines as they were; P3 keeps the title line.

- [ ] **Step 4: Implement**

In `frontend/lib/corrected-file.ts`, change the core import to add `fieldFor` and `type Role`:

```ts
import {
  amountInFile, fieldFor, readAmount, type ColumnId, type Delimiter, type FileLine, type ParsedCsv, type Role,
} from "@ledgerline/core";
```

and replace `correctedCsv` with:

```ts
const BOM = "﻿";

/**
 * How the header names a column so the file reads back the same: a role
 * under a name that does not say it gets the role's name, and a column
 * marked not used whose name says a role is told apart from it.
 */
export function headerName(name: string, role: Role): string {
  const read = fieldFor(name);
  if (role === "unused") return read ? `${name} (not used)` : name;
  return read === role ? name : role;
}

/**
 * The payer's file with their changes in it, to replace the one in their
 * spreadsheet. Read back with no edits, it is the run on screen. Lines above
 * the header are not part of the table and are not written. A line nothing
 * was typed on, when no column was added, and every blank line, are written
 * byte for byte. A deleted line is not written; a left-out line keeps its
 * own cells, since it is still owed.
 */
export function correctedCsv(lines: readonly FileLine[], sheet: ParsedCsv, edits: SheetEdits): string {
  const columns = sheet.columns;
  if (!columns || sheet.headerLine === 0) return lines.map((l) => l.body + l.end).join("");
  const d = sheet.delimiter;
  const h = sheet.headerLine - 1;
  const eol = lines.find((l) => l.end !== "")?.end ?? "\n";
  const bom = lines[0]?.body.startsWith(BOM) ? BOM : "";
  const newCols = edits.newColumns;
  const fileCols = sheet.header.map((_, i) => `f${i}` as const);
  const own = (line: number, col: ColumnId) => edits.cells[line]?.[col];
  const write = (cells: string[]) => cells.map((c) => cellText(c, d)).join(d);
  const value = (col: ColumnId, text: string) => (col === columns.amount ? amountCell(text.trim(), d) : text.trim());
  const extra = (line: number) => newCols.map((c) => value(c.id, own(line, c.id) ?? c.fill));

  const out: FileLine[] = [];
  const names = sheet.header.map((n, i) => headerName(n.trim(), sheet.roles[`f${i}`] ?? "unused"));
  const renamed = names.some((n, i) => n !== sheet.header[i]!.trim());
  out.push({
    body: renamed || newCols.length > 0
      ? write([...names, ...newCols.map((c) => headerName(c.name, c.role))])
      : lines[h]!.body.replace(/^﻿/, ""),
    end: lines[h]!.end,
  });

  const byLine = new Map(sheet.rows.map((r) => [r.line, r]));
  for (let i = h + 1; i < lines.length; i++) {
    const line = i + 1;
    if (edits.deleted.includes(line)) continue;
    const row = byLine.get(line);
    const typed = Object.keys(edits.cells[line] ?? {}).length > 0;
    const leftOut = edits.leftOut.includes(line);
    if (!row || (newCols.length === 0 && (!typed || leftOut))) { out.push(lines[i]!); continue; }
    if (row.unreadable && (!typed || leftOut)) { out.push(lines[i]!); continue; }
    const base = row.unreadable ? sheet.header.map(() => "") : row.cells;
    const cells = leftOut ? [...base] : fileCols.map((col, k) => {
      const t = own(line, col);
      return t === undefined ? base[k] ?? "" : value(col, t);
    });
    out.push({ body: write([...cells, ...extra(line)]), end: lines[i]!.end });
  }

  // New lines go before the empty line a final break leaves, if any.
  const tail = out.length > 1 && out.at(-1)!.body === "" && out.at(-1)!.end === "" ? out.pop() : undefined;
  for (const line of edits.newLines) {
    if (edits.deleted.includes(line)) continue;
    out.push({ body: write([...fileCols.map((col) => value(col, own(line, col) ?? "")), ...extra(line)]), end: eol });
  }
  if (tail) out.push(tail);
  // A line that had no break, and is no longer the last, gets one.
  for (let k = 0; k < out.length - 1; k++) if (out[k]!.end === "") out[k] = { ...out[k]!, end: eol };

  return bom + out.map((l) => l.body + l.end).join("");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS (the Task 3 tests of this file included), no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/corrected-file.ts frontend/test/corrected-file.test.ts frontend/test/fixtures/personas.ts
git commit -m "feat(web): the corrected file reads back as the run on screen, header and new columns included

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Drafts kept in this browser

**Files:**
- Create: `frontend/lib/draft-store.ts`
- Test: `frontend/test/draft-store.test.ts`

**Interfaces:**
- Consumes (Task 2): `SheetEdits`, `NO_EDITS`, `editCells`.
- Produces, from `@/lib/draft-store`:
  - `DRAFT_PREFIX = "ledgerline:draft:"`; `DRAFT_SAVED`, `DRAFT_REFUSED` (copy)
  - `interface Draft { v: 1; savedAt: number; edits: SheetEdits }`
  - `type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">`
  - `browserStorage(): DraftStorage | undefined`
  - `draftKey(text: string): Promise<string>`
  - `loadDraft(store, key, now): Draft | undefined`; `saveDraft(store, key, edits, now): boolean`; `dropDraft(store, key): void`
  - `draftPrompt(changes: number, savedAt: number): string`

- [ ] **Step 1: Write the failing tests**

Create `frontend/test/draft-store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DRAFT_PREFIX, draftKey, draftPrompt, dropDraft, loadDraft, saveDraft, type DraftStorage,
} from "@/lib/draft-store";
import { NO_EDITS, editCells } from "@/lib/sheet-edits";

/** `localStorage`'s shape, in memory. */
class Memory implements DraftStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  keys() { return [...this.m.keys()]; }
}

/** A browser that refuses to store anything. */
class Refusing extends Memory {
  override setItem(): void { throw new DOMException("QuotaExceededError"); }
}

const DAY = 24 * 60 * 60 * 1000;
const E = editCells(NO_EDITS, [{ line: 2, col: "f3", text: "1300" }]);

describe("draftKey", () => {
  it("is the same for the same file and different for another", async () => {
    const a = await draftKey("invoiceId,token,to,amount\n1");
    expect(a.startsWith(DRAFT_PREFIX)).toBe(true);
    expect(a).toHaveLength(DRAFT_PREFIX.length + 64);
    expect(await draftKey("invoiceId,token,to,amount\n1")).toBe(a);
    expect(await draftKey("invoiceId,token,to,amount\n2")).not.toBe(a);
  });
});

describe("saveDraft and loadDraft", () => {
  it("keeps the edits for the file and gives them back", () => {
    const s = new Memory();
    expect(saveDraft(s, "k", E, 1000)).toBe(true);
    expect(loadDraft(s, "k", 2000)).toEqual({ v: 1, savedAt: 1000, edits: E });
  });

  it("says so when the browser refuses, and gives nothing back without storage", () => {
    expect(saveDraft(new Refusing(), "k", E, 1)).toBe(false);
    expect(saveDraft(undefined, "k", E, 1)).toBe(false);
    expect(loadDraft(undefined, "k", 1)).toBeUndefined();
  });

  it("ignores a draft of another version, a malformed one, and one older than 30 days", () => {
    const s = new Memory();
    s.setItem("old-version", JSON.stringify({ savedAt: 1, edits: E }));
    s.setItem("garbage", "{not json");
    s.setItem("shapeless", JSON.stringify({ v: 1, savedAt: 1, edits: { cells: {} } }));
    expect(loadDraft(s, "old-version", 2)).toBeUndefined();
    expect(loadDraft(s, "garbage", 2)).toBeUndefined();
    expect(loadDraft(s, "shapeless", 2)).toBeUndefined();
    saveDraft(s, `${DRAFT_PREFIX}a`, E, 0);
    expect(loadDraft(s, `${DRAFT_PREFIX}a`, 31 * DAY)).toBeUndefined();
  });

  it("keeps the newest five drafts and drops any older than 30 days, leaving other keys alone", () => {
    const s = new Memory();
    s.setItem("theme", "dark");
    for (let i = 1; i <= 6; i++) saveDraft(s, `${DRAFT_PREFIX}${i}`, E, 40 * DAY + i);
    expect(s.keys().filter((k) => k.startsWith(DRAFT_PREFIX)).sort()).toEqual([2, 3, 4, 5, 6].map((i) => `${DRAFT_PREFIX}${i}`));
    saveDraft(s, `${DRAFT_PREFIX}new`, E, 71 * DAY);
    expect(s.keys().filter((k) => k.startsWith(DRAFT_PREFIX))).toEqual([`${DRAFT_PREFIX}new`]);
    expect(s.getItem("theme")).toBe("dark");
  });

  it("drops a draft, and does not throw without storage", () => {
    const s = new Memory();
    saveDraft(s, "k", E, 1);
    dropDraft(s, "k");
    expect(s.getItem("k")).toBeNull();
    expect(() => dropDraft(undefined, "k")).not.toThrow();
  });
});

describe("draftPrompt", () => {
  it("counts the changes and says when they were made", () => {
    expect(draftPrompt(12, Date.UTC(2026, 8, 26, 7, 2))).toMatch(/^You have 12 changes to this file from .+\.$/);
    expect(draftPrompt(1, Date.UTC(2026, 8, 26, 7, 2))).toMatch(/^You have 1 change to this file from /);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/draft-store.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/draft-store"`.

- [ ] **Step 3: Implement `frontend/lib/draft-store.ts`**

```ts
import type { SheetEdits } from "@/lib/sheet-edits";

export const DRAFT_PREFIX = "ledgerline:draft:";
export const DRAFT_SAVED = "Draft saved in this browser only";
export const DRAFT_REFUSED = "Changes can't be saved in this browser";
const KEEP = 5;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/** What is kept: the edits, never the file. */
export interface Draft { v: 1; savedAt: number; edits: SheetEdits }

/** The part of `Storage` a draft needs, so a test can pass a fake. */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** This browser's storage, or undefined where it is refused: reading
 *  `localStorage` itself throws in some private windows. */
export function browserStorage(): DraftStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** One file's key: its text, hashed, so the same file finds its draft and
 *  another never does. */
export async function draftKey(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return DRAFT_PREFIX + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const isEdits = (x: unknown): x is SheetEdits => {
  if (!x || typeof x !== "object") return false;
  const e = x as Partial<SheetEdits>;
  return [e.newColumns, e.newLines, e.deleted, e.leftOut, e.batches].every(Array.isArray)
    && typeof e.cells === "object" && e.cells !== null && typeof e.roles === "object" && e.roles !== null;
};

export function loadDraft(store: DraftStorage | undefined, key: string, now: number): Draft | undefined {
  try {
    const raw = store?.getItem(key);
    if (!raw) return undefined;
    const d = JSON.parse(raw) as Partial<Draft>;
    if (d.v !== 1 || typeof d.savedAt !== "number" || now - d.savedAt > MAX_AGE || !isEdits(d.edits)) return undefined;
    return { v: 1, savedAt: d.savedAt, edits: d.edits };
  } catch {
    return undefined;
  }
}

/** False when storage refused the write. Keeps the newest five drafts and
 *  drops any older than 30 days. */
export function saveDraft(store: DraftStorage | undefined, key: string, edits: SheetEdits, now: number): boolean {
  if (!store) return false;
  try {
    const draft: Draft = { v: 1, savedAt: now, edits };
    store.setItem(key, JSON.stringify(draft));
    prune(store, now);
    return true;
  } catch {
    return false;
  }
}

export function dropDraft(store: DraftStorage | undefined, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // Nothing to drop where nothing could be kept.
  }
}

function prune(store: DraftStorage, now: number) {
  const drafts: { key: string; savedAt: number }[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key?.startsWith(DRAFT_PREFIX)) continue;
    let savedAt = 0;
    try {
      savedAt = (JSON.parse(store.getItem(key) ?? "{}") as Partial<Draft>).savedAt ?? 0;
    } catch {
      // Unreadable: treated as the oldest.
    }
    drafts.push({ key, savedAt });
  }
  drafts.sort((a, b) => b.savedAt - a.savedAt);
  drafts.forEach((d, i) => { if (i >= KEEP || now - d.savedAt > MAX_AGE) store.removeItem(d.key); });
}

/** "You have 12 changes to this file from Sep 26, 14:02." In the payer's own time and format. */
export function draftPrompt(changes: number, savedAt: number): string {
  const when = new Date(savedAt).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return `You have ${changes} change${changes === 1 ? "" : "s"} to this file from ${when}.`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/draft-store.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. (Node 22 has `crypto.subtle`.)

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/draft-store.ts frontend/test/draft-store.test.ts
git commit -m "feat(web): drafts of a file's edits, kept in this browser under the file's hash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Changes tab's entries

**Files:**
- Create: `frontend/lib/changes-view.ts`
- Test: `frontend/test/changes-view.test.ts`

**Interfaces:**
- Consumes (Task 1): `isBlankLine`, `ColumnId`, `FileLine`, `ParsedCsv`, `ParsedRow`. (Task 2): `SheetEdits`, `cellText`, `clearRole`, `deleteLine`, `dropColumn`, `putBack`, `restoreLine`, `undoBatch`, `undoCell`. (Task 4): `PERSONAS`, `A`.
- Produces, from `@/lib/changes-view`:
  - `interface ChangeEntry { id: string; text: string; undo: SheetEdits }`
  - `interface ChangesView { entries: ChangeEntry[]; note?: string }`
  - `columnName(sheet: ParsedCsv, edits: SheetEdits, col: ColumnId): string`
  - `changesView({ lines, sheet, edits }): ChangesView`

Order of entries: the header, roles, new columns, batches, single cells by line, then lines added, deleted, left out. A cell a batch wrote is listed with its batch; a cell on a new or deleted line is listed with its line.

- [ ] **Step 1: Write the failing tests**

Create `frontend/test/changes-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readLines, readSheet } from "@ledgerline/core";
import { changesView } from "@/lib/changes-view";
import {
  NO_EDITS, addColumn, addLine, applyBatch, deleteLine, editCells, leaveOut, setRole, structureOf, useAsHeader,
  type SheetEdits,
} from "@/lib/sheet-edits";
import { A, PERSONAS } from "./fixtures/personas";

const view = (text: string, edits: SheetEdits) => {
  const lines = readLines(text);
  return changesView({ lines, sheet: readSheet(lines, structureOf(edits)), edits });
};

describe("changesView", () => {
  it("lists nothing when nothing changed", () => {
    expect(view(PERSONAS.nextMonth, NO_EDITS)).toEqual({ entries: [] });
  });

  it("names a typed cell by line and column, before and after, an address in full", () => {
    const t = `invoiceId,token,to,amount\nINV-1,USDC,vitalik.eth,1`;
    const e = editCells(NO_EDITS, [{ line: 2, col: "f2", text: A.toLowerCase() }, { line: 2, col: "f3", text: "2" }]);
    const v = view(t, e);
    expect(v.entries.map((x) => x.text)).toEqual([`Line 2 · to · vitalik.eth → ${A}`, "Line 2 · amount · 1 → 2"]);
    expect(v.entries[0]!.undo.cells).toEqual({ 2: { f3: "2" } });
  });

  it("lists the header, roles, columns, batches, and lines added, deleted and left out, each with its undo", () => {
    const t = PERSONAS.platform;
    let e = useAsHeader(NO_EDITS, 5);
    e = setRole(e, readSheet(readLines(t), structureOf(e)).roles, "f5", "to");
    e = addColumn(e, "token", "USDC").edits;
    e = applyBatch(e, { id: "replace:1", kind: "column", title: '"Crypto" → "Onchain" in Payment method' },
      [{ line: 6, col: "f2", text: "Onchain" }]);
    const added = addLine(e, readLines(t).length);
    e = deleteLine(leaveOut(added.edits, 7), 9);
    const v = view(t, e);
    expect(v.entries.map((x) => x.text)).toEqual([
      "Header · line 5",
      "Crypto wallet · to",
      "Column token added · USDC on every line",
      '"Crypto" → "Onchain" in Payment method',
      `Line ${added.line} · added`,
      "Line 9 · deleted",
      "Line 7 · left out of this run",
    ]);
    expect(v.note).toBe("Lines 1–4 are above the header and are not in the corrected file.");
    expect(v.entries.find((x) => x.id === "deleted:9")!.undo.deleted).toEqual([]);
    expect(v.entries.find((x) => x.id === "role:f5")!.undo.roles).toEqual({});
  });

  it("says a single line above the header is not in the corrected file", () => {
    expect(view(PERSONAS.numbers, useAsHeader(NO_EDITS, 2)).note)
      .toBe("Line 1 is above the header and is not in the corrected file.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/changes-view.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/changes-view"`.

- [ ] **Step 3: Implement `frontend/lib/changes-view.ts`**

```ts
import { getAddress, isAddress } from "viem";
import { isBlankLine, type ColumnId, type FileLine, type ParsedCsv, type ParsedRow } from "@ledgerline/core";
import {
  clearRole, deleteLine, dropColumn, putBack, restoreLine, undoBatch, undoCell, type SheetEdits,
} from "@/lib/sheet-edits";

export interface ChangeEntry { id: string; text: string; undo: SheetEdits }
export interface ChangesView { entries: ChangeEntry[]; note?: string }

/** A column as the payer knows it: its name in the file, or the name it was added under. */
export function columnName(sheet: ParsedCsv, edits: SheetEdits, col: ColumnId): string {
  if (col.startsWith("f")) {
    const i = Number(col.slice(1));
    return sheet.header[i]?.trim() || `Column ${i + 1}`;
  }
  return edits.newColumns.find((c) => c.id === col)?.name ?? col;
}

/**
 * Every change made on the Review step, each with the Undo that drops it:
 * the header, columns, batches, single cells by line, then lines added,
 * deleted and left out. An address shows in full, checksummed, on both sides.
 */
export function changesView({ lines, sheet, edits }: {
  lines: readonly FileLine[]; sheet: ParsedCsv; edits: SheetEdits;
}): ChangesView {
  const entries: ChangeEntry[] = [];
  const name = (col: ColumnId) => columnName(sheet, edits, col);

  if (edits.headerLine !== undefined) {
    entries.push({ id: "header", text: `Header · line ${edits.headerLine}`, undo: { ...edits, headerLine: undefined } });
  }
  for (const [col, role] of Object.entries(edits.roles) as [`f${number}`, string][]) {
    entries.push({ id: `role:${col}`, text: `${name(col)} · ${role === "unused" ? "not used" : role}`, undo: clearRole(edits, col) });
  }
  for (const c of edits.newColumns) {
    entries.push({
      id: `column:${c.id}`, text: `Column ${c.name} added${c.fill ? ` · ${c.fill} on every line` : ""}`,
      undo: dropColumn(edits, c.id),
    });
  }
  for (const b of edits.batches) entries.push({ id: `batch:${b.id}`, text: b.title, undo: undoBatch(edits, b.id) });

  const inBatch = new Set(edits.batches.flatMap((b) => b.cells.map(([l, c]) => `${l}:${c}`)));
  const byLine = new Map(sheet.rows.map((r) => [r.line, r]));
  const asRead = (row: ParsedRow | undefined, col: ColumnId) =>
    col.startsWith("f")
      ? (row && !row.unreadable ? row.cells[Number(col.slice(1))] ?? "" : "")
      : edits.newColumns.find((c) => c.id === col)?.fill ?? "";
  const show = (col: ColumnId, text: string) => {
    const t = text.trim();
    return sheet.roles[col] === "to" && isAddress(t) ? getAddress(t) : t || "(empty)";
  };
  for (const line of Object.keys(edits.cells).map(Number).sort((a, b) => a - b)) {
    if (edits.newLines.includes(line) || edits.deleted.includes(line)) continue;
    for (const col of Object.keys(edits.cells[line] ?? {}) as ColumnId[]) {
      if (inBatch.has(`${line}:${col}`)) continue;
      const before = asRead(byLine.get(line), col);
      const after = edits.cells[line]![col] ?? "";
      entries.push({
        id: `cell:${line}:${col}`, text: `Line ${line} · ${name(col)} · ${show(col, before)} → ${show(col, after)}`,
        undo: undoCell(edits, line, col),
      });
    }
  }

  for (const line of edits.newLines) entries.push({ id: `added:${line}`, text: `Line ${line} · added`, undo: deleteLine(edits, line) });
  for (const line of edits.deleted) entries.push({ id: `deleted:${line}`, text: `Line ${line} · deleted`, undo: restoreLine(edits, line) });
  for (const line of edits.leftOut) {
    entries.push({ id: `left-out:${line}`, text: `Line ${line} · left out of this run`, undo: putBack(edits, line) });
  }

  const h = sheet.headerLine;
  const above = lines.slice(0, Math.max(h - 1, 0))
    .filter((l, i) => !isBlankLine(i === 0 ? l.body.replace(/^﻿/, "") : l.body, sheet.delimiter)).length;
  const note = above === 0 ? undefined
    : h === 2 ? "Line 1 is above the header and is not in the corrected file."
    : `Lines 1–${h - 1} are above the header and are not in the corrected file.`;
  return { entries, ...(note ? { note } : {}) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/changes-view.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/changes-view.ts frontend/test/changes-view.test.ts
git commit -m "feat(web): every change on the Review step, listed with its own undo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: What the grid shows

**Files:**
- Create: `frontend/lib/sheet-grid.ts`
- Test: `frontend/test/sheet-grid.test.ts`

**Interfaces:**
- Consumes (Task 1): `isBlankLine`, `splitCells`, `ColumnId`, `CsvField`, `Delimiter`, `FileLine`, `ParsedCsv`, `Role`, `TokenSet`. (Task 3): `CheckedFile`, `checkRows`. (Task 2): `SheetEdits` and its operations. (Task 4): `PERSONAS`, `A`.
- Produces, from `@/lib/sheet-grid`:
  - `interface GridColumn { id: ColumnId; name: string; role: Role; isNew: boolean }`
  - `interface GhostColumn { role: CsvField; rule: string }`
  - `interface GridCell { col: ColumnId; id: string; text: string; edited: boolean; was?: string; problem?: string }`
  - `interface GridRow { line: number; label: string; state: "row" | "left-out" | "deleted"; isNew: boolean; cells: GridCell[]; message?: string; raw?: string }`
  - `interface GridView { columns: GridColumn[]; ghosts: GhostColumn[]; rows: GridRow[]; above: { line: number; text: string }[]; delimiter: Delimiter }`
  - `cellId(line: number, col: ColumnId): string` → `cell-<line>-<col>`
  - `templateRule(role: CsvField, delimiter: Delimiter, symbols: readonly string[]): string`
  - `sheetGrid({ lines, sheet, edits, checked, tokens }): GridView`

The grid shows the lines from the header down whether or not the header names all four roles, split with the header's delimiter, so a payer can see the data while giving columns their roles. A line that does not split into the header's columns shows empty cells to type into, and the line as written.

- [ ] **Step 1: Write the failing tests**

Create `frontend/test/sheet-grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readLines, readSheet, tokensForChain } from "@ledgerline/core";
import { sheetGrid, templateRule } from "@/lib/sheet-grid";
import { checkRows } from "@/lib/review-view";
import {
  NO_EDITS, addColumn, addLine, deleteLine, editCells, leaveOut, structureOf, useAsHeader, type SheetEdits,
} from "@/lib/sheet-edits";
import { A, PERSONAS } from "./fixtures/personas";

const TOKENS = tokensForChain(5042002);
const DECIMALS = { [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8 };

function grid(text: string, edits: SheetEdits = NO_EDITS) {
  const lines = readLines(text);
  const sheet = readSheet(lines, structureOf(edits));
  return sheetGrid({ lines, sheet, edits, checked: checkRows(sheet, edits, TOKENS, DECIMALS), tokens: TOKENS });
}

describe("sheetGrid", () => {
  it("shows a file whose header names nothing we pay: its column not used, four ghosts, the lines as split", () => {
    const g = grid(PERSONAS.numbers);
    expect(g.columns).toEqual([{ id: "f0", name: "ledgerline-sample", role: "unused", isNew: false }]);
    expect(g.ghosts.map((x) => x.role)).toEqual(["invoiceId", "token", "to", "amount"]);
    expect(g.rows.map((r) => r.cells[0]!.text)).toEqual([
      "invoiceId;token;to;amount", `INV-US-001;USDC;${A};0.10`, `INV-EU-002;EURC;${A};0.10`, `INV-BTC-003;cirBTC;${A};0.000001`,
    ]);
  });

  it("reads the table from the chosen header, and lists the lines above it", () => {
    const g = grid(PERSONAS.numbers, useAsHeader(NO_EDITS, 2));
    expect(g.above).toEqual([{ line: 1, text: "ledgerline-sample" }]);
    expect(g.columns.map((c) => [c.name, c.role])).toEqual([
      ["invoiceId", "invoiceId"], ["token", "token"], ["to", "to"], ["amount", "amount"],
    ]);
    expect(g.ghosts).toEqual([]);
    expect(g.rows.map((r) => r.label)).toEqual(["3", "4", "5"]);
  });

  it("marks a typed cell with what it was, and a problem cell with its message", () => {
    const g = grid(`invoiceId,token,to,amount\nINV-1,USD,${A},1`, editCells(NO_EDITS, [{ line: 2, col: "f3", text: "2" }]));
    const [inv, tok, , amt] = g.rows[0]!.cells;
    expect(amt).toMatchObject({ id: "cell-2-f3", text: "2", edited: true, was: "1" });
    expect(tok!.problem).toMatch(/"USD" is not a token/);
    expect(inv!.edited).toBe(false);
    expect(inv!.was).toBeUndefined();
  });

  it("shows a ghost's rule, a new column's fill, and new, left-out and deleted lines in place", () => {
    const t = PERSONAS.twoColumns;
    let e = addColumn(NO_EDITS, "token", "USDC").edits;
    e = leaveOut(deleteLine(e, 3), 4);
    const { edits, line } = addLine(e, readLines(t).length);
    const g = grid(t, edits);
    expect(g.ghosts).toEqual([{ role: "invoiceId", rule: "Every line needs its own reference." }]);
    expect(g.columns.at(-1)).toEqual({ id: "n1", name: "token", role: "token", isNew: true });
    expect(g.rows.map((r) => [r.label, r.state])).toEqual([["2", "row"], ["3", "deleted"], ["4", "left-out"], [`${line} new`, "row"]]);
    expect(g.rows[0]!.cells.at(-1)!.text).toBe("USDC");
    expect(g.rows.at(-1)!.cells.map((c) => c.text)).toEqual(["", "", "USDC"]);
  });

  it("says why a line could not be read, and shows it as written over empty cells", () => {
    const g = grid(`invoiceId,token,to,amount\nINV-1,USDC`);
    expect(g.rows[0]).toMatchObject({ raw: "INV-1,USDC", message: expect.stringMatching(/^This line has 2 values/) });
    expect(g.rows[0]!.cells.map((c) => c.text)).toEqual(["", "", "", ""]);
  });

  it("skips blank lines and lines of empty cells", () => {
    expect(grid(PERSONAS.gsheets).rows.map((r) => r.line)).toEqual([2, 3, 4, 6]);
  });
});

describe("templateRule", () => {
  it("says what the template asks of each column, in the file's own decimal mark", () => {
    expect(templateRule("amount", ";", ["USDC"])).toBe("As on an invoice: 1250,50.");
    expect(templateRule("amount", ",", ["USDC"])).toBe("As on an invoice: 1250.50.");
    expect(templateRule("token", ",", ["USDC", "EURC", "cirBTC"])).toBe("One of USDC, EURC, cirBTC.");
    expect(templateRule("to", ",", [])).toBe("A wallet address: 0x and 40 letters and digits.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/sheet-grid.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/sheet-grid"`.

- [ ] **Step 3: Implement `frontend/lib/sheet-grid.ts`**

```ts
import {
  isBlankLine, splitCells,
  type ColumnId, type CsvField, type Delimiter, type FileLine, type ParsedCsv, type Role, type TokenSet,
} from "@ledgerline/core";
import type { CheckedFile } from "@/lib/review-view";
import type { SheetEdits } from "@/lib/sheet-edits";

export interface GridColumn { id: ColumnId; name: string; role: Role; isNew: boolean }
export interface GhostColumn { role: CsvField; rule: string }
export interface GridCell { col: ColumnId; id: string; text: string; edited: boolean; was?: string; problem?: string }
export interface GridRow {
  line: number;
  label: string;
  state: "row" | "left-out" | "deleted";
  isNew: boolean;
  cells: GridCell[];
  /** A problem with the line as a whole, or why it could not be read. */
  message?: string;
  /** The line as written, when it does not split into the header's columns. */
  raw?: string;
}
export interface GridView {
  columns: GridColumn[];
  ghosts: GhostColumn[];
  rows: GridRow[];
  /** Lines above the header with anything in them. */
  above: { line: number; text: string }[];
  delimiter: Delimiter;
}

const FIELDS: readonly CsvField[] = ["invoiceId", "token", "to", "amount"];

export const cellId = (line: number, col: ColumnId) => `cell-${line}-${col}`;

/** What the template asks of a column, for a ghost column's menu. */
export function templateRule(role: CsvField, delimiter: Delimiter, symbols: readonly string[]): string {
  switch (role) {
    case "invoiceId": return "Every line needs its own reference.";
    case "token": return `One of ${symbols.join(", ")}.`;
    case "to": return "A wallet address: 0x and 40 letters and digits.";
    case "amount": return `As on an invoice: ${delimiter === ";" ? "1250,50" : "1250.50"}.`;
  }
}

/**
 * The file as the grid and the phone cards show it: every line from the
 * header down, split with the header's delimiter whether or not the header
 * names all four roles, each cell with what was typed over it and the
 * problem core found there; new lines after the file's.
 */
export function sheetGrid({ lines, sheet, edits, checked, tokens }: {
  lines: readonly FileLine[]; sheet: ParsedCsv; edits: SheetEdits; checked: CheckedFile; tokens: TokenSet;
}): GridView {
  const d = sheet.delimiter;
  if (sheet.headerLine === 0) return { columns: [], ghosts: [], rows: [], above: [], delimiter: d };
  const body = (i: number) => (i === 0 ? lines[0]!.body.replace(/^﻿/, "") : lines[i]!.body);

  const columns: GridColumn[] = [
    ...sheet.header.map((n, i) => ({
      id: `f${i}` as const, name: n.trim() || `Column ${i + 1}`, role: sheet.roles[`f${i}`] ?? "unused", isNew: false,
    })),
    ...edits.newColumns.map((c) => ({ id: c.id, name: c.name, role: c.role, isNew: true })),
  ];
  const held = new Set<Role>(Object.values(sheet.roles));
  const symbols = Object.keys(tokens);
  const ghosts = FIELDS.filter((f) => !held.has(f)).map((role) => ({ role, rule: templateRule(role, d, symbols) }));
  const fieldOf = new Map<ColumnId, CsvField>(
    columns.filter((c) => c.role !== "unused").map((c) => [c.id, c.role as CsvField]),
  );

  const problemAt = new Map<string, string>();
  const lineMessage = new Map<number, string>();
  for (const p of checked.problems) {
    if (p.field) {
      const k = `${p.line}:${p.field}`;
      if (!problemAt.has(k)) problemAt.set(k, p.message);
    } else if (!lineMessage.has(p.line)) lineMessage.set(p.line, p.message);
  }

  const fills = new Map<ColumnId, string>(edits.newColumns.map((c) => [c.id, c.fill]));
  const width = sheet.header.length;
  const row = (line: number, raw: string[] | undefined, isNew: boolean): GridRow => {
    const readable = raw !== undefined && raw.length === width;
    const cells = columns.map(({ id }): GridCell => {
      const own = edits.cells[line]?.[id];
      const read = id.startsWith("f") ? (readable ? raw![Number(id.slice(1))] ?? "" : "") : fills.get(id) ?? "";
      const field = fieldOf.get(id);
      const problem = field ? problemAt.get(`${line}:${field}`) : undefined;
      return {
        col: id, id: cellId(line, id), text: own ?? read, edited: own !== undefined,
        ...(own !== undefined ? { was: read } : {}),
        ...(problem ? { problem } : {}),
      };
    });
    const state = edits.deleted.includes(line) ? "deleted" : edits.leftOut.includes(line) ? "left-out" : "row";
    const message = lineMessage.get(line);
    return { line, label: isNew ? `${line} new` : `${line}`, state, isNew, cells, ...(message ? { message } : {}) };
  };

  const rows: GridRow[] = [];
  for (let i = sheet.headerLine; i < lines.length; i++) {
    const b = body(i);
    if (isBlankLine(b, d)) continue;
    const raw = splitCells(b, d);
    const r = row(i + 1, raw, false);
    rows.push(raw.length === width ? r : {
      ...r, raw: b,
      message: r.message ?? `This line has ${raw.length} values but the header names ${width} columns.`,
    });
  }
  for (const line of edits.newLines) rows.push(row(line, undefined, true));

  const above: { line: number; text: string }[] = [];
  for (let i = 0; i < sheet.headerLine - 1; i++) {
    const b = body(i);
    if (!isBlankLine(b, d)) above.push({ line: i + 1, text: b });
  }
  return { columns, ghosts, rows, above, delimiter: d };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/sheet-grid.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/sheet-grid.ts frontend/test/sheet-grid.test.ts
git commit -m "feat(web): what the grid shows, from the header down, whether or not the header names every role

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The grid replaces the payments table

**Files:**
- Create: `frontend/app/(app)/new/SheetGrid.tsx`, `CellEditor.tsx`, `LineMenu.tsx`
- Modify: `frontend/app/(app)/new/StepPreview.tsx`, `frontend/lib/sheet-edits.ts` (`headerWarning`), `frontend/app/styles/tape.css`
- Test: `frontend/test/sheet-edits.test.ts`, `frontend/test/plain-language.test.ts`; browser

**Interfaces:**
- Consumes (Task 7): `GridView`, `GridRow`, `sheetGrid`, `cellId`. (Task 2): `editCells`, `leaveOut`, `putBack`, `deleteLine`, `restoreLine`, `addLine`, `useAsHeader`, `droppedByHeader`.
- Produces:
  - `SheetGrid` props: `{ view: GridView; onEdit(line, col, text); onLine(line, action: LineAction); onAddLine(); open?: CellPos & { seq: number }; focusSeq?: number; head?: (c: GridColumn) => ReactNode; ghostHead?: (g: GhostColumn) => ReactNode; status?: ReactNode }`; `interface CellPos { line: number; col: ColumnId }` (exported from `SheetGrid.tsx`)
  - `CellEditor` props: `{ initial: string; label: string; onKeep(text, move: Move); onCancel() }`; `type Move = "down" | "right" | "left" | null`
  - `LineMenu` props: `{ line: number; state: GridRow["state"]; isNew: boolean; onAction(a: LineAction) }`; `type LineAction = "leave-out" | "put-back" | "delete" | "restore" | "header"`
  - `headerWarning(n: number): string` (`@/lib/sheet-edits`)

Keyboard (spec §5.2): arrow keys move between cells; Enter, F2, a double-click, a click on the focused cell, or typing a character opens the cell (typing starts it with that character); in the editor Enter keeps and moves down, Tab keeps and moves right, Shift+Tab left, Escape cancels, and leaving it any other way keeps it. One cell is in the tab order (roving `tabIndex`). Keys pressed in the editor never reach the grid or the page.

- [ ] **Step 1: Write the failing test for the header warning**

In `frontend/test/sheet-edits.test.ts`, add `headerWarning` to the import and to `describe("lines, columns and the header")`:

```ts
  it("warns how many changes a new header line drops", () => {
    expect(headerWarning(1)).toBe("The 1 change made under the current header's columns will be dropped.");
    expect(headerWarning(3)).toBe("The 3 changes made under the current header's columns will be dropped.");
  });
```

In `frontend/test/plain-language.test.ts`, import `headerWarning` from `@/lib/sheet-edits` and add after the `correctionReminder` line:

```ts
    plain(headerWarning(3));
    for (const label of ["+ Add a line", "Leave out of this run", "Put back in this run", "Delete from the file",
      "Delete this line", "Use as the header line", "Use it", "Keep the header", "The file as a table",
      "Line 1 is above the header", "Lines 1–4 are above the header"]) plain(label);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/sheet-edits.test.ts test/plain-language.test.ts`
Expected: FAIL — `headerWarning is not a function`.

- [ ] **Step 3: `headerWarning`**

Append to `frontend/lib/sheet-edits.ts`:

```ts
/** The confirmation before `useAsHeader` drops changes. */
export function headerWarning(dropped: number): string {
  return `The ${dropped} change${dropped === 1 ? "" : "s"} made under the current header's columns will be dropped.`;
}
```

Run: `cd frontend && npx vitest run test/sheet-edits.test.ts test/plain-language.test.ts`
Expected: PASS.

- [ ] **Step 4: `CellEditor.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";

export type Move = "down" | "right" | "left" | null;

/**
 * The one open cell. Enter keeps and moves down, Tab keeps and moves right
 * (Shift+Tab left), Escape cancels; leaving it any other way keeps it. Every
 * key stops here, so arrows move the caret, not the grid, and Ctrl+Z is the
 * input's own undo, not the sheet's.
 */
export default function CellEditor({ initial, label, onKeep, onCancel }: {
  initial: string;
  label: string;
  onKeep: (text: string, move: Move) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };
  return (
    <input
      className="cell-input hex"
      aria-label={label}
      value={text}
      autoFocus
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(() => onKeep(text, null))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); finish(() => onKeep(text, "down")); }
        else if (e.key === "Tab") { e.preventDefault(); finish(() => onKeep(text, e.shiftKey ? "left" : "right")); }
        else if (e.key === "Escape") { e.preventDefault(); finish(onCancel); }
      }}
    />
  );
}
```

- [ ] **Step 5: `LineMenu.tsx`**

```tsx
"use client";

import { Button, Dropdown } from "antd";
import type { GridRow } from "@/lib/sheet-grid";

export type LineAction = "leave-out" | "put-back" | "delete" | "restore" | "header";

/** A line's ⋯ menu. A deleted line shows its Undo in place instead. */
export default function LineMenu({ line, state, isNew, onAction }: {
  line: number;
  state: GridRow["state"];
  isNew: boolean;
  onAction: (a: LineAction) => void;
}) {
  if (state === "deleted") {
    return (
      <>
        <span className="because">deleted</span>{" "}
        <Button size="small" aria-label={`Put line ${line} back in the file`} onClick={() => onAction("restore")}>Undo</Button>
      </>
    );
  }
  const items = isNew
    ? [{ key: "delete", label: "Delete this line" }]
    : [
      state === "left-out"
        ? { key: "put-back", label: "Put back in this run" }
        : { key: "leave-out", label: "Leave out of this run" },
      { key: "delete", label: "Delete from the file" },
      { key: "header", label: "Use as the header line" },
    ];
  return (
    <Dropdown trigger={["click"]} menu={{ items, onClick: ({ key }) => onAction(key as LineAction) }}>
      <Button size="small" type="text" aria-label={`Line ${line} actions`}>⋯</Button>
    </Dropdown>
  );
}
```

- [ ] **Step 6: `SheetGrid.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "antd";
import type { ColumnId } from "@ledgerline/core";
import { cellId, type GhostColumn, type GridColumn, type GridView } from "@/lib/sheet-grid";
import CellEditor, { type Move } from "./CellEditor";
import LineMenu, { type LineAction } from "./LineMenu";

export interface CellPos { line: number; col: ColumnId }
type Dir = "up" | "down" | "left" | "right";
const ARROWS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

function AboveHeader({ above, onUse }: { above: GridView["above"]; onUse: (line: number) => void }) {
  const [shown, setShown] = useState(false);
  const first = above[0]!.line;
  const last = above.at(-1)!.line;
  return (
    <div className="sheet-above">
      <Button type="link" size="small" aria-expanded={shown} onClick={() => setShown(!shown)}>
        {first === last ? `Line ${first} is above the header` : `Lines ${first}–${last} are above the header`}
      </Button>
      {shown && (
        <ul className="fix-rows">
          {above.map((a) => (
            <li key={a.line}>
              <span className="hex">line {a.line}: {a.text}</span>
              <Button size="small" onClick={() => onUse(a.line)}>Use as the header line</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The file as a grid (spec 2026-09-26-csv-sheet-editor §5.2). Cells are text
 * and one opens at a time, so 400 lines are 400 rows of text and one input.
 * One cell is in the tab order; arrow keys move it.
 */
export default function SheetGrid({ view, onEdit, onLine, onAddLine, open, focusSeq, head, ghostHead, status }: {
  view: GridView;
  onEdit: (line: number, col: ColumnId, text: string) => void;
  onLine: (line: number, action: LineAction) => void;
  onAddLine: () => void;
  /** A cell to open, asked for from outside. A new `seq` asks again. */
  open?: CellPos & { seq: number };
  /** A new value moves focus to the grid's current cell. */
  focusSeq?: number;
  head?: (c: GridColumn) => ReactNode;
  ghostHead?: (g: GhostColumn) => ReactNode;
  /** Beside `+ Add a line`: the draft's state. */
  status?: ReactNode;
}) {
  const cols = view.columns.map((c) => c.id);
  const lines = view.rows.map((r) => r.line);
  const [active, setActive] = useState<CellPos>();
  const [editing, setEditing] = useState<{ pos: CellPos; initial: string }>();
  const focusNext = useRef<CellPos | undefined>(undefined);

  const pos: CellPos | undefined = active && lines.includes(active.line) && cols.includes(active.col)
    ? active
    : lines[0] !== undefined && cols[0] !== undefined ? { line: lines[0], col: cols[0] } : undefined;
  const cellAt = (p: CellPos) => view.rows.find((r) => r.line === p.line)?.cells.find((c) => c.col === p.col);
  const colName = (col: ColumnId) => view.columns.find((c) => c.id === col)?.name ?? col;

  useEffect(() => {
    const p = focusNext.current;
    if (!p) return;
    focusNext.current = undefined;
    document.getElementById(cellId(p.line, p.col))?.focus();
  });

  useEffect(() => {
    if (!open) return;
    const cell = cellAt(open);
    if (!cell) return;
    setActive({ line: open.line, col: open.col });
    setEditing({ pos: { line: open.line, col: open.col }, initial: cell.text });
    document.getElementById(cellId(open.line, open.col))?.scrollIntoView({ block: "center" });
    // `open` is a new object each time it is asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (focusSeq === undefined || !pos) return;
    document.getElementById(cellId(pos.line, pos.col))?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq]);

  const move = (from: CellPos, dir: Dir): CellPos | undefined => {
    const r = lines.indexOf(from.line) + (dir === "up" ? -1 : dir === "down" ? 1 : 0);
    const c = cols.indexOf(from.col) + (dir === "left" ? -1 : dir === "right" ? 1 : 0);
    if (r < 0 || r >= lines.length || c < 0 || c >= cols.length) return undefined;
    return { line: lines[r]!, col: cols[c]! };
  };
  const go = (p: CellPos) => { setActive(p); focusNext.current = p; };
  const startEdit = (p: CellPos, initial?: string) => {
    const row = view.rows.find((r) => r.line === p.line);
    const cell = cellAt(p);
    if (!row || !cell || row.state === "deleted") return;
    setActive(p);
    setEditing({ pos: p, initial: initial ?? cell.text });
  };
  const keep = (p: CellPos, before: string, text: string, m: Move) => {
    setEditing(undefined);
    if (text !== before) onEdit(p.line, p.col, text);
    if (m) go(move(p, m) ?? p);
  };
  const onKey = (e: KeyboardEvent<HTMLTableCellElement>, p: CellPos) => {
    const dir = ARROWS[e.key];
    if (dir) { e.preventDefault(); go(move(p, dir) ?? p); }
    else if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); startEdit(p); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); startEdit(p, e.key); }
  };

  const current = pos && cellAt(pos);
  const said = current
    ? [current.problem, current.edited ? `was ${current.was || "(empty)"}` : undefined].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="sheet">
      {view.above.length > 0 && <AboveHeader above={view.above} onUse={(line) => onLine(line, "header")} />}
      <p className="sheet-status because" aria-live="polite">{said}</p>
      <div className="table-scroll" role="region" aria-label="The file as a table">
        <table className="sheet-grid" role="grid" aria-label="The file" aria-rowcount={view.rows.length + 1}>
          <thead>
            <tr>
              <th scope="col" className="line-head">Line</th>
              {view.columns.map((c) => (
                <th key={c.id} scope="col" className={c.isNew ? "is-new" : undefined}>
                  {head ? head(c) : (
                    <>
                      <span className="col-name">{c.name}</span>
                      <span className={`role-chip ${c.role === "unused" ? "is-unused" : "is-set"}`}>
                        {c.role === "unused" ? "not used" : `${c.role} ✓`}
                      </span>
                    </>
                  )}
                </th>
              ))}
              {view.ghosts.map((g) => (
                <th key={g.role} scope="col" className="ghost">
                  {ghostHead ? ghostHead(g) : <span className="role-chip is-missing">{g.role} ✗ missing</span>}
                </th>
              ))}
              <th scope="col"><span className="sr-only">Line actions</span></th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.line} className={`is-${r.state}${r.isNew ? " is-new" : ""}`}>
                <th scope="row" className="line-head">
                  {r.label}
                  {r.cells.some((c) => c.edited) && <span className="edited-mark" aria-label="edited here">✎</span>}
                  {r.message && (
                    <>
                      <span className="line-flag" title={r.message} aria-hidden="true">!</span>
                      <span className="sr-only">{r.message}</span>
                    </>
                  )}
                  {r.raw !== undefined && <span className="sr-only">As written: {r.raw}</span>}
                </th>
                {r.cells.map((c) => {
                  const p = { line: r.line, col: c.col };
                  const isActive = pos?.line === r.line && pos.col === c.col;
                  const isEditing = editing?.pos.line === r.line && editing.pos.col === c.col;
                  return (
                    <td
                      key={c.col}
                      id={c.id}
                      role="gridcell"
                      tabIndex={isActive && !isEditing ? 0 : -1}
                      className={[c.problem ? "has-problem" : "", c.edited ? "is-edited" : ""].join(" ").trim() || undefined}
                      aria-invalid={c.problem ? true : undefined}
                      aria-describedby={c.problem ? `${c.id}-p` : undefined}
                      onFocus={() => { if (!isActive) setActive(p); }}
                      onClick={() => { if (!isEditing && isActive) startEdit(p); }}
                      onDoubleClick={() => { if (!isEditing) startEdit(p); }}
                      onKeyDown={(e) => { if (!isEditing) onKey(e, p); }}
                    >
                      {isEditing ? (
                        <CellEditor
                          initial={editing!.initial}
                          label={`Line ${r.line}, ${colName(c.col)}`}
                          onKeep={(text, m) => keep(p, c.text, text, m)}
                          onCancel={() => { setEditing(undefined); focusNext.current = p; }}
                        />
                      ) : (
                        <span className="cell-text hex">{c.text}</span>
                      )}
                      {c.problem && <span id={`${c.id}-p`} className="sr-only">{c.problem}</span>}
                    </td>
                  );
                })}
                {view.ghosts.map((g) => <td key={g.role} className="ghost" />)}
                <td className="line-actions">
                  <LineMenu line={r.line} state={r.state} isNew={r.isNew} onAction={(a) => onLine(r.line, a)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sheet-foot">
        <Button onClick={onAddLine}>+ Add a line</Button>
        {status}
      </p>
    </div>
  );
}
```

- [ ] **Step 7: Put the grid in `StepPreview.tsx`**

7a. Imports: the antd import becomes `import { Alert, Button, Modal, Popconfirm } from "antd";` (`Table` and `TableColumnsType` go), and add:

```ts
import type { ColumnId } from "@ledgerline/core";
import {
  addLine, deleteLine, droppedByHeader, editCells, headerWarning, leaveOut, putBack, restoreLine, useAsHeader,
} from "@/lib/sheet-edits";
import { sheetGrid } from "@/lib/sheet-grid";
import SheetGrid, { type CellPos } from "./SheetGrid";
import type { LineAction } from "./LineMenu";
```

Remove `type ResolvedRow` from the core import, `short` from `@/lib/chain`, and `amountFigure, metaFor` from `@/lib/token-meta`, which only the table used. Delete the `columns` constant and `editedLines`.

7b. After the `fix` memo, add:

```tsx
  const grid = useMemo(
    () => sheetGrid({ lines: draft.lines, sheet: draft.sheet, edits: draft.edits, checked: draft, tokens: draft.tokens }),
    [draft],
  );
  const [openCell, setOpenCell] = useState<CellPos & { seq: number }>();
  const [focusSeq, setFocusSeq] = useState<number>();
  const [askHeader, setAskHeader] = useState<number>();
  const onEdit = (line: number, col: ColumnId, text: string) => onEdits(editCells(draft.edits, [{ line, col, text }]));
  const toHeader = (line: number) => { onEdits(useAsHeader(draft.edits, line)); setFocusSeq(Date.now()); };
  const onLine = (line: number, action: LineAction) => {
    const e = draft.edits;
    if (action === "leave-out") onEdits(leaveOut(e, line));
    else if (action === "put-back") onEdits(putBack(e, line));
    else if (action === "delete") onEdits(deleteLine(e, line));
    else if (action === "restore") onEdits(restoreLine(e, line));
    else if (droppedByHeader(e) > 0) setAskHeader(line);
    else toHeader(line);
  };
  const onAddLine = () => {
    const { edits, line } = addLine(draft.edits, draft.lines.length);
    onEdits(edits);
    const first = grid.columns[0];
    if (first) setOpenCell({ line, col: first.id, seq: Date.now() });
  };
```

7c. Replace the whole `<div … className="table-scroll" …><Table … /></div>` block with:

```tsx
      <SheetGrid view={grid} onEdit={onEdit} onLine={onLine} onAddLine={onAddLine} open={openCell} focusSeq={focusSeq} />

      <Modal
        open={askHeader !== undefined}
        title={`Use line ${askHeader ?? ""} as the header?`}
        okText="Use it"
        cancelText="Keep the header"
        focusTriggerAfterClose={false}
        onOk={() => { const line = askHeader!; setAskHeader(undefined); toHeader(line); }}
        onCancel={() => { setAskHeader(undefined); setFocusSeq(Date.now()); }}
      >
        <p>{headerWarning(droppedByHeader(draft.edits))}</p>
      </Modal>
```

- [ ] **Step 8: Styles**

Append to `frontend/app/styles/tape.css`:

```css
/* The sheet on the Review step (spec 2026-09-26-csv-sheet-editor §5.2). */
.sheet { margin-top: 24px; }
.sheet-status { min-height: 1.4em; margin: 0 0 6px; }
.sheet-above { margin: 0 0 8px; }
.sheet-foot { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 10px 0 0; }
.sheet-grid { border-collapse: collapse; width: max-content; min-width: 100%; }
.sheet-grid th, .sheet-grid td { padding: 6px 8px; border-bottom: 1px dotted var(--rule); text-align: left; vertical-align: top; white-space: nowrap; }
.sheet-grid thead th { border-bottom: 1.5px solid var(--ink); font-weight: 500; }
.sheet-grid .line-head { color: var(--ink-soft); font-family: var(--font-mono), ui-monospace, monospace; font-size: 0.87rem; }
.sheet-grid td[role="gridcell"] { min-width: 6ch; max-width: 30ch; overflow: hidden; text-overflow: ellipsis; cursor: cell; }
.sheet-grid td[role="gridcell"]:focus { outline: 2px solid var(--focus); outline-offset: -2px; }
.sheet-grid td.is-edited { background: var(--tape-shade); }
.sheet-grid td.has-problem { color: var(--ribbon); background: var(--ribbon-bg); box-shadow: inset 0 0 0 1.5px var(--ribbon); }
.sheet-grid tr.is-left-out td[role="gridcell"] { color: var(--ink-soft); }
.sheet-grid tr.is-deleted td[role="gridcell"] { color: var(--ink-soft); text-decoration: line-through; }
.sheet-grid .ghost { border-left: 1.5px dashed var(--ribbon); border-right: 1.5px dashed var(--ribbon); }
.sheet-grid .line-flag { margin-left: 4px; color: var(--ribbon); }
.cell-input { width: 100%; min-width: 14ch; padding: 0; border: none; background: transparent; color: inherit; font: inherit; }
.cell-input:focus { outline: none; }
.col-name { display: block; }
.role-chip {
  margin-top: 4px; padding: 1px 6px; border: 1.5px solid var(--control); background: none; color: inherit;
  font-family: var(--font-mono), ui-monospace, monospace; font-size: 0.8rem; font-weight: 500;
}
.role-chip.is-set { border-color: var(--ink); background: var(--highlight); color: var(--on-highlight); }
.role-chip.is-unused { border-style: dashed; color: var(--ink-soft); }
.role-chip.is-missing { border-color: var(--ribbon); color: var(--ribbon); }
```

- [ ] **Step 9: Run everything**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 10: Drive it**

Build and serve (`pnpm build`; `cd frontend && pnpm start -p 3055` in the background). At 1280, through the file input:

1. `.superpowers/ux-audit/persona-4-next-month.csv`: the grid shows lines 2–4 under `invoiceId token to amount`, each column `✓`, no ghost. Click line 2's amount, press Enter, type `1300`, press Enter: focus is on line 3's amount (`document.activeElement.id === "cell-3-f3"`), line 2's amount has the shaded fill and `✎`, and the status line reads `was 1200` when line 2's amount is focused again.
2. Arrow keys move the focused cell; F2 opens it; Escape closes it with the old text and focus back on the cell; typing `9` on a focused cell opens it with `9`.
3. ⋯ on line 3 → `Delete from the file`: line 3 is struck through with `deleted` and `Undo` in place; Undo restores it. ⋯ on line 4 → `Leave out of this run`: dimmed; ⋯ → `Put back in this run`.
4. `+ Add a line`: line 5 appears as `5 new` with its first cell open. Type four values with Tab between them: the line checks when each cell is kept.
5. `persona-3-numbers.csv`: one column `ledgerline-sample · not used`, four ghost columns. ⋯ on line 2 → `Use as the header line`: no confirmation (nothing to drop); the grid now has four `✓` columns, `Line 1 is above the header` above it, and focus is on a grid cell, not `BODY`. Type in any cell, then ⋯ on line 3 → `Use as the header line`: the confirmation says `The 1 change made under the current header's columns will be dropped.`; `Keep the header` keeps the typed cell.
6. `document.documentElement.scrollWidth <= innerWidth`; axe (`.playwright-mcp/axe.min.js`) reports no violations on the Review step.

Stop the server. Empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 11: Commit**

```bash
git add frontend/app frontend/lib/sheet-edits.ts frontend/test
git commit -m "feat(web): the Review table becomes a grid: any cell, lines added, deleted, left out, a header chosen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Columns against the template: roles, ghost columns, find and replace

**Files:**
- Create: `frontend/app/(app)/new/ColumnHead.tsx`, `frontend/app/(app)/new/FindReplace.tsx`
- Modify: `packages/core/src/csv.ts` (header messages), `frontend/lib/fix-list.ts` (summary), `frontend/app/(app)/new/StepPreview.tsx`, `frontend/app/styles/tape.css`
- Test: `packages/core/test/csv.test.ts`, `frontend/test/review-view.test.ts`, `frontend/test/fix-list.test.ts`, `frontend/test/plain-language.test.ts`; browser

**Interfaces:**
- Consumes (Task 2): `setRole`, `addColumn`, `numberInvoices`, `applyBatch`, `nextBatchId`, `replaceInColumn`, `CellEdit`. (Task 7): `GridColumn`, `GhostColumn`. (Task 8): `SheetGrid`'s `head`, `ghostHead` and `focusSeq`.
- Produces: `ColumnHead` `{ column: GridColumn; onRole(role: Role); onReplace() }`; `GhostHead` `{ ghost: GhostColumn; symbols: readonly string[]; numberPreview: string; onFill(value); onEmpty(); onNumber() }`; `FindReplace` `{ column: { id: ColumnId; name: string }; values: readonly { line: number; text: string }[]; onApply(changes: CellEdit[], title: string); onClose() }`.

Copy (spec §5.5): a header that names nothing (`Line 1, "ledgerline-sample", does not name columns. If the names are on a later line, use that line as the header.`), a missing role (`No column is the amount. Choose it under a column's name, or add it.`), a role held twice (`Two columns could be the amount: "Amount" and "Value". Mark one not used.`). Each now names what to do on this page.

- [ ] **Step 1: Update the tests to the new copy**

In `packages/core/test/csv.test.ts`:
- `"rejects a file whose header names are wrong"`: replace `.toMatch(/Missing: invoiceId, token\./)` with `.toMatch(/^No column is the invoice reference or token\./)`.
- `"refuses a file where two columns could be the same field"`: the expected message ends `Mark one not used.` instead of `Keep one.`
- Rename `"names what is missing and what it found"` to `"names what is missing and how to add it"`, with the expected message `"No column is the amount. Choose it under a column's name, or add it."`
- In `describe("readSheet")`: `"reads a later line as the header, and its delimiter from that line"` expects `parseCsv(text).issues[0]!.message` `.toBe('Line 1, "ledgerline-sample", does not name columns. If the names are on a later line, use that line as the header.')`; `"gives a column a role its name does not, and takes one away"` expects `off.issues[0]!.message` `.toBe("No column is the token. Choose it under a column's name, or add it.")`; `"names both columns when two hold one role, …"` expects the message ending `Mark one not used.`

In `frontend/test/review-view.test.ts`, `"keeps the file's own problems apart from the rows'"`: replace `/^The first line must name the columns/` with `/^No column is the /`.

In `frontend/test/fix-list.test.ts`, rename `"names a file-level problem with no card, and asks for another file"` to `"names a file-level problem with no card, to fix below"`, with the summary `"1 problem stops this run from being paid. Fix it below, or in your file and choose it again."`

In `frontend/test/plain-language.test.ts`, add to the labels checked with `plain(label)`: `"Find and replace in this column…"`, `"Number them"`, `"Add it empty and fill each line"`, `"Same token on every line:"`, `"Type the text to find. Capitals count."`, `"A column you already have under another name: choose it under that column's name."`, `"not used"`, `"Replace in 3 cells"`, `"3 cells will change."`, `"October-1 to October-3, one per line."`, and add `` `id,coin\n1,2` `` and `` `ledgerline-sample\ninvoiceId,token,to,amount` `` to the texts whose `fixList` copy is checked.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/core && npx vitest run` and `cd frontend && npx vitest run`
Expected: FAIL on the messages above.

- [ ] **Step 3: The copy**

In `packages/core/src/csv.ts`, add beside `FIELD_WORD`:

```ts
/** "a", "a or b", "a, b or c". */
const orList = (words: readonly string[]) =>
  words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`;
```

In `readSheet`, the duplicate message becomes

```ts
          message: `Two columns could be the ${FIELD_WORD[role]}: "${nameOf(seen)}" and "${nameOf(id)}". Mark one not used.`,
```

and the missing branch becomes

```ts
  const missing = FIELDS.filter((f) => at[f] === undefined);
  if (missing.length > 0) {
    const named = names.filter((n) => n !== "");
    const it = missing.length === 1 ? "it" : "them";
    const message = named.length === 1 && Object.keys(at).length === 0
      ? `Line ${headerLine}, "${named[0]}", does not name columns. If the names are on a later line, use that line as the header.`
      : `No column is the ${orList(missing.map((f) => FIELD_WORD[f]))}. Choose ${it} under a column's name, or add ${it}.`;
    return { rows, delimiter, header, headerLine, roles, issues: [{ line: headerLine, message }] };
  }
```

In `frontend/lib/fix-list.ts`, the summary's two sentences become one, since a file-level problem is now fixed here too:

```ts
  const summary =
    blocking > 0
      ? `${plural(blocking, "problem stops", "problems stop")} this run from being paid. Fix ${one ? "it" : "them"} below, or in your file and choose it again.`
    : problems.length > 0 ? "Worth a second look before paying. They do not stop the run."
    : undefined;
```

Run: `cd packages/core && npx vitest run && cd ../../frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 4: `ColumnHead.tsx`**

```tsx
"use client";

import { Button, Dropdown, Popover } from "antd";
import type { Role } from "@ledgerline/core";
import type { GhostColumn, GridColumn } from "@/lib/sheet-grid";

const ROLES: readonly Role[] = ["invoiceId", "token", "to", "amount", "unused"];
const word = (r: Role) => (r === "unused" ? "not used" : r);

/** A column's name, and a chip saying what it holds against the template. The chip changes it. */
export function ColumnHead({ column, onRole, onReplace }: {
  column: GridColumn;
  onRole: (role: Role) => void;
  onReplace: () => void;
}) {
  const items = [
    ...ROLES.map((r) => ({ key: r, label: `${column.role === r ? "✓ " : ""}${word(r)}` })),
    { type: "divider" as const },
    { key: "replace", label: "Find and replace in this column…" },
  ];
  return (
    <>
      <span className="col-name">{column.name}</span>
      <Dropdown
        trigger={["click"]}
        menu={{ items, onClick: ({ key }) => (key === "replace" ? onReplace() : onRole(key as Role)) }}
      >
        <button
          type="button"
          className={`role-chip ${column.role === "unused" ? "is-unused" : "is-set"}`}
          aria-label={`${column.name}: ${word(column.role)}. Change what this column holds`}
        >
          {column.role === "unused" ? "not used" : `${column.role} ✓`} ▾
        </button>
      </Dropdown>
    </>
  );
}

/** A column the template needs and the file lacks, and the ways to add it.
 *  Numbering shows what it will write before it writes it. */
export function GhostHead({ ghost, symbols, numberPreview, onFill, onEmpty, onNumber }: {
  ghost: GhostColumn;
  symbols: readonly string[];
  /** "October-1 to October-3, one per line." */
  numberPreview: string;
  onFill: (value: string) => void;
  onEmpty: () => void;
  onNumber: () => void;
}) {
  const content = (
    <div className="ghost-menu">
      <p className="because">{ghost.rule}</p>
      {ghost.role === "token" && (
        <>
          <p>Same token on every line:</p>
          <div className="fix-choices">
            {symbols.map((s) => <Button key={s} size="small" onClick={() => onFill(s)}>{s}</Button>)}
          </div>
        </>
      )}
      {ghost.role === "invoiceId" && (
        <>
          <p className="because">{numberPreview}</p>
          <Button size="small" onClick={onNumber}>Number them</Button>
        </>
      )}
      <Button size="small" type="link" onClick={onEmpty}>Add it empty and fill each line</Button>
      <p className="because">A column you already have under another name: choose it under that column&apos;s name.</p>
    </div>
  );
  return (
    <Popover trigger="click" title={`Add the ${ghost.role} column`} content={content}>
      <button type="button" className="role-chip is-missing" aria-label={`${ghost.role} is missing. Add it`}>
        {ghost.role} ✗ missing · + Add
      </button>
    </Popover>
  );
}
```

- [ ] **Step 5: `FindReplace.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Input, Modal } from "antd";
import type { ColumnId } from "@ledgerline/core";
import { replaceInColumn, type CellEdit } from "@/lib/sheet-edits";

/** Find and replace in one column: plain text, capitals counting, the count shown before anything changes. */
export default function FindReplace({ column, values, onApply, onClose }: {
  column: { id: ColumnId; name: string };
  values: readonly { line: number; text: string }[];
  onApply: (changes: CellEdit[], title: string) => void;
  onClose: () => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const changes = replaceInColumn(values, column.id, find, replace);
  const n = changes.length;
  const cells = `${n} cell${n === 1 ? "" : "s"}`;
  return (
    <Modal
      open
      title={`Find and replace in ${column.name}`}
      okText={n > 0 ? `Replace in ${cells}` : "Replace"}
      okButtonProps={{ disabled: n === 0 }}
      cancelText="Cancel"
      focusTriggerAfterClose={false}
      onOk={() => onApply(changes, `"${find}" → "${replace}" in ${column.name}`)}
      onCancel={onClose}
    >
      <label className="fix-field">
        <span className="fix-label">Find</span>
        <Input autoFocus value={find} spellCheck={false} onChange={(e) => setFind(e.target.value)} />
      </label>
      <label className="fix-field" style={{ marginTop: 12 }}>
        <span className="fix-label">Replace with</span>
        <Input value={replace} spellCheck={false} onChange={(e) => setReplace(e.target.value)} />
      </label>
      <p className="because" aria-live="polite">
        {find === "" ? "Type the text to find. Capitals count." : `${cells} will change.`}
      </p>
    </Modal>
  );
}
```

- [ ] **Step 6: Wire them in `StepPreview.tsx`**

Add imports:

```ts
import type { Role } from "@ledgerline/core";
import { addColumn, applyBatch, nextBatchId, numberInvoices, setRole } from "@/lib/sheet-edits";
import type { GhostColumn, GridColumn } from "@/lib/sheet-grid";
import { ColumnHead, GhostHead } from "./ColumnHead";
import FindReplace from "./FindReplace";
```

After `onAddLine`, add:

```tsx
  const [replacing, setReplacing] = useState<GridColumn>();
  const symbols = Object.keys(draft.tokens);
  const inFile = grid.rows.filter((r) => r.state !== "deleted");
  const settle = (next: typeof draft.edits) => { onEdits(next); setFocusSeq(Date.now()); };
  const head = (c: GridColumn) => (
    <ColumnHead
      column={c}
      onRole={(role: Role) => onEdits(setRole(draft.edits, draft.sheet.roles, c.id, role))}
      onReplace={() => setReplacing(c)}
    />
  );
  const ghostHead = (g: GhostColumn) => (
    <GhostHead
      ghost={g}
      symbols={symbols}
      numberPreview={`${draft.runLabel}-1 to ${draft.runLabel}-${inFile.length}, one per line.`}
      onFill={(value) => settle(addColumn(draft.edits, g.role, value).edits)}
      onEmpty={() => settle(addColumn(draft.edits, g.role, "").edits)}
      onNumber={() => settle(numberInvoices(draft.edits, inFile.map((r) => r.line), draft.runLabel))}
    />
  );
```

Pass `head={head} ghostHead={ghostHead}` to `<SheetGrid … />`, and after the header `Modal` add:

```tsx
      {replacing && (
        <FindReplace
          column={replacing}
          values={inFile.map((r) => ({ line: r.line, text: r.cells.find((c) => c.col === replacing.id)?.text ?? "" }))}
          onApply={(changes, title) => {
            setReplacing(undefined);
            settle(applyBatch(draft.edits, { id: nextBatchId(draft.edits, "replace"), kind: "column", title }, changes));
          }}
          onClose={() => { setReplacing(undefined); setFocusSeq(Date.now()); }}
        />
      )}
```

- [ ] **Step 7: Styles**

Append to `frontend/app/styles/tape.css`:

```css
.role-chip { cursor: pointer; }
.role-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.ghost-menu { display: grid; gap: 8px; justify-items: start; max-width: 32ch; }
.ghost-menu p { margin: 0; }
```

- [ ] **Step 8: Run everything**

Run: `cd packages/core && npx vitest run && npx tsc --noEmit -p .` and `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 9: Drive it**

Build and serve. At 1280, through the file input:

1. `persona-1-gsheets.csv`: `Wallet Address` shows `to ✓`; `Amount (USDC)` and `Invoice #` show `not used`; ghosts `invoiceId`, `token`, `amount`. The file problem reads `No column is the invoice reference, token or amount. Choose them under a column's name, or add them.` Set `Amount (USDC)` to `amount` and `Invoice #` to `invoiceId` from their chips: those ghosts go. The `token` ghost → `USDC`: a `token` column appears on every line with `USDC`, and focus is on a grid cell. `Amount (USDC)` chip → `Find and replace in this column…` → find `$`, replace with nothing: `4 cells will change.` → `Replace in 4 cells`. The Problems list now offers `3 amounts have marks between the thousands, like 1,250.00.` `Read all without the marks`.
2. `persona-6-two-columns.csv`, run name `October`: the `invoiceId` ghost's menu reads `October-1 to October-3, one per line.` before anything is written; `Number them`: every line reads `October-1`, `October-2`, `October-3`.
3. `persona-2-excel-de.csv`: set `Währung` to token, `Betrag` to amount, `Rechnung` to invoiceId; set `Wallet` to `amount` too: `Betrag` becomes `not used` (a role is never held twice).
4. axe reports no violations with a role menu, the ghost popover and the find-and-replace dialog each open. Focus is never on `BODY` after any of them closes.

Stop the server; empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 10: Commit**

```bash
git add packages/core frontend
git commit -m "feat(web): columns against the template: role chips, ghost columns, numbering, find and replace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The Review step: summary line, Problems | Changes, undo, drafts

**Files:**
- Create: `frontend/lib/edit-history.ts`, `frontend/app/(app)/new/ReviewTabs.tsx`, `frontend/app/(app)/new/ChangesList.tsx`
- Modify: `frontend/app/(app)/new/CreateRun.tsx`, `StepPreview.tsx`, `FixList.tsx`, `LineCard.tsx`, `RunSummary.tsx`, `frontend/app/styles/tape.css`
- Test: `frontend/test/edit-history.test.ts`, `frontend/test/plain-language.test.ts`; browser

**Interfaces:**
- Consumes (Task 5): `browserStorage`, `draftKey`, `loadDraft`, `saveDraft`, `dropDraft`, `draftPrompt`, `DRAFT_SAVED`, `DRAFT_REFUSED`, `Draft`. (Task 6): `changesView`, `ChangesView`. (Task 2): `changeCounts`, `changeTotal`. (Task 8): `SheetGrid` `open`.
- Produces:
  - `interface EditHistory { now: SheetEdits; past: readonly SheetEdits[]; future: readonly SheetEdits[] }`; `type HistoryAction`; `START: EditHistory`; `history(h, a): EditHistory` (`@/lib/edit-history`)
  - `NOTHING_CHANGED` (`ChangesList.tsx`)
  - `StepPreview` gains props `onUndo?`, `onRedo?`, `offer?: Draft`, `onContinue`, `onStartOver`, `draftStatus?: "saved" | "refused"`
  - `LineCardView` and `FixList` gain `onShow: (line: number, col: ColumnId) => void`
  - `RunSummary` gains `line?: boolean`

- [ ] **Step 1: Write the failing tests**

Create `frontend/test/edit-history.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { history, START } from "@/lib/edit-history";
import { NO_EDITS, editCells } from "@/lib/sheet-edits";

const a = editCells(NO_EDITS, [{ line: 2, col: "f0", text: "A" }]);
const b = editCells(a, [{ line: 2, col: "f0", text: "B" }]);

describe("history", () => {
  it("steps back and forward through whole edits", () => {
    let h = history(history(START, { type: "set", edits: a }), { type: "set", edits: b });
    h = history(h, { type: "undo" });
    expect(h.now).toBe(a);
    h = history(h, { type: "undo" });
    expect(h.now).toBe(NO_EDITS);
    expect(history(h, { type: "undo" })).toBe(h);
    h = history(h, { type: "redo" });
    expect(h.now).toBe(a);
  });

  it("forgets what could be redone once something new is set", () => {
    let h = history(history(START, { type: "set", edits: a }), { type: "undo" });
    h = history(h, { type: "set", edits: b });
    expect(h.future).toEqual([]);
    expect(history(h, { type: "redo" })).toBe(h);
  });

  it("keeps the last hundred steps", () => {
    let h = START;
    for (let i = 0; i < 150; i++) h = history(h, { type: "set", edits: editCells(NO_EDITS, [{ line: 2, col: "f0", text: String(i) }]) });
    expect(h.past).toHaveLength(100);
  });

  it("starts again from a draft, or from nothing", () => {
    expect(history(history(START, { type: "set", edits: a }), { type: "reset", edits: b })).toEqual({ now: b, past: [], future: [] });
    expect(history(START, { type: "reset" }).now).toBe(NO_EDITS);
  });
});
```

In `frontend/test/plain-language.test.ts`, import `NOTHING_CHANGED` from `@/lib/changes-view` and `DRAFT_SAVED, DRAFT_REFUSED, draftPrompt` from `@/lib/draft-store`, and add:

```ts
    plain(NOTHING_CHANGED);
    plain(DRAFT_SAVED);
    plain(DRAFT_REFUSED);
    plain(draftPrompt(12, Date.UTC(2026, 8, 26)));
    for (const label of ["Show in table", "Continue them", "Start over", "Undo last change", "Redo", "Problems", "Changes",
      "Nothing to fix."]) plain(label);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/edit-history.test.ts test/plain-language.test.ts`
Expected: FAIL — `@/lib/edit-history` does not exist; `NOTHING_CHANGED` is not exported.

- [ ] **Step 3: `edit-history.ts` and `NOTHING_CHANGED`**

Create `frontend/lib/edit-history.ts`:

```ts
import { NO_EDITS, type SheetEdits } from "@/lib/sheet-edits";

export interface EditHistory { now: SheetEdits; past: readonly SheetEdits[]; future: readonly SheetEdits[] }
export type HistoryAction =
  | { type: "set"; edits: SheetEdits }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; edits?: SheetEdits };

const LIMIT = 100;
export const START: EditHistory = { now: NO_EDITS, past: [], future: [] };

/** Ctrl+Z and Ctrl+Shift+Z over whole `SheetEdits` values: the model is
 *  immutable, so a step back is simply the value before. */
export function history(h: EditHistory, a: HistoryAction): EditHistory {
  switch (a.type) {
    case "set":
      return a.edits === h.now ? h : { now: a.edits, past: [...h.past, h.now].slice(-LIMIT), future: [] };
    case "undo":
      return h.past.length === 0 ? h : { now: h.past.at(-1)!, past: h.past.slice(0, -1), future: [h.now, ...h.future] };
    case "redo":
      return h.future.length === 0 ? h : { now: h.future[0]!, past: [...h.past, h.now], future: h.future.slice(1) };
    case "reset":
      return { now: a.edits ?? NO_EDITS, past: [], future: [] };
  }
}
```

Append to `frontend/lib/changes-view.ts`:

```ts
export const NOTHING_CHANGED = "Nothing changed yet. Every change you make here is listed, with its Undo.";
```

Run: `cd frontend && npx vitest run test/edit-history.test.ts test/plain-language.test.ts`
Expected: PASS.

- [ ] **Step 4: `ChangesList.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Button } from "antd";
import { NOTHING_CHANGED, type ChangesView } from "@/lib/changes-view";
import type { SheetEdits } from "@/lib/sheet-edits";

/** The Changes tab: every change, with its own Undo. Focus stays in the list after an Undo. */
export default function ChangesList({ view, onEdits }: { view: ChangesView; onEdits: (e: SheetEdits) => void }) {
  const listRef = useRef<HTMLUListElement>(null);
  const undone = useRef<number | undefined>(undefined);
  useEffect(() => {
    const i = undone.current;
    if (i === undefined) return;
    undone.current = undefined;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button");
    const next = buttons && buttons.length > 0 ? buttons[Math.min(i, buttons.length - 1)] : undefined;
    (next ?? document.getElementById("changes-empty"))?.focus();
  }, [view]);

  if (view.entries.length === 0) {
    return <p id="changes-empty" className="because" tabIndex={-1}>{view.note ?? NOTHING_CHANGED}</p>;
  }
  return (
    <section className="changes-list" aria-label="Changes made here">
      {view.note && <p className="because">{view.note}</p>}
      <ul ref={listRef}>
        {view.entries.map((x, i) => (
          <li key={x.id}>
            <span className="hex">{x.text}</span>
            <Button size="small" aria-label={`Undo: ${x.text}`} onClick={() => { undone.current = i; onEdits(x.undo); }}>
              Undo
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: `ReviewTabs.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";

export type ReviewTab = "problems" | "changes";

/** Problems | Changes, over the same edits (spec §5.4). Arrow keys move between the two tabs. */
export default function ReviewTabs({ tab, onTab, problems, changes, problemCount, changeCount }: {
  tab: ReviewTab;
  onTab: (t: ReviewTab) => void;
  problems: ReactNode;
  changes: ReactNode;
  problemCount: number;
  changeCount: number;
}) {
  const tabs: { key: ReviewTab; label: string }[] = [
    { key: "problems", label: `Problems ${problemCount}` },
    { key: "changes", label: `Changes ${changeCount}` },
  ];
  return (
    <div className="review-tabs">
      <div role="tablist" aria-label="Problems and changes">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            className={tab === t.key ? "is-on" : undefined}
            onClick={() => onTab(t.key)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next = tabs[(i + 1) % tabs.length]!.key;
              onTab(next);
              document.getElementById(`tab-${next}`)?.focus();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="panel-problems" aria-labelledby="tab-problems" hidden={tab !== "problems"}>{problems}</div>
      <div role="tabpanel" id="panel-changes" aria-labelledby="tab-changes" hidden={tab !== "changes"}>{changes}</div>
    </div>
  );
}
```

- [ ] **Step 6: Free text moves to the grid: `LineCard.tsx` and `FixList.tsx`**

In `LineCard.tsx`:
- Replace the `Input` import with `import type { ColumnId } from "@ledgerline/core";` (keep `Button`, `GetRef` from antd).
- Replace the whole `FieldInput` function with:

```tsx
/** One field of one line: what it holds, a button per reading core found,
 *  and the way to its cell, where it is typed. */
function FieldRow({ line, fix, onApply, onShow }: {
  line: number; fix: FieldFix; onApply: Apply; onShow: (line: number, col: ColumnId) => void;
}) {
  return (
    <div className="fix-field">
      <span className="fix-label">{fix.label}: <span className="hex">{fix.value || "(empty)"}</span></span>
      {fix.choices.length > 0 && (
        <div className="fix-choices" role="group" aria-label={fix.field === "token" ? "Token" : "Read it as"}>
          {fix.choices.map((c) => (
            <Button key={c.label} size="small" onClick={() => onApply([{ line, col: fix.col, text: c.text }], true)}>
              {c.label}
            </Button>
          ))}
        </div>
      )}
      <Button
        id={`fix-${line}-${fix.field}`}
        size="small"
        aria-label={`Show line ${line}'s ${fix.label.toLowerCase()} in the table`}
        onClick={() => onShow(line, fix.col)}
      >
        Show in table
      </Button>
      {fix.help && <span className="because">{fix.help}</span>}
    </div>
  );
}
```

- Add `onShow: (line: number, col: ColumnId) => void;` to `LineCardView`'s props and destructuring, and render fields with `{card.fields.map((f) => <FieldRow key={f.field} line={card.line} fix={f} onApply={apply} onShow={onShow} />)}`.

In `FixList.tsx`: add `onShow: (line: number, col: ColumnId) => void;` to `FixList`'s props (import `type ColumnId` from `@ledgerline/core`) and pass `onShow={onShow}` to each `LineCardView`.

- [ ] **Step 7: The summary as one line: `RunSummary.tsx`**

Add `line?: boolean` to the props, and before the existing `return`:

```tsx
  if (line) {
    return (
      <section className="run-summary-line" aria-label="This run">
        <strong>{view.name}</strong>
        <span>{view.payments}</span>
        {view.toPay.length > 0 && <span className="hex">{view.toPay.join(" · ")}</span>}
        {view.changes && <span>Changed here · {view.changes}</span>}
        <span>Arc {network}</span>
      </section>
    );
  }
```

- [ ] **Step 8: `CreateRun.tsx`: undo stack, drafts, layout**

8a. Imports: add `useReducer` to the React import; the `@/lib/sheet-edits` import becomes `import { changeCounts, changeTotal, structureOf, type SheetEdits } from "@/lib/sheet-edits";` (`NO_EDITS` is no longer used here); and add

```ts
import { history, START } from "@/lib/edit-history";
import {
  browserStorage, draftKey, dropDraft, loadDraft, saveDraft, type Draft,
} from "@/lib/draft-store";
```

8b. Replace `const [edits, setEdits] = useState<SheetEdits>(NO_EDITS);` with:

```ts
  const [hist, dispatch] = useReducer(history, START);
  const edits = hist.now;
  const [drafted, setDrafted] = useState<{ key: string; offer?: Draft }>();
  const [draftStatus, setDraftStatus] = useState<"saved" | "refused">();

  // A file's draft is found by its hash, and offered, never applied, until the payer says so.
  useEffect(() => {
    setDrafted(undefined);
    setDraftStatus(undefined);
    if (!base) return;
    let live = true;
    void draftKey(base.text).then((key) => {
      if (!live) return;
      const found = loadDraft(browserStorage(), key, Date.now());
      setDrafted({ key, offer: found && changeTotal(changeCounts(found.edits)) > 0 ? found : undefined });
    });
    return () => { live = false; };
  }, [base]);

  // Saved half a second after the last change; nothing is written over a draft not yet answered.
  useEffect(() => {
    if (!drafted || drafted.offer) return;
    const t = setTimeout(() => {
      const store = browserStorage();
      if (changeTotal(changeCounts(edits)) === 0) { dropDraft(store, drafted.key); setDraftStatus(undefined); return; }
      setDraftStatus(saveDraft(store, drafted.key, edits, Date.now()) ? "saved" : "refused");
    }, 500);
    return () => clearTimeout(t);
  }, [edits, drafted]);
  const forgetDraft = () => { if (drafted) dropDraft(browserStorage(), drafted.key); };
```

(`SheetEdits` stays imported for `RunDraft`.)

8c. `StepUpload`'s `onReady` becomes `onReady={(b) => { setBase(b); dispatch({ type: "reset" }); setStep(1); }}`.

8d. The summary column becomes one line on Review:

```tsx
      {source && draft && (step === 1 ? (
        <Col span={12}>
          <RunSummary line
            view={runSummaryView(draft.runLabel, source, tokenOrder, draft.decimals, draft.symbols, changeCounts(edits))}
            network={net.name} payer={source.payer ?? wallet?.address} />
        </Col>
      ) : (
        <Col start={9} span={4} md={12} sticky>
          <RunSummary
            view={runSummaryView(draft.runLabel, source, tokenOrder, draft.decimals, draft.symbols, changeCounts(edits))}
            network={net.name} payer={source.payer ?? wallet?.address} />
        </Col>
      ))}
```

and the main column's span becomes `span={step === 4 || step === 1 ? 12 : 8}`.

8e. `StepPreview`'s props become:

```tsx
            <StepPreview
              draft={draft} net={net}
              onEdits={(e) => dispatch({ type: "set", edits: e })}
              onUndo={hist.past.length > 0 ? () => dispatch({ type: "undo" }) : undefined}
              onRedo={hist.future.length > 0 ? () => dispatch({ type: "redo" }) : undefined}
              offer={drafted?.offer}
              onContinue={() => {
                if (drafted?.offer) dispatch({ type: "reset", edits: drafted.offer.edits });
                setDrafted((d) => d && { key: d.key });
              }}
              onStartOver={() => { forgetDraft(); setDrafted((d) => d && { key: d.key }); }}
              draftStatus={draftStatus}
              onBack={() => { forgetDraft(); setStep(0); }}
              onNext={() => setStep(2)}
              wallet={wallet} walletError={walletError} onConnect={connect}
              wrongChain={wrongChain}
            />
```

8f. In `StepSend`'s `onDone`, after `setStep(4);` add `forgetDraft();` — a paid run's draft is done with.

- [ ] **Step 9: `StepPreview.tsx`: tabs, restore prompt, Show in table, Ctrl+Z**

9a. Imports: add

```ts
import { changesView } from "@/lib/changes-view";
import { DRAFT_REFUSED, DRAFT_SAVED, draftPrompt, type Draft } from "@/lib/draft-store";
import ChangesList from "./ChangesList";
import ReviewTabs, { type ReviewTab } from "./ReviewTabs";
```

9b. Props: add, to the type and to the destructuring,

```ts
  onUndo?: () => void;
  onRedo?: () => void;
  offer?: Draft;
  onContinue: () => void;
  onStartOver: () => void;
  draftStatus?: "saved" | "refused";
```

9c. After the `grid` memo add:

```tsx
  const changesList = useMemo(() => changesView({ lines: draft.lines, sheet: draft.sheet, edits: draft.edits }), [draft]);
  const [tab, setTab] = useState<ReviewTab>("problems");
  const [firstAsk, setFirstAsk] = useState<number>();
  useEffect(() => { if (firstAsk) focusFirst(fix.firstOpen); }, [firstAsk]); // eslint-disable-line react-hooks/exhaustive-deps
  const openProblems = fix.fileProblems.length + fix.groups.filter((g) => g.state === "open").length
    + fix.cards.filter((c) => c.state === "open").length;

  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) step through the sheet's changes. In a
  // text field they are the field's own: the cell editor keeps its keys.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const act = k === "y" || e.shiftKey ? onRedo : onUndo;
      if (!act) return;
      e.preventDefault();
      act();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onUndo, onRedo]);
```

9d. Replace `<FixList view={fix} edits={draft.edits} onEdits={onEdits} />` with:

```tsx
      {offer && (
        <Alert
          style={{ marginBottom: 18 }}
          type="info"
          showIcon
          title={draftPrompt(changeTotal(changeCounts(offer.edits)), offer.savedAt)}
          action={
            <span style={{ display: "flex", gap: 8 }}>
              <Button size="small" type="primary" onClick={onContinue}>Continue them</Button>
              <Button size="small" onClick={onStartOver}>Start over</Button>
            </span>
          }
        />
      )}

      <ReviewTabs
        tab={tab}
        onTab={setTab}
        problemCount={openProblems}
        changeCount={changesList.entries.length}
        problems={
          fix.fileProblems.length + fix.groups.length + fix.cards.length > 0
            ? <FixList view={fix} edits={draft.edits} onEdits={onEdits}
                onShow={(line, col) => setOpenCell({ line, col, seq: Date.now() })} />
            : <p className="because">Nothing to fix.</p>
        }
        changes={<ChangesList view={changesList} onEdits={onEdits} />}
      />
```

9e. Give the grid its status: add to `<SheetGrid … />`

```tsx
        status={
          <>
            <Button size="small" disabled={!onUndo} onClick={onUndo}>Undo last change</Button>
            <Button size="small" disabled={!onRedo} onClick={onRedo}>Redo</Button>
            {draftStatus && <span className="because">{draftStatus === "saved" ? DRAFT_SAVED : DRAFT_REFUSED}</span>}
          </>
        }
```

9f. The primary action while anything blocks: `onClick={() => focusFirst(fix.firstOpen)}` becomes `onClick={() => { setTab("problems"); setFirstAsk(Date.now()); }}`, so it works from the Changes tab too.

- [ ] **Step 10: Styles**

Append to `frontend/app/styles/tape.css`:

```css
.run-summary-line {
  display: flex; flex-wrap: wrap; gap: 6px 20px; align-items: baseline;
  padding: 10px var(--tape-pad); border: 1px solid var(--rule); background: var(--tape);
  font-family: var(--font-mono), ui-monospace, monospace; font-size: 0.87rem;
}
.review-tabs [role="tablist"] { display: flex; gap: 4px; border-bottom: 1.5px solid var(--ink); }
.review-tabs [role="tab"] {
  padding: 6px 12px; border: 1.5px solid var(--control); border-bottom: none; background: none; color: var(--ink-soft);
  font-family: var(--font-mono), ui-monospace, monospace; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; cursor: pointer;
}
.review-tabs [role="tab"].is-on { border-color: var(--ink); color: var(--ink); background: var(--tape); }
.review-tabs [role="tab"]:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.review-tabs [role="tabpanel"] { padding-top: 10px; }
.changes-list ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.changes-list li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; overflow-wrap: anywhere; }
```

- [ ] **Step 11: Run everything**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 12: Drive it**

Build and serve. At 1280:

1. `persona-4-next-month.csv`: the summary is one line above the tabs, and the grid spans the page. Edit two amounts. Changes shows `Changes 2` with both, before and after. Undo on the first: it goes, and focus is on the next entry's Undo.
2. With focus on a grid cell, Ctrl+Z undoes the last cell; Ctrl+Shift+Z redoes it. Open a cell, type `abc`, press Ctrl+Z: the input loses `abc`, and Changes still shows the same count (the sheet was not undone). Escape.
3. On a problem card, `Show in table` opens that cell in the grid.
4. Draft: after two edits the foot reads `Draft saved in this browser only`. Reload the page, name the run, choose the same file: `You have 2 changes to this file from …` with `Continue them` and `Start over`. `Continue them` restores both cells. Reload again, choose the file, `Start over`: the grid is clean, and choosing it once more offers nothing.
5. In a context whose `localStorage` getter throws (`page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new Error("denied"); } }))`): editing works, and the foot reads `Changes can't be saved in this browser`.
6. From the Changes tab, `Fix N problems first` switches to Problems and focuses the first problem.
7. axe reports no violations on each tab; focus is never on `BODY` after an Undo, a tab switch, or `Continue them`.

Stop the server; empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 13: Commit**

```bash
git add frontend
git commit -m "feat(web): Problems and Changes over one sheet, Ctrl+Z, drafts kept in this browser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: On a phone, one card per line

**Files:**
- Create: `frontend/lib/use-narrow.ts`, `frontend/app/(app)/new/SheetCards.tsx`
- Modify: `frontend/app/(app)/new/SheetGrid.tsx` (export `AboveHeader`), `StepPreview.tsx`, `frontend/app/styles/tape.css`
- Test: browser at 390

**Interfaces:**
- Consumes (Task 7): `GridView`, `GridRow`, `GridColumn`, `GhostColumn`, `cellId`. (Task 8): `CellEditor`, `LineMenu`, `CellPos`, `AboveHeader`.
- Produces: `useNarrow(): boolean` (`@/lib/use-narrow`), true at 639px and below; `SheetCards` with the same props as `SheetGrid`.

Spec §5.3: `Columns` first (each column's role chip, then the ghosts); one card per line with its role fields as label and value, other columns folded under `More: …`; a tap opens a field in place with the grid's keep and cancel rules; the ⋯ menu; every target at least 44px high; no sideways scroll. When no column holds a role yet, every column is shown on the card, so the payer can see what is in the file.

- [ ] **Step 1: `use-narrow.ts`**

```ts
"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 639px)";

/** The `sm` breakpoint the shell already uses (shell.css). False on the server. */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(QUERY);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
```

- [ ] **Step 2: Export `AboveHeader`**

In `SheetGrid.tsx`, change `function AboveHeader(` to `export function AboveHeader(`.

- [ ] **Step 3: `SheetCards.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "antd";
import type { ColumnId, CsvField } from "@ledgerline/core";
import { type GhostColumn, type GridColumn, type GridRow, type GridView } from "@/lib/sheet-grid";
import CellEditor from "./CellEditor";
import LineMenu, { type LineAction } from "./LineMenu";
import { AboveHeader, type CellPos } from "./SheetGrid";

const LABEL: Record<CsvField, string> = { invoiceId: "Invoice", token: "Token", to: "Recipient", amount: "Amount" };
const ORDER: readonly CsvField[] = ["invoiceId", "token", "to", "amount"];

/**
 * The sheet on a phone (spec 2026-09-26-csv-sheet-editor §5.3): the columns
 * and their roles first, then one card per line with the fields the template
 * names; other columns fold under More. A tap opens a field in place.
 */
export default function SheetCards({ view, onEdit, onLine, onAddLine, open, focusSeq, head, ghostHead, status }: {
  view: GridView;
  onEdit: (line: number, col: ColumnId, text: string) => void;
  onLine: (line: number, action: LineAction) => void;
  onAddLine: () => void;
  open?: CellPos & { seq: number };
  focusSeq?: number;
  head?: (c: GridColumn) => ReactNode;
  ghostHead?: (g: GhostColumn) => ReactNode;
  status?: ReactNode;
}) {
  const [editing, setEditing] = useState<CellPos & { initial: string }>();
  const focusNext = useRef<string | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    focusNext.current = undefined;
    document.getElementById(id)?.focus();
  });

  useEffect(() => {
    if (!open) return;
    const cell = view.rows.find((r) => r.line === open.line)?.cells.find((c) => c.col === open.col);
    if (!cell) return;
    setEditing({ line: open.line, col: open.col, initial: cell.text });
    document.getElementById(cell.id)?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (focusSeq === undefined) return;
    rootRef.current?.querySelector<HTMLElement>(".card-value")?.focus();
  }, [focusSeq]);

  const roleCols = ORDER.map((f) => view.columns.find((c) => c.role === f)).filter((c): c is GridColumn => !!c);
  const shown = roleCols.length > 0 ? roleCols : view.columns;
  const more = roleCols.length > 0 ? view.columns.filter((c) => c.role === "unused") : [];

  const field = (r: GridRow, c: GridColumn, label: string) => {
    const cell = r.cells.find((x) => x.col === c.id)!;
    const isEditing = editing?.line === r.line && editing.col === c.id;
    return (
      <div key={c.id} className={`card-field${cell.problem ? " has-problem" : ""}${cell.edited ? " is-edited" : ""}`}>
        <span className="card-label">{label}</span>
        {isEditing ? (
          <CellEditor
            initial={editing!.initial}
            label={`Line ${r.line}, ${label}`}
            onKeep={(text) => { setEditing(undefined); if (text !== cell.text) onEdit(r.line, c.id, text); focusNext.current = cell.id; }}
            onCancel={() => { setEditing(undefined); focusNext.current = cell.id; }}
          />
        ) : (
          <button
            type="button"
            id={cell.id}
            className="card-value hex"
            disabled={r.state === "deleted"}
            aria-describedby={cell.problem ? `${cell.id}-p` : undefined}
            onClick={() => setEditing({ line: r.line, col: c.id, initial: cell.text })}
          >
            {cell.text || "(empty)"}
          </button>
        )}
        {cell.problem && <span id={`${cell.id}-p`} className="card-problem">{cell.problem}</span>}
        {cell.edited && !isEditing && <span className="because">was {cell.was || "(empty)"}</span>}
      </div>
    );
  };

  return (
    <div className="sheet sheet-narrow" ref={rootRef}>
      <details className="sheet-columns" open={view.ghosts.length > 0 || undefined}>
        <summary>Columns</summary>
        <ul>
          {view.columns.map((c) => <li key={c.id}>{head ? head(c) : c.name}</li>)}
          {view.ghosts.map((g) => <li key={g.role}>{ghostHead ? ghostHead(g) : `${g.role} missing`}</li>)}
        </ul>
      </details>
      {view.above.length > 0 && <AboveHeader above={view.above} onUse={(line) => onLine(line, "header")} />}
      <ol className="sheet-cards">
        {view.rows.map((r) => {
          const invoice = roleCols.find((c) => c.role === "invoiceId");
          const title = (invoice && r.cells.find((x) => x.col === invoice.id)?.text) || r.cells.find((x) => x.text)?.text || "";
          const inMore = more.some((c) => editing?.line === r.line && editing.col === c.id);
          return (
            <li key={r.line} className={`sheet-card is-${r.state}`}>
              <div className="card-head">
                <strong>Line {r.label}{title ? ` · ${title}` : ""}</strong>
                <LineMenu line={r.line} state={r.state} isNew={r.isNew} onAction={(a) => onLine(r.line, a)} />
              </div>
              {r.message && <p className="card-problem">{r.message}</p>}
              {r.raw !== undefined && <pre className="hex fix-raw">{r.raw}</pre>}
              {shown.map((c) => field(r, c, c.role === "unused" ? c.name : LABEL[c.role]))}
              {more.length > 0 && (
                <details className="card-more" open={inMore || undefined}>
                  <summary>More: {more.map((c) => c.name).join(", ")}</summary>
                  {more.map((c) => field(r, c, c.name))}
                </details>
              )}
            </li>
          );
        })}
      </ol>
      <p className="sheet-foot">
        <Button onClick={onAddLine}>+ Add a line</Button>
        {status}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Choose by width in `StepPreview.tsx`**

Import `useNarrow` from `@/lib/use-narrow` and `SheetCards` from `./SheetCards`. Before the `return`, add `const narrow = useNarrow();`, and render the sheet as:

```tsx
      {(() => {
        const props = {
          view: grid, onEdit, onLine, onAddLine, open: openCell, focusSeq, head, ghostHead,
          status: (
            <>
              <Button size="small" disabled={!onUndo} onClick={onUndo}>Undo last change</Button>
              <Button size="small" disabled={!onRedo} onClick={onRedo}>Redo</Button>
              {draftStatus && <span className="because">{draftStatus === "saved" ? DRAFT_SAVED : DRAFT_REFUSED}</span>}
            </>
          ),
        };
        return narrow ? <SheetCards {...props} /> : <SheetGrid {...props} />;
      })()}
```

replacing the `<SheetGrid … />` element and its `status` prop from Task 10.

- [ ] **Step 5: Styles**

Append to `frontend/app/styles/tape.css`:

```css
/* The sheet on a phone (spec 2026-09-26-csv-sheet-editor §5.3). */
.sheet-columns summary, .card-more summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; }
.sheet-columns ul { display: grid; gap: 8px; margin: 0 0 12px; padding: 0; list-style: none; }
.sheet-columns li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
.sheet-cards { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.sheet-card { display: grid; gap: 4px; padding: 10px 12px; border: 1.5px solid var(--rule); background: var(--tape); }
.sheet-card.is-left-out { color: var(--ink-soft); border-style: dotted; }
.sheet-card.is-deleted .card-value { text-decoration: line-through; }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; overflow-wrap: anywhere; }
.card-field { display: grid; gap: 2px; padding: 4px 0; border-bottom: 1px dotted var(--rule); }
.card-label { font-size: 0.8rem; color: var(--ink-soft); }
.card-value {
  min-height: 44px; width: 100%; padding: 0 4px; border: none; background: none; color: inherit;
  text-align: left; overflow-wrap: anywhere; cursor: pointer;
}
.card-value:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.card-field.is-edited .card-value { background: var(--tape-shade); }
.card-field.has-problem .card-value { color: var(--ribbon); background: var(--ribbon-bg); }
.card-problem { color: var(--ribbon); font-size: 0.87rem; overflow-wrap: anywhere; }
.sheet-narrow .ant-btn, .sheet-narrow .role-chip { min-height: 44px; }
.sheet-narrow .cell-input { min-height: 44px; }
```

- [ ] **Step 6: Run everything**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Drive it at 390**

Build and serve. At 390×844:

1. `persona-1-gsheets.csv`: `Columns` is open (ghosts exist): each column with its chip, then the ghosts. Give roles and add the token column as in Task 9, from here. Each line is a card: `Line 2 · INV-2026-09-01`, Invoice, Token, Recipient, Amount; `More: Name, Email, Notes` folded.
2. Tap Line 3's Amount: an input opens in place; type and Enter: the card shows the value, `was …`, and focus is on that value.
3. A problem card's `Show in table` opens that field on its card, scrolled into view. A field under More opens its `More` first.
4. ⋯ menus, `+ Add a line` (the new card's first field opens), and a deleted card's Undo work as on desktop.
5. `document.documentElement.scrollWidth <= innerWidth`; every button, chip and value is at least 44px high (`getBoundingClientRect().height >= 44` over `.sheet-narrow button`); axe reports no violations.
6. Resize to 1280: the grid replaces the cards, keeping every edit.

Stop the server; empty `.playwright-mcp/` except `axe.min.js`.

- [ ] **Step 8: Commit**

```bash
git add frontend
git commit -m "feat(web): on a phone, the sheet is one card per line, the template's fields first

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Acceptance with the payers' files, and the spec brought in line

**Files:**
- Create (git-ignored): `.superpowers/ux-audit/persona-*.csv` if missing, written from `frontend/test/fixtures/personas.ts`; `.superpowers/ux-audit/payroll-400.csv`
- Modify: `docs/superpowers/specs/2026-09-26-csv-sheet-editor-design.md`

No new product code unless a check below fails. If one fails, fix it in the task that owns the code, re-run that task's tests, and commit as `fix(web): …`.

- [ ] **Step 1: Build, serve, fixtures**

From the repo root `pnpm build`; then `cd frontend && pnpm start -p 3055` in the background. Expected: `✓ Ready`.

Write the fixtures (git-ignored) with `.superpowers/ux-audit/write-fixtures.ts`:

```ts
import { writeFileSync } from "node:fs";
import { PERSONAS } from "../../frontend/test/fixtures/personas";

const names = {
  gsheets: "persona-1-gsheets", excelDe: "persona-2-excel-de", numbers: "persona-3-numbers",
  nextMonth: "persona-4-next-month", platform: "persona-5-platform", twoColumns: "persona-6-two-columns",
} as const;
for (const [key, name] of Object.entries(names)) {
  writeFileSync(`.superpowers/ux-audit/${name}.csv`, PERSONAS[key as keyof typeof PERSONAS]);
}
// 400 payments to 400 different recipients, so no line warns of a repeat.
const to = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
writeFileSync(".superpowers/ux-audit/payroll-400.csv",
  ["invoiceId,token,to,amount", ...Array.from({ length: 400 }, (_, i) => `PAY-${i + 1},USDC,${to(i + 1)},${i + 1}.00`)].join("\n") + "\n");
```

Run from the repo root: `npx tsx .superpowers/ux-audit/write-fixtures.ts`.

- [ ] **Step 2: Each payer's file, at 1280 and at 390**

Feed each through the file input (the `DataTransfer` approach) and take it to `Connect a wallet to continue` (nothing blocks), then `Download the corrected file`, read the download, and feed it back: it must open with no file problem and the same payments.

1. **P1 `gsheets`**: roles for `Amount (USDC)` and `Invoice #`; token column `USDC`; find `$` → nothing in Amount; `Read all without the marks`; delete the `Total` line. The download's header is `Name,Email,Wallet Address,amount,invoiceId,Notes,token`.
2. **P2 `excel-de`**: roles for `Währung`, `Betrag`, `Rechnung`; `Change all to EURC`; the two thousands-mark amounts by their reading buttons. The download starts with a BOM and keeps `\r\n`.
3. **P3 `numbers`**: `Use as the header line` on line 2. The download is the file without its first line.
4. **P4 `next-month`**: amount on line 2; find `2026-09` → `2026-10` in invoiceId; delete line 3; add a line with four values. Ctrl+Z with a cell focused steps back one change; Ctrl+Z inside an open cell only undoes its text.
5. **P5 `platform`**: `Use as the header line` on line 5 (`Lines 1–4 are above the header`, and the Changes note says they are not in the corrected file); `Crypto wallet` → `to`; leave out the bank and USDT lines. The download keeps those two lines unchanged.
6. **P6 `two-columns`**: token `USDC` for every line; `Number them`.

- [ ] **Step 3: Drafts, storage refused, 400 lines**

1. P4: two edits, reload, choose the file: the prompt counts 2 changes; `Continue them` restores them; paying is not possible without a wallet, so instead `Choose another file` → `Discard`: choosing P4 again offers nothing.
2. In a context whose `localStorage` getter throws, P6 works end to end and the foot says `Changes can't be saved in this browser`.
3. `payroll-400.csv` at 1280: focus line 200's amount, press Enter, type `7`, press Enter, and measure with `performance.now()` from the second Enter to the frame where the Changes tab reads `Changes 1` (`requestAnimationFrame` polling). Record the figure. Scrolling the grid stays smooth; the page does not scroll sideways.

- [ ] **Step 4: Everywhere**

At 1280 and 390 on the Review step: axe reports no violations with a problem card open, the Changes tab open, a role menu open, and the find-and-replace dialog open; `document.documentElement.scrollWidth <= innerWidth`; after every action above, `document.activeElement` is not `BODY`; `browser_console_messages` at `warning` shows nothing.

- [ ] **Step 5: Bring the spec in line with what was built**

In `docs/superpowers/specs/2026-09-26-csv-sheet-editor-design.md`:
- §3.2: `Batch` has `kind: "group" | "column"`.
- §3.3: `readSheet` takes the structure only (`headerLine`, `roles`, `newColumns`); typed cells, new lines, deleted and left-out lines are overlaid by `applySheetEdits` in the frontend, as `applyEdits` did. Core decides which problems a header has; the frontend overlays values.
- §4: changing the header line drops typed cells, batches and new lines as well as roles and new columns, since each was keyed to the old header's columns; deleted and left-out lines below it stay.
- §5.4: Changes are listed by kind — the header, roles, new columns, batches, cells by line, lines added, deleted, left out — not newest first; the edits keep no order to sort by.
- §5.5: `Changed here` also counts columns changed and names a moved header (`6 cells · 2 columns changed · header on line 5 · 1 line added · 1 deleted · 1 left out`).
- §7: the round trip compares the payable lines' invoice, token, recipient and amount; line numbers move once lines above the header are dropped, and a left-out line comes back as a line (still owed).
- §5.2: record the 400-line measurement, replacing `[unverified]` with `[measured]` and the figure.

- [ ] **Step 6: Stop the server, clean up, commit**

Stop the server. Empty `.playwright-mcp/` except `axe.min.js`.

```bash
git add docs/superpowers/specs/2026-09-26-csv-sheet-editor-design.md
git commit -m "docs: the sheet editor spec matches what was built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

