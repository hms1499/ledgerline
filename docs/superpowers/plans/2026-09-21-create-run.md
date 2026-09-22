# Create-run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A payer uploads a CSV in the browser and ends up with a signed, anchored, referenced payout run on Arc, plus one receipt link per recipient — without touching a script.

**Architecture:** Three pure additions to `@ledgerline/core` (CSV, validation, salt derivation), one deliberately impure addition (`execute.ts`, the orchestration both the script and the browser run so they cannot drift), a raw EIP-1193 wallet module, and a five-step screen at `/new`. The run salt stops being a public constant and becomes `keccak256(payer's signature over the run label)` — unguessable to observers, reproducible by the payer, stored nowhere.

**Tech Stack:** TypeScript, viem, vitest, Next.js App Router, Ant Design v6.

**Spec:** `docs/superpowers/specs/2026-09-21-create-run-design.md` — read it alongside this plan. Its parent is `docs/superpowers/specs/2026-09-21-ledgerline-design.md`. Claims in both are tagged `[measured]`, `[docs]`, `[unverified]`; respect the tags.

## Global Constraints

- **Chain:** Arc mainnet `5042`, testnet `5042002`. viem ships `arc` and `arcTestnet` — never hand-roll a chain definition.
- **Gas floor:** `maxFeePerGas` at least **25 Gwei** (`MIN_MAX_FEE_WEI`). Below 20 Gwei Arc drops transactions silently — no receipt, no error, no revert.
- **Priority fee floor:** 1 Gwei (`MIN_PRIORITY_FEE_WEI`).
- **Never report a payment successful without a receipt.** `pending` and `dropped` are displayable states.
- **Decimals come from `decimals()` on chain**, never hardcoded.
- **Ignore emitter `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`** in all log processing.
- **EOA only.** `Memo` reverts with `sender spoofing requires tx.origin as sender` for contract callers.
- **Our contract is never the caller in the payment path** — `PayoutAnchor` is a sibling subcall inside `aggregate3`.
- **No floating point in money arithmetic.** Ever. Integer strings and `BigInt` only.
- **Max 400 items per run** (`MAX_ITEMS_PER_RUN`).
- **New dependencies: none.** No wagmi, no RainbowKit, no CSV library.
- Run `pnpm --filter @ledgerline/core build` before anything in `apps/web` or `packages/cli` consumes a new core export — the web app imports from `dist/`.

---

## File Structure

```
packages/core/src/
  csv.ts        parseCsv, toBaseUnits, resolveRows      (pure)
  validate.ts   validateRun                             (pure)
  salt.ts       normalizeRunLabel, saltMessageFor, saltFromSignature  (pure)
  execute.ts    executeRun, RunOutcome, ioFromPublicClient  (async, network — the one exception)

packages/core/test/
  csv.test.ts  validate.test.ts  salt.test.ts  execute.test.ts

apps/web/lib/
  wallet.ts     connect, ensureChain, walletClientFor, assertEoa

apps/web/app/new/
  page.tsx  CreateRun.tsx  StepUpload.tsx  StepPreview.tsx  StepPreflight.tsx
  StepSend.tsx  Result.tsx

scripts/run-payout.ts          rewritten onto executeRun
apps/web/app/run/[txHash]/Reconciliation.tsx    gains recovery
```

`execute.ts` is split from everything else because it is the only file in core that touches the network; keeping it alone makes the exception visible. `csv.ts` holds parsing and conversion together because they change together. `validate.ts` is separate because it applies to items from any source, not only CSV.

---

## Task 1: CSV structural parsing

**Files:**
- Create: `packages/core/src/csv.ts`
- Create: `packages/core/test/csv.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCsv(text: string): ParsedCsv`, `interface ParsedRow { line: number; invoiceId: string; tokenSymbol: string; to: string; amount: string }`, `interface CsvIssue { line: number; message: string }`, `interface ParsedCsv { rows: ParsedRow[]; issues: CsvIssue[] }`.

Excel produces BOM, CRLF and quoted fields containing commas. All three must survive. `amount` stays raw text here — conversion needs on-chain decimals and belongs to Task 2.

- [x] **Step 1: Write the failing test**

```ts
// packages/core/test/csv.test.ts
import { describe, it, expect } from "vitest";
import { parseCsv } from "../src/csv.js";

const GOOD = `invoiceId,token,to,amount
INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-EU-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10`;

describe("parseCsv", () => {
  it("reads every data row and numbers lines from the file, header included", () => {
    const { rows, issues } = parseCsv(GOOD);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      line: 2,
      invoiceId: "INV-US-001",
      tokenSymbol: "USDC",
      to: "0xe48A096B9E74f064b13c17734af29F85E02d732a",
      amount: "0.10",
    });
    expect(rows[1]!.line).toBe(3);
  });

  it("survives a UTF-8 BOM, which every Excel export carries", () => {
    const { rows, issues } = parseCsv("﻿" + GOOD);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it("survives CRLF line endings", () => {
    const { rows, issues } = parseCsv(GOOD.replace(/\n/g, "\r\n"));
    expect(issues).toEqual([]);
    expect(rows[0]!.amount).toBe("0.10");
  });

  it("reads a quoted field containing a comma", () => {
    const text = `invoiceId,token,to,amount
"INV, US, 001",USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10`;
    const { rows, issues } = parseCsv(text);
    expect(issues).toEqual([]);
    expect(rows[0]!.invoiceId).toBe("INV, US, 001");
  });

  it("reads a doubled quote inside a quoted field", () => {
    const text = `invoiceId,token,to,amount
"INV ""A""",USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10`;
    const { rows } = parseCsv(text);
    expect(rows[0]!.invoiceId).toBe('INV "A"');
  });

  it("skips blank lines without treating them as rows", () => {
    const { rows, issues } = parseCsv(GOOD + "\n\n\n");
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it("rejects a file whose header names are wrong", () => {
    const { rows, issues } = parseCsv("id,coin,address,value\na,b,c,d");
    expect(rows).toEqual([]);
    expect(issues[0]!.line).toBe(1);
    expect(issues[0]!.message).toMatch(/invoiceId,token,to,amount/);
  });

  it("rejects a file with no header at all", () => {
    const { issues } = parseCsv("");
    expect(issues[0]!.message).toMatch(/empty/i);
  });

  it("reports a row with the wrong number of columns, and keeps going", () => {
    const text = `invoiceId,token,to,amount
INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a
INV-EU-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10`;
    const { rows, issues } = parseCsv(text);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.line).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.line).toBe(3);
  });

  it("accepts header names in any case, since Excel retitles columns", () => {
    const { issues } = parseCsv("InvoiceID,Token,To,Amount\na,b,c,d");
    expect(issues).toEqual([]);
  });
});
```

- [x] **Step 2: Run the test and watch it fail**

Run: `cd packages/core && npx vitest run test/csv.test.ts`
Expected: FAIL — `Failed to load url ../src/csv.js`.

- [x] **Step 3: Write the implementation**

```ts
// packages/core/src/csv.ts

/** One row as it appears in the file. `amount` is still text: converting it
 *  needs the token's on-chain decimals, which is Task 2's job. */
export interface ParsedRow {
  /** 1-based line in the file, counting the header. Errors are useless without it. */
  line: number;
  invoiceId: string;
  tokenSymbol: string;
  to: string;
  amount: string;
}

export interface CsvIssue {
  line: number;
  message: string;
}

export interface ParsedCsv {
  rows: ParsedRow[];
  issues: CsvIssue[];
}

const COLUMNS = ["invoiceid", "token", "to", "amount"] as const;

/**
 * Minimal RFC 4180. A real CSV library would be a dependency for 40 lines of
 * behaviour we can state exactly, and this file is on the path where a wrong
 * answer sends money to the wrong place.
 *
 * The header is required and its names are checked. A silently reordered
 * column is a wrong-payment bug, not a formatting preference.
 */
export function parseCsv(text: string): ParsedCsv {
  const issues: CsvIssue[] = [];
  const rows: ParsedRow[] = [];

  // Excel writes a BOM; left in place it becomes part of the first header name.
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n");

  const headerIndex = lines.findIndex((l) => l.trim() !== "");
  if (headerIndex === -1) {
    return { rows, issues: [{ line: 1, message: "The file is empty." }] };
  }

  const header = splitLine(lines[headerIndex]!).map((h) => h.trim().toLowerCase());
  if (header.length !== COLUMNS.length || !COLUMNS.every((c, i) => header[i] === c)) {
    return {
      rows,
      issues: [{
        line: headerIndex + 1,
        message: `The header must read exactly: invoiceId,token,to,amount — found "${lines[headerIndex]!.trim()}".`,
      }],
    };
  }

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === "") continue;
    const line = i + 1;
    const cells = splitLine(raw);

    if (cells.length !== COLUMNS.length) {
      issues.push({
        line,
        message: `Expected ${COLUMNS.length} columns, found ${cells.length}.`,
      });
      continue;
    }

    rows.push({
      line,
      invoiceId: cells[0]!.trim(),
      tokenSymbol: cells[1]!.trim(),
      to: cells[2]!.trim(),
      amount: cells[3]!.trim(),
    });
  }

  return { rows, issues };
}

/** One line into fields, honouring double quotes and the doubled-quote escape. */
function splitLine(line: string): string[] {
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
    } else if (ch === ",") {
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

- [x] **Step 4: Export it**

Append to `packages/core/src/index.ts`:

```ts
export * from "./csv.js";
```

- [x] **Step 5: Run the test and watch it pass**

Run: `cd packages/core && npx vitest run test/csv.test.ts`
Expected: PASS, 10 tests.

- [x] **Step 6: Commit**

```bash
git add packages/core/src/csv.ts packages/core/test/csv.test.ts packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core): parse a payout CSV, including what Excel actually writes

BOM, CRLF and quoted fields containing commas all appear in real exports.
The header is required and its names checked: a silently reordered column
is a wrong-payment bug, not a formatting preference.

Amounts stay as text. Converting one needs the token's on-chain decimals,
which this file deliberately does not have.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Amounts and row resolution

**Files:**
- Modify: `packages/core/src/csv.ts`
- Modify: `packages/core/test/csv.test.ts`

**Interfaces:**
- Consumes: `ParsedRow`, `CsvIssue` from Task 1; `TokenSet` from `constants.js`; `ManifestItem` from `types.js`.
- Produces: `toBaseUnits(text: string, decimals: number): { ok: true; value: bigint } | { ok: false; reason: string }`, `interface ResolvedRow extends ManifestItem { line: number }`, `resolveRows(rows: ParsedRow[], tokens: TokenSet, decimals: Record<string, number>): { items: ResolvedRow[]; issues: CsvIssue[] }`. The `decimals` key is the **lowercased token address**.

`resolveRows` cannot be called without a decimals table, and that table can only come from `decimals()` on chain. The invariant is enforced by the signature.

- [x] **Step 1: Write the failing test**

Append to `packages/core/test/csv.test.ts`:

```ts
import { toBaseUnits, resolveRows } from "../src/csv.js";
import { tokensForChain, ARC_TESTNET_CHAIN_ID } from "../src/constants.js";

const TOKENS = tokensForChain(ARC_TESTNET_CHAIN_ID);
const DECIMALS = {
  [TOKENS.USDC.toLowerCase()]: 6,
  [TOKENS.EURC.toLowerCase()]: 6,
  [TOKENS.cirBTC.toLowerCase()]: 8,
};
const TO = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

describe("toBaseUnits", () => {
  it("converts a decimal amount at the token's scale", () => {
    expect(toBaseUnits("0.10", 6)).toEqual({ ok: true, value: 100_000n });
    expect(toBaseUnits("0.00001", 8)).toEqual({ ok: true, value: 1_000n });
    expect(toBaseUnits("1", 6)).toEqual({ ok: true, value: 1_000_000n });
  });

  it("keeps full precision on a value that would lose digits as a float", () => {
    // 123456789.123456 is not exactly representable in IEEE 754 binary64.
    expect(toBaseUnits("123456789.123456", 6)).toEqual({
      ok: true,
      value: 123_456_789_123_456n,
    });
  });

  it("accepts trailing zeros and a bare leading dot", () => {
    expect(toBaseUnits("0.1000", 6)).toEqual({ ok: true, value: 100_000n });
    expect(toBaseUnits(".1", 6)).toEqual({ ok: true, value: 100_000n });
  });

  it("refuses more precision than the token has, rather than rounding", () => {
    const r = toBaseUnits("0.0000001", 6);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/6 decimal/);
  });

  it("refuses scientific notation, separators, negatives, zero and empty", () => {
    for (const bad of ["1e-7", "1,000.50", "-5", "0", "", "abc", "1.2.3"]) {
      expect(toBaseUnits(bad, 6).ok, bad).toBe(false);
    }
  });
});

describe("resolveRows", () => {
  const row = (over: Partial<import("../src/csv.js").ParsedRow> = {}) => ({
    line: 2, invoiceId: "INV-1", tokenSymbol: "USDC", to: TO, amount: "0.10", ...over,
  });

  it("resolves a symbol to the chain's token address and scales the amount", () => {
    const { items, issues } = resolveRows([row()], TOKENS, DECIMALS);
    expect(issues).toEqual([]);
    expect(items[0]).toEqual({
      line: 2, invoiceId: "INV-1", token: TOKENS.USDC, to: TO, amount: 100_000n,
    });
  });

  it("uses each token's own decimals, not one shared number", () => {
    const { items } = resolveRows(
      [row({ tokenSymbol: "cirBTC", amount: "0.00001" })], TOKENS, DECIMALS,
    );
    expect(items[0]!.amount).toBe(1_000n);
  });

  it("matches a token symbol regardless of case", () => {
    const { items, issues } = resolveRows([row({ tokenSymbol: "usdc" })], TOKENS, DECIMALS);
    expect(issues).toEqual([]);
    expect(items[0]!.token).toBe(TOKENS.USDC);
  });

  it("reports an unknown symbol against its line and drops the row", () => {
    const { items, issues } = resolveRows([row({ tokenSymbol: "DAI" })], TOKENS, DECIMALS);
    expect(items).toEqual([]);
    expect(issues[0]).toEqual({ line: 2, message: expect.stringMatching(/DAI/) });
  });

  it("reports a malformed recipient address", () => {
    const { items, issues } = resolveRows([row({ to: "0x123" })], TOKENS, DECIMALS);
    expect(items).toEqual([]);
    expect(issues[0]!.message).toMatch(/address/i);
  });

  it("reports an empty invoice id, which would make a meaningless reference", () => {
    const { issues } = resolveRows([row({ invoiceId: "" })], TOKENS, DECIMALS);
    expect(issues[0]!.message).toMatch(/invoice/i);
  });

  it("collects every bad row instead of stopping at the first", () => {
    const { items, issues } = resolveRows(
      [row({ line: 2, tokenSymbol: "DAI" }), row({ line: 3, to: "nope" }), row({ line: 4 })],
      TOKENS, DECIMALS,
    );
    expect(issues).toHaveLength(2);
    expect(items).toHaveLength(1);
  });

  it("fails loudly when the decimals table is missing a token it was given", () => {
    const { issues } = resolveRows([row()], TOKENS, {});
    expect(issues[0]!.message).toMatch(/decimals/i);
  });
});
```

