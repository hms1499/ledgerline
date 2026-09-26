# Inline Row Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A payer fixes problem lines on the Review step (one line at a time, or many lines with the same problem at once) and pays without going back to the spreadsheet. Nothing is paid that the payer did not see and confirm.

**Architecture:** Core splits the reader into two layers. `parseCsv` splits text and maps columns, keeping every line with its raw cells. `resolveRows` reads meaning through a new `readAmount`, and every problem names its field. The frontend keeps the file as read (`source`) and an overlay of edits (`RunEdits`). Everything shown is derived by pure functions in `frontend/lib/`: `checkRows`, `fixList`, `correctedFile`. Components only lay those out.

**Tech Stack:** TypeScript, viem 2.56, vitest 2, Next.js 16.3.5 (App Router), React 19.3, antd 6.6.5, Playwright (MCP) for the browser pass.

**Spec:** `docs/superpowers/specs/2026-09-26-inline-row-fixes-design.md`. Read it before any task.

## Global Constraints

- Nothing in `CLAUDE.md`'s invariants changes. `packages/core/src/execute.ts`, `build.ts`, `salt.ts` and `toBaseUnits` are not edited.
- An amount is never guessed. A suggestion is only a reading `readAmount` computed, applied only when the payer presses it. A recipient address is never suggested and never grouped.
- One validator: every rule lives in `packages/core`. The UI never re-implements a check.
- The file as read is never written to. Undo is dropping an edit.
- Tokens and decimals are fixed at upload (`RunBase.tokens`, `RunBase.decimals`), as today. A network switch does not re-read a draft.
- The interface stays English. New copy passes `frontend/test/plain-language.test.ts`.
- No new dependencies.
- Rules in `frontend/app/styles/` that set `font-*` or `display` on something antd also styles start with `html`.
- One commit per task, conventional prefix, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Commands: core tests `cd packages/core && npx vitest run`, core types `cd packages/core && npx tsc --noEmit -p .`, frontend tests `cd frontend && npx vitest run`, frontend types `cd frontend && npx tsc --noEmit`.

## Review Focus

1. **The payer types in a field, then presses "Leave out of this run".** The blur commits the edit first. A left-out line must still go into the corrected file unchanged, with no edit written. Test in Task 4.
2. **Every line left out.** The list must say `Every line is left out of this run. Put one back to pay it.`, never `This file has no payments in it.` Test in Task 3.
3. **An edited invoice containing the file's delimiter or a quote** (`INV, "A"`). The corrected file must quote it and read back to the same invoice. Test in Task 4.
4. **A file with a BOM and CRLF line endings.** Every line not edited, the header included, must come back byte for byte. Test in Task 4.
5. **A typed amount in the other convention.** `0,10` typed in a `,` file is refused with its reason, not read. `0.10` typed in a `;` file is read. Test in Task 3.

---

## File map

| File | Change |
|---|---|
| `packages/core/src/csv.ts` | `readAmount`, `amountInFile`, `CsvField`, `AmountKind`; `parseCsv` keeps every line; `resolveRows(…, delimiter)` reads amounts and reports every field |
| `packages/core/src/validate.ts` | `RowIssue.field` |
| `packages/core/test/csv.test.ts` | new tests, `;` and unreadable tests moved to the layer that owns them |
| `frontend/lib/run-edits.ts` | **new**: `RunEdits` and its pure operations, the change counts and reminder copy |
| `frontend/lib/review-view.ts` | `checkRows(source, edits, …)`; `reviewView` deleted in Task 6 |
| `frontend/lib/corrected-file.ts` | **new**: `correctedCsv`, `correctedFile` |
| `frontend/lib/fix-list.ts` | **new**: the problem list as groups and line cards |
| `frontend/lib/save-file.ts` | **new**: `saveFile`, moved out of `Result.tsx` |
| `frontend/lib/run-file.ts` | `PASTED_ROWS` |
| `frontend/lib/run-summary-view.ts` | `changes` line |
| `frontend/app/(app)/new/FixList.tsx` | **new**: the list and group cards |
| `frontend/app/(app)/new/LineCard.tsx` | **new**: one line's card |
| `frontend/app/(app)/new/ReviewIssues.tsx` | **deleted** |
| `frontend/app/(app)/new/CreateRun.tsx` | `RunBase` + `edits` state; draft derived |
| `frontend/app/(app)/new/StepUpload.tsx` | hands over `RunBase` |
| `frontend/app/(app)/new/StepPreview.tsx` | `FixList`, ✎ in the table, primary action, download, discard confirm |
| `frontend/app/(app)/new/RunSummary.tsx` | `Changed here` row |
| `frontend/app/(app)/new/Result.tsx` | reminder and download |
| `frontend/app/styles/tape.css` | fix card styles |

---

### Task 1: `readAmount` in core

**Files:**
- Modify: `packages/core/src/csv.ts`
- Test: `packages/core/test/csv.test.ts`

**Interfaces:**
- Consumes: `Delimiter` (already exported from `csv.ts`).
- Produces:
  - `export type AmountKind = "thousands-marks" | "dot-or-thousands" | "comma-or-thousands"`
  - `export type AmountReading = { ok: true; amount: string; warning?: string; readings?: string[]; kind?: AmountKind } | { ok: false; message: string; readings?: string[]; kind?: AmountKind }`
  - `export function readAmount(text: string, delimiter: Delimiter): AmountReading`: `amount` and `readings` are dot-decimal text.
  - `export function amountInFile(amount: string, delimiter: Delimiter): string`: dot-decimal text written in the file's convention.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/csv.test.ts`, and add `readAmount, amountInFile` to the existing `import { toBaseUnits, resolveRows } from "../src/csv.js";` line:

```ts
describe("readAmount", () => {
  it("reads a comma file's plain amount as written, and leaves the rest to toBaseUnits", () => {
    expect(readAmount("12.50", ",")).toEqual({ ok: true, amount: "12.50" });
    expect(readAmount(" 7 ", "\t")).toEqual({ ok: true, amount: "7" });
    expect(readAmount("$20", ",")).toEqual({ ok: true, amount: "$20" });
    expect(readAmount("", ",")).toEqual({ ok: true, amount: "" });
  });

  it("offers both readings of 1,000 in a comma file, since a comma-decimal sheet can write it", () => {
    expect(readAmount("1,000", ",")).toEqual({
      ok: false, kind: "comma-or-thousands", readings: ["1", "1000"],
      message: '"1,000" could mean 1 or 1000. Write 1000 for the larger amount, or 1 for the smaller.',
    });
    expect(readAmount("1,500", "\t")).toMatchObject({ ok: false, readings: ["1.5", "1500"] });
  });

  it("offers the one reading of an amount with thousands marks", () => {
    expect(readAmount("1,250.50", ",")).toEqual({
      ok: false, kind: "thousands-marks", readings: ["1250.50"],
      message: '"1,250.50" has marks between the thousands. Write it as 1250.50.',
    });
    expect(readAmount("1,000,000", "\t")).toMatchObject({ kind: "thousands-marks", readings: ["1000000"] });
  });

  it("reads a semicolon file's decimal comma, and warns when it could be a thousand", () => {
    expect(readAmount("0,10", ";")).toEqual({ ok: true, amount: "0.10" });
    expect(readAmount("1,000", ";")).toEqual({
      ok: true, amount: "1", kind: "comma-or-thousands", readings: ["1", "1000"],
      warning: 'In a file separated by ";", the comma marks decimals, so "1,000" is read as 1, not 1000. If you meant 1000, write it without the comma.',
    });
    expect(readAmount("12,500", ";")).toMatchObject({ ok: true, amount: "12.5", readings: ["12.5", "12500"] });
  });

  it("reads a semicolon file's dot when it cannot group thousands, and refuses one that could", () => {
    expect(readAmount("0.10", ";")).toEqual({ ok: true, amount: "0.10" });
    expect(readAmount("0.000001", ";")).toEqual({ ok: true, amount: "0.000001" });
    expect(readAmount("12.500", ";")).toEqual({
      ok: false, kind: "dot-or-thousands", readings: ["12.5", "12500"],
      message: 'In a file separated by ";", "12.500" could mean 12,5 or 12500. Write 12500 for the larger amount, or 12,5 for the smaller.',
    });
  });

  it("offers the one reading of a semicolon amount with thousands marks", () => {
    expect(readAmount("1.250,50", ";")).toEqual({
      ok: false, kind: "thousands-marks", readings: ["1250.50"],
      message: '"1.250,50" has marks between the thousands. Write it as 1250,50.',
    });
    expect(readAmount("1.000.000", ";")).toMatchObject({ kind: "thousands-marks", readings: ["1000000"] });
  });

  it("refuses anything else in a semicolon file, saying how to write it", () => {
    expect(readAmount("1,000,50", ";")).toEqual({
      ok: false,
      message: 'In a file separated by ";", write amounts with a comma for decimals and no other marks, like 1250,50. Found "1,000,50".',
    });
  });
});

describe("amountInFile", () => {
  it("writes the decimal mark the file uses", () => {
    expect(amountInFile("12.5", ";")).toBe("12,5");
    expect(amountInFile("12.5", ",")).toBe("12.5");
    expect(amountInFile("1000", ";")).toBe("1000");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/core && npx vitest run test/csv.test.ts`
Expected: FAIL: `readAmount is not a function` (or not exported).

- [ ] **Step 3: Implement**

