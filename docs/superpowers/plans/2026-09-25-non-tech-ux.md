# Plain-User Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A payer who is not technical reaches paid receipts without a dead end, a raw error or a word they cannot act on; a recipient reads their receipt at a glance.

**Architecture:** The CSV reader and core's user-facing messages change in `packages/core` so every caller reads a file the same way. Everything a screen says is built by small pure functions in `frontend/lib/` with unit tests; components only lay them out. The audit's own Playwright scenarios are the acceptance test.

**Tech Stack:** TypeScript, viem 2.56, vitest 2, Next.js 16.3.5 (App Router), React 19.3, antd 6.6.5, Playwright (MCP) for the browser pass.

**Spec:** `docs/superpowers/specs/2026-09-25-non-tech-ux-design.md` — read it before any task.

## Global Constraints

- Nothing in `CLAUDE.md`'s invariants changes. `packages/core/src/execute.ts` and `packages/core/src/build.ts` are not edited.
- The interface stays English. Screen copy passes `frontend/test/plain-language.test.ts` (no manifest, anchor, salt, merkle, preflight, commit, root, run label).
- No new dependencies.
- An amount is never guessed: a `,` file takes `1250.50`; a `;` file takes `1250,50` and refuses any `.`.
- Rules in `frontend/app/styles/` that set `font-*` or `display` on something antd also styles start with `html`.
- External links, exactly: `https://metamask.io/download`, `https://rabby.io`, `https://faucet.circle.com`.
- One commit per task, conventional prefix, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Browser checks: from the repo root `pnpm build`, then `pnpm start -p 3055` in `frontend/` (run in the background; stop it after). Playwright scripts live in `.superpowers/ux-audit/` (git-ignored) — the Playwright tool only reads files inside the repo.

## Review Focus

1. **A spreadsheet row with a trailing delimiter** (`INV-1,USDC,0x…,10,`) under a header that ends in an empty column name — the row must still be read, not refused for its column count. Test in Task 1.
2. **A `;` file whose invoice references contain commas** (`INV,1;USDC;0x…;0,10`) — the comma is data there; the row must read as invoice `INV,1`, amount `0.10`. Test in Task 1.
3. **A wallet cancellation buried inside viem's error** (`{ shortMessage, cause: { code: 4001 } }`) — it must still read as "You cancelled", never as a failure. Test in Task 8.
4. **A hash pasted with spaces, a newline or capital hex, or an address pasted instead** — the first opens the run; the 40-character address is refused with the hint. Test in Task 11.
5. **The receipt when the block cannot be read** — the PAID line is left out and the verdict still shows. Checked in Task 13 by failing the block request in the browser.

---

## File map

| File | Change |
|---|---|
| `packages/core/src/csv.ts` | delimiter, columns by name, decimal comma, plain messages |
| `packages/core/src/validate.ts` | plain messages |
| `packages/core/src/verify.ts` | one receipt sentence |
| `packages/core/test/csv.test.ts`, `validate.test.ts`, `verify.test.ts` | new cases, updated matchers |
| `frontend/lib/run-label.ts` | new: `defaultRunLabel` |
| `frontend/lib/review-view.ts` | new: `reviewView` |
| `frontend/lib/wallet-help.ts` | new: `noWalletHelp`, `WALLET_INSTALL`, `FAUCET_URL` |
| `frontend/lib/pay-copy.ts` | new: `isCancelled`, `CANCELLED`, `BLOCKED_COPY`, `FEE_ADVICE`, `CHECK_FAILED`, `RUN_FILE_COPY` |
| `frontend/lib/tx-hash.ts` | new: `isTxHash`, `TX_HASH_HINT` |
| `frontend/lib/chain.ts` | `chainName` |
| `frontend/lib/funding-view.ts` | `topUpHint` |
| `frontend/lib/receipt-view.ts` | `paidAtText` |
| `frontend/lib/wallet.ts` | `NoWalletError` |
| `frontend/components/NoWalletDialog.tsx` | new |
| `frontend/components/OpenRunByHash.tsx` | new |
| `frontend/components/ui/TechnicalDetails.tsx` | new |
| `frontend/components/ui/StatTile.tsx` | untouched |
| `frontend/components/wallet/WalletProvider.tsx` | no-wallet dialog, chain name in switch error |
| `frontend/app/(app)/new/*` | CreateRun, StepUpload, CsvHelp, StepPreview, ReviewIssues (new), StepPreflight, StepSend, Result |
| `frontend/app/(public)/r/[txHash]/Receipt.tsx` | FROM and PAID |
| `frontend/app/(app)/run/[txHash]/Reconciliation.tsx` | invoice cell |
| `frontend/app/(app)/dashboard/Dashboard.tsx`, `frontend/app/(app)/runs/RunHistory.tsx` | hash input |
| `frontend/app/(public)/page.tsx` | order, need line, chips |
| `frontend/app/styles/shell.css`, `tape.css`, `antd.css`, `base.css`, `pages.css` | phone classes, wrapping, small new classes |
| `frontend/test/*` | new tests per task; `plain-language.test.ts` and `tape.test.ts` extended |

---

### Task 1: Core reads a spreadsheet's CSV

**Files:**
- Modify: `packages/core/src/csv.ts` (the `ParsedCsv` type, `COLUMNS`, `parseCsv`, `splitLine`)
- Test: `packages/core/test/csv.test.ts`