- [x] **Step 2: Run the test and watch it fail**

Run: `cd packages/core && npx vitest run test/csv.test.ts`
Expected: FAIL — `toBaseUnits is not a function`.

- [x] **Step 3: Write the implementation**

Append to `packages/core/src/csv.ts`:

```ts
import { getAddress, isAddress } from "viem";
import type { TokenSet } from "./constants.js";
import type { ManifestItem } from "./types.js";

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
): { ok: true; value: bigint } | { ok: false; reason: string } {
  const t = text.trim();
  if (t === "") return { ok: false, reason: "Amount is empty." };
  if (!/^\d*\.?\d*$/.test(t) || t === ".") {
    return {
      ok: false,
      reason: `"${text}" is not a plain decimal number. Scientific notation, thousands separators and negative values are not accepted.`,
    };
  }

  const [whole = "", frac = ""] = t.split(".");
  if (frac.length > decimals) {
    return {
      ok: false,
      reason: `"${text}" has ${frac.length} decimal places but this token has ${decimals}. Rounding a payment is not something this tool will do quietly.`,
    };
  }

  const value = BigInt((whole || "0") + frac.padEnd(decimals, "0"));
  if (value === 0n) {
    return { ok: false, reason: "Amount is zero, which is legal on chain but meaningless in a payout." };
  }
  return { ok: true, value };
}

/**
 * Parsed text into manifest items.
 *
 * `decimals` is keyed by lowercased token address and can only come from
 * `decimals()` on chain. Requiring it here is how the "never hardcode
 * decimals" rule becomes a type signature instead of a comment.
 */
export function resolveRows(
  rows: ParsedRow[],
  tokens: TokenSet,
  decimals: Record<string, number>,
): { items: ResolvedRow[]; issues: CsvIssue[] } {
  const items: ResolvedRow[] = [];
  const issues: CsvIssue[] = [];

  const bySymbol = new Map<string, `0x${string}`>(
    Object.entries(tokens).map(([symbol, address]) => [symbol.toLowerCase(), address]),
  );

  for (const row of rows) {
    if (row.invoiceId === "") {
      issues.push({ line: row.line, message: "Invoice reference is empty." });
      continue;
    }

    const token = bySymbol.get(row.tokenSymbol.toLowerCase());
    if (!token) {
      issues.push({
        line: row.line,
        message: `Unknown token "${row.tokenSymbol}". This chain has ${[...bySymbol.keys()].join(", ")}.`,
      });
      continue;
    }

    const d = decimals[token.toLowerCase()];
    if (d === undefined) {
      issues.push({
        line: row.line,
        message: `No on-chain decimals were read for ${row.tokenSymbol}.`,
      });
      continue;
    }

    if (!isAddress(row.to)) {
      issues.push({ line: row.line, message: `"${row.to}" is not a valid address.` });
      continue;
    }

    const amount = toBaseUnits(row.amount, d);
    if (!amount.ok) {
      issues.push({ line: row.line, message: amount.reason });
      continue;
    }

    items.push({
      line: row.line,
      invoiceId: row.invoiceId,
      token,
      to: getAddress(row.to),
      amount: amount.value,
    });
  }

  return { items, issues };
}
```

- [x] **Step 4: Run the test and watch it pass**

Run: `cd packages/core && npx vitest run test/csv.test.ts`
Expected: PASS, 20 tests.

- [x] **Step 5: Commit**

```bash
git add packages/core/src/csv.ts packages/core/test/csv.test.ts
git commit -m "$(cat <<'EOF'
feat(core): convert CSV amounts by string arithmetic, never by float

resolveRows cannot be called without a decimals table, and that table can
only come from decimals() on chain — the "never hardcode decimals" rule
becomes a type signature rather than a comment.

toBaseUnits refuses more precision than a token carries instead of
rounding. Silently truncating 0.0000001 for a 6-decimal token pays zero
and reports success, which is the exact failure a payout tool must not
have. A regression test pins 123456789.123456, a value binary64 cannot
hold exactly.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Validation

**Files:**
- Create: `packages/core/src/validate.ts`
- Create: `packages/core/test/validate.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `ResolvedRow` from Task 2; `MAX_ITEMS_PER_RUN` from `build.js`.
- Produces: `interface RowIssue { line?: number; invoiceId?: string; message: string }`, `validateRun(items: ResolvedRow[]): { errors: RowIssue[]; warnings: RowIssue[] }`.

Returns arrays and never throws. Fixing a 400-row payroll one error per attempt is unusable. `buildRun`'s existing `throw`s stay as the last guard for callers reaching it directly.

- [x] **Step 1: Write the failing test**

```ts
// packages/core/test/validate.test.ts
import { describe, it, expect } from "vitest";
import { validateRun } from "../src/validate.js";
import type { ResolvedRow } from "../src/csv.js";

const TOKEN = "0x3600000000000000000000000000000000000000" as const;
const TO = "0xe48A096B9E74f064b13c17734af29F85E02d732a" as const;

const row = (over: Partial<ResolvedRow> = {}): ResolvedRow => ({
  line: 2, invoiceId: "INV-1", token: TOKEN, to: TO, amount: 100_000n, ...over,
});

describe("validateRun", () => {
  it("passes a clean run with nothing to say", () => {
    const r = validateRun([row(), row({ line: 3, invoiceId: "INV-2" })]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("rejects the zero address, which Arc reverts on", () => {
    const r = validateRun([row({ to: "0x0000000000000000000000000000000000000000" })]);
    expect(r.errors[0]!.line).toBe(2);
    expect(r.errors[0]!.message).toMatch(/zero address/i);
  });

  it("rejects a duplicate invoice id and names the line that repeats it", () => {
    const r = validateRun([row({ line: 2 }), row({ line: 7 })]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.line).toBe(7);
    expect(r.errors[0]!.message).toMatch(/INV-1/);
    expect(r.errors[0]!.message).toMatch(/line 2/);
  });

  it("rejects a run over the item limit", () => {
    const many = Array.from({ length: 401 }, (_, i) =>
      row({ line: i + 2, invoiceId: `INV-${i}` }));
    const r = validateRun(many);
    expect(r.errors.some((e) => /400/.test(e.message))).toBe(true);
  });

  it("accepts exactly the item limit", () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      row({ line: i + 2, invoiceId: `INV-${i}` }));
    expect(validateRun(many).errors).toEqual([]);
  });

  it("warns about a repeated recipient without blocking it", () => {
    const r = validateRun([
      row({ line: 2, invoiceId: "INV-1" }),
      row({ line: 3, invoiceId: "INV-2" }),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.line).toBe(3);
    expect(r.warnings[0]!.message).toMatch(/two invoices to one recipient is valid/i);
  });

  it("rejects an empty run", () => {
    expect(validateRun([]).errors[0]!.message).toMatch(/no rows/i);
  });
});
```

- [x] **Step 2: Run the test and watch it fail**

Run: `cd packages/core && npx vitest run test/validate.test.ts`
Expected: FAIL — `Failed to load url ../src/validate.js`.

- [x] **Step 3: Write the implementation**

```ts
// packages/core/src/validate.ts
import { MAX_ITEMS_PER_RUN } from "./build.js";
import type { ResolvedRow } from "./csv.js";

export interface RowIssue {
  line?: number;
  invoiceId?: string;
  message: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Everything checkable without the network, reported all at once.
 *
 * Arrays, never throws: fixing a 400-row payroll one error per attempt is
 * unusable. buildRun keeps its own throws — they are the last guard for a
 * caller reaching it directly, not a duplicate of this.
 *
 * Per-token balances and Arc's runtime blocklist need the chain and belong to
 * preflight, not here.
 */
export function validateRun(items: ResolvedRow[]): {
  errors: RowIssue[];
  warnings: RowIssue[];
} {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  if (items.length === 0) {
    return { errors: [{ message: "This file has no rows to pay." }], warnings };
  }

  if (items.length > MAX_ITEMS_PER_RUN) {
    errors.push({
      message: `This run has ${items.length} rows; the limit is ${MAX_ITEMS_PER_RUN}, to stay under Arc's block gas limit. Split it into separate files.`,
    });
  }

  const invoiceLine = new Map<string, number>();
  const recipientLine = new Map<string, number>();

  for (const item of items) {
    if (item.to.toLowerCase() === ZERO) {
      errors.push({
        line: item.line,
        invoiceId: item.invoiceId,
        message: "Pays the zero address. Arc reverts on this, and burning a payroll is not a thing this tool will do.",
      });
    }

    const seenInvoice = invoiceLine.get(item.invoiceId);
    if (seenInvoice !== undefined) {
      errors.push({
        line: item.line,
        invoiceId: item.invoiceId,
        message: `Invoice "${item.invoiceId}" already appears on line ${seenInvoice}. Two payments under one reference cannot be told apart when reconciling.`,
      });
    } else {
      invoiceLine.set(item.invoiceId, item.line);
    }

    const to = item.to.toLowerCase();
    const seenRecipient = recipientLine.get(to);
    if (seenRecipient !== undefined) {
      warnings.push({
        line: item.line,
        invoiceId: item.invoiceId,
        message: `Also paid on line ${seenRecipient}. Two invoices to one recipient is valid — check it is intended.`,
      });
    } else {
      recipientLine.set(to, item.line);
    }
  }

  return { errors, warnings };
}
```

- [x] **Step 4: Export it**

Append to `packages/core/src/index.ts`:

```ts
export * from "./validate.js";
```

- [x] **Step 5: Run the test and watch it pass**

Run: `cd packages/core && npx vitest run test/validate.test.ts`
Expected: PASS, 7 tests.

- [x] **Step 6: Commit**

```bash
git add packages/core/src/validate.ts packages/core/test/validate.test.ts packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core): validate a run and report every problem at once

Arrays, never throws. Fixing a 400-row payroll one error per attempt is
unusable, so every issue carries its line number and they all come back
together.

A repeated recipient is a warning, not an error: paying one person two
invoices is ordinary. A repeated invoice id is an error, because two
payments under one reference cannot be told apart when reconciling.

buildRun keeps its own throws. They are the last guard for a caller
reaching it directly, not a duplicate of this.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Run salt from the payer's signature

**Files:**
- Create: `packages/core/src/salt.ts`
- Create: `packages/core/test/salt.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeRunLabel(label: string): string`, `saltMessageFor(chainId: number, runLabel: string): string`, `saltFromSignature(signature: Hex): Hex`.

Spec §2. This replaces `keccak256(toHex("ledgerline-<network>-salt-1"))`, a public constant that any observer can recompute, defeating the privacy property `memo.ts` advertises.

- [x] **Step 1: Write the failing test**