In `packages/core/src/csv.ts`, directly after `delimiterOf`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/core && npx vitest run && npx tsc --noEmit -p .`
Expected: all pass. `parseCsv` is untouched, so every existing test still passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/csv.ts packages/core/test/csv.test.ts
git commit -m "feat(core): readAmount names every reading of an amount, and guesses none

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `parseCsv` keeps every line; `resolveRows` reads meaning and names the field

**Files:**
- Modify: `packages/core/src/csv.ts`, `packages/core/src/validate.ts`
- Modify: `frontend/lib/review-view.ts` (`checkRunFile` only, so the tree stays green), `frontend/test/plain-language.test.ts` (one call)
- Test: `packages/core/test/csv.test.ts`, `packages/core/test/validate.test.ts`

**Interfaces:**
- Consumes: `readAmount` (Task 1).
- Produces:
  - `export type CsvField = "invoiceId" | "token" | "to" | "amount"` (renames the private `Field`)
  - `ParsedRow` gains `cells: string[]` and `unreadable?: { message: string; text: string }`; `amount` is now **as written** (`"0,10"` stays `"0,10"`).
  - `CsvIssue` gains `field?: CsvField; readings?: string[]; kind?: AmountKind`.
  - `ParsedCsv` is `{ rows; issues; delimiter; header: string[]; columns?: Record<CsvField, number> }`. `warnings` is removed; `columns` is undefined when the header failed.
  - `resolveRows(rows, tokens, decimals, delimiter: Delimiter = ",")` returns `{ items: ResolvedRow[]; issues: CsvIssue[]; warnings: CsvIssue[] }` and reports **every** field problem of a row, not the first.
  - `RowIssue` gains `field?: CsvField`: `"to"` for the zero address, `"invoiceId"` for a duplicate invoice.

- [ ] **Step 1: Update and add the failing tests**

In `packages/core/test/csv.test.ts`:

(a) In `it("reads every data row and numbers lines from the file, header included"`, add a `cells` entry to the expected object:

```ts
    expect(rows[0]).toEqual({
      line: 2,
      invoiceId: "INV-US-001",
      tokenSymbol: "USDC",
      to: "0xe48A096B9E74f064b13c17734af29F85E02d732a",
      amount: "0.10",
      cells: ["INV-US-001", "USDC", "0xe48A096B9E74f064b13c17734af29F85E02d732a", "0.10"],
    });
```

(b) Replace `it("reports a row with the wrong number of columns, and keeps going"` with:

```ts
  it("keeps a row with the wrong number of values, marked unreadable, and keeps going", () => {
    const text = `invoiceId,token,to,amount
INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a
INV-EU-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10`;
    const { rows, issues } = parseCsv(text);
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
    expect(rows[0]!.unreadable).toEqual({
      message: "This line has 3 values but the first line names 4 columns. A value that contains a comma needs quotes around it.",
      text: "INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a",
    });
    expect(rows[0]!.invoiceId).toBe("");
    expect(rows[1]!.unreadable).toBeUndefined();
    expect(resolveRows(rows, TOKENS, DECIMALS).issues).toEqual([
      { line: 2, message: rows[0]!.unreadable!.message },
    ]);
  });
```

(c) In `it("fails closed on a newline inside a quoted field rather than inventing a row"`, replace the two `expect` lines with:

```ts
    expect(issues).toEqual([]);
    expect(rows.every((r) => r.unreadable)).toBe(true);
    const resolved = resolveRows(rows, TOKENS, DECIMALS);
    expect(resolved.items).toEqual([]);
    expect(resolved.issues.length).toBeGreaterThan(0);
```

(d) In `it("maps columns by name, in any order, through a spreadsheet's own names"`, add to the expected object:

```ts
      cells: ["12.50", "0xe48A096B9E74f064b13c17734af29F85E02d732a", "INV-1", "USDC"],
```

(e) Replace the body of `it("reads a semicolon amount that could be a thousands group, and asks for a second look"` after the `const a = …` line with:

```ts
    const { rows, issues, delimiter } = parseCsv(`invoiceId;token;to;amount
INV-1;USDC;${a};1,000
INV-2;USDC;${a};12,500
INV-3;cirBTC;${a};0,125
INV-4;USDC;${a};1,5
INV-5;USDC;${a};1234,567`);
    expect(issues).toEqual([]);
    const resolved = resolveRows(rows, TOKENS, DECIMALS, delimiter);
    expect(resolved.issues).toEqual([]);
    expect(resolved.items.map((i) => i.amount)).toEqual([1_000_000n, 12_500_000n, 12_500_000n, 1_500_000n, 1_234_567_000n]);
    expect(resolved.warnings).toEqual([
      { line: 2, field: "amount", kind: "comma-or-thousands", readings: ["1", "1000"],
        message: 'In a file separated by ";", the comma marks decimals, so "1,000" is read as 1, not 1000. If you meant 1000, write it without the comma.' },
      { line: 3, field: "amount", kind: "comma-or-thousands", readings: ["12.5", "12500"],
        message: 'In a file separated by ";", the comma marks decimals, so "12,500" is read as 12,5, not 12500. If you meant 12500, write it without the comma.' },
    ]);
```

(f) Replace the body of `it("has no second look to ask for in a comma file"` with:

```ts
    const a = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
    const { rows, delimiter } = parseCsv(`invoiceId,token,to,amount\nINV-1,USDC,${a},1.000`);
    expect(resolveRows(rows, TOKENS, DECIMALS, delimiter).warnings).toEqual([]);
```

(g) Replace the body of `it("reads a semicolon file and its decimal commas"` with:

```ts
    const { rows, issues, delimiter } = parseCsv(
      `invoiceId;token;to;amount\nINV,1;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;0,10`,
    );
    expect(issues).toEqual([]);
    expect(delimiter).toBe(";");
    expect(rows[0]!.invoiceId).toBe("INV,1");
    expect(rows[0]!.amount).toBe("0,10");
    expect(resolveRows(rows, TOKENS, DECIMALS, delimiter).items[0]!.amount).toBe(100_000n);
```

(h) In `it("refuses a dot in a semicolon file's amount when it could group thousands, …"`, replace from `const { rows, issues } = parseCsv(text);` to the end of the test with:

```ts
    const { rows, delimiter } = parseCsv(text);
    const { items, issues } = resolveRows(rows, TOKENS, DECIMALS, delimiter);
    expect(items.map((r) => r.invoiceId)).toEqual(["INV-3"]);
    expect(issues.map((i) => i.line)).toEqual([2, 3, 5, 6]);
    expect(issues[0]!.message).toBe(
      'In a file separated by ";", "1.000" could mean 1 or 1000. Write 1000 for the larger amount, or 1 for the smaller.',
    );
    expect(issues[1]!.message).toBe(
      'In a file separated by ";", write amounts with a comma for decimals and no other marks, like 1250,50. Found "1,000,50".',
    );
    expect(issues[2]!.message).toBe(
      'In a file separated by ";", "12.500" could mean 12,5 or 12500. Write 12500 for the larger amount, or 12,5 for the smaller.',
    );
```

(i) Replace the body of `it("says which mark to quote when a semicolon row has the wrong number of values"` with:

```ts
    const { rows } = parseCsv(`invoiceId;token;to;amount\nINV-1;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a`);
    expect(rows[0]!.unreadable!.message).toBe(
      "This line has 3 values but the first line names 4 columns. A value that contains a semicolon needs quotes around it.",
    );
```

(j) In `it("reads a dot in a semicolon file's amount as the decimal when it cannot group thousands"`, replace from `const { rows, issues, warnings } = parseCsv(` to the end with:

```ts
    const { rows, delimiter } = parseCsv(
      `invoiceId;token;to;amount\nINV-US-001;USDC;${a};0.10\nINV-EU-002;EURC;${a};0.10\nINV-BTC-003;cirBTC;${a};0.000001\nINV-4;USDC;${a};1.5\nINV-5;USDC;${a};0.100`,
    );
    const { items, issues, warnings } = resolveRows(rows, TOKENS, DECIMALS, delimiter);
    expect(issues).toEqual([]);
    expect(warnings).toEqual([]);
    expect(items.map((i) => i.amount)).toEqual([100_000n, 100_000n, 100n, 1_500_000n, 100_000n]);
```

(k) In `it("reads cells pasted from a spreadsheet, …"`, add to the expected row:

```ts
      cells: ["INV,1;A", "USDC", "0xe48A096B9E74f064b13c17734af29F85E02d732a", "0.10"],
```

(l) Replace the body of `it("leaves a pasted amount as the sheet displayed it, …"` with:

```ts
    const { rows, issues, delimiter } = parseCsv(
      "invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t0xe48A096B9E74f064b13c17734af29F85E02d732a\t1,250.50",
    );
    expect(issues).toEqual([]);
    expect(rows[0]!.amount).toBe("1,250.50");
    expect(resolveRows(rows, TOKENS, DECIMALS, delimiter).issues[0]).toMatchObject({
      field: "amount", kind: "thousands-marks", readings: ["1250.50"],
    });
```

(m) Replace the body of `it("says a tab is the mark when a pasted row has the wrong number of values"` with:

```ts
    const { rows } = parseCsv("invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t0xe48A096B9E74f064b13c17734af29F85E02d732a");
    expect(rows[0]!.unreadable!.message).toBe(
      "This line has 3 values but the first line names 4 columns. A value that contains a tab needs quotes around it.",
    );
```

(n) Add a test for the header and column map, inside `describe("parseCsv"`:

```ts
  it("keeps the header as written and where each field sits, for a corrected file", () => {
    const { header, columns } = parseCsv(`Name,Amount,Recipient,Invoice ID,Currency\nAn,1,0x,INV-1,USDC`);
    expect(header).toEqual(["Name", "Amount", "Recipient", "Invoice ID", "Currency"]);
    expect(columns).toEqual({ invoiceId: 3, token: 4, to: 2, amount: 1 });
    expect(parseCsv("id,coin\n1,2").columns).toBeUndefined();
  });
```

(o) In `describe("resolveRows"`, give the `row` helper raw cells, so it type-checks:

```ts
  const row = (over: Partial<import("../src/csv.js").ParsedRow> = {}) => ({
    line: 2, invoiceId: "INV-1", tokenSymbol: "USDC", to: TO, amount: "0.10", cells: [], ...over,
  });
```

and add:

```ts
  it("names every field a row gets wrong at once, not only the first", () => {
    const { items, issues } = resolveRows(
      [row({ invoiceId: "", tokenSymbol: "USD", to: "vitalik.eth", amount: "1,250.50" })], TOKENS, DECIMALS,
    );
    expect(items).toEqual([]);
    expect(issues.map((i) => i.field)).toEqual(["invoiceId", "token", "to", "amount"]);
  });

  it("checks an amount's form even when the token is unknown", () => {
    const { issues } = resolveRows([row({ tokenSymbol: "USD", amount: "0" })], TOKENS, DECIMALS);
    expect(issues.map((i) => [i.field, i.message])).toEqual([
      ["token", '"USD" is not a token this page pays. Use one of: USDC, EURC, cirBTC.'],
      ["amount", "The amount is zero. Enter the amount owed, or remove this line."],
    ]);
  });
```

In `packages/core/test/validate.test.ts`, add inside the top-level `describe`:

```ts
  it("names the field a row problem is in", () => {
    const TO = "0xe48A096B9E74f064b13c17734af29F85E02d732a" as const;
    const TOKEN = "0x3600000000000000000000000000000000000000" as const;
    const r = validateRun([
      { line: 2, invoiceId: "A", token: TOKEN, to: "0x0000000000000000000000000000000000000000", amount: 1n },
      { line: 3, invoiceId: "A", token: TOKEN, to: TO, amount: 1n },
    ]);
    expect(r.errors.map((e) => [e.line, e.field])).toEqual([[2, "to"], [3, "invoiceId"]]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/core && npx vitest run`
Expected: FAIL. `cells` is missing, `unreadable` is undefined, `resolveRows(…).warnings` is undefined, and `field` is undefined.

- [ ] **Step 3: Implement in `packages/core/src/csv.ts`**

Replace the `ParsedRow`, `CsvIssue` and `ParsedCsv` interfaces and the `Field` type with:

```ts
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
  /** Every value on the line, extra columns included, so a corrected file keeps them. */
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
  /** The file's field separator, read from its first line. */
  delimiter: Delimiter;
  /** The first line's names, as written. */
  header: string[];
  /** Where each field sits. Undefined when the first line could not name them. */
  columns?: Record<CsvField, number>;
}

/** A tab is what a spreadsheet puts on the clipboard when cells are copied. */
export type Delimiter = "," | ";" | "\t";

const FIELDS: readonly CsvField[] = ["invoiceId", "token", "to", "amount"];
```

Rename every remaining `Field` in the file to `CsvField` (`ALIASES`, `FIELD_WORD`, `fieldFor`, `at`, `missing`, `cell`). Move `type AmountKind`, `AmountReading`, `amountInFile` and `readAmount` (Task 1) above `ParsedRow` if the compiler needs `AmountKind` declared first. It does not, since type declarations hoist, so leave them where they are.

Rewrite `parseCsv`'s doc comment and body:

```ts
/**
 * Minimal RFC 4180. A real CSV library would be a dependency for 40 lines of
 * behaviour we can state exactly, and this file is on the path where a wrong
 * answer sends money to the wrong place.
 *
 * Splits and maps; reads no meaning. The first line is required and names the
 * columns, matched by name in any order; a column that names nothing we pay
 * is kept in `cells` and otherwise ignored. Every data line is returned, even
 * one that cannot be split into the header's columns, so the payer can see it
 * and fix it. What a value means (an amount, a token, an address) is
 * `resolveRows`' job.
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
    return { rows, issues: [{ line: 1, message: "The file is empty." }], delimiter: ",", header: [] };
  }

  const delimiter = delimiterOf(lines[headerIndex]!);
  const header = splitLine(lines[headerIndex]!, delimiter);
  const names = header.map((h) => h.trim());
  const headerLine = headerIndex + 1;

  const at: Partial<Record<CsvField, number>> = {};
  for (let i = 0; i < names.length; i++) {
    const field = fieldFor(names[i]!);
    if (!field) continue;
    const seen = at[field];
    if (seen !== undefined) {
      return {
        rows, delimiter, header,
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
      rows, delimiter, header,
      issues: [{
        line: headerLine,
        message: `The first line must name the columns invoiceId, token, to and amount, in any order. Missing: ${missing.join(", ")}. Found: ${found}.`,
      }],
    };
  }
  const columns = at as Record<CsvField, number>;

  const mark = { ",": "a comma", ";": "a semicolon", "\t": "a tab" }[delimiter];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === "") continue;
    const line = i + 1;
    const cells = splitLine(raw, delimiter);

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

    const cell = (f: CsvField) => cells[columns[f]]!.trim();
    rows.push({
      line, invoiceId: cell("invoiceId"), tokenSymbol: cell("token"), to: cell("to"), amount: cell("amount"), cells,
    });
  }

  return { rows, issues, delimiter, header, columns };
}
```

Rewrite `resolveRows`:

```ts
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
```

Delete the old `;` amount block from `parseCsv` (the code between `let amount = cell("amount");` and the `rows.push` that follows it), since `readAmount` now owns it. The doc paragraph about `;` files also moves: add it to `readAmount`'s comment if anything in it is not already said there.

- [ ] **Step 4: Implement in `packages/core/src/validate.ts`**

```ts
import type { CsvField, ResolvedRow } from "./csv.js";

export interface RowIssue {
  line?: number;
  invoiceId?: string;
  /** The field to fix, when the fix is one value. */
  field?: CsvField;
  message: string;
}
```

Add `field: "to",` to the zero-address `errors.push({…})` and `field: "invoiceId",` to the duplicate-invoice `errors.push({…})`.

- [ ] **Step 5: Keep the frontend green**

In `frontend/lib/review-view.ts`, `checkRunFile`:

```ts
export function checkRunFile(text: string, tokens: TokenSet, decimals: Record<string, number>): CheckedFile {
  const csv = parseCsv(text);
  const resolved = resolveRows(csv.rows, tokens, decimals, csv.delimiter);
  const issues = [...csv.issues, ...resolved.issues];
  const run = validateRun(resolved.items, issues.length);
  return {
    rows: resolved.items, parsed: csv.rows, issues,
    errors: run.errors, warnings: [...resolved.warnings, ...run.warnings],
  };
}
```

In `frontend/test/plain-language.test.ts`, in the loop over texts, replace:

```ts
      const { rows, issues } = parseCsv(text);
      const resolved = resolveRows(rows, TOKENS, DECIMALS);
```

with:

```ts
      const { rows, issues, delimiter } = parseCsv(text);
      const resolved = resolveRows(rows, TOKENS, DECIMALS, delimiter);
```

- [ ] **Step 6: Run everything**

Run: `cd packages/core && npx vitest run && npx tsc --noEmit -p . && cd ../../frontend && npx vitest run && npx tsc --noEmit`
Expected: all pass. If `review-view.test.ts`'s `"1,000"` test now sees a different message, check that only the message changed. The line and level must be the same.

- [ ] **Step 7: Commit**

```bash
git add packages/core frontend/lib/review-view.ts frontend/test/plain-language.test.ts
git commit -m "refactor(core): parseCsv keeps every line; resolveRows reads meaning and names each field

A refused line used to vanish, so there was nothing on screen to fix.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `RunEdits` and `checkRows`

**Files:**
- Create: `frontend/lib/run-edits.ts`
- Modify: `frontend/lib/review-view.ts`
- Test: `frontend/test/run-edits.test.ts` (new), `frontend/test/review-view.test.ts`

**Interfaces:**
- Consumes: `ParsedCsv`, `ParsedRow`, `CsvField`, `AmountKind`, `resolveRows`, `validateRun`, `parseCsv` (Task 2).
- Produces (in `frontend/lib/run-edits.ts`):
  - `interface CellEdit { line: number; field: CsvField; text: string }`
  - `interface AppliedGroup { key: string; field: CsvField; lines: number[]; title: string }`
  - `interface RunEdits { cells: Readonly<Record<number, Partial<Record<CsvField, string>>>>; removed: readonly number[]; groups: readonly AppliedGroup[] }`
  - `const NO_EDITS: RunEdits`
  - `applyEdits(rows: readonly ParsedRow[], edits: RunEdits): ParsedRow[]`
  - `withEdits(edits, changes: readonly CellEdit[]): RunEdits`
  - `applyGroup(edits, action: { edits: CellEdit[]; applied: AppliedGroup }): RunEdits`
  - `undoGroup(edits, key: string): RunEdits`
  - `undoLine(edits, line: number): RunEdits`
  - `leaveOut(edits, line: number): RunEdits`, `putBack(edits, line: number): RunEdits`
  - `changeCounts(edits): { edited: number; leftOut: number }`
  - `changesText(c: { edited: number; leftOut: number }): string | undefined`
  - `correctionReminder(c: { edited: number; leftOut: number }): string | undefined`
- Produces (in `frontend/lib/review-view.ts`):
  - `interface RowProblem { line: number; field?: CsvField; message: string; level: "error" | "warning"; readings?: string[]; kind?: AmountKind }`
  - `CheckedFile` gains `fileProblems: string[]` and `problems: RowProblem[]`.
  - `checkRows(source: ParsedCsv, edits: RunEdits, tokens: TokenSet, decimals: Record<string, number>): CheckedFile`
  - `ALL_LEFT_OUT = "Every line is left out of this run. Put one back to pay it."`

- [ ] **Step 1: Write the failing tests**

Create `frontend/test/run-edits.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCsv } from "@ledgerline/core";
import {
  NO_EDITS, applyEdits, withEdits, applyGroup, undoGroup, undoLine, leaveOut, putBack,
  changeCounts, changesText, correctionReminder,
} from "@/lib/run-edits";

const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const SRC = parseCsv(`invoiceId,token,to,amount\nINV-1,USD,${A},10\nINV-2,USDC,nope,5\nINV-3,USD,${A},1`);

describe("applyEdits", () => {
  it("returns the rows as read when nothing is edited", () => {
    expect(applyEdits(SRC.rows, NO_EDITS)).toEqual(SRC.rows);
  });

  it("puts an edited field over the row as read, trimmed, and leaves the source alone", () => {
    const rows = applyEdits(SRC.rows, withEdits(NO_EDITS, [{ line: 2, field: "token", text: " USDC " }]));
    expect(rows[0]!.tokenSymbol).toBe("USDC");
    expect(SRC.rows[0]!.tokenSymbol).toBe("USD");
  });

  it("drops a left-out line, and brings it back", () => {
    const out = leaveOut(NO_EDITS, 3);
    expect(applyEdits(SRC.rows, out).map((r) => r.line)).toEqual([2, 4]);
    expect(applyEdits(SRC.rows, putBack(out, 3)).map((r) => r.line)).toEqual([2, 3, 4]);
  });

  it("reads an unreadable line from what was typed alone", () => {
    const src = parseCsv(`invoiceId,token,to,amount\nINV-1,USDC`);
    const rows = applyEdits(src.rows, withEdits(NO_EDITS, [{ line: 2, field: "invoiceId", text: "INV-9" }]));
    expect(rows[0]!.unreadable).toBeUndefined();
    expect(rows[0]!.invoiceId).toBe("INV-9");
    expect(rows[0]!.tokenSymbol).toBe("");
  });
});

describe("groups and undo", () => {
  const action = {
    edits: [{ line: 2, field: "token" as const, text: "USDC" }, { line: 4, field: "token" as const, text: "USDC" }],
    applied: { key: "token:usd", field: "token" as const, lines: [2, 4], title: "Token changed to USDC on 2 lines." },
  };

  it("applies a group in one step and undoes it in one step", () => {
    const e = applyGroup(NO_EDITS, action);
    expect(e.groups).toEqual([action.applied]);
    expect(applyEdits(SRC.rows, e).map((r) => r.tokenSymbol)).toEqual(["USDC", "USDC", "USDC"]);
    expect(undoGroup(e, "token:usd")).toEqual({ cells: {}, removed: [], groups: [] });
  });

  it("undoes a group without touching another edit on the same line", () => {
    const e = withEdits(applyGroup(NO_EDITS, action), [{ line: 2, field: "amount", text: "11" }]);
    expect(undoGroup(e, "token:usd").cells).toEqual({ 2: { amount: "11" } });
  });

  it("undoes one line, taking it out of any group it was in", () => {
    const e = undoLine(applyGroup(NO_EDITS, action), 2);
    expect(e.cells).toEqual({ 4: { token: "USDC" } });
    expect(e.groups[0]!.lines).toEqual([4]);
    expect(undoLine(e, 4).groups).toEqual([]);
  });
});

describe("what changed, in words", () => {
  it("counts edited lines apart from left-out ones", () => {
    const e = leaveOut(withEdits(NO_EDITS, [
      { line: 2, field: "token", text: "USDC" }, { line: 2, field: "amount", text: "1" },
      { line: 3, field: "to", text: A },
    ]), 3);
    expect(changeCounts(e)).toEqual({ edited: 1, leftOut: 1 });
  });

  it("says nothing when nothing changed", () => {
    expect(changesText({ edited: 0, leftOut: 0 })).toBeUndefined();
    expect(correctionReminder({ edited: 0, leftOut: 0 })).toBeUndefined();
  });

  it("names the changes for the side summary", () => {
    expect(changesText({ edited: 1, leftOut: 0 })).toBe("1 line edited here");
    expect(changesText({ edited: 3, leftOut: 1 })).toBe("3 lines edited here · 1 left out");
    expect(changesText({ edited: 0, leftOut: 2 })).toBe("2 left out");
  });

  it("reminds the payer to update the spreadsheet", () => {
    expect(correctionReminder({ edited: 3, leftOut: 1 })).toBe(
      "You edited 3 lines and left 1 out of this run. Download the corrected file to update your spreadsheet.",
    );
    expect(correctionReminder({ edited: 1, leftOut: 0 })).toBe(
      "You edited 1 line. Download the corrected file to update your spreadsheet.",
    );
    expect(correctionReminder({ edited: 0, leftOut: 2 })).toBe(
      "You left 2 lines out of this run. Download the corrected file to update your spreadsheet.",
    );
  });
});
```

Append to `frontend/test/review-view.test.ts`, and add `checkRows, ALL_LEFT_OUT` to its `@/lib/review-view` import, plus these imports:

```ts
import { parseCsv } from "@ledgerline/core";
import { NO_EDITS, withEdits, leaveOut } from "@/lib/run-edits";

describe("checkRows", () => {
  const check = (text: string, edits = NO_EDITS) => checkRows(parseCsv(text), edits, TOKENS, DECIMALS);

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

  it("re-reads a line from its edit, through the same rules", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USD,${A},1`;
    const c = check(text, withEdits(NO_EDITS, [{ line: 2, field: "token", text: "USDC" }]));
    expect(c.problems).toEqual([]);
    expect(c.rows.map((r) => r.line)).toEqual([2]);
  });

  it("refuses 0,10 typed into a comma file, and reads 0.10 typed into a semicolon file", () => {
    const comma = check(`invoiceId,token,to,amount\nINV-1,USDC,${A},x`,
      withEdits(NO_EDITS, [{ line: 2, field: "amount", text: "0,10" }]));
    expect(comma.rows).toEqual([]);
    expect(comma.problems[0]).toMatchObject({ line: 2, field: "amount", level: "error" });
    const semi = check(`invoiceId;token;to;amount\nINV-1;USDC;${A};x`,
      withEdits(NO_EDITS, [{ line: 2, field: "amount", text: "0.10" }]));
    expect(semi.rows[0]!.amount).toBe(100_000n);
  });

  it("says every line is left out, not that the file is empty", () => {
    const c = check(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`, leaveOut(NO_EDITS, 2));
    expect(c.fileProblems).toEqual([ALL_LEFT_OUT]);
    expect(ALL_LEFT_OUT).toBe("Every line is left out of this run. Put one back to pay it.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/run-edits.test.ts test/review-view.test.ts`
Expected: FAIL: cannot resolve `@/lib/run-edits`, and `checkRows` is not exported.

- [ ] **Step 3: Implement `frontend/lib/run-edits.ts`**

```ts
import type { CsvField, ParsedRow } from "@ledgerline/core";

/** One value the payer typed or pressed, for one field of one line. */
export interface CellEdit { line: number; field: CsvField; text: string }

/** A change made to many lines at once, kept so it can be undone at once. */
export interface AppliedGroup { key: string; field: CsvField; lines: number[]; title: string }

/**
 * What the payer changed on the Review step, over the file as read. The file
 * itself is never written to: undo is dropping an entry here.
 */
export interface RunEdits {
  cells: Readonly<Record<number, Partial<Record<CsvField, string>>>>;
  /** Lines left out of this run. Still owed: the corrected file keeps them. */
  removed: readonly number[];
  groups: readonly AppliedGroup[];
}

export const NO_EDITS: RunEdits = { cells: {}, removed: [], groups: [] };

const ROW_KEY = { invoiceId: "invoiceId", token: "tokenSymbol", to: "to", amount: "amount" } as const;

/** The rows the run is checked against: edited values over the file's, and
 *  left-out lines dropped. An unreadable line that was typed in again is
 *  read from what was typed alone. */
export function applyEdits(rows: readonly ParsedRow[], edits: RunEdits): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const row of rows) {
    if (edits.removed.includes(row.line)) continue;
    const e = edits.cells[row.line];
    if (!e) { out.push(row); continue; }
    const { unreadable: _, ...rest } = row;
    const next: ParsedRow = { ...rest };
    for (const f of Object.keys(e) as CsvField[]) next[ROW_KEY[f]] = e[f]!.trim();
    out.push(next);
  }
  return out;
}

export function withEdits(edits: RunEdits, changes: readonly CellEdit[]): RunEdits {
  const cells = { ...edits.cells };
  for (const { line, field, text } of changes) cells[line] = { ...cells[line], [field]: text };
  return { ...edits, cells };
}

function dropFields(
  cells: RunEdits["cells"], lines: readonly number[], field?: CsvField,
): RunEdits["cells"] {
  const next = { ...cells };
  for (const line of lines) {
    if (!next[line]) continue;
    if (field === undefined) { delete next[line]; continue; }
    const { [field]: _, ...keep } = next[line]!;
    if (Object.keys(keep).length === 0) delete next[line];
    else next[line] = keep;
  }
  return next;
}

export function applyGroup(edits: RunEdits, action: { edits: CellEdit[]; applied: AppliedGroup }): RunEdits {
  const next = withEdits(edits, action.edits);
  return { ...next, groups: [...next.groups, action.applied] };
}

export function undoGroup(edits: RunEdits, key: string): RunEdits {
  const group = edits.groups.find((g) => g.key === key);
  if (!group) return edits;
  return {
    ...edits,
    cells: dropFields(edits.cells, group.lines, group.field),
    groups: edits.groups.filter((g) => g !== group),
  };
}

export function undoLine(edits: RunEdits, line: number): RunEdits {
  return {
    ...edits,
    cells: dropFields(edits.cells, [line]),
    groups: edits.groups
      .map((g) => ({ ...g, lines: g.lines.filter((l) => l !== line) }))
      .filter((g) => g.lines.length > 0),
  };
}

export function leaveOut(edits: RunEdits, line: number): RunEdits {
  return edits.removed.includes(line) ? edits : { ...edits, removed: [...edits.removed, line] };
}

export function putBack(edits: RunEdits, line: number): RunEdits {
  return { ...edits, removed: edits.removed.filter((l) => l !== line) };
}

export function changeCounts(edits: RunEdits): { edited: number; leftOut: number } {
  const edited = Object.keys(edits.cells).map(Number).filter((l) => !edits.removed.includes(l)).length;
  return { edited, leftOut: edits.removed.length };
}

const lines = (n: number) => `${n} line${n === 1 ? "" : "s"}`;

/** For the side summary, through Check and Pay. */
export function changesText({ edited, leftOut }: { edited: number; leftOut: number }): string | undefined {
  const parts = [
    ...(edited > 0 ? [`${lines(edited)} edited here`] : []),
    ...(leftOut > 0 ? [`${leftOut} left out`] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** For the Result screen: the spreadsheet is what the payer opens next month. */
export function correctionReminder({ edited, leftOut }: { edited: number; leftOut: number }): string | undefined {
  const did =
    edited > 0 && leftOut > 0 ? `You edited ${lines(edited)} and left ${leftOut} out of this run.`
    : edited > 0 ? `You edited ${lines(edited)}.`
    : leftOut > 0 ? `You left ${lines(leftOut)} out of this run.`
    : undefined;
  return did && `${did} Download the corrected file to update your spreadsheet.`;
}
```

- [ ] **Step 4: Implement `checkRows` in `frontend/lib/review-view.ts`**

Replace the imports and `CheckedFile`/`checkRunFile` with:

```ts
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
```

Keep `reviewView` and its types unchanged for now. Task 6 deletes them.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/run-edits.ts frontend/lib/review-view.ts frontend/test/run-edits.test.ts frontend/test/review-view.test.ts
git commit -m "feat(web): edits sit over the file as read, and go through the same checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The corrected file

**Files:**
- Create: `frontend/lib/corrected-file.ts`
- Modify: `frontend/lib/run-file.ts` (add `PASTED_ROWS`)
- Test: `frontend/test/corrected-file.test.ts` (new)

**Interfaces:**
- Consumes: `RunEdits`, `withEdits`, `leaveOut`, `NO_EDITS` (Task 3); `checkRows` (Task 3); `readAmount`, `amountInFile`, `parseCsv`, `ParsedCsv`, `Delimiter` (Tasks 1–2).
- Produces:
  - `PASTED_ROWS = "the pasted rows"` in `frontend/lib/run-file.ts`
  - `correctedCsv(text: string, source: ParsedCsv, edits: RunEdits): string`
  - `correctedFile(d: { text: string; source: ParsedCsv; edits: RunEdits; sourceName: string }): { name: string; text: string; type: string }`

- [ ] **Step 1: Write the failing tests**

Create `frontend/test/corrected-file.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCsv, tokensForChain } from "@ledgerline/core";
import { correctedCsv, correctedFile } from "@/lib/corrected-file";
import { NO_EDITS, leaveOut, withEdits, type RunEdits } from "@/lib/run-edits";
import { checkRows } from "@/lib/review-view";
import { PASTED_ROWS } from "@/lib/run-file";

const TOKENS = tokensForChain(5042002);
const DECIMALS = { [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8 };
const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const fix = (text: string, edits: RunEdits) => correctedCsv(text, parseCsv(text), edits);

describe("correctedCsv", () => {
  it("gives back the file byte for byte when nothing is edited", () => {
    const text = `﻿Name,invoiceId,token,to,amount\r\n"Nguyen, An",INV-1,USDC,${A},1\r\n`;
    expect(fix(text, NO_EDITS)).toBe(text);
  });

  it("rewrites only the edited line, keeping the BOM, the line endings and the extra columns", () => {
    const text = `﻿Name,invoiceId,token,to,amount\r\nAn,INV-1,USD,${A},1\r\nBinh,INV-2,USDC,${A},2\r\n`;
    const out = fix(text, withEdits(NO_EDITS, [{ line: 2, field: "token", text: "USDC" }]));
    expect(out).toBe(`﻿Name,invoiceId,token,to,amount\r\nAn,INV-1,USDC,${A},1\r\nBinh,INV-2,USDC,${A},2\r\n`);
  });

  it("quotes an edited value that holds the delimiter or a quote, and it reads back the same", () => {
    const text = `invoiceId,token,to,amount\n,USDC,${A},1`;
    const out = fix(text, withEdits(NO_EDITS, [{ line: 2, field: "invoiceId", text: 'INV, "A"' }]));
    expect(out).toBe(`invoiceId,token,to,amount\n"INV, ""A""",USDC,${A},1`);
    expect(parseCsv(out).rows[0]!.invoiceId).toBe('INV, "A"');
  });

  it("writes an amount in the file's decimal mark, so a comma-decimal sheet stores a number", () => {
    const text = `invoiceId;token;to;amount\nINV-1;USDC;${A};1.000`;
    expect(fix(text, withEdits(NO_EDITS, [{ line: 2, field: "amount", text: "0.10" }])))
      .toBe(`invoiceId;token;to;amount\nINV-1;USDC;${A};0,10`);
  });

  it("keeps a left-out line as it was, even with an edit typed into it first", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USD,${A},1`;
    const e = leaveOut(withEdits(NO_EDITS, [{ line: 2, field: "token", text: "USDC" }]), 2);
    expect(fix(text, e)).toBe(text);
  });

  it("writes an unreadable line out in the header's columns once it is typed in again", () => {
    const text = `invoiceId,token,to,amount,Note\nINV-1,USDC`;
    const e = withEdits(NO_EDITS, [
      { line: 2, field: "invoiceId", text: "INV-1" }, { line: 2, field: "token", text: "USDC" },
      { line: 2, field: "to", text: A }, { line: 2, field: "amount", text: "5" },
    ]);
    expect(fix(text, e)).toBe(`invoiceId,token,to,amount,Note\nINV-1,USDC,${A},5,`);
  });

  it("reads back to exactly the rows on screen", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USD,${A},"1,250.50"\nINV-2,USDC,nope,2\nINV-3,EURC,${A},3\nINV-4,USDC,${A},x`;
    const source = parseCsv(text);
    const e = leaveOut(withEdits(NO_EDITS, [
      { line: 2, field: "token", text: "USDC" }, { line: 2, field: "amount", text: "1250.50" },
      { line: 3, field: "to", text: A.toLowerCase() },
    ]), 5);
    const onScreen = checkRows(source, e, TOKENS, DECIMALS).rows;
    const reread = checkRows(parseCsv(correctedCsv(text, source, e)), NO_EDITS, TOKENS, DECIMALS).rows;
    expect(reread).toEqual(onScreen);
  });
});

describe("correctedFile", () => {
  it("names the file after the one chosen, in its own format", () => {
    const text = `invoiceId,token,to,amount\nINV-1,USDC,${A},1`;
    const f = correctedFile({ text, source: parseCsv(text), edits: NO_EDITS, sourceName: "September.csv" });
    expect(f.name).toBe("September-corrected.csv");
    expect(f.type).toBe("text/csv");
  });

  it("names pasted rows as a tab-separated file", () => {
    const text = `invoiceId\ttoken\tto\tamount\nINV-1\tUSDC\t${A}\t1`;
    const f = correctedFile({ text, source: parseCsv(text), edits: NO_EDITS, sourceName: PASTED_ROWS });
    expect(f.name).toBe("pasted-rows-corrected.tsv");
    expect(f.type).toBe("text/tab-separated-values");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/corrected-file.test.ts`
Expected: FAIL: cannot resolve `@/lib/corrected-file`.

- [ ] **Step 3: Implement**

Add to `frontend/lib/run-file.ts`:

```ts
/** The name a paste goes by, where a file would give its own. */
export const PASTED_ROWS = "the pasted rows";
```

Create `frontend/lib/corrected-file.ts`:

```ts
import { amountInFile, readAmount, type CsvField, type Delimiter, type ParsedCsv } from "@ledgerline/core";
import type { RunEdits } from "@/lib/run-edits";
import { PASTED_ROWS } from "@/lib/run-file";

/** The file's lines, each with the break that ended it, so a line not edited
 *  goes back byte for byte. Numbered as `parseCsv` numbers them. */
function linesOf(text: string): { body: string; end: string }[] {
  const out: { body: string; end: string }[] = [];
  const re = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push({ body: m[1]!, end: m[2]! });
    if (m[2] === "") break;
  }
  return out;
}

const cellText = (value: string, delimiter: Delimiter) =>
  /["\r\n]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value;

/** An edited amount in the file's own convention: `0,10` in a `;` file, so a
 *  comma-decimal Numbers stores a number, not text. */
function amountCell(text: string, delimiter: Delimiter): string {
  const read = readAmount(text, delimiter);
  return read.ok ? amountInFile(read.amount, delimiter) : text.trim();
}

/**
 * The payer's file with their fixes in it, to replace the one in their
 * spreadsheet. Lines not edited, the header and every extra column are kept
 * as they were. A left-out line is kept unchanged: it is still owed.
 */
export function correctedCsv(text: string, source: ParsedCsv, edits: RunEdits): string {
  if (!source.columns) return text;
  const columns = source.columns;
  const lines = linesOf(text);
  for (const row of source.rows) {
    const e = edits.cells[row.line];
    if (!e || edits.removed.includes(row.line)) continue;
    const cells = row.unreadable ? source.header.map(() => "") : [...row.cells];
    for (const f of Object.keys(e) as CsvField[]) {
      const value = e[f]!.trim();
      cells[columns[f]] = f === "amount" ? amountCell(value, source.delimiter) : value;
    }
    lines[row.line - 1]!.body = cells.map((c) => cellText(c, source.delimiter)).join(source.delimiter);
  }
  return lines.map((l) => l.body + l.end).join("");
}

export function correctedFile(d: {
  text: string; source: ParsedCsv; edits: RunEdits; sourceName: string;
}): { name: string; text: string; type: string } {
  const tab = d.source.delimiter === "\t";
  const base = d.sourceName === PASTED_ROWS ? "pasted-rows" : d.sourceName.replace(/\.(csv|tsv|txt)$/i, "");
  return {
    name: `${base}-corrected.${tab ? "tsv" : "csv"}`,
    text: correctedCsv(d.text, d.source, d.edits),
    type: tab ? "text/tab-separated-values" : "text/csv",
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/corrected-file.ts frontend/lib/run-file.ts frontend/test/corrected-file.test.ts
git commit -m "feat(web): the corrected file keeps every untouched byte and every left-out line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The fix list as groups and line cards

**Files:**
- Create: `frontend/lib/fix-list.ts`
- Test: `frontend/test/fix-list.test.ts` (new), `frontend/test/plain-language.test.ts`

**Interfaces:**
- Consumes: `CheckedFile`, `RowProblem`, `checkRows` (Task 3); `RunEdits`, `CellEdit`, `AppliedGroup`, `applyGroup`, `withEdits`, `leaveOut`, `NO_EDITS` (Task 3); `amountInFile`, `ParsedCsv`, `CsvField`, `TokenSet`.
- Produces:
  - `interface Choice { label: string; text: string }`
  - `interface FieldFix { field: CsvField; label: string; value: string; choices: Choice[]; help?: string }`
  - `interface LineCard { id: string; line: number; state: "open" | "fixed" | "left-out"; heading: string; messages: { text: string; level: "error" | "warning" }[]; fields: FieldFix[]; changes: { label: string; before: string; after: string }[]; unreadableText?: string; blocking: boolean }`
  - `interface GroupRow { line: number; raw: string; choices: Choice[] }`
  - `interface GroupAction { label: string; edits: CellEdit[]; applied: AppliedGroup }`
  - `interface GroupCard { id: string; key: string; field: CsvField; state: "open" | "applied"; title: string; lead?: string; examples: string[]; rows: GroupRow[]; lines: number[]; actions: GroupAction[]; blocking: boolean }`
  - `interface FixListView { fileProblems: string[]; groups: GroupCard[]; cards: LineCard[]; blocking: number; title?: string; summary?: string; counts?: string; fixFirst?: string; firstOpen: string }`
  - `fixList(input: { checked: CheckedFile; source: ParsedCsv; edits: RunEdits; tokens: TokenSet }): FixListView`
  - `RECIPIENT_HELP`, `GROUP_MIN = 3`

- [ ] **Step 1: Write the failing tests**

Create `frontend/test/fix-list.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCsv, tokensForChain } from "@ledgerline/core";
import { fixList, RECIPIENT_HELP } from "@/lib/fix-list";
import { checkRows } from "@/lib/review-view";
import { NO_EDITS, applyGroup, leaveOut, withEdits, type RunEdits } from "@/lib/run-edits";

const TOKENS = tokensForChain(5042002);
const DECIMALS = { [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8 };
const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const B = "0x1111111111111111111111111111111111111111";
const C = "0x2222222222222222222222222222222222222222";

function view(text: string, edits: RunEdits = NO_EDITS) {
  const source = parseCsv(text);
  return fixList({ checked: checkRows(source, edits, TOKENS, DECIMALS), source, edits, tokens: TOKENS });
}
const csv = (...rows: string[]) => `invoiceId,token,to,amount\n${rows.join("\n")}`;
const semi = (...rows: string[]) => `invoiceId;token;to;amount\n${rows.join("\n")}`;

describe("fixList: groups", () => {
  it("puts three or more lines with the same unknown token in one card, with no line cards", () => {
    const v = view(csv(`INV-1,USD,${A},1`, `INV-2,usd,${A},2`, `INV-3,USD,${A},3`));
    expect(v.cards).toEqual([]);
    expect(v.groups).toHaveLength(1);
    const g = v.groups[0]!;
    expect(g.title).toBe('3 lines use the token "USD".');
    expect(g.lead).toBe("Change all to");
    expect(g.actions.map((a) => a.label)).toEqual(["USDC", "EURC", "cirBTC"]);
    expect(g.actions[0]!.edits).toEqual([2, 3, 4].map((line) => ({ line, field: "token", text: "USDC" })));
    expect(g.examples).toEqual(["line 2: USD", "line 3: usd"]);
    expect(g.blocking).toBe(true);
  });

  it("leaves two such lines as line cards", () => {
    const v = view(csv(`INV-1,USD,${A},1`, `INV-2,USD,${A},2`));
    expect(v.groups).toEqual([]);
    expect(v.cards.map((c) => c.line)).toEqual([2, 3]);
  });

  it("never groups addresses", () => {
    const v = view(csv(`INV-1,USDC,nope,1`, `INV-2,USDC,nope,2`, `INV-3,USDC,nope,3`));
    expect(v.groups).toEqual([]);
    expect(v.cards).toHaveLength(3);
    expect(v.cards[0]!.fields).toEqual([{ field: "to", label: "Recipient", value: "nope", choices: [], help: RECIPIENT_HELP }]);
  });

  it("offers both readings for a group of 1.000-style amounts, with the file's own marks", () => {
    const v = view(semi(`INV-1;EURC;${A};1.000`, `INV-2;EURC;${A};2.500`, `INV-3;EURC;${A};3.000`));
    const g = v.groups[0]!;
    expect(g.title).toBe("3 amounts like 1.000 could be read two ways.");
    expect(g.examples).toEqual(["line 2: 1.000 → 1 or 1000 EURC", "line 3: 2.500 → 2,5 or 2500 EURC"]);
    expect(g.actions.map((a) => [a.label, a.edits.map((e) => e.text)])).toEqual([
      ["All are thousands", ["1000", "2500", "3000"]],
      ["All are decimals", ["1", "2,5", "3"]],
    ]);
    expect(g.rows[1]).toEqual({ line: 3, raw: "2.500", choices: [
      { label: "2,5 EURC", text: "2,5" }, { label: "2500 EURC", text: "2500" },
    ] });
  });

  it("offers one button for a group of amounts with thousands marks", () => {
    const v = view(csv(`INV-1,USDC,${A},"1,250.50"`, `INV-2,USDC,${A},"2,000.00"`, `INV-3,USDC,${A},"3,100.10"`));
    expect(v.groups[0]!.title).toBe("3 amounts have marks between the thousands, like 1,250.50.");
    expect(v.groups[0]!.actions.map((a) => a.label)).toEqual(["Read all without the marks"]);
  });

  it("offers only 'All are thousands' for semicolon warnings, which read as decimals already", () => {
    const v = view(semi(`INV-1;USDC;${A};1,000`, `INV-2;USDC;${A};2,000`, `INV-3;USDC;${A};3,000`));
    const g = v.groups[0]!;
    expect(g.blocking).toBe(false);
    expect(g.title).toBe("3 amounts like 1,000 are read as decimals.");
    expect(g.actions.map((a) => a.label)).toEqual(["All are thousands"]);
  });

  it("turns an applied group into one card that undoes it, keeping its place and id", () => {
    // Three recipients, so the fixed lines raise no "already paid" warning.
    const text = csv(`INV-1,USD,${A},1`, `INV-2,USD,${B},2`, `INV-3,USD,${C},3`);
    const open = view(text).groups[0]!;
    const e = applyGroup(NO_EDITS, open.actions[0]!);
    const v = view(text, e);
    expect(v.cards).toEqual([]);
    expect(v.groups).toEqual([expect.objectContaining({
      id: open.id, key: open.key, state: "applied", title: "Token changed to USDC on 3 lines.", blocking: false,
    })]);
    expect(v.blocking).toBe(0);
  });

  it("gives a line in a group its own card for its other problem, with only that field", () => {
    const v = view(csv(`INV-1,USD,nope,1`, `INV-2,USD,${A},2`, `INV-3,USD,${A},3`));
    expect(v.groups).toHaveLength(1);
    expect(v.cards.map((c) => [c.line, c.fields.map((f) => f.field)])).toEqual([[2, ["to"]]]);
  });

  it("breaks a group up when one line is fixed on its own and fewer than three remain", () => {
    const text = csv(`INV-1,USD,${A},1`, `INV-2,USD,${A},2`, `INV-3,USD,${A},3`);
    const v = view(text, withEdits(NO_EDITS, [{ line: 3, field: "token", text: "EURC" }]));
    expect(v.groups).toEqual([]);
    expect(v.cards.map((c) => [c.line, c.state])).toEqual([[2, "open"], [3, "fixed"], [4, "open"]]);
  });
});

describe("fixList: line cards", () => {
  it("shows only the fields with a problem, with buttons carrying the token and no grouping mark", () => {
    const v = view(csv(`INV-1,EURC,${A},"1,000"`));
    const c = v.cards[0]!;
    expect(c.heading).toBe("Line 2 · INV-1");
    expect(c.fields).toEqual([{
      field: "amount", label: "Amount", value: "1,000",
      choices: [{ label: "1 EURC", text: "1" }, { label: "1000 EURC", text: "1000" }],
    }]);
  });

  it("offers the chain's tokens as buttons for a token", () => {
    const c = view(csv(`INV-1,USDT,${A},1`)).cards[0]!;
    expect(c.fields[0]!.choices.map((x) => x.label)).toEqual(["USDC", "EURC", "cirBTC"]);
  });

  it("gives an unreadable line all four fields, empty, with the line as written", () => {
    const c = view(csv(`INV-1,USDC`)).cards[0]!;
    expect(c.unreadableText).toBe("INV-1,USDC");
    expect(c.fields.map((f) => [f.field, f.value])).toEqual([["invoiceId", ""], ["token", ""], ["to", ""], ["amount", ""]]);
  });

  it("offers no field for a problem that is not one value", () => {
    const c = view(csv(`INV-1,USDC,${A},1`, `INV-2,USDC,${A},2`)).cards[0]!;
    expect(c.line).toBe(3);
    expect(c.fields).toEqual([]);
    expect(c.blocking).toBe(false);
  });

  it("keeps a fixed card in place, showing before and after, the address in full", () => {
    const text = csv(`INV-1,USDC,nope,1`, `INV-2,USDC,${A},2`);
    const v = view(text, withEdits(NO_EDITS, [{ line: 2, field: "to", text: A.toLowerCase() }]));
    expect(v.cards[0]).toMatchObject({
      id: "fix-line-2", state: "fixed", heading: "Line 2 · INV-1 · ready to pay",
      changes: [{ label: "Recipient", before: "nope", after: A }],
    });
  });

  it("shows a left-out line as one line to undo", () => {
    const v = view(csv(`INV-1,USDC,nope,1`, `INV-2,USDC,${A},2`), leaveOut(NO_EDITS, 2));
    expect(v.cards[0]).toMatchObject({ state: "left-out", heading: "Line 2 · INV-1 · left out of this run", blocking: false });
  });

  it("orders cards by line alone, so a card never moves when its state changes", () => {
    const v = view(csv(`INV-1,USDC,${A},1`, `INV-2,USDC,${A},1`, `INV-3,USDT,${A},1`));
    expect(v.cards.map((c) => [c.line, c.blocking])).toEqual([[3, false], [4, true]]);
  });
});

describe("fixList: the list as a whole", () => {
  it("counts what stops the run, what is fixed and what is left out", () => {
    const text = csv(`INV-1,USDT,${A},1`, `INV-2,USDC,nope,2`, `INV-3,USDC,${A},x`);
    const e = leaveOut(withEdits(NO_EDITS, [{ line: 3, field: "to", text: A }]), 4);
    const v = view(text, e);
    expect(v.counts).toBe("1 line stops this run · 1 fixed · 1 left out");
    expect(v.title).toBe("Fix these lines");
    expect(v.summary).toBe("1 problem stops this run from being paid. Fix it below, or in your file and choose it again.");
    expect(v.fixFirst).toBe("Fix 1 problem first");
    expect(v.firstOpen).toBe("fix-line-2");
  });

  it("points the first-problem button at a blocking group before any card", () => {
    const v = view(csv(`INV-1,USDC,nope,1`, `INV-2,USD,${A},2`, `INV-3,USD,${A},3`, `INV-4,USD,${A},4`));
    expect(v.firstOpen).toBe(v.groups[0]!.id);
  });

  it("names a file-level problem with no card, and asks for another file", () => {
    const v = view(`id,coin\n1,2`);
    expect(v.cards).toEqual([]);
    expect(v.fileProblems).toHaveLength(1);
    expect(v.summary).toBe("1 problem stops this run from being paid. Fix it in the file and choose it again.");
    expect(v.firstOpen).toBe("fix-list");
  });

  it("with only warnings, asks for a second look and blocks nothing", () => {
    const v = view(csv(`INV-1,USDC,${A},1`, `INV-2,USDC,${A},2`));
    expect(v.title).toBe("Check these lines");
    expect(v.summary).toBe("Worth a second look before paying. They do not stop the run.");
    expect(v.fixFirst).toBeUndefined();
  });

  it("with only changes, lists them under 'Your changes'", () => {
    const v = view(csv(`INV-1,USDC,nope,1`), withEdits(NO_EDITS, [{ line: 2, field: "to", text: A }]));
    expect(v.title).toBe("Your changes");
    expect(v.blocking).toBe(0);
  });

  it("is empty for a clean file", () => {
    expect(view(csv(`INV-1,USDC,${A},1`))).toEqual({ fileProblems: [], groups: [], cards: [], blocking: 0, firstOpen: "fix-list" });
  });
});
```

In `frontend/test/plain-language.test.ts`, add these imports:

```ts
import { fixList, RECIPIENT_HELP } from "@/lib/fix-list";
import { checkRows } from "@/lib/review-view";
import { NO_EDITS, changesText, correctionReminder } from "@/lib/run-edits";
```

Then, inside the loop over texts (after the existing `reviewView` lines), add:

```ts
      const source = parseCsv(text);
      const f = fixList({ checked: checkRows(source, NO_EDITS, TOKENS, DECIMALS), source, edits: NO_EDITS, tokens: TOKENS });
      [f.title, f.summary, f.counts, f.fixFirst, ...f.fileProblems].forEach(plain);
      for (const g of f.groups) { plain(g.title); plain(g.lead); g.actions.forEach((a) => { plain(a.label); plain(a.applied.title); }); }
      for (const c of f.cards) { plain(c.heading); c.messages.forEach((m) => plain(m.text)); c.fields.forEach((x) => plain(x.help)); }
```

Add `";"` group texts to the loop's array:

```ts
      `invoiceId;token;to;amount\nINV-1;EURC;${A};1.000\nINV-2;EURC;${A};2.000\nINV-3;EURC;${A};3.000`,
      `invoiceId,token,to,amount\nINV-1,USD,${A},1\nINV-2,USD,${A},2\nINV-3,USD,${A},3`,
```

After the loop, add:

```ts
    plain(RECIPIENT_HELP);
    plain(changesText({ edited: 3, leftOut: 1 }));
    plain(correctionReminder({ edited: 3, leftOut: 1 }));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/fix-list.test.ts`
Expected: FAIL: cannot resolve `@/lib/fix-list`.

- [ ] **Step 3: Implement `frontend/lib/fix-list.ts`**

```ts
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
    if (own.length > 0) {
      const fields = row.unreadable ? FIELDS : FIELDS.filter((f) => own.some((p) => p.field === f));
      cards.push({
        ...base, state: "open", heading,
        messages: own.map((p) => ({ text: p.message, level: p.level })),
        fields: fields.map((f) => fieldFix(line, f, own.find((p) => p.field === f))),
        ...(row.unreadable ? { unreadableText: row.unreadable.text } : {}),
        blocking: own.some((p) => p.level === "error"),
      });
      continue;
    }
    const edited = (Object.keys(edits.cells[line] ?? {}) as CsvField[]).filter((f) => !byGroup.get(line)?.has(f));
    if (edited.length === 0) continue;
    cards.push({
      ...base, state: "fixed",
      heading: `${heading} · ${all.length === 0 ? "ready to pay" : "changed"}`,
      changes: edited.map((f) => ({
        label: LABEL[f], before: orig.unreadable ? "" : orig[ROW_KEY[f]], after: after(line, f),
      })),
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
```

Note on the order of `groups`: applied groups come first. An applied group keeps the id its open card had (the open card's `-more` suffix only appears if the same problem comes back on three new lines), so React keeps the element in place when it turns applied.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all pass. If a test on examples or labels fails, fix the implementation, not the expected copy. The copy is the spec.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/fix-list.ts frontend/test/fix-list.test.ts frontend/test/plain-language.test.ts
git commit -m "feat(web): the problem list groups a repeated problem and keeps each card in place

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Review step UI

**Files:**
- Create: `frontend/app/(app)/new/FixList.tsx`, `frontend/app/(app)/new/LineCard.tsx`, `frontend/lib/save-file.ts`
- Modify: `frontend/app/(app)/new/CreateRun.tsx`, `StepUpload.tsx`, `StepPreview.tsx`, `Result.tsx` (import `saveFile` only), `frontend/app/styles/tape.css`, `frontend/lib/review-view.ts`, `frontend/test/review-view.test.ts`, `frontend/test/plain-language.test.ts`
- Delete: `frontend/app/(app)/new/ReviewIssues.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3–5.
- Produces:
  - In `CreateRun.tsx`: `interface RunBase { text: string; source: ParsedCsv; sourceName: string; runLabel: string; tokens: TokenSet; decimals: Record<string, number>; symbols: Record<string, string> }` and `interface RunDraft extends RunBase, CheckedFile { edits: RunEdits }`
  - `StepUpload` prop `onReady: (base: RunBase) => void`
  - `StepPreview` prop `onEdits: (edits: RunEdits) => void`
  - `saveFile(name: string, text: string, type: string): void` in `frontend/lib/save-file.ts`

- [ ] **Step 1: Move `saveFile` out of `Result.tsx`**

Create `frontend/lib/save-file.ts` with the function and its comment exactly as they are in `Result.tsx`:

```ts
/** Hand the payer a file. The object URL is revoked a tick later, not
 *  straight after click(): some browsers start the download asynchronously
 *  and a URL revoked first saves nothing. */
export function saveFile(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
```

In `Result.tsx`, delete the local function and add `import { saveFile } from "@/lib/save-file";`.

- [ ] **Step 2: `CreateRun.tsx`: the draft becomes derived**

Replace the `RunDraft` interface and the draft state:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedCsv, RunOutcome, TokenSet } from "@ledgerline/core";
import { checkRows, type CheckedFile } from "@/lib/review-view";
import { NO_EDITS, type RunEdits } from "@/lib/run-edits";

/** What the Upload step hands over: the file as read, never written to. */
export interface RunBase {
  text: string;
  source: ParsedCsv;
  /** The file's name, or PASTED_ROWS. */
  sourceName: string;
  runLabel: string;
  /** Fixed at upload, with the decimals read for them. */
  tokens: TokenSet;
  decimals: Record<string, number>;
  symbols: Record<string, string>;
}

/** The run as Review shows it: the file, the payer's edits over it, and
 *  everything checked from the two. */
export interface RunDraft extends RunBase, CheckedFile {
  edits: RunEdits;
}
```

(Drop the now-unused `ResolvedRow, CsvIssue, RowIssue, ParsedRow` imports.) In the component:

```ts
  const [base, setBase] = useState<RunBase>();
  const [edits, setEdits] = useState<RunEdits>(NO_EDITS);
  const draft = useMemo<RunDraft | undefined>(
    () => base && { ...base, edits, ...checkRows(base.source, edits, base.tokens, base.decimals) },
    [base, edits],
  );
```

Wire the steps:

```tsx
          {step === 0 && (
            <StepUpload net={net} runLabel={runLabel} onRunLabel={setRunLabel}
              onReady={(b) => { setBase(b); setEdits(NO_EDITS); setStep(1); }} />
          )}
          {step === 1 && draft && (
            <StepPreview
              draft={draft} net={net} onEdits={setEdits}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
              wallet={wallet} walletError={walletError} onConnect={connect}
              wrongChain={wrongChain}
            />
          )}
```

- [ ] **Step 3: `StepUpload.tsx` hands over `RunBase`**

```ts
import { parseCsv, tokensForChain } from "@ledgerline/core";
import type { RunBase } from "./CreateRun";
import { PASTED_ROWS, RUN_FILE_ACCEPT, spreadsheetRefusal } from "@/lib/run-file";
```

Change `onReady`'s type to `(base: RunBase) => void`, drop the `checkRunFile` import, and replace `handle`:

```ts
  const handle = async (name: string, text: string) => {
    setBusy(true);
    setError(undefined);
    try {
      // Decimals come from the chain before any amount is interpreted.
      const { decimals, symbols } = await readTokenMeta(net.defaultRpc, net.chain, net.chain.id);
      onReady({
        text, source: parseCsv(text), sourceName: name, runLabel: runLabel.trim(),
        tokens: tokensForChain(net.chain.id), decimals, symbols,
      });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
```

Update the two callers: `void handle(name, text)` in `receive`, and `void handle(pending.name, pending.text)` in the `Continue with …` button. Replace the literal `"the pasted rows"` in the paste button with `PASTED_ROWS`.

- [ ] **Step 4: `LineCard.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, type GetRef } from "antd";
import type { FieldFix, LineCard } from "@/lib/fix-list";
import type { CellEdit } from "@/lib/run-edits";

type Apply = (changes: CellEdit[], focusUndo: boolean) => void;

/** One field of one line: its input, and a button per reading core found. */
function FieldInput({ line, fix, onApply }: { line: number; fix: FieldFix; onApply: Apply }) {
  const [text, setText] = useState(fix.value);
  // A button or an undo changes the value from outside: follow it.
  const [seen, setSeen] = useState(fix.value);
  if (seen !== fix.value) { setSeen(fix.value); setText(fix.value); }

  const id = `fix-${line}-${fix.field}`;
  const commit = (focusUndo: boolean) => {
    if (text.trim() !== fix.value.trim()) onApply([{ line, field: fix.field, text }], focusUndo);
  };
  return (
    <div className="fix-field">
      {fix.field === "token"
        ? <span className="fix-label">{fix.label}</span>
        : <label className="fix-label" htmlFor={id}>{fix.label}</label>}
      {fix.field !== "token" && (
        <Input
          id={id}
          value={text}
          spellCheck={false}
          autoComplete="off"
          className={fix.field === "to" ? "hex" : undefined}
          inputMode={fix.field === "amount" ? "decimal" : undefined}
          aria-describedby={fix.help ? `${id}-help` : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(false)}
          onPressEnter={() => commit(true)}
        />
      )}
      {fix.choices.length > 0 && (
        <div className="fix-choices" role="group" aria-label={fix.field === "token" ? "Token" : "Read it as"}>
          {fix.choices.map((c) => (
            <Button key={c.label} size="small" onClick={() => onApply([{ line, field: fix.field, text: c.text }], true)}>
              {c.label}
            </Button>
          ))}
        </div>
      )}
      {fix.help && <span id={`${id}-help`} className="because">{fix.help}</span>}
    </div>
  );
}

/**
 * One line's card. It stays where it is when fixed or left out, showing what
 * changed, so nothing moves under the pointer; after a button press focus
 * moves to its own Undo, never to the page.
 */
export default function LineCardView({ card, onApply, onUndo, onLeaveOut, onPutBack }: {
  card: LineCard;
  onApply: (changes: CellEdit[]) => void;
  onUndo: () => void;
  onLeaveOut: () => void;
  onPutBack: () => void;
}) {
  const undoRef = useRef<GetRef<typeof Button>>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (card.state !== "open" && pending.current) {
      pending.current = false;
      undoRef.current?.focus();
    }
  }, [card.state]);
  const apply: Apply = (changes, focusUndo) => { pending.current = focusUndo; onApply(changes); };

  if (card.state === "left-out") {
    return (
      <article id={card.id} className="fix-card left-out">
        <p className="fix-heading">{card.heading}</p>
        <Button size="small" ref={undoRef} onClick={onPutBack}>Undo</Button>
      </article>
    );
  }
  if (card.state === "fixed") {
    return (
      <article id={card.id} className="fix-card fixed">
        <p className="fix-heading"><span aria-hidden="true">✓ </span>{card.heading}</p>
        <dl className="fix-changes">
          {card.changes.map((c) => (
            <div key={c.label}>
              <dt>{c.label}</dt>
              <dd><span className="hex">{c.before || "(empty)"}</span> → <span className="hex">{c.after}</span></dd>
            </div>
          ))}
        </dl>
        <Button size="small" ref={undoRef} onClick={onUndo}>Undo</Button>
      </article>
    );
  }
  return (
    <article id={card.id} className={`fix-card ${card.blocking ? "fail" : "warn"}`} aria-labelledby={`${card.id}-h`}>
      <p id={`${card.id}-h`} className="fix-heading">{card.heading}</p>
      <ul className="fix-messages">
        {card.messages.map((m) => (
          <li key={m.text} className={m.level}>
            <span aria-hidden="true">{m.level === "error" ? "✗ " : "! "}</span>{m.text}
          </li>
        ))}
      </ul>
      {card.unreadableText !== undefined && <pre className="hex fix-raw">{card.unreadableText}</pre>}
      {card.fields.map((f) => <FieldInput key={f.field} line={card.line} fix={f} onApply={apply} />)}
      <Button size="small" type="text" onClick={() => { pending.current = true; onLeaveOut(); }}>
        Leave out of this run
      </Button>
    </article>
  );
}
```

- [ ] **Step 5: `FixList.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button, type GetRef } from "antd";
import type { FixListView, GroupAction, GroupCard } from "@/lib/fix-list";
import {
  applyGroup, leaveOut, putBack, undoGroup, undoLine, withEdits, type CellEdit, type RunEdits,
} from "@/lib/run-edits";
import LineCardView from "./LineCard";

const SHOWN = 25;

function GroupCardView({ group, onApply, onApplyOne, onUndo }: {
  group: GroupCard;
  onApply: (a: GroupAction) => void;
  onApplyOne: (changes: CellEdit[]) => void;
  onUndo: () => void;
}) {
  const [shown, setShown] = useState(false);
  const undoRef = useRef<GetRef<typeof Button>>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (group.state === "applied" && pending.current) {
      pending.current = false;
      undoRef.current?.focus();
    }
  }, [group.state]);

  if (group.state === "applied") {
    return (
      <article id={group.id} className="fix-card fixed">
        <p className="fix-heading"><span aria-hidden="true">✓ </span>{group.title}</p>
        <Button size="small" ref={undoRef} onClick={onUndo}>Undo</Button>
      </article>
    );
  }
  return (
    <article id={group.id} className={`fix-card ${group.blocking ? "fail" : "warn"}`} aria-labelledby={`${group.id}-h`}>
      <p id={`${group.id}-h`} className="fix-heading">{group.title}</p>
      <ul className="fix-examples">{group.examples.map((e) => <li key={e} className="hex">{e}</li>)}</ul>
      <div className="fix-choices">
        {group.lead && <span>{group.lead}</span>}
        {group.actions.map((a) => (
          <Button key={a.label} size="small" onClick={() => { pending.current = true; onApply(a); }}>{a.label}</Button>
        ))}
      </div>
      <Button type="link" size="small" aria-expanded={shown} onClick={() => setShown(!shown)}>
        {shown ? "Hide the lines" : `Show the ${group.lines.length} lines`}
      </Button>
      {shown && (
        <ul className="fix-rows">
          {group.rows.map((r) => (
            <li key={r.line}>
              <span className="hex">line {r.line}: {r.raw || "(empty)"}</span>
              {r.choices.map((c) => (
                <Button key={c.label} size="small"
                  onClick={() => onApplyOne([{ line: r.line, field: group.field, text: c.text }])}>
                  {c.label}
                </Button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** The Review step's problems, as cards to work down (spec 2026-09-26 §4). */
export default function FixList({ view, edits, onEdits }: {
  view: FixListView; edits: RunEdits; onEdits: (e: RunEdits) => void;
}) {
  const [all, setAll] = useState(false);
  const [said, setSaid] = useState("");
  // Each card's state on the last render, so a card that just turned ready is announced.
  const before = useRef(new Map<string, string>());
  useEffect(() => {
    for (const c of view.cards) {
      if (c.state === "fixed" && before.current.get(c.id) === "open") setSaid(`Line ${c.line} is ready to pay`);
    }
    for (const g of view.groups) {
      if (g.state === "applied" && before.current.get(g.id) === "open") setSaid(`${g.lines.length} lines changed`);
    }
    before.current = new Map([...view.cards, ...view.groups].map((x) => [x.id, x.state]));
  }, [view]);

  if (view.fileProblems.length + view.groups.length + view.cards.length === 0) return null;
  const cards = all ? view.cards : view.cards.slice(0, SHOWN);
  return (
    <section id="fix-list" className="fix-list" aria-labelledby="fix-list-title" tabIndex={-1}>
      <h2 id="fix-list-title" className="label">{view.title}</h2>
      {view.counts && <p className="fix-counts">{view.counts}</p>}
      {view.summary && <p className="because">{view.summary}</p>}
      {view.fileProblems.length > 0 && (
        <ul className="ladder">
          {view.fileProblems.map((m) => (
            <li key={m} className="rung fail">
              <span className="claim">This file</span>
              <span className="mark" aria-hidden="true">✗</span>
              <span className="because">{m}</span>
            </li>
          ))}
        </ul>
      )}
      {view.groups.map((g) => (
        <GroupCardView key={g.id} group={g}
          onApply={(a) => onEdits(applyGroup(edits, a))}
          onApplyOne={(changes) => onEdits(withEdits(edits, changes))}
          onUndo={() => onEdits(undoGroup(edits, g.key))} />
      ))}
      {cards.map((c) => (
        <LineCardView key={c.id} card={c}
          onApply={(changes) => onEdits(withEdits(edits, changes))}
          onUndo={() => onEdits(undoLine(edits, c.line))}
          onLeaveOut={() => onEdits(leaveOut(edits, c.line))}
          onPutBack={() => onEdits(putBack(edits, c.line))} />
      ))}
      {!all && view.cards.length > SHOWN && (
        <Button type="link" onClick={() => setAll(true)}>Show {view.cards.length - SHOWN} more</Button>
      )}
      <p className="sr-only" aria-live="polite">{said}</p>
    </section>
  );
}
```

- [ ] **Step 6: `StepPreview.tsx`**

Imports: drop `reviewView` and `ReviewIssues`; add:

```ts
import { Alert, Button, Popconfirm, Table, type TableColumnsType } from "antd";
import { fixList } from "@/lib/fix-list";
import { changeCounts, type RunEdits } from "@/lib/run-edits";
import { correctedFile } from "@/lib/corrected-file";
import { saveFile } from "@/lib/save-file";
import FixList from "./FixList";
```

Above the component:

```ts
/** Bring the first problem to the payer: scrolled to, its first field focused. */
function focusFirst(id: string) {
  const el = document.getElementById(id) ?? document.getElementById("fix-list");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  (el.querySelector<HTMLElement>("input, button") ?? el).focus({ preventScroll: true });
}
```

Add `onEdits: (edits: RunEdits) => void;` to the props and destructure it. Replace the `review`/`blocking` lines with:

```ts
  const fix = fixList({ checked: draft, source: draft.source, edits: draft.edits, tokens: draft.tokens });
  const blocking = fix.blocking;
  const changes = changeCounts(draft.edits);
  const changed = changes.edited + changes.leftOut;
  const editedLines = new Set(Object.keys(draft.edits.cells).map(Number));
```

Line column:

```ts
    {
      title: "Line", dataIndex: "line", width: 70,
      render: (line: number) => editedLines.has(line)
        ? <>{line} <span className="edited-mark" title="Edited here" aria-label="edited here">✎</span></>
        : line,
    },
```

Replace `<ReviewIssues view={review} />` with:

```tsx
      <FixList view={fix} edits={draft.edits} onEdits={onEdits} />
```

Replace the action row's first button and the blocking button:

```tsx
      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {changed > 0 ? (
          <Popconfirm
            title={`Discard your ${changed} ${changed === 1 ? "edit" : "edits"}?`}
            okText="Discard" cancelText="Keep editing" onConfirm={onBack}>
            <Button>Choose another file</Button>
          </Popconfirm>
        ) : (
          <Button onClick={onBack}>Choose another file</Button>
        )}
        {changes.edited > 0 && (
          <Button onClick={() => { const f = correctedFile(draft); saveFile(f.name, f.text, f.type); }}>
            Download the corrected file
          </Button>
        )}
        {blocking > 0 ? (
          <Button type="primary" onClick={() => focusFirst(fix.firstOpen)}>{fix.fixFirst}</Button>
        ) : wallet ? (
```

(The rest of the ternary is unchanged.)

- [ ] **Step 7: Styles**

Append to `frontend/app/styles/tape.css`:

```css
/* Fix cards on the Review step (spec 2026-09-26 §4). */
.fix-list:focus { outline: none; }
.fix-counts { margin: 0 0 6px; font-family: var(--font-mono), ui-monospace, monospace; font-size: 0.87rem; }
.fix-card { display: grid; gap: 8px; justify-items: start; margin-top: 10px; padding: 10px 12px; border: 1.5px solid var(--rule); }
.fix-card.fail { border-color: var(--ribbon); }
.fix-card.warn { border-style: dashed; }
.fix-card:is(.fixed, .left-out) { border-style: dotted; color: var(--ink-soft); }
.fix-heading { margin: 0; font-weight: 500; overflow-wrap: anywhere; }
.fix-messages, .fix-examples, .fix-rows { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.fix-messages .error { color: var(--ribbon); }
.fix-messages li, .fix-examples li { overflow-wrap: anywhere; }
.fix-field { display: grid; gap: 4px; width: 100%; }
.fix-label { font-size: 0.87rem; }
.fix-choices { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.fix-changes { display: grid; gap: 2px; margin: 0; }
.fix-changes div { display: flex; flex-wrap: wrap; gap: 6px; }
.fix-changes dd { margin: 0; overflow-wrap: anywhere; }
.fix-raw { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.fix-rows li { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.edited-mark { margin-left: 4px; }
```

- [ ] **Step 8: Delete what the list replaced**

- Delete `frontend/app/(app)/new/ReviewIssues.tsx`.
- In `frontend/lib/review-view.ts`, delete `ReviewItem`, `ReviewView` and `reviewView`. Delete `CheckedFile.issues`, `errors` and `warnings`, and their lines in `checkRows`, if nothing else reads them. Check with `grep -rn "\.errors\|\.warnings\|\.issues" frontend/app frontend/lib`. `StepPreflight` reads only `draft.rows`.
- In `frontend/test/review-view.test.ts`, delete `describe("reviewView", …)` and the `viewOf` helper. `fix-list.test.ts` now covers ordering, singular and plural, warnings-only and the clean file.
- In `frontend/test/plain-language.test.ts`, delete the `reviewView` import and the two lines that call it in the loop (`const v = reviewView(…)` and the `plain(v.…)` / `v.items` lines). The `fixList` lines from Task 5 replace them. Add:

```ts
    for (const label of ["Leave out of this run", "Undo", "Download the corrected file", "Choose another file",
      "Show the 3 lines", "Hide the lines", "Keep editing", "Discard your 3 edits?"]) plain(label);
```

- [ ] **Step 9: Run everything**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all pass. If `GetRef<typeof Button>` does not type-check under antd 6.6.5, read `node_modules/antd/es/_util/type.d.ts` for the exported name and use it. Do not use `any`.

- [ ] **Step 10: Commit**

```bash
git add -A frontend/app frontend/lib frontend/test
git commit -m "feat(web): problem lines are fixed on the Review step, one by one or many at once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The side summary and the Result reminder

**Files:**
- Modify: `frontend/lib/run-summary-view.ts`, `frontend/app/(app)/new/RunSummary.tsx`, `frontend/app/(app)/new/CreateRun.tsx`, `frontend/app/(app)/new/Result.tsx`
- Test: `frontend/test/run-summary-view.test.ts`

**Interfaces:**
- Consumes: `changeCounts`, `changesText`, `correctionReminder` (Task 3); `correctedFile` (Task 4); `saveFile` (Task 6).
- Produces: `runSummaryView(runLabel, src, tokenOrder, decimals, symbols, changes?: { edited: number; leftOut: number })` returns `RunSummaryView` with `changes?: string`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/test/run-summary-view.test.ts` (keep its existing imports and add `runSummaryView` if it is not there):

```ts
describe("runSummaryView: changes made here", () => {
  it("says what was changed here, so the list being signed is visibly not the file", () => {
    const v = runSummaryView("Payroll", { items: [] }, [], {}, {}, { edited: 3, leftOut: 1 });
    expect(v.changes).toBe("3 lines edited here · 1 left out");
  });
  it("says nothing without changes", () => {
    expect(runSummaryView("Payroll", { items: [] }, [], {}, {}).changes).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run test/run-summary-view.test.ts`
Expected: FAIL: `changes` is undefined.

- [ ] **Step 3: Implement**

`frontend/lib/run-summary-view.ts`:

```ts
import { changesText } from "@/lib/run-edits";

export interface RunSummaryView { name: string; payments: string; toPay: string[]; runId?: string; changes?: string }
```

Add the parameter `changes?: { edited: number; leftOut: number }` to `runSummaryView`, and return `changes: changes && changesText(changes)` alongside the existing fields.

`RunSummary.tsx`, after the `Payments` row:

```tsx
        {view.changes && (<><dt>Changed here</dt><dd>{view.changes}</dd></>)}
```

`CreateRun.tsx`: import `changeCounts` from `@/lib/run-edits` and pass `changeCounts(edits)` as the last argument of `runSummaryView(…)`.

`Result.tsx`: add these imports:

```ts
import { changeCounts, correctionReminder } from "@/lib/run-edits";
import { correctedFile } from "@/lib/corrected-file";
```

In the component body:

```ts
  const reminder = correctionReminder(changeCounts(draft.edits));
```

Render this just before the run file download block:

```tsx
      {reminder && (
        <Alert
          style={{ marginTop: 18 }}
          type="info"
          showIcon
          title={reminder}
          action={
            <Button size="small" onClick={() => { const f = correctedFile(draft); saveFile(f.name, f.text, f.type); }}>
              Download the corrected file
            </Button>
          }
        />
      )}
```

Add `plain(runSummaryView("P", { items: [] }, [], {}, {}, { edited: 1, leftOut: 1 }).changes); plain("Changed here");` to the plain-language test's create-flow case.

- [ ] **Step 4: Run everything**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/run-summary-view.ts frontend/app frontend/test
git commit -m "feat(web): the summary names changes made here, and Result offers the corrected file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Browser acceptance, and the spec brought in line

**Files:**
- Create (git-ignored): `.superpowers/ux-audit/fix-*.csv` fixtures
- Modify: `docs/superpowers/specs/2026-09-26-inline-row-fixes-design.md`

No new product code unless a check below fails. If one fails, fix it in the task that owns the code, re-run that task's tests, and commit as `fix(web): …`.

- [ ] **Step 1: Build and start**

Run: from the repo root `pnpm build`. Then, in `frontend/`, run `pnpm start -p 3055` in the background.
Expected: `✓ Ready`.

- [ ] **Step 2: Fixtures**

Write `.superpowers/ux-audit/fix-numbers.csv`: a `;` file of 10 lines where 9 amounts look like `1.000` in EURC, line 11 has recipient `vitalik.eth`, and one line has extra columns `Name` and `Note`. Write `.superpowers/ux-audit/fix-crlf.csv`: a BOM and CRLF file with one `USD` token line.

- [ ] **Step 3: Drive it, at 1280 and at 390**

Feed each file through the page's file input (the `DataTransfer` approach, since the Playwright tool reads only in-repo files) and check, in order:

1. `fix-numbers.csv` → Review shows one group card `9 amounts like 1.000 could be read two ways.` → press `All are thousands` → the card reads `✓ 9 amounts read as thousands.` and focus is on its `Undo` → the 9 lines are in the table with `✎` → `Undo` brings the group back.
2. On line 11's card, type the good address and click straight into the next card's input. The card turns `✓ … ready to pay` in place, and the click lands in the input you aimed at: `document.activeElement.id` is that input's id.
3. `Leave out of this run` on a line, then `Undo`.
4. With a problem left, `Fix 1 problem first` scrolls to it and focuses its first input.
5. `Download the corrected file` → read the download → the left-out line is there unchanged, amounts are written `1000`, the extra columns are intact → drop it back → only the left-out line's problem shows.
6. `Choose another file` asks `Discard your N edits?`.
7. `fix-crlf.csv` → change the token → download → compare bytes: only that line differs, with the BOM and `\r\n` kept.
8. `document.documentElement.scrollWidth <= innerWidth` at both widths. axe (`.playwright-mcp/axe.min.js`) reports no violations on the Review step.

- [ ] **Step 4: Bring the spec in line with what was built**

In `docs/superpowers/specs/2026-09-26-inline-row-fixes-design.md`:
- §3.1: `resolveRows(rows, tokens, decimals, delimiter)`. The delimiter is the last parameter, with default `","`, so existing callers are unchanged.
- §4.2 and §4.3: a token is chosen with one button per chain token, not a select. There are only three tokens, and buttons need one press fewer.
- §4.2: in a `,` or tab file, `1,000` is refused with both readings (a comma-decimal sheet can write it). It groups as `comma-or-thousands` with `All are thousands` and `All are decimals`.

- [ ] **Step 5: Stop the server, clean up, commit**

Stop the server. Empty `.playwright-mcp/` except `axe.min.js`.

```bash
git add docs/superpowers/specs/2026-09-26-inline-row-fixes-design.md
git commit -m "docs: the inline fixes spec matches what was built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