**Interfaces:**
- Produces: `parseCsv(text: string): ParsedCsv` where `ParsedCsv = { rows: ParsedRow[]; issues: CsvIssue[]; delimiter: "," | ";" }`. `ParsedRow.amount` is always dot-decimal text (a `;` file's `0,10` arrives as `"0.10"`).

- [ ] **Step 1: Write the failing tests** — append to `packages/core/test/csv.test.ts` inside the first `describe("parseCsv", …)` block (the block that holds "rejects a file whose header names are wrong"), and replace that test's last line:

```ts
  // replaces: expect(issues[0]!.message).toMatch(/invoiceId,token,to,amount/);
    expect(issues[0]!.message).toMatch(/Missing: invoiceId, token\./);
```

```ts
  it("maps columns by name, in any order, through a spreadsheet's own names", () => {
    const { rows, issues, delimiter } = parseCsv(
      `Amount,Recipient,Invoice ID,Currency\n12.50,0xe48A096B9E74f064b13c17734af29F85E02d732a,INV-1,USDC`,
    );
    expect(issues).toEqual([]);
    expect(delimiter).toBe(",");
    expect(rows[0]).toEqual({
      line: 2, invoiceId: "INV-1", tokenSymbol: "USDC",
      to: "0xe48A096B9E74f064b13c17734af29F85E02d732a", amount: "12.50",
    });
  });

  it("ignores a column it does not know, such as a name", () => {
    const { rows, issues } = parseCsv(
      `Name,invoiceId,token,to,amount\n"Nguyen, An",INV-1,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,5`,
    );
    expect(issues).toEqual([]);
    expect(rows[0]!.invoiceId).toBe("INV-1");
    expect(rows[0]!.amount).toBe("5");
  });

  it("reads a row with a trailing delimiter under a header that has one too", () => {
    const { rows, issues } = parseCsv(
      `invoiceId,token,to,amount,\nINV-1,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,10,`,
    );
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it("refuses a file where two columns could be the same field", () => {
    const { rows, issues } = parseCsv(`invoiceId,token,to,Amount,Value\na,b,c,1,2`);
    expect(rows).toEqual([]);
    expect(issues[0]!.message).toBe('Two columns could be the amount: "Amount" and "Value". Keep one.');
  });

  it("names what is missing and what it found", () => {
    const { issues } = parseCsv(`Invoice ID,Token,Recipient,Salary\na,b,c,1`);
    expect(issues[0]).toEqual({
      line: 1,
      message: "The first line must name the columns invoiceId, token, to and amount, in any order. Missing: amount. Found: Invoice ID, Token, Recipient, Salary.",
    });
  });

  it("reads a semicolon file and its decimal commas", () => {
    const { rows, issues, delimiter } = parseCsv(
      `invoiceId;token;to;amount\nINV,1;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;0,10`,
    );
    expect(issues).toEqual([]);
    expect(delimiter).toBe(";");
    expect(rows[0]!.invoiceId).toBe("INV,1");
    expect(rows[0]!.amount).toBe("0.10");
  });

  it("refuses a dot in a semicolon file's amount, since 1.000 may mean a thousand", () => {
    const text = `invoiceId;token;to;amount
INV-1;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;1.000
INV-2;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;1,000,50
INV-3;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a;2`;
    const { rows, issues } = parseCsv(text);
    expect(rows.map((r) => r.invoiceId)).toEqual(["INV-3"]);
    expect(issues.map((i) => i.line)).toEqual([2, 3]);
    expect(issues[0]!.message).toBe(
      'In a file separated by ";", write amounts with a comma for decimals and no other marks, like 1250,50. Found "1.000".',
    );
  });

  it("says which mark to quote when a semicolon row has the wrong number of values", () => {
    const { issues } = parseCsv(`invoiceId;token;to;amount\nINV-1;USDC;0xe48A096B9E74f064b13c17734af29F85E02d732a`);
    expect(issues[0]!.message).toBe(
      "This line has 3 values but the first line names 4 columns. A value that contains a semicolon needs quotes around it.",
    );
  });
```

Also change the existing "reports a row with the wrong number of columns" test's expectations to add:

```ts
    expect(issues[0]!.message).toBe(
      "This line has 3 values but the first line names 4 columns. A value that contains a comma needs quotes around it.",
    );
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd packages/core && pnpm vitest run test/csv.test.ts`
Expected: FAIL — the new cases fail on the old header rule and on `delimiter` being undefined.

- [ ] **Step 3: Rewrite the reader** — in `packages/core/src/csv.ts`, replace from `export interface ParsedCsv {` through the end of `splitLine` with:

```ts
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
```

Also delete the now-unused `const COLUMNS = ["invoiceid", "token", "to", "amount"] as const;` line.

- [ ] **Step 4: Run the core suite**

Run: `cd packages/core && pnpm vitest run && pnpm tsc --noEmit`
Expected: every test passes, including the old fail-closed ones; no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/csv.ts packages/core/test/csv.test.ts
git commit -m "feat(core): read a spreadsheet's CSV: columns by name, and a semicolon file's decimal commas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Core's messages say what to do

**Files:**
- Modify: `packages/core/src/csv.ts` (`toBaseUnits`, `resolveRows`)
- Modify: `packages/core/src/validate.ts`
- Modify: `packages/core/src/verify.ts:165-166`
- Test: `packages/core/test/csv.test.ts`, `packages/core/test/validate.test.ts`, `packages/core/test/verify.test.ts`

**Interfaces:**
- Produces: `toBaseUnits(text: string, decimals: number, symbol?: string)` — `symbol` only changes the too-many-decimals sentence (default `"this token"`).

- [ ] **Step 1: Write the failing tests** — in `packages/core/test/csv.test.ts`, inside `describe("toBaseUnits")` change the precision test's matcher and add a test:

```ts
  it("refuses more precision than the token has, rather than rounding", () => {
    const r = toBaseUnits("0.0000001", 6, "USDC");
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toBe(
      '"0.0000001" has 7 decimal places, but USDC has 6. Round it yourself, so the amount paid is exactly what you mean.',
    );
  });

  it("says how to write an amount it cannot read, and what to do with a zero", () => {
    expect(toBaseUnits("1,000", 6)).toEqual({
      ok: false, reason: '"1,000" is not an amount this page can read. Write it with digits and a dot only, like 1000 or 12.50.',
    });
    expect(toBaseUnits("0", 6)).toEqual({
      ok: false, reason: "The amount is zero. Enter the amount owed, or remove this line.",
    });
  });
```

In `describe("resolveRows")` add:

```ts
  it("names the tokens it pays and what an address looks like", () => {
    const { issues } = resolveRows(
      [row({ line: 2, tokenSymbol: "USDT" }), row({ line: 3, to: "vitalik.eth" }), row({ line: 4, invoiceId: "" })],
      TOKENS, DECIMALS,
    );
    expect(issues.map((i) => i.message)).toEqual([
      '"USDT" is not a token this page pays. Use one of: USDC, EURC, cirBTC.',
      '"vitalik.eth" is not a wallet address. Use the full address: 0x followed by 40 letters and digits.',
      "The invoice reference is empty. Every payment needs one.",
    ]);
  });

  it("passes the token's own symbol to the precision message", () => {
    const { issues } = resolveRows([row({ amount: "0.0000001" })], TOKENS, DECIMALS);
    expect(issues[0]!.message).toMatch(/but USDC has 6/);
  });
```

In `packages/core/test/validate.test.ts`, change the zero-address test's matcher from `/zero address/i` to `/nobody owns/`, and add:

```ts
  it("words every refusal as what to do", () => {
    const to = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
    const token = "0x3600000000000000000000000000000000000000";
    const r = validateRun([
      { line: 2, invoiceId: "INV-1", token, to, amount: 1n },
      { line: 3, invoiceId: "INV-1", token, to: "0x0000000000000000000000000000000000000000", amount: 1n },
    ]);
    expect(r.errors.map((e) => e.message)).toEqual([
      "This pays 0x0000…0000, an address nobody owns. Arc refuses the payment. Check the recipient.",
      'Invoice "INV-1" is also on line 2. Give each payment its own invoice reference, or the two cannot be told apart.',
    ]);
    expect(validateRun([]).errors[0]!.message).toBe("This file has no payments in it.");
  });
```

In `packages/core/test/verify.test.ts`, add inside its top-level `describe` (it uses the file's own `input()` and `rung()` helpers):

```ts
  it("explains the invoice match without engineering words", () => {
    expect(rung(verifyReceipt(input()), "invoice_match").detail).toBe(
      "Proven by rebuilding this payment and matching it to the invoice's reference — not by its position or amount.",
    );
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd packages/core && pnpm vitest run test/csv.test.ts test/validate.test.ts test/verify.test.ts`
Expected: FAIL on every new message.

- [ ] **Step 3: Change the words** — in `packages/core/src/csv.ts`:

`toBaseUnits` signature and messages:

```ts
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
```

In `resolveRows`, keep each token's own spelling for messages:

```ts
  const bySymbol = new Map<string, `0x${string}`>(
    Object.entries(tokens).map(([symbol, address]) => [symbol.toLowerCase(), address]),
  );
  const spelled = new Map<string, string>(Object.keys(tokens).map((s) => [s.toLowerCase(), s]));
```

and replace the four messages:

```ts
      issues.push({ line: row.line, message: "The invoice reference is empty. Every payment needs one." });
```
```ts
        message: `"${row.tokenSymbol}" is not a token this page pays. Use one of: ${Object.keys(tokens).join(", ")}.`,
```
```ts
      issues.push({
        line: row.line,
        message: `"${row.to}" is not a wallet address. Use the full address: 0x followed by 40 letters and digits.`,
      });
```
```ts
    const amount = toBaseUnits(row.amount, d, spelled.get(row.tokenSymbol.toLowerCase()));
```

In `packages/core/src/validate.ts` replace the three messages:

```ts
    return { errors: [{ message: "This file has no payments in it." }], warnings };
```
```ts
        message: "This pays 0x0000…0000, an address nobody owns. Arc refuses the payment. Check the recipient.",
```
```ts
        message: `Invoice "${item.invoiceId}" is also on line ${seenInvoice}. Give each payment its own invoice reference, or the two cannot be told apart.`,
```

In `packages/core/src/verify.ts` replace the `invoice_match` detail:

```ts
  at("invoice_match").detail =
    "Proven by rebuilding this payment and matching it to the invoice's reference — not by its position or amount.";
```

- [ ] **Step 4: Run everything that reads these words**

Run: `cd /Users/vanhuy/Desktop/arc-chain && pnpm test && pnpm typecheck`
Expected: core, cli and frontend all pass (`plain-language.test.ts` reads the receipt rungs and must stay clean).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/csv.ts packages/core/src/validate.ts packages/core/src/verify.ts packages/core/test/csv.test.ts packages/core/test/validate.test.ts packages/core/test/verify.test.ts
git commit -m "feat(core): every file and row message says what to do, in plain words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Phone-only classes above antd; nothing widens a page

**Files:**
- Modify: `frontend/app/styles/shell.css:117-118`
- Modify: `frontend/app/styles/tape.css` (the `.verdict p` rule)
- Modify: `frontend/app/styles/antd.css` (alerts section)
- Modify: `frontend/app/styles/base.css:67` (`.raw-reason`)
- Test: `frontend/test/tape.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `frontend/test/tape.test.ts`:

```ts
describe("on a phone and with a long string", () => {
  it("hides antd's step bar on a phone: the phone classes sit above antd", () => {
    // antd's `.ant-steps { display: flex }` is injected later at the same
    // specificity, so a bare `.hide-sm` showed both progress indicators.
    const shell = readFileSync(join(STYLES, "shell.css"), "utf8");
    expect(shell).toMatch(/html \.hide-sm\s*\{\s*display:\s*none;?\s*\}/);
    expect(shell).toMatch(/html \.only-sm\s*\{\s*display:\s*inline-flex;?\s*\}/);
  });

  it("wraps a verdict, an alert's description and a raw reason anywhere", () => {
    // A rejected payment once printed viem's hex and made the page 31,900px wide.
    const css = allCss();
    expect(css).toMatch(/\.verdict p\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/html \.ant-alert-description\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\.raw-reason\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd frontend && pnpm vitest run test/tape.test.ts`
Expected: FAIL on both.

- [ ] **Step 3: Change the rules**

`frontend/app/styles/shell.css`, inside `@media (max-width: 639px)`:

```css
  html .only-sm { display: inline-flex; }
  html .hide-sm { display: none; }
```

(replacing `.only-sm { display: inline-flex; }` and `.hide-sm { display: none; }`).

`frontend/app/styles/tape.css`, the verdict paragraph:

```css
.verdict p { margin: 0; max-width: var(--measure); color: var(--ink-soft); overflow-wrap: anywhere; }
```

`frontend/app/styles/antd.css`, after `html .ant-alert-title { font-weight: 700; }`:

```css
/* A wallet's error can carry unbroken hex; it wraps rather than widening the page. */
html .ant-alert-description { overflow-wrap: anywhere; }
```

`frontend/app/styles/base.css`, the `.raw-reason` rule gains `overflow-wrap: anywhere;`:

```css
.raw-reason { display: block; font-family: var(--font-mono), ui-monospace, monospace; font-stretch: 87%; font-size: 0.92em; overflow-wrap: anywhere; }
```

- [ ] **Step 4: Run the frontend suite and build**

Run: `cd frontend && pnpm vitest run && pnpm typecheck` then `cd .. && pnpm build`
Expected: pass; build prints the route table.

- [ ] **Step 5: Look at it** — start the server (`cd frontend && pnpm start -p 3055`, background) and run in Playwright:

```js
async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3055/new?n=testnet", { waitUntil: "networkidle" });
  return page.evaluate(() => ({
    steps: getComputedStyle(document.querySelector(".ant-steps")).display,
    stepLine: getComputedStyle(document.querySelector(".step-line")).display,
    nameTop: Math.round(document.querySelector("input[placeholder]").getBoundingClientRect().top),
  }));
}
```

Expected: `steps: "none"`, `stepLine: "inline-flex"`, `nameTop` under 400. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/styles/shell.css frontend/app/styles/tape.css frontend/app/styles/antd.css frontend/app/styles/base.css frontend/test/tape.test.ts
git commit -m "fix(web): one progress indicator on a phone, and no string can widen a page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Upload — a prefilled name that survives, and a drop zone that always listens

**Files:**
- Create: `frontend/lib/run-label.ts`
- Modify: `frontend/app/(app)/new/CreateRun.tsx`
- Modify: `frontend/app/(app)/new/StepUpload.tsx` (whole file)
- Modify: `frontend/app/(app)/new/CsvHelp.tsx`
- Modify: `frontend/app/styles/base.css` (add `.field-error`)
- Test: `frontend/test/run-label.test.ts`

**Interfaces:**
- Produces: `defaultRunLabel(now: Date): string`; `StepUpload` props `{ net, runLabel, onRunLabel, onReady }`.

- [ ] **Step 1: Write the failing test** — `frontend/test/run-label.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultRunLabel } from "@/lib/run-label";

describe("defaultRunLabel", () => {
  it("is this month's payroll, month padded", () => {
    expect(defaultRunLabel(new Date(2026, 8, 25))).toBe("Payroll 2026-09");
    expect(defaultRunLabel(new Date(2027, 0, 1))).toBe("Payroll 2027-01");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd frontend && pnpm vitest run test/run-label.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `frontend/lib/run-label.ts`**

```ts
/**
 * The name a new run starts with: this month's payroll, in the local calendar.
 * It is editable, and prefilling it is safe: only the same list under the same
 * name is refused a second time, so a different list this month still pays.
 */
export function defaultRunLabel(now: Date): string {
  return `Payroll ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && pnpm vitest run test/run-label.test.ts`
Expected: PASS.

- [ ] **Step 5: `CreateRun` owns the name** — in `frontend/app/(app)/new/CreateRun.tsx` add the import and state, and pass them down:

```tsx
import { defaultRunLabel } from "@/lib/run-label";
```

```tsx
  // Owned here, so "Choose another file" returns to a filled field. Set after
  // mount: the server's clock and time zone are not the payer's.
  const [runLabel, setRunLabel] = useState("");
  useEffect(() => { setRunLabel((l) => l || defaultRunLabel(new Date())); }, []);
```

```tsx
          {step === 0 && (
            <StepUpload net={net} runLabel={runLabel} onRunLabel={setRunLabel}
              onReady={(d) => { setDraft(d); setStep(1); }} />
          )}
```

- [ ] **Step 6: Rewrite `frontend/app/(app)/new/StepUpload.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { Alert, Button, Input, Upload, type InputRef } from "antd";
import { parseCsv, resolveRows, validateRun, tokensForChain } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import { describeError } from "@/lib/errors";
import type { RunDraft } from "./CreateRun";
import { readTokenMeta } from "@/lib/token-meta";

export default function StepUpload({
  net, runLabel, onRunLabel, onReady,
}: {
  net: NetworkView;
  runLabel: string;
  onRunLabel: (label: string) => void;
  onReady: (draft: RunDraft) => void;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // A file chosen before the run had a name is kept, so it need not be chosen again.
  const [pending, setPending] = useState<{ name: string; text: string }>();
  const [askedForName, setAskedForName] = useState(false);
  const nameRef = useRef<InputRef>(null);
  const named = runLabel.trim().length > 0;

  const handle = async (text: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const { rows, issues } = parseCsv(text);
      // Decimals come from the chain before any amount is interpreted.
      const { decimals, symbols } = await readTokenMeta(net.defaultRpc, net.chain, net.chain.id);
      const resolved = resolveRows(rows, tokensForChain(net.chain.id), decimals);
      const { errors, warnings } = validateRun(resolved.items);
      onReady({
        rows: resolved.items,
        parsed: rows,
        runLabel: runLabel.trim(),
        issues: [...issues, ...resolved.issues],
        errors, warnings, decimals, symbols,
      });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const receive = (name: string, text: string) => {
    if (!runLabel.trim()) {
      setPending({ name, text });
      setAskedForName(true);
      nameRef.current?.focus();
      return;
    }
    void handle(text);
  };

  return (
    <>
      <section className="verdict">
        <h2>A run starts with a file and a name</h2>
        <p>
          The name is what lets the same payroll run again next month. Paying the same
          list twice under the same name is refused on chain, so a double-click or a retry
          can never pay anyone twice.
        </p>
      </section>

      <label style={{ display: "block", marginTop: 22, maxWidth: "32rem" }}>
        <span style={{ display: "block", fontSize: "0.87rem", marginBottom: 6 }}>
          Run name
        </span>
        <Input
          ref={nameRef}
          value={runLabel}
          status={askedForName && !named ? "error" : undefined}
          aria-describedby="run-name-help"
          onChange={(e) => onRunLabel(e.target.value)}
        />
        {askedForName && !named ? (
          <span id="run-name-help" className="because field-error" role="alert">Name the run first</span>
        ) : (
          <span id="run-name-help" className="because">Saved in the run file you download after paying.</span>
        )}
      </label>

      <div style={{ marginTop: 24 }}>
        <Upload.Dragger
          accept=".csv,text/csv"
          showUploadList={false}
          disabled={busy}
          beforeUpload={(file) => {
            const reader = new FileReader();
            reader.onload = () => receive(file.name, String(reader.result));
            reader.readAsText(file);
            return false;
          }}
        >
          <p style={{ margin: "1.4rem 0 0.4rem", fontWeight: 500 }}>
            Drop a CSV, or click to choose one
          </p>
          <p className="because" style={{ margin: "0 0 1.4rem" }}>
            It is read in your browser and never uploaded anywhere.
          </p>
        </Upload.Dragger>
      </div>

      {pending && (
        <div style={{ marginTop: 14 }}>
          <Button type="primary" disabled={!named || busy} loading={busy} onClick={() => void handle(pending.text)}>
            Continue with {pending.name}
          </Button>
        </div>
      )}

      {error && <Alert style={{ marginTop: 18 }} type="error" showIcon title={error} />}
    </>
  );
}
```

`RunDraft` gains `parsed` — in `CreateRun.tsx`:

```tsx
import type { ResolvedRow, CsvIssue, RowIssue, RunOutcome, ParsedRow } from "@ledgerline/core";

export interface RunDraft {
  rows: ResolvedRow[];
  /** Every row as read, by line, so a problem can name its invoice. */
  parsed: ParsedRow[];
  runLabel: string;
  issues: CsvIssue[];
  errors: RowIssue[];
  warnings: RowIssue[];
  decimals: Record<string, number>;
  symbols: Record<string, string>;
}
```

`frontend/app/styles/base.css`, after `p.because { margin-bottom: 0; }`:

```css
.field-error { color: var(--ribbon); }
```

- [ ] **Step 7: CSV help** — in `frontend/app/(app)/new/CsvHelp.tsx` replace the paragraph's first sentence:

```tsx
      <p className="because">
        The first line names the columns, in any order: Recipient or Address also work for
        &ldquo;to&rdquo;. A file separated by semicolons writes amounts like 0,10. Amounts are
        written the way you would write them on an invoice; this page converts them using each
        token&apos;s own decimals, read from the chain.{" "}
        <a href={sampleCsvHref()} download="ledgerline-sample.csv">Download this sample</a>{" "}
        and replace the recipients with your own.
      </p>
```

- [ ] **Step 8: Checks**

Run: `cd frontend && pnpm vitest run && pnpm typecheck`
Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/run-label.ts frontend/test/run-label.test.ts "frontend/app/(app)/new/CreateRun.tsx" "frontend/app/(app)/new/StepUpload.tsx" "frontend/app/(app)/new/CsvHelp.tsx" frontend/app/styles/base.css
git commit -m "feat(web): the run name starts filled and survives a new file; the drop zone always listens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Review — one list of problems, in line order

**Files:**
- Create: `frontend/lib/review-view.ts`
- Create: `frontend/app/(app)/new/ReviewIssues.tsx`
- Modify: `frontend/app/(app)/new/StepPreview.tsx` (the Alerts block and the button row)
- Modify: `frontend/app/styles/tape.css` (add `.rung.warn`)
- Test: `frontend/test/review-view.test.ts`

**Interfaces:**
- Consumes: `RunDraft.parsed` (Task 4).
- Produces: `reviewView({ issues, errors, warnings, parsed }): ReviewView` with `ReviewView = { items: ReviewItem[]; blocking: number; title?: string; summary?: string; fixFirst?: string }` and `ReviewItem = { key: string; where: string; message: string; level: "error" | "warning" }`.

Wording note: the spec's example reads "Fix N lines first". A header problem or "no payments in it" is not a line, so the count and the button say *problems*: `Fix 3 problems first`, `3 problems stop this run from being paid.` Everything else follows the spec.

- [ ] **Step 1: Write the failing test** — `frontend/test/review-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCsv, resolveRows, validateRun, tokensForChain } from "@ledgerline/core";
import { reviewView } from "@/lib/review-view";

const TOKENS = tokensForChain(5042002);
const DECIMALS = {
  [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8,
};
const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

function viewOf(text: string) {
  const { rows, issues } = parseCsv(text);
  const resolved = resolveRows(rows, TOKENS, DECIMALS);
  const { errors, warnings } = validateRun(resolved.items);
  return reviewView({ issues: [...issues, ...resolved.issues], errors, warnings, parsed: rows });
}

describe("reviewView", () => {
  it("lists every problem in line order, naming the line and its invoice", () => {
    const v = viewOf(`invoiceId,token,to,amount
INV-1,USDC,${A},10
INV-2,USDT,${A},10
INV-1,USDC,${A},3
INV-4,EURC,${A},"1,000"`);
    expect(v.items.map((i) => i.where)).toEqual([
      "Line 3 · INV-2", "Line 4 · INV-1", "Line 4 · INV-1", "Line 5 · INV-4",
    ]);
    expect(v.items.map((i) => i.level)).toEqual(["error", "error", "warning", "error"]);
    expect(v.blocking).toBe(3);
    expect(v.title).toBe("Fix these lines");
    expect(v.summary).toBe("3 problems stop this run from being paid. Fix them in the file and choose it again.");
    expect(v.fixFirst).toBe("Fix 3 problems first");
  });

  it("puts a problem with the whole file first, then the lines", () => {
    const v = viewOf(`Invoice ID,Token,Recipient,Salary\na,b,c,1`);
    expect(v.items.map((i) => i.where)).toEqual(["This file", "Line 1"]);
    expect(v.fixFirst).toBe("Fix 2 problems first");
  });

  it("says one problem in the singular", () => {
    const v = viewOf(`invoiceId,token,to,amount\nINV-1,USDC,${A},0`);
    expect(v.summary).toBe("1 problem stops this run from being paid. Fix it in the file and choose it again.");
    expect(v.fixFirst).toBe("Fix 1 problem first");
  });

  it("with only warnings, asks for a second look and blocks nothing", () => {
    const v = viewOf(`invoiceId,token,to,amount\nINV-1,USDC,${A},1\nINV-2,USDC,${A},2`);
    expect(v.blocking).toBe(0);
    expect(v.title).toBe("Check these lines");
    expect(v.fixFirst).toBeUndefined();
  });

  it("is empty for a clean file", () => {
    const v = viewOf(`invoiceId,token,to,amount\nINV-1,USDC,${A},1`);
    expect(v).toEqual({ items: [], blocking: 0 });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd frontend && pnpm vitest run test/review-view.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `frontend/lib/review-view.ts`**

```ts
import type { CsvIssue, ParsedRow, RowIssue } from "@ledgerline/core";

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
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && pnpm vitest run test/review-view.test.ts`
Expected: PASS.

- [ ] **Step 5: The list component** — `frontend/app/(app)/new/ReviewIssues.tsx`:

```tsx
import type { ReviewView } from "@/lib/review-view";

/** The review step's problems, printed as one checklist above the table. */
export default function ReviewIssues({ view }: { view: ReviewView }) {
  if (view.items.length === 0) return null;
  return (
    <section className="review-issues" aria-labelledby="review-issues-title">
      <h2 id="review-issues-title" className="label">{view.title}</h2>
      <p className="because">{view.summary}</p>
      <ul className="ladder">
        {view.items.map((i) => (
          <li key={i.key} className={`rung ${i.level === "error" ? "fail" : "warn"}`}>
            <span className="claim">{i.where}</span>
            <span className="mark" aria-hidden="true">{i.level === "error" ? "✗" : "!"}</span>
            <span className="because">{i.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`frontend/app/styles/tape.css`, after `.rung.skipped …`:

```css
.rung.warn .mark { background: var(--highlight); color: var(--on-highlight); text-align: center; }
.review-issues { margin-bottom: 20px; }
.review-issues .label { margin: 0 0 4px; }
```

- [ ] **Step 6: Use it in `StepPreview.tsx`** — add imports:

```tsx
import { reviewView } from "@/lib/review-view";
import ReviewIssues from "./ReviewIssues";
```

Replace `const blocking = draft.issues.length + draft.errors.length;` with:

```tsx
  const review = reviewView({
    issues: draft.issues, errors: draft.errors, warnings: draft.warnings, parsed: draft.parsed,
  });
  const blocking = review.blocking;
```

Replace the three `.map(… <Alert …/>)` blocks at the top of the returned fragment with `<ReviewIssues view={review} />`.

Replace the button row's `{wallet ? (…) : (…)}` with:

```tsx
        {blocking > 0 ? (
          <Button type="primary" disabled>{review.fixFirst}</Button>
        ) : wallet ? (
          <Button
            type="primary"
            disabled={wrongChain || checkingFunds || shortTokens > 0}
            loading={checkingFunds}
            onClick={onNext}
          >
            {wrongChain
              ? "Switch to Arc first"
              : checkingFunds
                ? "Checking balances"
                : shortTokens > 0
                  ? `Top up ${shortTokens === 1 ? "the short token" : `${shortTokens} tokens`} first`
                  : "Check it against the chain"}
          </Button>
        ) : (
          <Button type="primary" onClick={onConnect}>Connect a wallet to continue</Button>
        )}
```

- [ ] **Step 7: Checks**

Run: `cd frontend && pnpm vitest run && pnpm typecheck`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/review-view.ts frontend/test/review-view.test.ts "frontend/app/(app)/new/ReviewIssues.tsx" "frontend/app/(app)/new/StepPreview.tsx" frontend/app/styles/tape.css
git commit -m "feat(web): the review step's problems as one list in line order, and no wallet prompt for a file that cannot pay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: No wallet — one dialog that says what to get

**Files:**
- Create: `frontend/lib/wallet-help.ts`
- Create: `frontend/components/NoWalletDialog.tsx`
- Modify: `frontend/lib/wallet.ts` (add `NoWalletError`, throw it from `connect`)
- Modify: `frontend/components/wallet/WalletProvider.tsx`
- Test: `frontend/test/wallet-help.test.ts`

**Interfaces:**
- Produces: `NoWalletError extends Error`; `noWalletHelp(network: "mainnet" | "testnet"): { title: string; install: string; funds: string; fundsLink?: { text: string; href: string }; kind: string }`; `WALLET_INSTALL: readonly { name: string; href: string }[]`; `FAUCET_URL: "https://faucet.circle.com"`.

Implementation note: the spec gives `describeConnectError` a third kind. `ConnectError.type` feeds antd's `Alert type` union directly (StepPreview, WalletButton), so a `"no-wallet"` member would not type-check there. The same intent — the dialog is driven by the error's kind — is met by a typed `NoWalletError` that the provider recognises before `describeConnectError` is reached.

- [ ] **Step 1: Write the failing test** — `frontend/test/wallet-help.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { noWalletHelp, WALLET_INSTALL, FAUCET_URL } from "@/lib/wallet-help";

describe("noWalletHelp", () => {
  it("links two wallets and, on testnet, the faucet", () => {
    expect(WALLET_INSTALL).toEqual([
      { name: "MetaMask", href: "https://metamask.io/download" },
      { name: "Rabby", href: "https://rabby.io" },
    ]);
    const t = noWalletHelp("testnet");
    expect(t.title).toBe("You need a browser wallet");
    expect(t.funds).toBe("Get free test tokens at");
    expect(t.fundsLink).toEqual({ text: "faucet.circle.com", href: FAUCET_URL });
  });

  it("on mainnet names USDC for the fee and links nothing unverified", () => {
    const m = noWalletHelp("mainnet");
    expect(m.funds).toBe("Your wallet also needs USDC on Arc mainnet: it pays each run's network fee.");
    expect(m.fundsLink).toBeUndefined();
    expect(m.kind).toMatch(/like Safe/);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd frontend && pnpm vitest run test/wallet-help.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `frontend/lib/wallet-help.ts`**

```ts
/** Where a payer with no wallet goes next. Both links resolved (200) on
 *  2026-09-25; no bridge or swap link is offered, since none is verified. */
export const WALLET_INSTALL = [
  { name: "MetaMask", href: "https://metamask.io/download" },
  { name: "Rabby", href: "https://rabby.io" },
] as const;

export const FAUCET_URL = "https://faucet.circle.com";

export function noWalletHelp(network: "mainnet" | "testnet"): {
  title: string;
  install: string;
  funds: string;
  fundsLink?: { text: string; href: string };
  kind: string;
} {
  return {
    title: "You need a browser wallet",
    install: "Install one, then reload this page:",
    funds: network === "testnet"
      ? "Get free test tokens at"
      : "Your wallet also needs USDC on Arc mainnet: it pays each run's network fee.",
    fundsLink: network === "testnet" ? { text: "faucet.circle.com", href: FAUCET_URL } : undefined,
    kind: "Use an ordinary wallet account. Multisig and smart-contract wallets, like Safe, cannot sign these payments.",
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && pnpm vitest run test/wallet-help.test.ts`
Expected: PASS.

- [ ] **Step 5: A typed error** — in `frontend/lib/wallet.ts`, next to `export class EoaRequiredError extends Error {}`:

```ts
/** No wallet answered discovery: the page shows how to get one, not an error. */
export class NoWalletError extends Error {}
```

and in `connect()` replace the `throw new Error("No wallet found. …")` with:

```ts
    throw new NoWalletError("No wallet found in this browser.");
```

- [ ] **Step 6: The dialog** — `frontend/components/NoWalletDialog.tsx`:

```tsx
"use client";

import { Button, Modal } from "antd";
import { noWalletHelp, WALLET_INSTALL } from "@/lib/wallet-help";

/** Shown by any Connect button when no wallet is installed: what to get,
 *  and a reload for when it is. */
export default function NoWalletDialog({
  open, network, onClose,
}: { open: boolean; network: "mainnet" | "testnet"; onClose: () => void }) {
  const h = noWalletHelp(network);
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={h.title}
      width={440}
      footer={[
        <Button key="close" onClick={onClose}>Close</Button>,
        <Button key="reload" type="primary" onClick={() => window.location.reload()}>Reload the page</Button>,
      ]}
    >
      <p style={{ marginTop: 0 }}>
        {h.install}{" "}
        {WALLET_INSTALL.map((w, i) => (
          <span key={w.name}>
            {i > 0 && " · "}
            <a href={w.href} target="_blank" rel="noreferrer">{w.name}</a>
          </span>
        ))}
      </p>
      <p>
        {h.funds}
        {h.fundsLink && <> <a href={h.fundsLink.href} target="_blank" rel="noreferrer">{h.fundsLink.text}</a>.</>}
      </p>
      <p className="because" style={{ marginBottom: 0 }}>{h.kind}</p>
    </Modal>
  );
}
```

- [ ] **Step 7: Wire it in `WalletProvider.tsx`** — imports:

```tsx
import { NoWalletError } from "@/lib/wallet";
import NoWalletDialog from "@/components/NoWalletDialog";
```

state, next to the others: `const [noWallet, setNoWallet] = useState(false);`

in `connectTo`, the catch:

```tsx
    catch (err) {
      // No wallet is a next step, not a failure: the dialog says what to get.
      if (err instanceof NoWalletError) setNoWallet(true);
      else setError(describeConnectError(err));
    }
```

after `<WalletPicker … />`:

```tsx
      <NoWalletDialog open={noWallet} network={net.name} onClose={() => setNoWallet(false)} />
```

- [ ] **Step 8: Checks**

Run: `cd frontend && pnpm vitest run && pnpm typecheck`
Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/wallet-help.ts frontend/test/wallet-help.test.ts frontend/components/NoWalletDialog.tsx frontend/lib/wallet.ts frontend/components/wallet/WalletProvider.tsx
git commit -m "feat(web): no wallet opens one dialog with what to install and what to hold, instead of an error twice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The wrong network by name; a short balance with a way out

**Files:**
- Modify: `frontend/lib/chain.ts` (add `chainName`)
- Modify: `frontend/lib/funding-view.ts` (add `topUpHint`)
- Modify: `frontend/app/(app)/new/CreateRun.tsx` (wrong-chain banner body)
- Modify: `frontend/components/wallet/WalletProvider.tsx` (switch error)
- Modify: `frontend/app/(app)/new/StepPreview.tsx` (funding list, re-read)
- Test: `frontend/test/network-name.test.ts`

**Interfaces:**
- Consumes: `FAUCET_URL` (Task 6).
- Produces: `chainName(id: number | undefined): string`; `topUpHint(symbol: string, network: "mainnet" | "testnet"): { text: string; link?: { text: string; href: string } }`.

- [ ] **Step 1: Write the failing test** — `frontend/test/network-name.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { chainName } from "@/lib/chain";
import { topUpHint } from "@/lib/funding-view";

describe("chainName", () => {
  it("names Arc's two networks and says plainly when it is another", () => {
    expect(chainName(5042)).toBe("Arc mainnet");
    expect(chainName(5042002)).toBe("Arc testnet");
    expect(chainName(1)).toBe("another network (chain 1)");
    expect(chainName(0)).toBe("a network it did not name");
    expect(chainName(undefined)).toBe("a network it did not name");
  });
});

describe("topUpHint", () => {
  it("links the faucet for test USDC, and otherwise says what to add or take out", () => {
    expect(topUpHint("USDC", "testnet")).toEqual({
      text: "Get free test USDC at", link: { text: "faucet.circle.com", href: "https://faucet.circle.com" },
    });
    expect(topUpHint("cirBTC", "mainnet")).toEqual({
      text: "Add cirBTC to this wallet on Arc mainnet, then check again — or take its lines out of the file.",
    });
    expect(topUpHint("EURC", "testnet").link).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd frontend && pnpm vitest run test/network-name.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — `frontend/lib/chain.ts`, after `defaultNetwork`:

```ts
/** A wallet's network, in words: the id only when it is not one of Arc's. */
export function chainName(id: number | undefined): string {
  if (id === arc.id) return "Arc mainnet";
  if (id === arcTestnet.id) return "Arc testnet";
  return id ? `another network (chain ${id})` : "a network it did not name";
}
```

`frontend/lib/funding-view.ts`, at the end:

```ts
import { FAUCET_URL } from "@/lib/wallet-help";

/** What a payer short of one token can do next. The faucet is linked for
 *  USDC only: it is the one test token the home page has promised it gives. */
export function topUpHint(
  symbol: string, network: "mainnet" | "testnet",
): { text: string; link?: { text: string; href: string } } {
  if (network === "testnet" && symbol === "USDC") {
    return { text: "Get free test USDC at", link: { text: "faucet.circle.com", href: FAUCET_URL } };
  }
  return { text: `Add ${symbol} to this wallet on Arc ${network}, then check again — or take its lines out of the file.` };
}
```

(Put the `import` line at the top of the file with the others.)

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && pnpm vitest run test/network-name.test.ts`
Expected: PASS.

- [ ] **Step 5: Use `chainName`** — `CreateRun.tsx`, import `chainName` from `@/lib/chain` and replace the wrong-chain paragraph's text with:

```tsx
                  {`Your wallet is on ${chainName(wallet.chainId)}. This run pays on Arc ${net.name}. Use "Switch to Arc ${net.name}" at the top of the page — your wallet will ask you to confirm.`}
```

`WalletProvider.tsx`, import `chainName` from `@/lib/chain` and replace the still-on-another-chain message:

```tsx
        setSwitchError(`The wallet is still on ${chainName(id)}. Switch it to Arc ${net.name} from the wallet itself, then try again.`);
```

- [ ] **Step 6: The funding list** — `StepPreview.tsx`:

imports: `import { fundingView, topUpHint } from "@/lib/funding-view";` (replacing the `fundingView` import).

A re-read counter:

```tsx
  const [reads, setReads] = useState(0);
```

and add `reads` to the balances effect's dependency array (`[owner, net, draft.rows, usdc, reads]`).

In each funding `<li>`, after the `shortBy` fragment, add:

```tsx
                    {r.state === "short" && (() => {
                      const h = topUpHint(r.symbol, net.name);
                      return (
                        <span className="because">
                          {h.text}
                          {h.link && <> <a href={h.link.href} target="_blank" rel="noreferrer">{h.link.text}</a>.</>}
                        </span>
                      );
                    })()}
```

After the `</ul>` (still inside the not-checking branch), add:

```tsx
              <Button size="small" style={{ marginTop: 10 }} onClick={() => setReads((n) => n + 1)}>
                Check balances again
              </Button>
```

The not-checking branch becomes a fragment `<>…</>` wrapping the `<ul>` and the button.

- [ ] **Step 7: Checks**

Run: `cd frontend && pnpm vitest run && pnpm typecheck`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/chain.ts frontend/lib/funding-view.ts frontend/test/network-name.test.ts "frontend/app/(app)/new/CreateRun.tsx" frontend/components/wallet/WalletProvider.tsx "frontend/app/(app)/new/StepPreview.tsx"
git commit -m "feat(web): name the wallet's network, and give a short balance a way to top up and re-read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Check and Pay — a cancel is a cancel, an error is one plain sentence

**Files:**
- Create: `frontend/lib/pay-copy.ts`
- Create: `frontend/components/ui/TechnicalDetails.tsx`
- Modify: `frontend/app/(app)/new/StepPreflight.tsx`
- Modify: `frontend/app/(app)/new/StepSend.tsx`
- Test: `frontend/test/pay-copy.test.ts`

**Interfaces:**
- Produces: `isCancelled(err: unknown): boolean`; `CANCELLED: { message: { title; body }; payment: { title; body } }`; `BLOCKED_COPY: Record<"chain" | "balance" | "preflight" | "fees" | "signature", string>`; `FEE_ADVICE: string`; `CHECK_FAILED: string`; `RUN_FILE_COPY: string` (used in Task 9); `TechnicalDetails({ children })`.

- [ ] **Step 1: Write the failing test** — `frontend/test/pay-copy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isCancelled, BLOCKED_COPY, CANCELLED, FEE_ADVICE } from "@/lib/pay-copy";

describe("isCancelled", () => {
  it("reads a 4001 however deep the wallet and viem buried it", () => {
    expect(isCancelled({ code: 4001 })).toBe(true);
    expect(isCancelled({ shortMessage: "User rejected the request.", cause: { code: 4001 } })).toBe(true);
    expect(isCancelled({ cause: { data: { code: 4001 } } })).toBe(true);
  });
  it("is not a cancel for anything else", () => {
    expect(isCancelled({ code: -32603 })).toBe(false);
    expect(isCancelled(new Error("nope"))).toBe(false);
    expect(isCancelled(undefined)).toBe(false);
  });
});

describe("pay copy", () => {
  it("says nothing moved, for a cancel and for every blocked reason", () => {
    expect(CANCELLED.payment.body).toBe("Nothing was signed and no money moved.");
    for (const text of Object.values(BLOCKED_COPY)) expect(text).toMatch(/Nothing was signed/);
  });
  it("keeps the fee floor for the payer who edits the fee", () => {
    expect(FEE_ADVICE).toMatch(/Keep the fee it suggests/);
    expect(FEE_ADVICE).toMatch(/25 Gwei/);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd frontend && pnpm vitest run test/pay-copy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `frontend/lib/pay-copy.ts`**

```ts
import type { RunOutcome } from "@ledgerline/core";
import { errorCode } from "@/lib/errors";

/** EIP-1193 4001: the person clicked Reject or closed the prompt. It is a
 *  choice they made, and the screen says so instead of calling it a failure. */
export const isCancelled = (err: unknown): boolean => errorCode(err) === 4001;

export const CANCELLED = {
  message: { title: "You cancelled the message in your wallet", body: "Nothing was signed and no money moved." },
  payment: { title: "You cancelled the payment in your wallet", body: "Nothing was signed and no money moved." },
};

type BlockedReason = Extract<RunOutcome, { state: "blocked" }>["reason"];

/** What each stop before signing means for the payer. The executor's own
 *  sentence is kept under Technical details. */
export const BLOCKED_COPY: Record<BlockedReason, string> = {
  chain: "Your wallet changed network before paying. Nothing was signed and no money moved. Switch back to Arc and try again.",
  balance: "The wallet no longer holds enough to pay every line. Nothing was signed and no money moved. Top it up and try again.",
  preflight: "A payment would now fail on Arc, so nothing was sent. Nothing was signed and no money moved. Go back to the check to see which one.",
  fees: "The network fee could not be set. Nothing was signed and no money moved. Try again in a moment.",
  signature: "Your wallet did not sign the payment. Nothing was signed and no money moved.",
};

export const FEE_ADVICE =
  "Your wallet will show a network fee. Keep the fee it suggests. If you change it, do not go below 25 Gwei: Arc silently drops cheaper transactions, with no error.";

export const CHECK_FAILED = "The check could not finish. Nothing was signed and no money moved.";

export const RUN_FILE_COPY =
  "This one file keeps everything: the run name, the transaction and every receipt link. Load it on the run page any time.";
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && pnpm vitest run test/pay-copy.test.ts`
Expected: PASS.

- [ ] **Step 5: `frontend/components/ui/TechnicalDetails.tsx`**

```tsx
import type { ReactNode } from "react";
import { Collapse } from "antd";

/** The original error or identifier, folded away: there for whoever needs it,
 *  never in front of the sentence a payer reads. */
export default function TechnicalDetails({ children }: { children: ReactNode }) {
  return (
    <Collapse
      ghost
      style={{ marginTop: 14 }}
      items={[{ key: "technical", label: "Technical details", children }]}
    />
  );
}
```

- [ ] **Step 6: `StepPreflight.tsx`** — imports:

```tsx
import { isCancelled, CANCELLED, CHECK_FAILED } from "@/lib/pay-copy";
import TechnicalDetails from "@/components/ui/TechnicalDetails";
```

state: `const [cancelled, setCancelled] = useState(false);` and a decoded-or-not flag: `const [known, setKnown] = useState(false);`

at the top of `prepare`: `setCancelled(false); setKnown(false);`

replace the catch body:

```tsx
    } catch (err) {
      if (isCancelled(err)) {
        setCancelled(true);
        setPhase("failed");
        return;
      }
      const { name, message } = explainRevert(err);
      setKnown(!!name);
      setError(name ? `${name}: ${message}` : message);
      setPhase("failed");
    }
```

the heading's failed branch: `: cancelled ? "Nothing was signed" : "This run would not go through"`

replace the `{phase === "failed" && (<Alert … />)}` block with:

```tsx
      {phase === "failed" && cancelled && (
        <Alert style={{ marginTop: 20 }} type="info" showIcon
          title={CANCELLED.message.title} description={CANCELLED.message.body} />
      )}

      {phase === "failed" && !cancelled && (
        <Alert style={{ marginTop: 20 }} type="error" showIcon
          // Not "nothing was signed": by this point the payer has usually
          // signed the salt message, and telling someone who just approved a
          // wallet prompt that nothing happened is the fastest way to teach
          // them this screen cannot be trusted about what did.
          title="No transaction was signed, and no money moved"
          description={
            <>
              {error === undefined
                ? "One or more payments would fail if sent to Arc — each failing row above says why. Fix those and check again; nothing has been paid."
                : known ? error : CHECK_FAILED}
              {error !== undefined && !known && (
                <TechnicalDetails><p className="raw-reason" style={{ margin: 0 }}>{error}</p></TechnicalDetails>
              )}
              <p style={{ marginTop: 10, marginBottom: 0 }}>
                {signed
                  ? "Your wallet did sign the short message a moment ago. That one only created this run's reference code — it costs nothing, moves nothing, and is not a payment. Nothing else has been signed."
                  : "Your wallet has not been asked to sign anything for this attempt."}
              </p>
            </>
          } />
      )}
```

replace the `List fingerprint` `<dl>` block with:

```tsx
      {prepared && (
        <TechnicalDetails>
          <dl className="detail">
            <dt>List fingerprint</dt>
            <dd className="hex">{prepared.built.root}</dd>
          </dl>
        </TechnicalDetails>
      )}
```

- [ ] **Step 7: `StepSend.tsx`** — imports:

```tsx
import { isCancelled, CANCELLED, BLOCKED_COPY, FEE_ADVICE } from "@/lib/pay-copy";
import TechnicalDetails from "@/components/ui/TechnicalDetails";
```

state: `const [cancelled, setCancelled] = useState(false);`

the `send` passed to `executeRun`:

```tsx
        send: async (tx) => {
          try {
            return await wallet.walletClient.sendTransaction({ account: wallet.address, chain: net.chain, ...tx });
          } catch (err) {
            // Noted here so execute.ts stays an orchestrator that decides nothing.
            if (isCancelled(err)) setCancelled(true);
            throw err;
          }
        },
```

in the prepared-reset effect add `setCancelled(false);`.

crash branch: replace `<Alert style={{ marginTop: 20 }} type="warning" showIcon title={crash} />` with:

```tsx
        <TechnicalDetails><p className="raw-reason" style={{ margin: 0 }}>{crash}</p></TechnicalDetails>
```

ready-to-send paragraph:

```tsx
          <p>
            One transaction pays every line and records the list on chain. {FEE_ADVICE}
          </p>
```

`OutcomeView` gains `cancelled: boolean` in its props and call site (`cancelled={cancelled}`), `onRetry` also calls `setCancelled(false)`, and the blocked entry reads:

```tsx
    blocked: {
      tone: "error",
      title: cancelled ? CANCELLED.payment.title : "Nothing was signed",
      body: cancelled
        ? CANCELLED.payment.body
        : outcome.state === "blocked" ? BLOCKED_COPY[outcome.reason] : "",
    },
```

and after the verdict section in `OutcomeView`:

```tsx
      {outcome.state === "blocked" && !cancelled && (
        <TechnicalDetails><p className="raw-reason" style={{ margin: 0 }}>{outcome.details}</p></TechnicalDetails>
      )}
```

- [ ] **Step 8: Checks**

Run: `cd frontend && pnpm vitest run && pnpm typecheck`
Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/pay-copy.ts frontend/test/pay-copy.test.ts frontend/components/ui/TechnicalDetails.tsx "frontend/app/(app)/new/StepPreflight.tsx" "frontend/app/(app)/new/StepSend.tsx"
git commit -m "feat(web): a cancel in the wallet reads as a cancel, and every stop is one plain sentence with the detail folded away

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Result — one file to keep

**Files:**
- Modify: `frontend/app/(app)/new/Result.tsx` (render and the two copied states)

**Interfaces:**
- Consumes: `RUN_FILE_COPY` (Task 8).

- [ ] **Step 1: The copied labels return after two seconds** — after the `copiedAll` state:

```tsx
  // "Copied" is feedback for one click, not a state: it returns to its label.
  useEffect(() => {
    if (!copied && !copiedAll) return;
    const t = setTimeout(() => { setCopied(undefined); setCopiedAll(false); }, 2000);
    return () => clearTimeout(t);
  }, [copied, copiedAll]);
```

- [ ] **Step 2: The render** — import `RUN_FILE_COPY` from `@/lib/pay-copy`; replace everything from `return (` to the end of the component with:

```tsx
  return (
    <>
      <section className="line line--summary">
        <div>
          <p className="amount">
            {rows.length}<span className="unit">paid</span>
          </p>
          <p className="payee">Recorded in block {outcome.receipt.blockNumber.toLocaleString("en-US")}</p>
        </div>
        <span className="reference">{draft.runLabel}</span>
      </section>

      <section className="verdict ok">
        <h2>Paid, with a receipt</h2>
        <p>
          Each link below verifies against the chain on its own. Send each recipient
          theirs — they need nothing from us to check it.
        </p>
      </section>

      {outcome.feeWarning && (
        <Alert style={{ marginTop: 20 }} type="warning" showIcon
          title="The fee was below the floor" description={outcome.feeWarning} />
      )}

      <Alert
        style={{ marginTop: 24 }}
        type={manifestSaved ? "success" : "warning"}
        showIcon
        title={manifestSaved ? "Run file saved" : "Save the run file"}
        description={
          <>
            <p style={{ marginTop: 0 }}>{RUN_FILE_COPY}</p>
            <Button type={manifestSaved ? "default" : "primary"} onClick={downloadManifest}>
              {manifestSaved ? "Download it again" : "Download the run file"}
            </Button>
          </>
        }
      />

      <h2 className="label" style={{ margin: "28px 0 0" }}>Send each recipient their link</h2>
      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={() => {
          void navigator.clipboard.writeText(receiptLinksText(exportRows));
          setCopiedAll(true);
        }}>
          {copiedAll ? `Copied ${rows.length} links` : "Copy all links"}
        </Button>
        <Button onClick={() => saveFile(`ledgerline-${slug}-receipts.csv`, receiptLinksCsv(exportRows), "text/csv")}>
          Download links as CSV
        </Button>
      </div>

      <div style={{ marginTop: 14 }}>
        <Table<LinkRow> columns={columns} dataSource={rows}
          pagination={rows.length > 25 ? { pageSize: 25 } : false} size="middle"
          scroll={{ x: "max-content" }} />
      </div>

      <p style={{ marginTop: 22, marginBottom: 0 }}>
        <a href={`/run/${outcome.txHash}?n=${net.name}`}>Open this run</a>
        {" · "}
        <a href={`${net.explorer}/tx/${outcome.txHash}`} target="_blank" rel="noreferrer">On the explorer</a>
      </p>
    </>
  );
```

The run file already carries `runLabel`, `txHash`, `runSalt` and `proofs` (`downloadManifest` above is unchanged), and the run page builds receipt links from it (`Reconciliation.tsx`, `receiptUrl` from the loaded manifest), which is why the "Keep two things" alert can go.

- [ ] **Step 3: Checks**

Run: `cd frontend && pnpm vitest run && pnpm typecheck`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(app)/new/Result.tsx"
git commit -m "feat(web): after paying, one run file to keep, then the links to send

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The receipt says who paid and when; the run page stops repeating itself

**Files:**
- Modify: `frontend/lib/receipt-view.ts` (add `paidAtText`)
- Modify: `frontend/app/(public)/r/[txHash]/Receipt.tsx` (`Loaded`, `verifyAgainst`, `Ready`)
- Modify: `frontend/app/(app)/run/[txHash]/Reconciliation.tsx:204-206`
- Test: `frontend/test/receipt-view.test.ts`

**Interfaces:**
- Produces: `paidAtText(seconds: bigint | number, timeZone?: string): string`.

- [ ] **Step 1: Write the failing test** — append to `frontend/test/receipt-view.test.ts` (import `paidAtText` from `@/lib/receipt-view`):

```ts
describe("paidAtText", () => {
  // 2026-09-24 07:46:00 UTC
  const T = 1_790_235_960n;
  it("prints day, month, year and time in English, in the given zone, zone named", () => {
    expect(paidAtText(T, "Asia/Ho_Chi_Minh")).toBe("24 Sep 2026, 14:46 GMT+7");
    expect(paidAtText(T, "UTC")).toBe("24 Sep 2026, 07:46 GMT");
    expect(paidAtText(Number(T), "America/New_York")).toBe("24 Sep 2026, 03:46 GMT-4");
  });
  it("does not pad a single-digit day", () => {
    expect(paidAtText(1_788_566_400, "UTC")).toBe("5 Sep 2026, 00:00 GMT");
  });
});
```

(`1_788_566_400` is 2026-09-05T00:00:00Z; `1_790_235_960` is 2026-09-24T07:46:00Z — both checked with `new Date(…).toISOString()`.)

- [ ] **Step 2: Run and watch it fail**

Run: `cd frontend && pnpm vitest run test/receipt-view.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — `frontend/lib/receipt-view.ts`, at the end:

```ts
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * When a payment landed, from its block's timestamp: English like the rest of
 * the page, in the viewer's own zone, with the zone named so a recipient
 * abroad reads it right. Month names are ours, not Intl's, which prints
 * "Sept" for en-GB on newer ICU.
 */
export function paidAtText(seconds: bigint | number, timeZone?: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset",
    }).formatToParts(new Date(Number(seconds) * 1000)).map((p) => [p.type, p.value]),
  );
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.timeZoneName}`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && pnpm vitest run test/receipt-view.test.ts`
Expected: PASS.

- [ ] **Step 5: The receipt** — `Receipt.tsx`:

import `paidAtText` alongside `absentHeadline, RECEIPT_COPY`.

`Loaded` gains `paidAt?: bigint;`.

In `verifyAgainst`, right after `getTransactionReceipt`:

```ts
  // The block's timestamp is when the payment landed. A node that cannot say
  // leaves the line off; it is never estimated.
  const paidAt = await client.getBlock({ blockNumber: receipt.blockNumber })
    .then((b) => b.timestamp)
    .catch(() => undefined);
```

and add `paidAt` to both returned objects (`{ result: first, …, anchorChecked: false, paidAt }` and `{ result, …, anchorChecked, paidAt }`).

In `Ready`, after the `To` leader:

```tsx
        {p && (
          <p className="leader">
            <span className="leader-key">From</span>
            <span className="leader-dots" aria-hidden="true" />
            <span className="leader-val hex addr" title={p.payer}>{short(p.payer)}</span>
          </p>
        )}
        {data.paidAt !== undefined && (
          <p className="leader">
            <span className="leader-key">Paid</span>
            <span className="leader-dots" aria-hidden="true" />
            <span className="leader-val">{paidAtText(data.paidAt)}</span>
          </p>
        )}
```

- [ ] **Step 6: The run page's invoice cell** — `Reconciliation.tsx`, the Invoice column's render:

```tsx
      render: (id?: string) => id ?? (hasManifest
        ? <span style={{ color: "var(--ink-soft)" }}>not on the list</span>
        : <span style={{ color: "var(--ink-soft)" }}>
            <span aria-hidden="true">—</span>
            <span className="sr-only">known only from the run file</span>
          </span>),
```

- [ ] **Step 7: Checks**

Run: `cd frontend && pnpm vitest run && pnpm typecheck`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/receipt-view.ts frontend/test/receipt-view.test.ts "frontend/app/(public)/r/[txHash]/Receipt.tsx" "frontend/app/(app)/run/[txHash]/Reconciliation.tsx"
git commit -m "feat(web): the receipt prints who paid and when; the run page stops printing \"in the run file\" on every row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Open a run by its transaction hash

**Files:**
- Create: `frontend/lib/tx-hash.ts`
- Create: `frontend/components/OpenRunByHash.tsx`
- Modify: `frontend/app/(app)/dashboard/Dashboard.tsx` (both empty states)
- Modify: `frontend/app/(app)/runs/RunHistory.tsx`
- Modify: `frontend/app/styles/pages.css` (add `.open-run`)
- Test: `frontend/test/tx-hash.test.ts`

**Interfaces:**
- Produces: `isTxHash(input: string): boolean` (trims first); `TX_HASH_HINT: string`; `OpenRunByHash({ network })`.

- [ ] **Step 1: Write the failing test** — `frontend/test/tx-hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isTxHash, TX_HASH_HINT } from "@/lib/tx-hash";

const H = "0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5";

describe("isTxHash", () => {
  it("takes a hash as pasted: spaces, a newline, capital hex", () => {
    expect(isTxHash(H)).toBe(true);
    expect(isTxHash(`  ${H}\n`)).toBe(true);
    expect(isTxHash("0x" + H.slice(2).toUpperCase())).toBe(true);
  });
  it("refuses an address, a short hash and anything else", () => {
    expect(isTxHash("0xe48A096B9E74f064b13c17734af29F85E02d732a")).toBe(false);
    expect(isTxHash(H.slice(0, 60))).toBe(false);
    expect(isTxHash(H.slice(2))).toBe(false);
    expect(isTxHash("")).toBe(false);
  });
  it("explains what a hash looks like", () => {
    expect(TX_HASH_HINT).toBe("That is not a transaction hash: it starts with 0x and has 64 more letters and digits.");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd frontend && pnpm vitest run test/tx-hash.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `frontend/lib/tx-hash.ts`**

```ts
export const TX_HASH_HINT =
  "That is not a transaction hash: it starts with 0x and has 64 more letters and digits.";

/** A transaction hash as a person pastes one: surrounding space ignored,
 *  either case of hex. An address (40 hex) is refused. */
export function isTxHash(input: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(input.trim());
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && pnpm vitest run test/tx-hash.test.ts`
Expected: PASS.

- [ ] **Step 5: The form** — `frontend/components/OpenRunByHash.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "antd";
import { isTxHash, TX_HASH_HINT } from "@/lib/tx-hash";

/** A run sent from another browser is still on chain; its hash opens it. */
export default function OpenRunByHash({ network }: { network: "mainnet" | "testnet" }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);

  const open = () => {
    const hash = value.trim().toLowerCase();
    if (!isTxHash(hash)) { setBad(true); return; }
    router.push(`/run/${hash}?n=${network}`);
  };

  return (
    <form className="open-run" onSubmit={(e) => { e.preventDefault(); open(); }}>
      <label htmlFor="open-run-hash" className="label">Open a run by its transaction hash</label>
      <div className="open-run-row">
        <Input
          id="open-run-hash"
          placeholder="0x…"
          value={value}
          status={bad ? "error" : undefined}
          aria-invalid={bad}
          aria-describedby={bad ? "open-run-error" : undefined}
          onChange={(e) => { setValue(e.target.value); setBad(false); }}
        />
        <Button htmlType="submit">Open</Button>
      </div>
      {bad && <p id="open-run-error" className="because field-error" role="alert">{TX_HASH_HINT}</p>}
    </form>
  );
}
```

`frontend/app/styles/pages.css`, at the end:

```css
/* ── open a run by its hash ───────────────────────────────────────────── */
.open-run { margin-top: 24px; max-width: 40rem; }
.open-run .label { display: block; margin-bottom: 6px; }
.open-run-row { display: flex; gap: 8px; }
.open-run-row .ant-input { min-width: 0; }
```

- [ ] **Step 6: Place it** — `Dashboard.tsx`: import `OpenRunByHash from "@/components/OpenRunByHash"`; in the `!wallet` state add `<OpenRunByHash network={net.name} />` after the Connect button; in the `records.length === 0` state add it after the paragraph holding "Create a payout run".

`RunHistory.tsx`: import it and `net` is already in scope from `useWallet()`; add `<OpenRunByHash network={net.name} />` after the Connect button in the `!wallet` Tape and after the links paragraph in the empty Tape; in the list state add, after the list's `<Col>`:

```tsx
          <Col span={12}>
            <Tape><OpenRunByHash network={net.name} /></Tape>
          </Col>
```

(If `net` is not destructured in `RunHistory`, add it to the existing `useWallet()` destructuring.)

- [ ] **Step 7: Checks**

Run: `cd frontend && pnpm vitest run && pnpm typecheck`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/tx-hash.ts frontend/test/tx-hash.test.ts frontend/components/OpenRunByHash.tsx "frontend/app/(app)/dashboard/Dashboard.tsx" "frontend/app/(app)/runs/RunHistory.tsx" frontend/app/styles/pages.css
git commit -m "feat(web): open a run by pasting its transaction hash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Home — how it works before the proof

**Files:**
- Modify: `frontend/app/(public)/page.tsx`
- Modify: `frontend/app/styles/pages.css` (add `.how-need`)
- Test: `frontend/test/plain-language.test.ts` (extended; see Step 1)

- [ ] **Step 1: Extend the plain-language test** — add imports at the top of `frontend/test/plain-language.test.ts`:

```ts
import { parseCsv, resolveRows, validateRun, tokensForChain } from "@ledgerline/core";
import { reviewView } from "@/lib/review-view";
import { noWalletHelp } from "@/lib/wallet-help";
import { topUpHint } from "@/lib/funding-view";
import { BLOCKED_COPY, CANCELLED, FEE_ADVICE, CHECK_FAILED, RUN_FILE_COPY } from "@/lib/pay-copy";
import { TX_HASH_HINT } from "@/lib/tx-hash";
```

(merge `parseCsv, resolveRows, validateRun, tokensForChain` into the existing `@ledgerline/core` import instead if the linter complains about duplicates.)

and a new block after the last `it` in the `describe`:

```ts
  it("the create flow's new words, and the file and row messages", () => {
    // Engineering words the audit found on screen; never again.
    const ENGINEERING = /\b(calldata|zero address|scientific notation|base units|burning)\b/i;
    const plain = (t?: string) => { clean(t); if (t) expect(t, t).not.toMatch(ENGINEERING); };

    const TOKENS = tokensForChain(5042002);
    const DECIMALS = { [TOKENS.USDC.toLowerCase()]: 6, [TOKENS.EURC.toLowerCase()]: 6, [TOKENS.cirBTC.toLowerCase()]: 8 };
    const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
    for (const text of [
      `invoiceId,token,to,amount\nINV-1,USDC,${A},1250.00\nINV-2,USDC,${A.slice(0, 40)},10\nINV-3,USDT,${A},10\nINV-4,EURC,${A},"1,000"\nINV-5,USDC,vitalik.eth,5\nINV-1,USDC,${A},3\nINV-7,USDC,0x0000000000000000000000000000000000000000,1\nINV-8,USDC,${A},0`,
      `Invoice ID,Token,Recipient,Salary\na,b,c,1`,
      `invoiceId;token;to;amount\nINV-1;USDC;${A};1.000`,
      ``,
    ]) {
      const { rows, issues } = parseCsv(text);
      const resolved = resolveRows(rows, TOKENS, DECIMALS);
      const { errors, warnings } = validateRun(resolved.items);
      const v = reviewView({ issues: [...issues, ...resolved.issues], errors, warnings, parsed: rows });
      plain(v.title); plain(v.summary); plain(v.fixFirst);
      for (const i of v.items) plain(i.message);
    }

    for (const n of ["mainnet", "testnet"] as const) {
      const h = noWalletHelp(n);
      plain(h.title); plain(h.install); plain(h.funds); plain(h.kind);
      plain(topUpHint("USDC", n).text); plain(topUpHint("cirBTC", n).text);
    }
    Object.values(BLOCKED_COPY).forEach(plain);
    plain(CANCELLED.message.title); plain(CANCELLED.payment.title); plain(CANCELLED.payment.body);
    plain(FEE_ADVICE); plain(CHECK_FAILED); plain(RUN_FILE_COPY); plain(TX_HASH_HINT);
  });
```

- [ ] **Step 2: Run it**

Run: `cd frontend && pnpm vitest run test/plain-language.test.ts`
Expected: PASS (Tasks 1–11 already wrote these words). If a string fails, change the string in its owning module, not the regex.

- [ ] **Step 3: The page** — in `frontend/app/(public)/page.tsx`:

`PAYS_IN` becomes symbols only and the chip loses its `dp`:

```tsx
const PAYS_IN = ["USDC", "EURC", "cirBTC"] as const;
```
```tsx
          {PAYS_IN.map((symbol) => (
            <span key={symbol} className="chip">{symbol}</span>
          ))}
```

Move the whole `<Col span={12}>` that holds the `How a run works` Tape so it comes directly after the example-slip `<Col span={4} md={12}>`, before the Proof `<Col span={12}>`.

Inside the How Tape, after `</ol>`:

```tsx
          <p className="because how-need">
            You need a browser wallet (MetaMask or Rabby) and USDC on Arc for the network fee.
            {!testnet && <> <Link href="/new?n=testnet">Try it on testnet first</Link>.</>}
          </p>
```

`frontend/app/styles/pages.css`, at the end:

```css
.how-need { margin-top: 18px; padding-top: 12px; border-top: 1.5px dotted var(--rule); max-width: none; }
```

- [ ] **Step 4: Checks**

Run: `cd frontend && pnpm vitest run && pnpm typecheck`
Expected: pass (`mainnet-proof.test.ts` reads the proof module, not the page order).

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(public)/page.tsx" frontend/app/styles/pages.css frontend/test/plain-language.test.ts
git commit -m "feat(web): home says how a run works and what you need before it shows the proof

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The audit, re-run

**Files:** none, unless a check fails. A fix goes in its owning file, with its own commit.

- [ ] **Step 1: Unit checks, typecheck, build**

Run from the repo root: `pnpm test && pnpm typecheck && pnpm build`
Expected: every package passes; `next build` prints the route table.

- [ ] **Step 2: Start the server** — `cd frontend && pnpm start -p 3055` in the background; wait until `curl -s -o /dev/null -w "%{http_code}" http://localhost:3055/` prints `200`.

- [ ] **Step 3: Reject at Pay (finding 1)** — run `.superpowers/ux-audit/flow-reject.js` in Playwright (it drives testnet with the keyless audit wallet, up to the wallet's Pay prompt, which it rejects). Expected at 1280 and 390: `scrollWidth === clientWidth`; then read the verdict:

```js
async (page) => page.evaluate(() => document.querySelector("main .verdict")?.innerText)
```

(run it inside the script before the context closes, or add it to the `rejected_` measurement) — Expected: contains `You cancelled the payment in your wallet` and not `Request Arguments`.

- [ ] **Step 4: The spreadsheets (findings 3, 4)** — in Playwright, for each of `excel.csv`, `semicolon.csv`, `mistakes.csv` in `.superpowers/ux-audit/`: open `/new?n=testnet`, keep the prefilled name, set the file, wait 2.5 s, read:

```js
async (page) => page.evaluate(() => ({
  rows: [...document.querySelectorAll(".ant-table-tbody tr")].map((r) => r.innerText.replace(/\s+/g, " ")),
  issues: [...document.querySelectorAll(".review-issues .rung .claim")].map((c) => c.innerText),
  button: [...document.querySelectorAll("main .ant-btn-primary")].map((b) => `${b.innerText}${b.disabled ? " [disabled]" : ""}`),
}))
```

Expected: `excel.csv` → the header is accepted (no `Line 1` issue); its two rows are refused only for their amounts, each with how to write it: `Line 2 · INV-1` (`"1,250.00"` carries a thousands comma, which a `,` file never guesses) and `Line 3 · INV-2` (`"$20"`); `semicolon.csv` → one row with amount `0.1`; `mistakes.csv` → issue claims in line order `Line 3 · INV-2`, `Line 4 · INV-3`, `Line 5 · INV-4`, `Line 6 · INV-5`, `Line 7 · INV-1`, `Line 7 · INV-1`, `Line 8 · INV-7`, `Line 9 · INV-8`, and the button `FIX 7 PROBLEMS FIRST [disabled]`.

- [ ] **Step 5: The name (findings 5, 8)** — on `/new?n=testnet`: the name field reads `Payroll YYYY-MM` for this month; upload `sample.csv`, click `Choose another file`, and the field still holds the name. Clear the name to spaces, set `sample.csv`: the page stays on Upload, shows `Name the run first`, and a `Continue with sample.csv` button that enables once a name is typed and then reaches Review.

- [ ] **Step 6: No wallet (finding 2)** — in a fresh context with no provider: `/new?n=testnet`, upload `sample.csv`, click `Connect a wallet to continue`. Expected: a dialog titled `You need a browser wallet` with links to `https://metamask.io/download`, `https://rabby.io` and `https://faucet.circle.com`; no `.ant-message-notice`; no `.ant-alert` saying "Couldn't connect".

- [ ] **Step 7: Short balance, wrong network (findings 6, 11)** — the `flow-wallet.js` scenarios 2 and 3 (keyless wallet `0x1111…1111` on testnet; the payer on chain `0x13b2`). Expected: the cirBTC row carries `Add cirBTC to this wallet on Arc testnet…` and a `Check balances again` button exists; the wrong-network banner reads `Your wallet is on Arc mainnet. This run pays on Arc testnet.`

- [ ] **Step 8: Phone (finding 7)** — at 390, `/new?n=testnet`: `.ant-steps` computes `display: none`, the name input's top is under 400.

- [ ] **Step 9: Receipt (finding 11, Review Focus 5)** — at 390 open the full testnet receipt link:
`http://localhost:3055/r/0x272c8fd186d17c042de60c9eb991b92b58fa960fee1f04842b01c7492c88a354?i=INV-BTC-003&s=0xfa993cebc46a539060543d8c45788d7605d4a38a11d448539054f872c3bcb12a&p=pEy3Qf2nD2M-crH0oqpvusVupzak8PM2ZqIyD3QOdvg&n=testnet`.
Expected: `FROM 0x5955…de17` and a `PAID` line with a date; the verdict `all passed`. Then in a fresh context route the block request to fail:

```js
async (page) => {
  const ctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route("https://rpc.testnet.arc.io/**", async (route) => {
    const body = route.request().postData() || "";
    if (body.includes("eth_getBlockByNumber")) return route.fulfill({ status: 500, body: "{}" });
    return route.continue();
  });
  const p = await ctx.newPage();
  await p.goto(RECEIPT_URL, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => /all passed|did not pass|Cannot be checked/i.test(document.body.innerText), null, { timeout: 30000 });
  const text = await p.evaluate(() => document.querySelector("main").innerText);
  await ctx.close();
  return { hasPaid: /\bPAID\b/.test(text), verified: /all passed/.test(text) };
}
```

(with `RECEIPT_URL` set to the link above). Expected: `{ hasPaid: false, verified: true }`.

- [ ] **Step 10: Open by hash (finding 10)** — on `/runs?n=testnet` with no wallet: type `  0x3376a04fd21c1fd708d721d6040750a547b69daf8f61d3d479567ce73876acc5 ` and press Enter → the URL becomes `/run/0x3376…acc5?n=testnet`. Back on `/runs`, type the address `0xe48A096B9E74f064b13c17734af29F85E02d732a` → the hint appears under the field and the URL does not change.

- [ ] **Step 11: axe, both themes; overflow, every width** — re-run the Task-12 axe check of the tape plan (7 routes × `theme=light|dark` cookie; `axe.run(document, { runOnly: ["wcag2a","wcag2aa","best-practice"] })`) — Expected: no `serious` or `critical`. Then the overflow sweep: 7 routes × 320, 390, 768, 1024, 1280 — Expected: `scrollWidth - clientWidth === 0` everywhere.

- [ ] **Step 12: Clean up and report** — stop the server, close the browser, empty `.playwright-mcp/` except `axe.min.js`, `git status` shows only the committed work. Report every step above with its actual output.