```ts
// packages/core/test/salt.test.ts
import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256 } from "viem";
import { normalizeRunLabel, saltMessageFor, saltFromSignature } from "../src/salt.js";
import { memoIdFor } from "../src/memo.js";

describe("normalizeRunLabel", () => {
  it("trims and collapses inner whitespace so a stray space cannot change the salt", () => {
    expect(normalizeRunLabel("  Payroll   2026-09 ")).toBe("Payroll 2026-09");
  });

  it("preserves case, because the label is shown to people", () => {
    expect(normalizeRunLabel("Payroll SEPT")).toBe("Payroll SEPT");
  });

  it("refuses an empty label, which would make every run share one salt", () => {
    expect(() => normalizeRunLabel("   ")).toThrow(/empty/i);
  });
});

describe("saltMessageFor", () => {
  it("binds the salt to the network and the label", () => {
    expect(saltMessageFor(5042002, "Payroll 2026-09")).toBe(
      "ledgerline-run-salt:v1:5042002:Payroll 2026-09",
    );
  });

  it("normalises the label before building the message", () => {
    expect(saltMessageFor(5042, "  Payroll  2026-09 ")).toBe(
      saltMessageFor(5042, "Payroll 2026-09"),
    );
  });

  it("gives a different message per chain, so testnet never reuses a mainnet salt", () => {
    expect(saltMessageFor(5042, "x")).not.toBe(saltMessageFor(5042002, "x"));
  });
});

describe("saltFromSignature", () => {
  it("is the keccak of the signature", () => {
    const sig = ("0x" + "ab".repeat(65)) as `0x${string}`;
    expect(saltFromSignature(sig)).toBe(keccak256(sig));
  });

  it("returns 32 bytes, which memoIdFor requires", () => {
    const sig = ("0x" + "cd".repeat(65)) as `0x${string}`;
    const salt = saltFromSignature(sig);
    expect(salt).toHaveLength(66);
    expect(() => memoIdFor(salt, "INV-1")).not.toThrow();
  });
});

describe("end to end", () => {
  const account = privateKeyToAccount(("0x" + "11".repeat(32)) as `0x${string}`);

  it("reproduces the same salt from the same key and label", async () => {
    const msg = saltMessageFor(5042002, "Payroll 2026-09");
    const a = saltFromSignature(await account.signMessage({ message: msg }));
    const b = saltFromSignature(await account.signMessage({ message: msg }));
    expect(b).toBe(a);
  });

  it("gives a different salt for a different label", async () => {
    const a = saltFromSignature(
      await account.signMessage({ message: saltMessageFor(5042002, "Payroll 2026-09") }));
    const b = saltFromSignature(
      await account.signMessage({ message: saltMessageFor(5042002, "Payroll 2026-10") }));
    expect(b).not.toBe(a);
  });

  it("gives a different salt for a different payer", async () => {
    const other = privateKeyToAccount(("0x" + "22".repeat(32)) as `0x${string}`);
    const msg = saltMessageFor(5042002, "Payroll 2026-09");
    const a = saltFromSignature(await account.signMessage({ message: msg }));
    const b = saltFromSignature(await other.signMessage({ message: msg }));
    expect(b).not.toBe(a);
  });
});
```

- [x] **Step 2: Run the test and watch it fail**

Run: `cd packages/core && npx vitest run test/salt.test.ts`
Expected: FAIL — `Failed to load url ../src/salt.js`.

- [x] **Step 3: Write the implementation**

```ts
// packages/core/src/salt.ts
import { keccak256 } from "viem";
import type { Hex } from "./types.js";

/**
 * The run salt is derived from the payer's own signature over the run label.
 *
 * It replaces a public constant string, which any observer could recompute —
 * and since memoId = keccak(salt ‖ invoiceId) over conventional invoice ids,
 * that let anyone reading the chain rebuild who paid whom, defeating exactly
 * the property memo.ts advertises.
 *
 * A random salt would fix that and introduce a worse failure: held only in
 * browser memory, closing the tab would destroy every recipient's ability to
 * verify, permanently. A signature is unguessable to observers AND
 * reproducible by the payer, with nothing stored anywhere.
 *
 * This leans on deterministic ECDSA. [measured] viem's local signer is
 * deterministic; browser wallets sign with their own implementations and are
 * [unverified]. Nothing here assumes it — the recovery path re-derives and
 * then checks against the memoIds actually in the transaction's logs.
 */

/** Collapse whitespace so a trailing space typed on the recovery screen
 *  cannot silently produce a different salt. Case is kept: a label is shown
 *  to people, and lowercasing it would make recovery lossy in the other
 *  direction. */
export function normalizeRunLabel(label: string): string {
  const normalized = label.trim().replace(/\s+/g, " ");
  if (normalized === "") {
    throw new Error(
      "runLabel must not be empty — it is what separates this run's references from every other run's",
    );
  }
  return normalized;
}

/** The exact message the payer signs. Changing it changes every future salt,
 *  which is why it carries an explicit v1. */
export function saltMessageFor(chainId: number, runLabel: string): string {
  return `ledgerline-run-salt:v1:${chainId}:${normalizeRunLabel(runLabel)}`;
}

export function saltFromSignature(signature: Hex): Hex {
  return keccak256(signature);
}
```

- [x] **Step 4: Export it**

Append to `packages/core/src/index.ts`:

```ts
export * from "./salt.js";
```

- [x] **Step 5: Run the test and watch it pass**

Run: `cd packages/core && npx vitest run test/salt.test.ts`
Expected: PASS, 10 tests.

- [x] **Step 6: Commit**

```bash
git add packages/core/src/salt.ts packages/core/test/salt.test.ts packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core): derive the run salt from the payer's signature

The only salt this repository ever produced was
keccak256("ledgerline-<network>-salt-1") — a public constant. Since
memoId = keccak(salt ‖ invoiceId) over conventional invoice ids, anyone
reading the chain could recompute every reference and rebuild who paid
whom, defeating the property memo.ts advertises and the reason the design
uses a Merkle tree rather than a flat hash.

A random salt fixes that and breaks something worse: held only in browser
memory, closing the tab destroys every recipient's ability to verify,
permanently and unrecoverably. A signature over the run label is
unguessable to observers and reproducible by the payer, with nothing
stored anywhere.

The label is normalised (trimmed, inner whitespace collapsed, case kept)
so a stray space on the recovery screen cannot silently derive a
different salt.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The shared executor

**Files:**
- Create: `packages/core/src/execute.ts`
- Create: `packages/core/test/execute.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `buildRun`, `buildPreflightData`, `decodePreflightResult`, `gasPolicy`, `explainRevert`, `MIN_MAX_FEE_WEI`, `Manifest`, `Address`, `Hex`.
- Produces: `interface ExecuteIO`, `interface PreparedTx`, `type RunStage`, `type RunOutcome`, `executeRun(args): Promise<RunOutcome>`, `ioFromPublicClient(client): ExecuteIO`.

Spec §4. `ExecuteIO` is a narrow structural interface rather than viem's `PublicClient` so the tests can fake it exactly; `ioFromPublicClient` adapts the real thing, including turning viem's throw-on-missing `getTransaction` into a `null`.

- [x] **Step 1: Write the failing test**

```ts
// packages/core/test/execute.test.ts
import { describe, it, expect, vi } from "vitest";
import { encodeAbiParameters, keccak256, toHex } from "viem";
import { executeRun, type ExecuteIO } from "../src/execute.js";
import { clientRunIdFor } from "../src/build.js";
import type { Address, Hex, Manifest } from "../src/types.js";

const PAYER = "0x595558B91DFAA97840F2F00bF6728A74B8E6de17" as Address;
const TO = "0xe48A096B9E74f064b13c17734af29F85E02d732a" as Address;
const USDC = "0x3600000000000000000000000000000000000000" as Address;
const ANCHOR = "0xb8907A07768D936D1D498257E5803c91033a8802" as Address;
const HASH = ("0x" + "ab".repeat(32)) as Hex;

const items = [{ invoiceId: "INV-1", token: USDC, to: TO, amount: 100_000n }];
const manifest: Manifest = {
  clientRunId: clientRunIdFor(PAYER, items, "test-run"),
  payer: PAYER,
  chainId: 5042002,
  runSalt: keccak256(toHex("salt")),
  items,
};

/** aggregate3 returns (bool success, bytes returnData)[] — one per call, and
 *  call 0 is the anchor commit. */
function preflight(flags: boolean[]): Hex {
  return encodeAbiParameters(
    [{ type: "tuple[]", components: [{ type: "bool" }, { type: "bytes" }] }],
    [flags.map((ok) => [ok, "0x"] as const)],
  );
}

function io(over: Partial<ExecuteIO> = {}): ExecuteIO {
  return {
    balanceOf: async () => 10_000_000n,
    decimalsOf: async () => 6,
    simulate: async () => preflight([true, true]),
    gasPrice: async () => 20_000_000_000n,
    priorityFee: async () => 1_000_000_000n,
    estimateGas: async () => 200_000n,
    findTransaction: async () => ({ maxFeePerGas: 30_000_000_000n }),
    waitForReceipt: async () => ({
      status: "success", blockNumber: 1n, gasUsed: 200_000n,
      effectiveGasPrice: 25_000_000_000n, logs: [],
    }),
    ...over,
  };
}

const run = (over: Partial<ExecuteIO> = {}, send = async () => HASH) =>
  executeRun({
    manifest, anchor: ANCHOR, io: io(over), send,
    dropCheck: { attempts: 1, delayMs: 0 },
  });

describe("executeRun", () => {
  it("confirms a healthy run", async () => {
    const out = await run();
    expect(out.state).toBe("confirmed");
    if (out.state === "confirmed") expect(out.txHash).toBe(HASH);
  });

  it("blocks on a short balance without signing anything", async () => {
    const send = vi.fn(async () => HASH);
    const out = await run({ balanceOf: async () => 1n }, send);
    expect(out.state).toBe("blocked");
    if (out.state === "blocked") expect(out.reason).toBe("balance");
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks on a failing preflight row without signing anything", async () => {
    const send = vi.fn(async () => HASH);
    const out = await run({ simulate: async () => preflight([true, false]) }, send);
    expect(out.state).toBe("blocked");
    if (out.state === "blocked") {
      expect(out.reason).toBe("preflight");
      expect(out.details).toMatch(/INV-1/);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("names the anchor commit, not an invoice, when call zero fails", async () => {
    const out = await run({ simulate: async () => preflight([false, true]) });
    if (out.state === "blocked") expect(out.details).toMatch(/anchor/i);
  });

  it("reports a transaction the node never saw as dropped, not pending", async () => {
    const out = await run({ findTransaction: async () => null });
    expect(out.state).toBe("dropped");
    if (out.state === "dropped") expect(out.txHash).toBe(HASH);
  });

  it("warns when the wallet lowered the fee below the silent-drop floor", async () => {
    const out = await run({
      findTransaction: async () => ({ maxFeePerGas: 15_000_000_000n }),
    });
    expect(out.state).toBe("confirmed");
    if (out.state === "confirmed") {
      expect(out.feeWarning).toMatch(/25 Gwei/);
      expect(out.broadcastMaxFeePerGas).toBe(15_000_000_000n);
    }
  });

  it("does not warn when the wallet left the fee alone", async () => {
    const out = await run();
    if (out.state === "confirmed") expect(out.feeWarning).toBeUndefined();
  });

  it("reports a mined failure as reverted, never as confirmed", async () => {
    const out = await run({
      waitForReceipt: async () => ({
        status: "reverted", blockNumber: 1n, gasUsed: 100n,
        effectiveGasPrice: 25_000_000_000n, logs: [],
      }),
    });
    expect(out.state).toBe("reverted");
  });

  it("reports no receipt inside the timeout as pending, never as confirmed", async () => {
    const out = await run({ waitForReceipt: async () => null });
    expect(out.state).toBe("pending");
  });

  it("applies the 25 Gwei floor to what it asks the wallet to sign", async () => {
    let seen: bigint | undefined;
    await run({}, async (tx) => { seen = tx.maxFeePerGas; return HASH; });
    expect(seen).toBe(30_000_000_000n); // 20 Gwei × 1.5
  });

  it("pads the gas estimate by 20 percent", async () => {
    let seen: bigint | undefined;
    await run({}, async (tx) => { seen = tx.gas; return HASH; });
    expect(seen).toBe(240_000n);
  });

  it("reports every stage it reached, in order", async () => {
    const stages: string[] = [];
    await executeRun({
      manifest, anchor: ANCHOR, io: io(), send: async () => HASH,
      dropCheck: { attempts: 1, delayMs: 0 },
      onProgress: (s) => stages.push(s),
    });
    expect(stages).toEqual([
      "balances", "preflight", "fees", "signing", "broadcast", "confirming",
    ]);
  });

  it("treats a rejected signature as blocked, not as a crash", async () => {
    const out = await run({}, async () => { throw new Error("User rejected the request"); });
    expect(out.state).toBe("blocked");
    if (out.state === "blocked") {
      expect(out.reason).toBe("signature");
      expect(out.details).toMatch(/rejected/i);
    }
  });
});
```

- [x] **Step 2: Run the test and watch it fail**

Run: `cd packages/core && npx vitest run test/execute.test.ts`
Expected: FAIL — `Failed to load url ../src/execute.js`.

- [x] **Step 3: Write the implementation**

```ts
// packages/core/src/execute.ts
import { buildRun } from "./build.js";
import { MIN_MAX_FEE_WEI } from "./constants.js";
import { explainRevert } from "./errors.js";
import { buildPreflightData, decodePreflightResult, gasPolicy } from "./preflight.js";
import type { Address, Hex, Manifest, RawLog } from "./types.js";

/**
 * The one file in core that touches the network, and deliberately so.
 *
 * The script and the browser perform the same sequence, differing only at the
 * ends: signing with a private key versus a wallet, writing a file versus
 * offering a download. This project has already paid once for keeping two
 * copies of a sequence like that — testnet-run.ts and mainnet-run.ts were
 * merged because "two near-identical scripts drift, and drift costs real
 * money". The duplicated middle here contains the gas floor, so the argument
 * is stronger, not weaker.
 *
 * reconcile() stays pure. Invariant #1 is about the reconciler.
 */

export interface RunReceipt {
  status: "success" | "reverted";
  blockNumber: bigint;
  gasUsed: bigint;
  /** Kept because Arc charges gas in USDC and the script reports the cost. */
  effectiveGasPrice: bigint;
  logs: RawLog[];
}

/** Narrow on purpose. A fake in a test implements exactly this, and
 *  ioFromPublicClient adapts viem to it. */
export interface ExecuteIO {
  balanceOf(token: Address, owner: Address): Promise<bigint>;
  decimalsOf(token: Address): Promise<number>;
  /** eth_call from `from`. Returns the raw return data. */
  simulate(from: Address, to: Address, data: Hex): Promise<Hex>;
  gasPrice(): Promise<bigint>;
  priorityFee(): Promise<bigint>;
  estimateGas(from: Address, to: Address, data: Hex): Promise<bigint>;
  /** null when the node does not know the hash — which on Arc usually means
   *  the mempool dropped it for being priced below the floor. */
  findTransaction(hash: Hex): Promise<{ maxFeePerGas?: bigint } | null>;
  /** null when no receipt arrived inside the timeout. */
  waitForReceipt(hash: Hex, timeoutMs: number): Promise<RunReceipt | null>;
}

export interface PreparedTx {
  to: Address;
  data: Hex;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export type RunStage =
  | "balances" | "preflight" | "fees" | "signing" | "broadcast" | "confirming";

export type RunOutcome =
  | { state: "blocked"; reason: "balance" | "preflight" | "signature"; details: string }
  | { state: "dropped"; txHash: Hex; sentMaxFeePerGas: bigint }
  | { state: "pending"; txHash: Hex; sentMaxFeePerGas: bigint; feeWarning?: string }
  | { state: "reverted"; txHash: Hex; receipt: RunReceipt }
  | {
      state: "confirmed";
      txHash: Hex;
      receipt: RunReceipt;
      sentMaxFeePerGas: bigint;
      broadcastMaxFeePerGas?: bigint;
      feeWarning?: string;
    };

export interface ExecuteRunArgs {
  manifest: Manifest;
  anchor: Address;
  io: ExecuteIO;
  send: (tx: PreparedTx) => Promise<Hex>;
  onProgress?: (stage: RunStage) => void;
  /** How hard to look for the broadcast transaction before calling it dropped. */
  dropCheck?: { attempts: number; delayMs: number };
  receiptTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function executeRun({
  manifest, anchor, io, send, onProgress,
  dropCheck = { attempts: 6, delayMs: 1_500 },
  receiptTimeoutMs = 180_000,
  sleep = defaultSleep,
}: ExecuteRunArgs): Promise<RunOutcome> {
  const say = (s: RunStage) => onProgress?.(s);
  const payer = manifest.payer;

  // 1. Balances, per token and never pooled.
  say("balances");
  const needed = new Map<string, bigint>();
  for (const item of manifest.items) {
    const key = item.token.toLowerCase();
    needed.set(key, (needed.get(key) ?? 0n) + item.amount);
  }
  for (const [key, need] of needed) {
    const token = manifest.items.find((i) => i.token.toLowerCase() === key)!.token;
    const [balance, decimals] = await Promise.all([
      io.balanceOf(token, payer),
      io.decimalsOf(token),
    ]);
    if (balance < need) {
      return {
        state: "blocked",
        reason: "balance",
        details: `Short of ${token}: need ${need} base units, hold ${balance} (${decimals} decimals). Nothing was signed.`,
      };
    }
  }

  // 2. Preflight. allowFailure=true so one bad row reports itself instead of
  //    reverting the simulation, and it is the only way to see Arc's runtime
  //    blocklist, which has no pre-check.
  say("preflight");
  const built = buildRun(manifest, anchor);
  try {
    const returnData = await io.simulate(payer, built.to, buildPreflightData(manifest, anchor));
    const outcomes = decodePreflightResult(returnData);
    const failed = outcomes
      .map((o, i) => ({ ok: o.success, label: i === 0 ? "the anchor commit" : manifest.items[i - 1]!.invoiceId }))
      .filter((o) => !o.ok);
    if (failed.length > 0) {
      return {
        state: "blocked",
        reason: "preflight",
        details: `Simulation failed for ${failed.map((f) => f.label).join(", ")}. Nothing was signed.`,
      };
    }
  } catch (err) {
    const { name, message } = explainRevert(err);
    return {
      state: "blocked",
      reason: "preflight",
      details: `Simulation reverted${name ? ` with ${name}` : ""}: ${message}. Nothing was signed.`,
    };
  }

  // 3. Fees. The floor is the whole point: below 20 Gwei Arc drops silently.
  say("fees");
  const fees = gasPolicy(await io.gasPrice(), await io.priorityFee());
  const estimate = await io.estimateGas(payer, built.to, built.data);
  const tx: PreparedTx = {
    to: built.to,
    data: built.data,
    gas: (estimate * 12n) / 10n,
    ...fees,
  };

  // 4. Sign and broadcast.
  say("signing");
  let txHash: Hex;
  try {
    txHash = await send(tx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { state: "blocked", reason: "signature", details: message };
  }

  // 5. Read back what was ACTUALLY broadcast. We set the fee correctly, but a
  //    browser wallet owns its own fee interface and the user can edit it.
  say("broadcast");
  let broadcast: { maxFeePerGas?: bigint } | null = null;
  for (let i = 0; i < dropCheck.attempts; i++) {
    broadcast = await io.findTransaction(txHash);
    if (broadcast) break;
    if (i < dropCheck.attempts - 1) await sleep(dropCheck.delayMs);
  }

  if (!broadcast) {
    return { state: "dropped", txHash, sentMaxFeePerGas: fees.maxFeePerGas };
  }

  const broadcastMaxFeePerGas = broadcast.maxFeePerGas;
  const feeWarning =
    broadcastMaxFeePerGas !== undefined && broadcastMaxFeePerGas < MIN_MAX_FEE_WEI
      ? `This transaction was broadcast at ${broadcastMaxFeePerGas} wei per gas, below the 25 Gwei floor. Arc drops transactions under 20 Gwei without a receipt or an error, so it may never be included.`
      : undefined;

  // 6. A receipt, or an honest pending. Never a claim of success without one.
  say("confirming");
  const receipt = await io.waitForReceipt(txHash, receiptTimeoutMs);
  if (!receipt) {
    return { state: "pending", txHash, sentMaxFeePerGas: fees.maxFeePerGas, feeWarning };
  }
  if (receipt.status === "reverted") {
    return { state: "reverted", txHash, receipt };
  }
  return {
    state: "confirmed",
    txHash,
    receipt,
    sentMaxFeePerGas: fees.maxFeePerGas,
    broadcastMaxFeePerGas,
    feeWarning,
  };
}

const balanceAbi = [{
  type: "function", name: "balanceOf", stateMutability: "view",
  inputs: [{ type: "address" }], outputs: [{ type: "uint256" }],
}] as const;

const decimalsAbi = [{
  type: "function", name: "decimals", stateMutability: "view",
  inputs: [], outputs: [{ type: "uint8" }],
}] as const;

/** Minimal shape of viem's PublicClient that this adapter needs. */
interface ViemLikeClient {
  readContract(args: unknown): Promise<unknown>;
  call(args: unknown): Promise<{ data?: Hex }>;
  getGasPrice(): Promise<bigint>;
  estimateMaxPriorityFeePerGas(): Promise<bigint>;
  estimateGas(args: unknown): Promise<bigint>;
  getTransaction(args: { hash: Hex }): Promise<{ maxFeePerGas?: bigint }>;
  waitForTransactionReceipt(args: unknown): Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    gasUsed: bigint;
    effectiveGasPrice: bigint;
    logs: { address: string; topics: string[]; data: string; logIndex: number | null }[];
  }>;
}

/** viem throws when a hash is unknown; ExecuteIO says null, because "the node
 *  has never heard of this" is an answer, not a failure. */
export function ioFromPublicClient(client: ViemLikeClient): ExecuteIO {
  return {
    balanceOf: (token, owner) =>
      client.readContract({
        address: token, abi: balanceAbi, functionName: "balanceOf", args: [owner],
      }) as Promise<bigint>,

    decimalsOf: async (token) =>
      Number(await client.readContract({
        address: token, abi: decimalsAbi, functionName: "decimals",
      })),

    simulate: async (from, to, data) => {
      const r = await client.call({ account: from, to, data });
      return (r.data ?? "0x") as Hex;
    },

    gasPrice: () => client.getGasPrice(),
    priorityFee: () => client.estimateMaxPriorityFeePerGas(),
    estimateGas: (account, to, data) => client.estimateGas({ account, to, data }),

    findTransaction: async (hash) => {
      try {
        return await client.getTransaction({ hash });
      } catch {
        return null;
      }
    },

    waitForReceipt: async (hash, timeout) => {
      try {
        const r = await client.waitForTransactionReceipt({ hash, timeout });
        return {
          status: r.status,
          blockNumber: r.blockNumber,
          gasUsed: r.gasUsed,
          effectiveGasPrice: r.effectiveGasPrice,
          logs: r.logs.map((l, i) => ({
            address: l.address as Address,
            topics: l.topics as Hex[],
            data: l.data as Hex,
            logIndex: l.logIndex ?? i,
          })),
        };
      } catch {
        return null;
      }
    },
  };
}
```

- [x] **Step 4: Export it**

Append to `packages/core/src/index.ts`:

```ts
export * from "./execute.js";
```

- [x] **Step 5: Record the exception in CLAUDE.md**

In `CLAUDE.md`, under **Non-negotiable invariants**, extend invariant 1 by appending this paragraph directly beneath it:

```markdown
   *One deliberate exception:* `packages/core/src/execute.ts` is async and
   takes a client, because the payout sequence must be identical in the script
   and the browser and two copies of it would drift across the gas floor. It
   orchestrates; it decides nothing. `reconcile()` is still pure and still
   takes no handle. Do not "tidy" this file out of core.
```

- [x] **Step 6: Run the test and watch it pass**

Run: `cd packages/core && npx vitest run test/execute.test.ts`
Expected: PASS, 13 tests.

- [x] **Step 7: Run the whole suite**

Run: `pnpm test`
Expected: all core and CLI tests pass.

- [x] **Step 8: Commit**

```bash
git add packages/core/src/execute.ts packages/core/test/execute.test.ts packages/core/src/index.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(core): one payout sequence for the script and the browser

Both perform the same eighty lines and differ only at the ends: a private
key or a wallet, a file or a download. Keeping two copies is what this
project already paid for once, when testnet-run.ts and mainnet-run.ts were
merged — and the duplicated middle here contains the gas floor.

The new part is step 5. We set maxFeePerGas correctly, but a browser
wallet owns its fee interface and the user can lower it; under 20 Gwei Arc
drops the transaction with no receipt, no error and no revert. So the
transaction is read back after broadcast: unknown to the node means
dropped, and a fee below the floor is reported rather than assumed away.

RunOutcome makes invariant #4 the compiler's problem — no path reaches
confirmed without a receipt whose status is success, and pending and
dropped are states rather than the absence of one.

execute.ts is a deliberate exception to core's network-free character,
recorded in CLAUDE.md so it is not tidied away later. reconcile() stays
pure.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Move the script onto the shared executor

**Files:**
- Modify: `scripts/run-payout.ts`

**Interfaces:**
- Consumes: `executeRun`, `ioFromPublicClient`, `RunOutcome`, `saltMessageFor`, `saltFromSignature` from Tasks 4 and 5.
- Produces: nothing new.

Doing this before the UI proves the shared path against a real chain while there is still only one consumer. The script also moves to the signature-derived salt, so both consumers produce salts the same way.

- [x] **Step 1: Rewrite the middle of the script**

In `scripts/run-payout.ts`, replace everything from the `const manifest: Manifest = {` declaration through the end of the file with:

```ts
// The salt is now derived from the payer's signature rather than a public
// constant, so an observer cannot recompute the references. Same derivation
// the browser uses.
const runSalt = saltFromSignature(
  await account.signMessage({ message: saltMessageFor(net.chain.id, RUN_LABEL) }),
);

const manifest: Manifest = {
  clientRunId: clientRunIdFor(account.address, items, RUN_LABEL),
  payer: account.address,
  chainId: net.chain.id,
  runSalt,
  items,
};

const built = buildRun(manifest, net.anchor);

console.log(`\n  network      ${net.name} (${net.chain.id})`);
console.log(`  payer        ${account.address}`);
console.log(`  recipient    ${RECIPIENT}`);
console.log(`  anchor       ${net.anchor}`);
console.log(`  runLabel     ${RUN_LABEL}`);
console.log(`  clientRunId  ${manifest.clientRunId}`);
console.log(`  runId        ${runIdFor(account.address, manifest.clientRunId)}`);
console.log(`  root         ${built.root}`);

if (dryRun) {
  // Preflight without signing: executeRun's send is never reached because the
  // balance and simulation stages come first and we stop at them.
  const outcome = await executeRun({
    manifest, anchor: net.anchor, io: ioFromPublicClient(publicClient),
    send: async () => { throw new Error("--dry-run: refusing to sign"); },
    onProgress: (s) => console.log(`  ${s}…`),
  });
  if (outcome.state === "blocked" && outcome.reason !== "signature") {
    console.error(`\n  ${outcome.details}\n`);
    process.exit(1);
  }
  console.log(`\n  --dry-run: everything checks out against live ${net.name} state. Nothing signed.\n`);
  process.exit(0);
}

const outcome = await executeRun({
  manifest,
  anchor: net.anchor,
  io: ioFromPublicClient(publicClient),
  send: (tx) => walletClient.sendTransaction(tx),
  onProgress: (s) => console.log(`  ${s}…`),
});

console.log();
switch (outcome.state) {
  case "blocked":
    console.error(`  blocked (${outcome.reason}): ${outcome.details}\n`);
    process.exit(1);
  // eslint-disable-next-line no-fallthrough
  case "dropped":
    console.error(`  DROPPED: ${outcome.txHash}`);
    console.error(`  The node has never seen this transaction. On Arc that means the`);
    console.error(`  mempool discarded it, which happens silently below 20 Gwei.`);
    console.error(`  It was sent at ${outcome.sentMaxFeePerGas} wei. Safe to run again.\n`);
    process.exit(1);
  // eslint-disable-next-line no-fallthrough
  case "pending":
    console.error(`  PENDING: ${outcome.txHash}`);
    console.error(`  No receipt inside the timeout. This is NOT a successful payment.`);
    if (outcome.feeWarning) console.error(`  ${outcome.feeWarning}`);
    console.error(`  ${net.explorer}/tx/${outcome.txHash}\n`);
    process.exit(1);
  // eslint-disable-next-line no-fallthrough
  case "reverted":
    console.error(`  REVERTED: ${outcome.txHash}`);
    console.error(`  No money moved and no anchor was written. Safe to run again.\n`);
    process.exit(1);
  // eslint-disable-next-line no-fallthrough
  case "confirmed": {
    const { receipt, txHash } = outcome;
    const cost = receipt.gasUsed * receipt.effectiveGasPrice;
    console.log(`  status:   success`);
    console.log(`  block:    ${receipt.blockNumber}`);
    console.log(`  gasUsed:  ${receipt.gasUsed}`);
    console.log(`  cost:     ${Number(cost) / 1e18} USDC`);
    console.log(`  logs:     ${receipt.logs.length}`);
    if (outcome.feeWarning) console.log(`\n  WARNING  ${outcome.feeWarning}`);
    console.log(`  ${net.explorer}/tx/${txHash}`);

    const out = `docs/notes/${net.name}-manifest.json`;
    mkdirSync("docs/notes", { recursive: true });
    writeFileSync(out, JSON.stringify({
      ...manifest,
      items: manifest.items.map((i) => ({ ...i, amount: i.amount.toString() })),
      runLabel: RUN_LABEL,
      txHash,
      anchor: net.anchor,
      runId: runIdFor(account.address, manifest.clientRunId),
      root: built.root,
      memoIds: built.memoIds,
      proofs: built.proofs,
    }, null, 2));
    console.log(`\n  manifest written to ${out}\n`);
    break;
  }
}
```

Update the import block at the top of the file to:

```ts
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  buildRun, clientRunIdFor, runIdFor,
  executeRun, ioFromPublicClient,
  saltMessageFor, saltFromSignature,
  type Manifest, type ManifestItem,
} from "@ledgerline/core";
import { resolveNetwork, assertChainId, hasFlag } from "./lib/network.js";
```

- [x] **Step 2: Build core so the script sees the new exports**

Run: `pnpm --filter @ledgerline/core build`
Expected: no output, exit 0.

- [x] **Step 3: Dry-run against testnet**

Run: `node --env-file=.env --import tsx scripts/run-payout.ts --network testnet --dry-run`
Expected: the header block, then `balances… preflight…`, then `--dry-run: everything checks out against live testnet state. Nothing signed.`

If it reports `blocked (preflight)` with `RunExists`, the same `runLabel` has already been used with this item list. Set a fresh one: `RUN_LABEL=testnet-shared-executor node --env-file=.env --import tsx scripts/run-payout.ts --network testnet --dry-run`.

- [x] **Step 4: Send it for real, with a fresh label**

Run: `RUN_LABEL=testnet-shared-executor node --env-file=.env --import tsx scripts/run-payout.ts --network testnet`
Expected: `status: success`, a block number, 11 logs, and a manifest written.

Record the transaction hash — Task 13 compares against it.

- [x] **Step 5: Commit**

```bash
git add scripts/run-payout.ts
git commit -m "$(cat <<'EOF'
refactor(scripts): run the payout through the shared executor

The script's orchestration moves into core so the browser cannot diverge
from it, and it picks up the signature-derived salt at the same time — one
derivation for both consumers, not two that agree today.

Doing this before the UI exists proves the shared path against a real
chain while there is still only one consumer to break.

The five RunOutcome states each get their own exit: dropped and pending
both fail loudly and neither is reported as a payment.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wallet module

**Files:**
- Create: `apps/web/lib/wallet.ts`

**Interfaces:**
- Consumes: `NetworkView` from `@/lib/chain`.
- Produces: `getProvider(): Eip1193Provider | undefined`, `connect(net: NetworkView): Promise<ConnectedWallet>`, `assertEoa(client, address): Promise<void>`, `watchWallet(onChange: () => void): () => void`, `interface ConnectedWallet { address: Address; walletClient: WalletClient }`.

Raw EIP-1193 plus viem `custom()`. No wagmi: one chain, EOA only, and antd is already here.

- [x] **Step 1: Write the module**

```ts
// apps/web/lib/wallet.ts
"use client";

import { createWalletClient, createPublicClient, custom, http, type Address, type WalletClient } from "viem";
import type { NetworkView } from "@/lib/chain";

/** The subset of EIP-1193 this app uses. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface ConnectedWallet {
  address: Address;
  walletClient: WalletClient;
}

export function getProvider(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
}

export async function connect(net: NetworkView): Promise<ConnectedWallet> {
  const provider = getProvider();
  if (!provider) {
    throw new Error(
      "No wallet found. Ledgerline needs a browser wallet such as MetaMask or Rabby, and the payer must sign directly — Arc's Memo contract rejects smart-contract wallets.",
    );
  }

  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
  const address = accounts[0];
  if (!address) throw new Error("The wallet returned no account.");

  await ensureChain(provider, net);

  const walletClient = createWalletClient({
    account: address,
    chain: net.chain,
    transport: custom(provider),
  });

  await assertEoa(net, address);
  return { address, walletClient };
}

/** Switch the wallet to Arc, adding the network if it has never seen it. */
async function ensureChain(provider: Eip1193Provider, net: NetworkView): Promise<void> {
  const hex = `0x${net.chain.id.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch (err) {
    // 4902: the wallet does not know this chain yet.
    const code = (err as { code?: number }).code;
    if (code !== 4902) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: hex,
        chainName: net.chain.name,
        nativeCurrency: net.chain.nativeCurrency,
        rpcUrls: [net.defaultRpc],
        blockExplorerUrls: [net.explorer],
      }],
    });
  }
}

/**
 * Arc's Memo predeploy reverts for contract callers with "sender spoofing
 * requires tx.origin as sender" — measured on testnet, since eth_call and
 * debug_traceCall force msg.sender == tx.origin and cannot test the rule.
 *
 * Catching it here costs a read. Letting it through costs the payer a signed
 * transaction and its gas, for a run that was always going to revert.
 */
export async function assertEoa(net: NetworkView, address: Address): Promise<void> {
  const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
  const code = await client.getCode({ address });
  if (!code || code === "0x") return;

  // An EOA carrying an EIP-7702 delegation has code but is still an EOA with a
  // valid tx.origin. [unverified] whether Arc enables 7702; the guard prevents
  // a false rejection if it does.
  if (code.toLowerCase().startsWith("0xef0100")) return;

  throw new Error(
    "This address is a smart-contract wallet. Arc's Memo contract requires the payer to be the transaction's origin, so Safe, ERC-4337 and similar wallets cannot sign a Ledgerline run. Connect an ordinary EOA instead.",
  );
}

/** Account and chain changes invalidate everything downstream of connect. */
export function watchWallet(onChange: () => void): () => void {
  const provider = getProvider();
  if (!provider?.on || !provider.removeListener) return () => {};
  const handler = () => onChange();
  provider.on("accountsChanged", handler);
  provider.on("chainChanged", handler);
  return () => {
    provider.removeListener?.("accountsChanged", handler);
    provider.removeListener?.("chainChanged", handler);
  };
}
```

- [x] **Step 2: Typecheck**

Run: `pnpm --filter @ledgerline/web typecheck`
Expected: `Done`, no errors.

- [x] **Step 3: Commit**

```bash
git add apps/web/lib/wallet.ts
git commit -m "$(cat <<'EOF'
feat(web): connect an EOA wallet, and refuse the ones Arc rejects

Raw EIP-1193 plus viem custom(), no wagmi — one chain and EOA only, so a
React context and a query client would be solving problems this app does
not have.

A contract wallet is refused at connect rather than at signing. Memo
reverts for contract callers with "sender spoofing requires tx.origin as
sender", measured on testnet because eth_call cannot test the rule. The
check costs a getCode; letting it through costs the payer a signed
transaction and its gas for a run that was always going to revert. Code
beginning 0xef0100 passes, since an EIP-7702 delegated EOA is still an
EOA.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `/new` — upload and preview

**Files:**
- Create: `apps/web/app/new/page.tsx`, `CreateRun.tsx`, `StepUpload.tsx`, `StepPreview.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `parseCsv`, `resolveRows`, `validateRun`, `tokensForChain` from core; `networkFor`, `formatAmount`, `short` from `@/lib/chain`.
- Produces: `interface RunDraft { rows: ResolvedRow[]; runLabel: string; issues: CsvIssue[]; errors: RowIssue[]; warnings: RowIssue[]; decimals: Record<string, number>; symbols: Record<string, string> }` exported from `CreateRun.tsx`.

The file is dropped, parsed, and the decimals read from chain — all before a wallet is involved. Requiring a wallet before someone may look at their own CSV is a bad habit of the genre.

- [x] **Step 1: Write the page and the shell**

```tsx
// apps/web/app/new/page.tsx
import CreateRun from "./CreateRun";

export const metadata = { title: "New payout run — Ledgerline" };

export default async function NewRunPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const v = q["n"];
  return <CreateRun networkName={Array.isArray(v) ? (v[0] ?? null) : (v ?? null)} />;
}
```

```tsx
// apps/web/app/new/CreateRun.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Steps } from "antd";
import { createPublicClient, http, type Address } from "viem";
import { tokensForChain, type ResolvedRow, type CsvIssue, type RowIssue } from "@ledgerline/core";
import { networkFor, short } from "@/lib/chain";
import { connect, watchWallet, type ConnectedWallet } from "@/lib/wallet";
import StepUpload from "./StepUpload";
import StepPreview from "./StepPreview";

export interface RunDraft {
  rows: ResolvedRow[];
  runLabel: string;
  issues: CsvIssue[];
  errors: RowIssue[];
  warnings: RowIssue[];
  decimals: Record<string, number>;
  symbols: Record<string, string>;
  fileName: string;
}

const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/** Read every token's decimals and symbol from the chain. Nothing downstream
 *  may assume 6 or 8 — that assumption is how a payout ends up off by 10^12. */
export async function readTokenMeta(
  rpc: string, chain: Parameters<typeof createPublicClient>[0]["chain"], chainId: number,
): Promise<{ decimals: Record<string, number>; symbols: Record<string, string> }> {
  const client = createPublicClient({ chain, transport: http(rpc) });
  const tokens = tokensForChain(chainId);
  const decimals: Record<string, number> = {};
  const symbols: Record<string, string> = {};
  await Promise.all(
    Object.values(tokens).map(async (address) => {
      const [d, s] = await Promise.all([
        client.readContract({ address: address as Address, abi: erc20Abi, functionName: "decimals" }),
        client.readContract({ address: address as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => ""),
      ]);
      decimals[(address as string).toLowerCase()] = Number(d);
      symbols[(address as string).toLowerCase()] = s as string;
    }),
  );
  return { decimals, symbols };
}

export default function CreateRun({ networkName }: { networkName: string | null }) {
  const net = networkFor(networkName);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<RunDraft>();
  const [wallet, setWallet] = useState<ConnectedWallet>();
  const [walletError, setWalletError] = useState<string>();

  // An account or chain change invalidates everything signed against the old one.
  useEffect(() => watchWallet(() => { setWallet(undefined); setStep((s) => Math.min(s, 1)); }), []);

  const onConnect = useCallback(async () => {
    setWalletError(undefined);
    try { setWallet(await connect(net)); }
    catch (err) { setWalletError(err instanceof Error ? err.message : String(err)); }
  }, [net]);

  return (
    <main className="sheet sheet--wide">
      <div className="masthead">
        <strong>New payout run</strong>
        <span>
          Arc {net.name}
          {wallet ? (
            <>
              {" · "}
              <a href={`${net.explorer}/address/${wallet.address}`} target="_blank" rel="noreferrer">
                {short(wallet.address)}
              </a>
            </>
          ) : (
            <>
              {" · "}
              <button className="linkish" onClick={onConnect}>connect a wallet</button>
            </>
          )}
        </span>
      </div>

      <Steps
        style={{ marginTop: 28 }}
        current={step}
        items={[
          { title: "Upload" }, { title: "Preview" },
          { title: "Preflight" }, { title: "Sign" }, { title: "Receipts" },
        ]}
      />

      <div style={{ marginTop: 28 }}>
        {step === 0 && (
          <StepUpload net={net} onReady={(d) => { setDraft(d); setStep(1); }} />
        )}
        {step === 1 && draft && (
          <StepPreview
            draft={draft} net={net}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
            wallet={wallet} walletError={walletError} onConnect={onConnect}
          />
        )}
      </div>
    </main>
  );
}
```

- [x] **Step 2: Write the upload step**

```tsx
// apps/web/app/new/StepUpload.tsx
"use client";

import { useState } from "react";
import { Alert, Input, Upload } from "antd";
import { parseCsv, resolveRows, validateRun, tokensForChain } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import { readTokenMeta, type RunDraft } from "./CreateRun";

const SAMPLE = `invoiceId,token,to,amount
INV-US-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-EU-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-BTC-003,cirBTC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.00001`;

export default function StepUpload({
  net, onReady,
}: { net: NetworkView; onReady: (draft: RunDraft) => void }) {
  const [runLabel, setRunLabel] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const handle = async (text: string, fileName: string) => {
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
        runLabel: runLabel.trim(),
        issues: [...issues, ...resolved.issues],
        errors, warnings, decimals, symbols, fileName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const labelReady = runLabel.trim().length > 0;

  return (
    <>
      <section className="verdict">
        <h1>A run starts with a file and a name</h1>
        <p>
          The name is what lets the same payroll run again next month — the anchor rejects
          a repeat of the identical list under the identical name, which is how double
          payment is blocked at the contract rather than in this screen.
        </p>
      </section>

      <label style={{ display: "block", marginTop: 22, maxWidth: "32rem" }}>
        <span style={{ display: "block", fontSize: "0.87rem", marginBottom: 6 }}>
          Run name
        </span>
        <Input
          placeholder="Payroll 2026-09"
          value={runLabel}
          onChange={(e) => setRunLabel(e.target.value)}
        />
        <span className="because">
          You will need this again to rebuild the receipt links later. Write it down.
        </span>
      </label>

      <div style={{ marginTop: 24, opacity: labelReady ? 1 : 0.45, pointerEvents: labelReady ? "auto" : "none" }}>
        <Upload.Dragger
          accept=".csv,text/csv"
          showUploadList={false}
          disabled={busy || !labelReady}
          beforeUpload={(file) => {
            const reader = new FileReader();
            reader.onload = () => void handle(String(reader.result), file.name);
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

      {error && <Alert style={{ marginTop: 18 }} type="error" showIcon title={error} />}

      <details style={{ marginTop: 26 }}>
        <summary style={{ cursor: "pointer" }}>What the file must look like</summary>
        <pre className="hex" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{SAMPLE}</pre>
        <p className="because">
          Header required and spelled exactly as above. Amounts are written the way you
          would write them on an invoice; this page converts them using each token&apos;s
          own decimals, read from the chain.
        </p>
      </details>
    </>
  );
}
```

- [x] **Step 3: Write the preview step**

```tsx
// apps/web/app/new/StepPreview.tsx
"use client";

import { Alert, Button, Table, type TableColumnsType } from "antd";
import type { ResolvedRow } from "@ledgerline/core";
import { formatAmount, short, type NetworkView } from "@/lib/chain";
import type { ConnectedWallet } from "@/lib/wallet";
import type { RunDraft } from "./CreateRun";

export default function StepPreview({
  draft, net, onBack, onNext, wallet, walletError, onConnect,
}: {
  draft: RunDraft; net: NetworkView;
  onBack: () => void; onNext: () => void;
  wallet?: ConnectedWallet; walletError?: string; onConnect: () => void;
}) {
  const blocking = draft.issues.length + draft.errors.length;

  const columns: TableColumnsType<ResolvedRow> = [
    { title: "Line", dataIndex: "line", width: 70 },
    { title: "Invoice", dataIndex: "invoiceId", width: 160 },
    {
      title: "Token", dataIndex: "token", width: 110,
      render: (t: string) => draft.symbols[t.toLowerCase()] ?? short(t),
    },
    {
      title: "Recipient", dataIndex: "to",
      render: (to: string) => (
        <a className="hex" href={`${net.explorer}/address/${to}`} target="_blank" rel="noreferrer" title={to}>
          {short(to)}
        </a>
      ),
    },
    {
      title: "Amount", dataIndex: "amount", align: "right",
      render: (a: bigint, r) => (
        <span className="hex">{formatAmount(a, draft.decimals[r.token.toLowerCase()] ?? 6)}</span>
      ),
    },
  ];

  const totals = new Map<string, bigint>();
  for (const r of draft.rows) {
    const k = r.token.toLowerCase();
    totals.set(k, (totals.get(k) ?? 0n) + r.amount);
  }

  return (
    <>
      <section className="line line--summary">
        <div>
          <p className="amount">
            {draft.rows.length}
            <span className="unit">{draft.rows.length === 1 ? "payment" : "payments"}</span>
          </p>
          <ul className="totals">
            {[...totals.entries()].map(([t, v]) => (
              <li key={t}>
                <span className="hex">{formatAmount(v, draft.decimals[t] ?? 6)}</span>{" "}
                {draft.symbols[t] ?? short(t)}
              </li>
            ))}
          </ul>
        </div>
        <span className={`reference${blocking ? " is-void" : ""}`}>{draft.runLabel}</span>
      </section>

      {draft.issues.map((i) => (
        <Alert key={`i-${i.line}-${i.message}`} style={{ marginTop: 14 }} type="error" showIcon
          title={`Line ${i.line}`} description={i.message} />
      ))}
      {draft.errors.map((e, n) => (
        <Alert key={`e-${n}`} style={{ marginTop: 14 }} type="error" showIcon
          title={e.line ? `Line ${e.line}` : "This run"} description={e.message} />
      ))}
      {draft.warnings.map((w, n) => (
        <Alert key={`w-${n}`} style={{ marginTop: 14 }} type="warning" showIcon
          title={w.line ? `Line ${w.line}` : "This run"} description={w.message} />
      ))}

      <div style={{ marginTop: 24 }}>
        <Table<ResolvedRow>
          columns={columns}
          dataSource={draft.rows.map((r) => ({ ...r, key: r.line }))}
          pagination={draft.rows.length > 25 ? { pageSize: 25 } : false}
          size="middle"
        />
      </div>

      {walletError && (
        <Alert style={{ marginTop: 18 }} type="error" showIcon
          title="This wallet cannot sign a Ledgerline run" description={walletError} />
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={onBack}>Choose another file</Button>
        {wallet ? (
          <Button type="primary" disabled={blocking > 0} onClick={onNext}>
            {blocking > 0 ? `${blocking} problem${blocking === 1 ? "" : "s"} to fix first` : "Check it against the chain"}
          </Button>
        ) : (
          <Button type="primary" onClick={onConnect}>Connect a wallet to continue</Button>
        )}
      </div>

      <p className="because" style={{ marginTop: 18 }}>
        Arc&apos;s Memo contract requires the payer to sign directly, so Safe, ERC-4337 and
        other smart-contract wallets are not supported. Nothing has been signed or sent yet.
      </p>
    </>
  );
}
```

- [x] **Step 4: Link it from the home page**

In `apps/web/app/page.tsx`, replace the `<footer className="footer">` block with:

```tsx
      <footer className="footer">
        <Link href="/new">Create a payout run</Link>
        {" · "}
        <Link href="/why">How this differs from an ordinary batch</Link>
      </footer>
```

- [x] **Step 5: Build core, then build the web app**

Run: `pnpm --filter @ledgerline/core build && pnpm --filter @ledgerline/web build`
Expected: `Compiled successfully`, and `/new` listed in the route table.

- [x] **Step 6: Check it in a browser**

Run: `cd apps/web && npx next start -p 3847`
Open `http://localhost:3847/new`, type a run name, drop a CSV with one bad row, and confirm: the bad row is reported with its line number, the good rows render with symbols and amounts from the chain, and the continue button is disabled.

Stop the server: `lsof -ti:3847 | xargs -r kill -9`

- [x] **Step 7: Commit**

```bash
git add apps/web/app/new apps/web/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(web): upload and preview a payout run

The file is read, the chain is asked for each token's decimals, and the
rows are shown with their real amounts — all before a wallet is involved.
Requiring a wallet before someone may look at their own CSV is a habit of
the genre worth not copying.

Every problem is listed at once with its line number. A repeated recipient
warns; a repeated invoice reference blocks, because two payments under one
reference cannot be told apart when reconciling.

Nothing is signed or sent on these two steps.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `/new` — preflight and the salt signature

**Files:**
- Create: `apps/web/app/new/StepPreflight.tsx`
- Modify: `apps/web/app/new/CreateRun.tsx`

**Interfaces:**
- Consumes: `saltMessageFor`, `saltFromSignature`, `clientRunIdFor`, `buildRun`, `buildPreflightData`, `decodePreflightResult`, `explainRevert`; `ConnectedWallet` from Task 7.
- Produces: `interface PreparedRun { manifest: Manifest; built: BuiltRun; outcomes: { label: string; ok: boolean }[] }` exported from `StepPreflight.tsx`.

This is signature #1. The salt must exist before the calldata, because memoIds determine the calldata.

- [x] **Step 1: Write the step**

```tsx
// apps/web/app/new/StepPreflight.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Skeleton } from "antd";
import { createPublicClient, http } from "viem";
import {
  saltMessageFor, saltFromSignature, clientRunIdFor, buildRun, runIdFor,
  buildPreflightData, decodePreflightResult, explainRevert,
  type Manifest, type BuiltRun,
} from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import type { ConnectedWallet } from "@/lib/wallet";
import type { RunDraft } from "./CreateRun";

export interface PreparedRun {
  manifest: Manifest;
  built: BuiltRun;
  outcomes: { label: string; ok: boolean }[];
}

type Phase = "idle" | "signing" | "checking" | "ready" | "failed";

export default function StepPreflight({
  draft, net, wallet, onBack, onReady,
}: {
  draft: RunDraft; net: NetworkView; wallet: ConnectedWallet;
  onBack: () => void; onReady: (prepared: PreparedRun) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>();
  const [prepared, setPrepared] = useState<PreparedRun>();

  const prepare = useCallback(async () => {
    setError(undefined);
    setPhase("signing");
    try {
      const items = draft.rows.map(({ invoiceId, token, to, amount }) => ({
        invoiceId, token, to, amount,
      }));

      // Signature #1. The salt has to exist before the calldata, because the
      // memoIds it produces are inside the calldata.
      const signature = await wallet.walletClient.signMessage({
        account: wallet.address,
        message: saltMessageFor(net.chain.id, draft.runLabel),
      });
      const runSalt = saltFromSignature(signature);

      const manifest: Manifest = {
        clientRunId: clientRunIdFor(wallet.address, items, draft.runLabel),
        payer: wallet.address,
        chainId: net.chain.id,
        runSalt,
        items,
      };

      if (!net.anchor) throw new Error(`No PayoutAnchor is configured for Arc ${net.name}.`);

      setPhase("checking");
      const built = buildRun(manifest, net.anchor);
      const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
      const sim = await client.call({
        account: wallet.address,
        to: built.to,
        data: buildPreflightData(manifest, net.anchor),
      });
      const outcomes = decodePreflightResult(sim.data ?? "0x").map((o, i) => ({
        ok: o.success,
        label: i === 0 ? "Anchor commit" : manifest.items[i - 1]!.invoiceId,
      }));

      const next = { manifest, built, outcomes };
      setPrepared(next);
      setPhase(outcomes.every((o) => o.ok) ? "ready" : "failed");
    } catch (err) {
      const { name, message } = explainRevert(err);
      setError(name ? `${name}: ${message}` : message);
      setPhase("failed");
    }
  }, [draft, net, wallet]);

  useEffect(() => { void prepare(); }, [prepare]);

  const allOk = phase === "ready";

  return (
    <>
      <section className={`verdict ${allOk ? "ok" : phase === "failed" ? "error" : ""}`}>
        <h1>
          {phase === "signing" ? "Waiting for your signature"
            : phase === "checking" ? "Checking every payment against the chain"
            : allOk ? "Every payment simulates cleanly"
            : "This run would not go through"}
        </h1>
        <p>
          {phase === "signing"
            ? "Your wallet is asking you to sign a short message. This is not the payment — it derives this run's reference salt, and it costs nothing."
            : "Each payment is simulated against live chain state before anything is signed. This is also the only way to see Arc's runtime blocklist, which has no pre-check."}
        </p>
      </section>

      {(phase === "signing" || phase === "checking") && (
        <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 26 }} />
      )}

      {prepared && (
        <ul className="ladder">
          {prepared.outcomes.map((o) => (
            <li key={o.label} className={`rung ${o.ok ? "pass" : "fail"}`}>
              <span className="mark">{o.ok ? "✓" : "✗"}</span>
              <span className="claim">{o.label}</span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <Alert style={{ marginTop: 20 }} type="error" showIcon
          title="Nothing was signed or sent" description={error} />
      )}

      {prepared && (
        <dl className="detail" style={{ marginTop: 26 }}>
          <dt>Run id</dt>
          <dd className="hex">{runIdFor(prepared.manifest.payer, prepared.manifest.clientRunId)}</dd>
          <dt>Manifest root</dt>
          <dd className="hex">{prepared.built.root}</dd>
        </dl>
      )}

      <div style={{ marginTop: 26, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={onBack}>Back to the preview</Button>
        {phase === "failed" && <Button onClick={() => void prepare()}>Try again</Button>}
        {allOk && prepared && (
          <Button type="primary" onClick={() => onReady(prepared)}>
            Sign and send the payment
          </Button>
        )}
      </div>
    </>
  );
}
```

- [x] **Step 2: Wire it into the shell**

In `apps/web/app/new/CreateRun.tsx`, add the import and the state, then render step 2:

```tsx
import StepPreflight, { type PreparedRun } from "./StepPreflight";
// …
const [prepared, setPrepared] = useState<PreparedRun>();
// …inside the step container, after the step === 1 block:
{step === 2 && draft && wallet && (
  <StepPreflight
    draft={draft} net={net} wallet={wallet}
    onBack={() => setStep(1)}
    onReady={(p) => { setPrepared(p); setStep(3); }}
  />
)}
```

- [x] **Step 3: Build and check**

Run: `pnpm --filter @ledgerline/core build && pnpm --filter @ledgerline/web build`
Expected: `Compiled successfully`.

- [x] **Step 4: Commit**

```bash
git add apps/web/app/new
git commit -m "$(cat <<'EOF'
feat(web): derive the run salt and simulate before anything is signed

The first wallet prompt is not the payment. It signs a short message whose
keccak becomes this run's salt, which must exist before the calldata does
because the memoIds it produces are inside the calldata. The screen says
so, because an unexplained signature request is how people learn to click
through them.

Then every payment is simulated with allowFailure=true, so one bad row
reports itself instead of reverting the simulation — and it is the only
way to see Arc's runtime blocklist, which exposes no pre-check. A failure
here ends with nothing signed and says so.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `/new` — send, and hand over the receipts

**Files:**
- Create: `apps/web/app/new/StepSend.tsx`, `apps/web/app/new/Result.tsx`
- Modify: `apps/web/app/new/CreateRun.tsx`

**Interfaces:**
- Consumes: `executeRun`, `ioFromPublicClient`, `RunOutcome` from Task 5; `encodeProof` from `@/lib/chain`; `PreparedRun` from Task 9.
- Produces: nothing later tasks consume.

- [x] **Step 1: Write the send step**

```tsx
// apps/web/app/new/StepSend.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Steps } from "antd";
import { createPublicClient, http } from "viem";
import { executeRun, ioFromPublicClient, type RunOutcome, type RunStage } from "@ledgerline/core";
import type { NetworkView } from "@/lib/chain";
import type { ConnectedWallet } from "@/lib/wallet";
import type { PreparedRun } from "./StepPreflight";

const STAGE_LABEL: Record<RunStage, string> = {
  balances: "Checking balances",
  preflight: "Simulating every payment",
  fees: "Setting the fee floor",
  signing: "Waiting for your signature",
  broadcast: "Reading back what was broadcast",
  confirming: "Waiting for a receipt",
};
const ORDER: RunStage[] = ["balances", "preflight", "fees", "signing", "broadcast", "confirming"];

export default function StepSend({
  prepared, net, wallet, onDone,
}: {
  prepared: PreparedRun; net: NetworkView; wallet: ConnectedWallet;
  onDone: (outcome: RunOutcome) => void;
}) {
  const [stage, setStage] = useState<RunStage>("balances");
  const [outcome, setOutcome] = useState<RunOutcome>();
  const started = useRef(false);

  const go = useCallback(async () => {
    const client = createPublicClient({ chain: net.chain, transport: http(net.defaultRpc) });
    const result = await executeRun({
      manifest: prepared.manifest,
      anchor: net.anchor!,
      io: ioFromPublicClient(client),
      send: (tx) => wallet.walletClient.sendTransaction({
        account: wallet.address, chain: net.chain, ...tx,
      }),
      onProgress: setStage,
    });
    setOutcome(result);
    if (result.state === "confirmed") onDone(result);
  }, [prepared, net, wallet, onDone]);

  // Signing must follow a click, not a render — a wallet prompt nobody asked
  // for is how people learn to approve without reading.
  useEffect(() => { started.current = false; }, [prepared]);

  if (!outcome) {
    return (
      <>
        <section className="verdict">
          <h1>Ready to send</h1>
          <p>
            One transaction pays every line and commits the manifest root. Your wallet will
            ask about fees — <strong>do not lower them below 25 Gwei</strong>. Arc discards
            transactions priced under 20 Gwei without a receipt, an error or a revert.
          </p>
        </section>

        {started.current ? (
          <Steps
            direction="vertical"
            style={{ marginTop: 26 }}
            current={ORDER.indexOf(stage)}
            items={ORDER.map((s) => ({ title: STAGE_LABEL[s] }))}
          />
        ) : (
          <Button
            type="primary" size="large" style={{ marginTop: 26 }}
            onClick={() => { started.current = true; setStage("balances"); void go(); }}
          >
            Sign and pay {prepared.manifest.items.length} invoice
            {prepared.manifest.items.length === 1 ? "" : "s"}
          </Button>
        )}
      </>
    );
  }

  return <OutcomeView outcome={outcome} net={net} onRetry={() => { setOutcome(undefined); started.current = false; }} />;
}

function OutcomeView({
  outcome, net, onRetry,
}: { outcome: RunOutcome; net: NetworkView; onRetry: () => void }) {
  if (outcome.state === "confirmed") return null; // the parent has moved on

  const explorer = "txHash" in outcome
    ? `${net.explorer}/tx/${outcome.txHash}` : undefined;

  const copy: Record<string, { tone: string; title: string; body: string }> = {
    blocked: {
      tone: "error",
      title: "Nothing was signed",
      body: outcome.state === "blocked" ? outcome.details : "",
    },
    dropped: {
      tone: "error",
      title: "Arc never saw this transaction",
      body: "The node has no record of the hash your wallet returned. On Arc that means the mempool discarded it, which happens silently for transactions priced below 20 Gwei. No money moved. It is safe to run again — the anchor is write-once, so if it somehow did land, the next attempt is blocked at preflight.",
    },
    pending: {
      tone: "degraded",
      title: "Sent, but not yet in a block",
      body: "This is not a completed payment and must not be treated as one. The transaction is in the mempool without a receipt yet. Watch it on the explorer, or run it again — a repeat is refused by the contract if the first one lands.",
    },
    reverted: {
      tone: "error",
      title: "The run reverted",
      body: "It reached a block and failed. No money moved and no anchor was written, so the run is safe to send again.",
    },
  };

  const c = copy[outcome.state]!;
  return (
    <>
      <section className={`verdict ${c.tone}`}>
        <h1>{c.title}</h1>
        <p>{c.body}</p>
      </section>

      {"feeWarning" in outcome && outcome.feeWarning && (
        <Alert style={{ marginTop: 20 }} type="error" showIcon
          title="The fee was lowered below the floor" description={outcome.feeWarning} />
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button type="primary" onClick={onRetry}>Try the run again</Button>
        {explorer && <Button href={explorer} target="_blank">Open on the explorer</Button>}
      </div>
    </>
  );
}
```

- [x] **Step 2: Write the result screen**

```tsx
// apps/web/app/new/Result.tsx
"use client";

import { useState } from "react";
import { Alert, Button, Table, type TableColumnsType } from "antd";
import type { RunOutcome } from "@ledgerline/core";
import { encodeProof, formatAmount, short, type NetworkView } from "@/lib/chain";
import type { PreparedRun } from "./StepPreflight";
import type { RunDraft } from "./CreateRun";

interface LinkRow {
  key: string;
  invoiceId: string;
  to: string;
  token: string;
  amount: bigint;
  url: string;
}

export default function Result({
  outcome, prepared, draft, net,
}: {
  outcome: Extract<RunOutcome, { state: "confirmed" }>;
  prepared: PreparedRun; draft: RunDraft; net: NetworkView;
}) {
  const [copied, setCopied] = useState<string>();

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const rows: LinkRow[] = prepared.manifest.items.map((item, i) => ({
    key: item.invoiceId,
    invoiceId: item.invoiceId,
    to: item.to,
    token: item.token,
    amount: item.amount,
    url: `${origin}/r/${outcome.txHash}?i=${encodeURIComponent(item.invoiceId)}`
      + `&s=${prepared.manifest.runSalt}`
      + `&p=${encodeProof(prepared.built.proofs[i]!)}`
      + `&n=${net.name}`,
  }));

  const downloadManifest = () => {
    const blob = new Blob([JSON.stringify({
      ...prepared.manifest,
      items: prepared.manifest.items.map((i) => ({ ...i, amount: i.amount.toString() })),
      runLabel: draft.runLabel,
      txHash: outcome.txHash,
      anchor: net.anchor,
      root: prepared.built.root,
      memoIds: prepared.built.memoIds,
      proofs: prepared.built.proofs,
      runLabelNormalisation: "trimmed, inner whitespace collapsed to single spaces, case preserved",
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ledgerline-${draft.runLabel.replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const columns: TableColumnsType<LinkRow> = [
    { title: "Invoice", dataIndex: "invoiceId", width: 160 },
    {
      title: "Paid", dataIndex: "amount", width: 150,
      render: (a: bigint, r) => (
        <span className="hex">
          {formatAmount(a, draft.decimals[r.token.toLowerCase()] ?? 6)}{" "}
          {draft.symbols[r.token.toLowerCase()] ?? ""}
        </span>
      ),
    },
    { title: "Recipient", dataIndex: "to", width: 140, render: (to: string) => <span className="hex">{short(to)}</span> },
    {
      title: "Receipt link", dataIndex: "url",
      render: (url: string, r) => (
        <Button
          size="small"
          onClick={() => { void navigator.clipboard.writeText(url); setCopied(r.invoiceId); }}
        >
          {copied === r.invoiceId ? "Copied" : "Copy link"}
        </Button>
      ),
    },
  ];

  return (
    <>
      <section className="line line--summary">
        <div>
          <p className="amount">
            {rows.length}<span className="unit">paid</span>
          </p>
          <p className="payee">block {outcome.receipt.blockNumber.toLocaleString("en-US")} · {outcome.receipt.gasUsed.toLocaleString("en-US")} gas</p>
        </div>
        <span className="reference">{draft.runLabel}</span>
      </section>

      <section className="verdict ok">
        <h1>Paid, with a receipt</h1>
        <p>
          Each link below verifies against the chain on its own. Send each recipient
          theirs — they need nothing from us to check it.
        </p>
      </section>

      {outcome.feeWarning && (
        <Alert style={{ marginTop: 20 }} type="warning" showIcon
          title="The fee was below the floor" description={outcome.feeWarning} />
      )}

      <div style={{ marginTop: 24 }}>
        <Table<LinkRow> columns={columns} dataSource={rows}
          pagination={rows.length > 25 ? { pageSize: 25 } : false} size="middle" />
      </div>

      <Alert
        style={{ marginTop: 24 }}
        type="info"
        title="Keep two things"
        description={
          <>
            <p style={{ marginTop: 0 }}>
              The transaction hash <span className="hex">{outcome.txHash}</span> and the run
              name <strong>{draft.runLabel}</strong>. With both, these links can be rebuilt
              from <a href={`/run/${outcome.txHash}?n=${net.name}`}>the run page</a> at any
              time, by signing the same message again. Neither is stored anywhere by us.
            </p>
            <p style={{ marginBottom: 0 }}>
              The hash is also on{" "}
              <a href={`${net.explorer}/address/${prepared.manifest.payer}`} target="_blank" rel="noreferrer">
                your address on the explorer
              </a>
              , permanently.
            </p>
          </>
        }
      />

      <div style={{ marginTop: 22, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={downloadManifest}>Download the manifest</Button>
        <Button href={`/run/${outcome.txHash}?n=${net.name}`}>Open the reconciliation</Button>
        <Button href={`${net.explorer}/tx/${outcome.txHash}`} target="_blank">On the explorer</Button>
      </div>
    </>
  );
}
```

- [x] **Step 3: Wire both into the shell**

In `apps/web/app/new/CreateRun.tsx`, add imports and state, then render steps 3 and 4:

```tsx
import StepSend from "./StepSend";
import Result from "./Result";
import type { RunOutcome } from "@ledgerline/core";
// …
const [outcome, setOutcome] = useState<Extract<RunOutcome, { state: "confirmed" }>>();
// …
{step === 3 && prepared && wallet && (
  <StepSend
    prepared={prepared} net={net} wallet={wallet}
    onDone={(o) => { if (o.state === "confirmed") { setOutcome(o); setStep(4); } }}
  />
)}
{step === 4 && outcome && prepared && draft && (
  <Result outcome={outcome} prepared={prepared} draft={draft} net={net} />
)}
```

- [x] **Step 4: Build**

Run: `pnpm --filter @ledgerline/core build && pnpm --filter @ledgerline/web build`
Expected: `Compiled successfully`.

- [x] **Step 5: Commit**

```bash
git add apps/web/app/new
git commit -m "$(cat <<'EOF'
feat(web): send the run, and hand the payer one link per recipient

The five RunOutcome states each get their own screen, and only one of them
says a payment happened. Dropped explains that Arc discards
under-priced transactions silently and that a re-run is safe because the
anchor is write-once. Pending states plainly that it is not a completed
payment.

Signing follows a click, never a render — a wallet prompt nobody asked for
is how people learn to approve without reading — and the fee floor is
spelled out on the button's own screen rather than left to the wallet.

The result screen's primary output is a copyable receipt link per row,
each carrying the salt and Merkle proof so the recipient needs nothing
from us. The manifest download is the backup, and the screen names the two
things worth keeping: the hash and the run name.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Rebuild receipt links from the chain

**Files:**
- Modify: `apps/web/app/run/[txHash]/Reconciliation.tsx`

**Interfaces:**
- Consumes: `saltMessageFor`, `saltFromSignature`, `memoIdFor`, `buildTree`, `leafFor` from core; `connect` from Task 7; `encodeProof` from `@/lib/chain`.
- Produces: nothing later tasks consume.

Spec §2.2. This is the design's safety valve, and the check is the point: it re-derives, then compares against the memoIds actually in the transaction's logs. A wrong run label, or a wallet that signs non-deterministically, is caught rather than acted on.

- [x] **Step 1: Add the recovery component**

Append to `apps/web/app/run/[txHash]/Reconciliation.tsx`:

```tsx
function RecoverLinks({
  net, txHash, memoIdsOnChain, payments, anchoredRoot,
}: {
  net: NetworkView; txHash: string;
  memoIdsOnChain: Set<string>;
  payments: PaymentRecord[];
  /** The root PayoutAnchor committed for this run, when it could be read. */
  anchoredRoot?: Hex;
}) {
  const [label, setLabel] = useState("");
  const [invoices, setInvoices] = useState("");
  const [state, setState] = useState<"idle" | "working" | "ok" | "mismatch" | "error">("idle");
  const [error, setError] = useState<string>();
  const [links, setLinks] = useState<{ invoiceId: string; url: string }[]>([]);

  const recover = async () => {
    setState("working");
    setError(undefined);
    try {
      const ids = invoices.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) throw new Error("List the invoice references, one per line.");

      const { address, walletClient } = await connect(net);
      const signature = await walletClient.signMessage({
        account: address,
        message: saltMessageFor(net.chain.id, label),
      });
      const runSalt = saltFromSignature(signature);

      // Check 1: the derived references must be ones this transaction carries.
      const derived = ids.map((invoiceId) => ({ invoiceId, memoId: memoIdFor(runSalt, invoiceId) }));
      if (!derived.every((d) => memoIdsOnChain.has(d.memoId.toLowerCase()))) {
        setState("mismatch");
        setLinks([]);
        return;
      }

      // The tree must be rebuilt from EVERY payment in the run, in the order
      // the run built them — a tree over only the invoices someone happened to
      // type produces different proofs that verify against nothing.
      const leaves = payments.map((p) => leafFor(p.memoId, p.token, p.to, p.value));
      const { root, proofFor } = buildTree(leaves);

      // Check 2: and the ordering assumption is not assumed. If the rebuilt
      // root is the one the anchor committed, the leaves are in the right
      // order and every proof below is valid. If it is not, say nothing.
      if (!anchoredRoot || root.toLowerCase() !== anchoredRoot.toLowerCase()) {
        setState("mismatch");
        setLinks([]);
        return;
      }

      setLinks(derived.map((d) => ({
        invoiceId: d.invoiceId,
        url: `${window.location.origin}/r/${txHash}?i=${encodeURIComponent(d.invoiceId)}`
          + `&s=${runSalt}`
          + `&p=${encodeProof(proofFor(payments.findIndex((p) => p.memoId.toLowerCase() === d.memoId.toLowerCase())))}`
          + `&n=${net.name}`,
      })));
      setState("ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  };

  return (
    <details style={{ marginTop: 26 }}>
      <summary style={{ cursor: "pointer" }}>Rebuild the receipt links for this run</summary>

      <p className="because" style={{ marginTop: 12 }}>
        Sign the same message again and the links come back. Nothing was stored — the salt
        is derived from your signature over the run name, so your wallet and this
        transaction are all that is needed.
      </p>

      <label style={{ display: "block", marginTop: 14, maxWidth: "32rem" }}>
        <span style={{ display: "block", fontSize: "0.87rem", marginBottom: 6 }}>Run name</span>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Payroll 2026-09" />
      </label>

      <label style={{ display: "block", marginTop: 14, maxWidth: "32rem" }}>
        <span style={{ display: "block", fontSize: "0.87rem", marginBottom: 6 }}>
          Invoice references, one per line
        </span>
        <Input.TextArea rows={4} value={invoices} onChange={(e) => setInvoices(e.target.value)} />
      </label>

      <Button style={{ marginTop: 14 }} loading={state === "working"} onClick={() => void recover()}>
        Sign and rebuild
      </Button>

      {state === "mismatch" && (
        <Alert style={{ marginTop: 16 }} type="error" showIcon
          title="These do not match what is on chain"
          description="Either the references derived from that signature are not the ones this transaction carries, or the rebuilt manifest root is not the one the anchor committed. That covers a run name typed differently, an invoice reference spelled differently, a wallet that does not reproduce its signatures, and an anchor that could not be read. Use the manifest you downloaded — no links are shown, because an unverified link is worse than none." />
      )}

      {state === "error" && error && (
        <Alert style={{ marginTop: 16 }} type="warning" showIcon title={error} />
      )}

      {state === "ok" && (
        <>
          <Alert style={{ marginTop: 16 }} type="success" showIcon
            title="Rebuilt and checked against the chain"
            description="Every reference below was derived from your signature and then found in this transaction's logs." />
          <dl className="detail" style={{ marginTop: 14 }}>
            {links.map((l) => (
              <div key={l.invoiceId} style={{ display: "contents" }}>
                <dt>{l.invoiceId}</dt>
                <dd>
                  <button className="linkish" onClick={() => void navigator.clipboard.writeText(l.url)}>
                    Copy link
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </details>
  );
}
```

- [x] **Step 2: Extend the imports and render it**

At the top of `Reconciliation.tsx`, extend the antd import to include `Button` and `Input`, extend the core import with `saltMessageFor, saltFromSignature, memoIdFor, buildTree, leafFor, type PaymentRecord`, extend the `@/lib/chain` import with `encodeProof`, and add `import { connect } from "@/lib/wallet";`.

`loadRun` already reads `anchoredRoot` from `PayoutAnchor.runs(runId)` but keeps it as a local and only passes it to `checkManifestAgainstRoot`. Recovery needs it directly, because its whole premise is having nothing but the `txHash` — and `manifestCheck` is `undefined` unless a manifest was uploaded. So:

1. Add `anchoredRoot?: Hex;` to the `Loaded` interface.
2. Add `anchoredRoot,` to the object `loadRun` returns.

If it is `undefined` — no anchor configured for this network, or the read failed — recovery reports a mismatch rather than emitting proofs it cannot vouch for.

Inside `Ready`, just before the closing explorer link paragraph, add:

```tsx
      <RecoverLinks
        net={net} txHash={txHash}
        memoIdsOnChain={new Set(result.payments.map((p) => p.memoId.toLowerCase()))}
        payments={result.payments}
        anchoredRoot={data.anchoredRoot}
      />
```

- [x] **Step 3: Build**

Run: `pnpm --filter @ledgerline/core build && pnpm --filter @ledgerline/web build`
Expected: `Compiled successfully`.

- [x] **Step 4: Commit**

```bash
git add apps/web/app/run
git commit -m "$(cat <<'EOF'
feat(web): rebuild a run's receipt links by signing again

The salt is derived, never stored, so recovery is a signature rather than
a backup. What makes it safe is the check: the re-derived memoIds must be
the ones this transaction's logs actually carry, and when they are not,
the screen says so and shows nothing.

That covers all three ways it can go wrong with one rule — a mistyped run
name, a misspelled invoice reference, or a wallet that does not reproduce
its signatures. The last of those is the design's one [unverified]
assumption, and this is where it gets answered by measurement instead of
belief.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: End-to-end run from the browser

**Files:**
- Create: `docs/notes/2026-09-21-create-run-testnet.md`
- Modify: `docs/superpowers/plans/2026-09-21-create-run.md` (tick the boxes)

**Interfaces:** none.

This is the definition of done from spec §7.1. It is manual because the wallet is, and the owner has taken that on.

- [x] **Step 1: Prepare a CSV**

Write `/tmp/payroll.csv` using the recipient from `.env` (`DEMO_RECIPIENT`):

```csv
invoiceId,token,to,amount
INV-BROWSER-001,USDC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-BROWSER-002,EURC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.10
INV-BROWSER-003,cirBTC,0xe48A096B9E74f064b13c17734af29F85E02d732a,0.00001
```

- [x] **Step 2: Serve the app**

Run:
```bash
pnpm --filter @ledgerline/core build && pnpm --filter @ledgerline/web build
cd apps/web && npx next start -p 3847
```

- [x] **Step 3: Run the whole flow by hand**

Open `http://localhost:3847/new`. Connect the testnet payer wallet. Run name: `browser-2026-09`. Drop the CSV. Walk every step through to the result screen.

Record, as you go:

| Observation | Why it matters |
|---|---|
| Did the wallet allow lowering the fee below 25 Gwei? | The one question the automated tests cannot reach |
| If lowered, did the warning appear on the result? | Proves step 5 of the executor |
| Transaction hash, block, gas used | Compared against the script's own run |
| Did all three amounts render at the right decimals? | 6, 6 and 8 in one run |

- [x] **Step 4: Verify a receipt link**

Copy the link for `INV-BROWSER-001` and open it. Expected: **all five rungs pass**, including "The payment was in the committed payout run".

- [x] **Step 5: Verify recovery from nothing but the hash**

Open `/run/<txHash>?n=testnet` in a fresh tab. Expand **Rebuild the receipt links for this run**, enter `browser-2026-09` and the three invoice references, and sign.

Expected: "Rebuilt and checked against the chain", and a copied link that opens to the same five green rungs.

**This answers the `[unverified]` question.** If it reports a mismatch instead, the wallet does not reproduce its signatures — record that, and the design degrades exactly as intended rather than producing wrong links.

- [x] **Step 6: Try the mismatch path deliberately**

Repeat step 5 with the run name `browser-2026-10`. Expected: the error alert, and no links shown.

- [x] **Step 7: Write it up**

Create `docs/notes/2026-09-21-create-run-testnet.md` recording: the transaction hash, block, gas used and log count; the answers to the four observations in step 3; the recovery result and therefore the wallet-determinism verdict; and anything that behaved differently from the spec.

- [x] **Step 8: Stop the server and run the full suite**

```bash
lsof -ti:3847 | xargs -r kill -9
pnpm test && pnpm typecheck && (cd contracts && forge test)
```

Expected: all green.

- [x] **Step 9: Commit**

```bash
git add docs/notes/2026-09-21-create-run-testnet.md docs/superpowers/plans/2026-09-21-create-run.md
git commit -m "$(cat <<'EOF'
test(web): run a three-token payout end to end from the browser

The definition of done: a CSV becomes a signed, anchored, referenced run
on Arc testnet with no script involved, and a receipt link produced by the
result screen passes all five rungs.

Also records the two answers only a real wallet can give — whether it lets
the fee fall below the floor, and whether it reproduces a signature — the
second by using recovery, which checks its own work against the chain.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

Checked against the spec:

- §1.1 salt not random → Tasks 4 and 6.
- §1.2 data loss → Tasks 4 and 11; the result screen (Task 10) names what to keep.
- §1.3 over 400 rows → out of scope in the spec; Task 3 still reports it as an error rather than throwing.
- §2.1–2.3 derivation, normalisation, two prompts → Task 4 (pure), Task 9 (prompt 1), Task 10 (prompt 2).
- §2.4 handoff and `txHash` provenance → Task 10; recovery in Task 11.
- §3 CSV → Tasks 1, 2, 3.
- §4 executor, read-back, `RunOutcome` → Task 5; both consumers in Tasks 6 and 10.
- §5 wallet, contract-wallet rejection, EIP-7702 → Task 7; stated in the UI in Task 8.
- §6 screens and file layout → Tasks 8, 9, 10.
- §7 testing → tests live in Tasks 1–5; §7.1 definition of done is Task 12.
- §8 out of scope → nothing in this plan implements any of it.

`ResolvedRow` (Task 2) is the type every later task uses; `RunOutcome` and `ExecuteIO` (Task 5) are consumed unchanged by Tasks 6 and 10; `PreparedRun` (Task 9) by Task 10.
