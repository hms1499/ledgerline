# Inline row fixes — a problem line is fixed on the Review step

A payer whose file has problem lines fixes them on the page, instead of going
back to Numbers or Excel, exporting again and choosing the file again. Nothing
is paid that the payer did not see and confirm.

**Parent specs:** `2026-09-21-ledgerline-design.md` (product, invariants),
`2026-09-21-create-run-design.md` (the create flow),
`2026-09-25-non-tech-ux-design.md` (the Review list this replaces). Nothing here
changes an invariant in `CLAUDE.md`, `execute.ts`, the run salt, or the
wallet-session rules. Edits exist only before anything is signed.

Claims are tagged `[measured]`, `[docs]`, `[unverified]`, as in the parents.

---

## 1. Why

- The payer who reported this keeps payroll in Numbers, on a Mac set to region
  `en_VN` `[measured]`. Opening the sample CSV there and exporting it again
  gave a `;`-separated file whose amounts kept their dots: Numbers had stored
  `0.10` and `0.00001` as **text**. They sit in the table's string list beside
  `INV-US-001`, and the preview shows them left-aligned `[measured]` (read from
  `ledgerline-sample.csv.numbers`). Every line was refused. `bf00a73` fixed that
  case in the reader. The loop it exposed remains: any row problem costs a
  round trip through the spreadsheet.
- A refused line vanishes from the Review table: `parseCsv` drops a row whose
  amount it refuses (`continue`), and the table shows only resolved rows
  `[measured]` (`StepPreview.tsx`). There is nothing on screen to fix.

**Supersedes** decision 1 of `2026-09-25-non-tech-ux-design.md` ("any `.` in
an amount there is refused"). Since `bf00a73`, a `.` in a `;` file is read as
the decimal when it cannot group thousands (`0.10`, `1.5`, `0.000001`).
`1.000` and `12.500` are still refused, naming both readings.

## 2. Decisions (with the product owner, 2026-09-26)

1. **Scope: lines with a problem.** A line with an error or a warning gets an
   input for each field with a problem, and it can be removed. Fields without
   a problem, and valid lines, are read-only. File-level problems (missing or duplicate columns, an empty file,
   over 400 rows) still need another file.
2. **Records: mark, and offer the corrected file.** Edited cells are marked
   `edited here`. Once anything is edited, Review offers `Download the
   corrected file` (optional) in the payer's own columns and line order.
3. **Suggestions are buttons the payer presses.** They are never applied on
   their own. A token is chosen from the chain's tokens. A recipient address is
   never suggested.
4. **Layout: fix cards in the problem list,** not cells in the table and not
   a dialog. The layout works on a phone, and each message sits next to its
   field.
5. **Approach: edits are an overlay on the file as read.** The file as read is
   never overwritten. Everything shown is derived through core's rules. There
   is no second validator in the UI.

## 3. Data flow and core changes

### 3.1 Two layers in `packages/core/src/csv.ts`

**`parseCsv(text)` splits and maps. It reads no meaning.**

- Returns `header: string[]` (names as written), `columns` (field → index),
  `delimiter`, and **every data line** as a `ParsedRow`: `line`, raw `cells`
  (every column, extra ones included), and the raw text of the four fields,
  trimmed.
- A line with the wrong number of values is kept, marked `unreadable`, with its
  raw text. Its fields are empty.
- File-level issues stay here: empty file, missing columns, a field named
  twice.

**`resolveRows(rows, delimiter, tokens, decimals)` reads meaning.**

- An amount goes through the new `readAmount(text, delimiter)`, then
  `toBaseUnits`. The token, address and invoice rules are unchanged.
- `readAmount` returns one of:
  - `{ ok: true, amount, warning? }`, where `amount` is dot-decimal text. The
    warning is the `;` case of `1,000`, read as 1.
  - `{ ok: false, message, readings? }`. `readings` lists each amount the text
    could mean, as dot-decimal text: `1.000` in a `;` file gives
    `["1", "1000"]`, and `1,250.50` in a `,` or tab file gives `["1250.50"]`.
- Row-level issues and warnings, including the `;` amount rules that live in
  `parseCsv` today, come from `resolveRows`. `validateRun` is unchanged.
- An `unreadable` row resolves to one issue ("This line has 3 values but the
  first line names 4 columns…"), as today.

**Every row-level issue and warning names its field.** `CsvIssue` and
`RowIssue` gain `field?: "invoiceId" | "token" | "to" | "amount"`, which is
how a card knows which input to show:

| Issue | `field` |
|---|---|
| empty invoice; invoice also on another line | `invoiceId` |
| unknown token | `token` |
| not an address; the zero address | `to` |
| amount unreadable, ambiguous, too precise or zero; `;` `1,000` warning | `amount` |
| same recipient and token paid twice (warning) | none: the card offers only `Remove line` |
| no on-chain decimals for a token | none: not the payer's to fix; the card offers only `Remove line` |
| unreadable line | none: all four inputs, empty |

### 3.2 State on the Review step

```
source  = parseCsv(text)                 // never written to
edits   = { cells: { [line]: { [field]: text } }, removed: Set<line> }
derived = validateRun(resolveRows(applyEdits(source, edits), …))
          → rows, issues, warnings, totals
```

- `RunDraft` carries `source`, `sourceName` (the file name, or `pasted rows`)
  and `edits`. `rows`, `issues`, `errors` and `warnings` become values derived
  with `useMemo`. `applyEdits` is a pure function in `frontend/lib`.
- A typed amount goes through the same `readAmount` with the file's delimiter.
  In a `;` file, `12,5` and `0.10` are both read, and `1.000` offers `[1]
  [1000]`, exactly as the same cell in the file would.

## 4. The Review step

**The problem list** (replaces `ReviewIssues`) is titled `Fix these lines`, or
`Check these lines` when only warnings remain.

- File-level problems come first, as text, with no card.
- Then one **card per line**, by line number, with error lines before
  warning-only lines.

**A card:**

- Heading `Line 5 · INV-4`, then its messages as today.
- Only the fields that have a problem get an input:
  - **Amount:** a text input, plus one button per reading when `readings` is
    present (`[1]` `[1000]`, `[Use 1250.50]`). A button shows the reading in
    the file's convention and applies it at once.
  - **Token:** a select of the chain's tokens.
  - **Recipient:** a text input, never a suggestion. Help text: `Paste the full
    address. Check it against the one you were given.`
  - **Invoice:** a text input. A duplicate names the other line.
  - **Unreadable line:** the raw text, read-only, above four empty inputs.
- `Remove line` on every card.

**Re-checking** happens on blur or Enter, not on every keystroke, so a card
never vanishes while the payer is typing. A suggestion button applies at once.

**A line that becomes valid** leaves the list and appears in the payments
table at its line number, with `✎ edited here`. A polite live region announces
`Line 5 is ready to pay`. An edit that causes a new problem (a duplicate
invoice) keeps the card, with the new message.

**Undo.** An edited cell in the table has `Undo`, which drops that field's
edit. The line may return to the list. A removed line shows as `Line 7
removed · Undo` below the list.

**Primary action.** Unchanged: `Fix N lines first`, disabled, while anything
blocks.

**`Choose another file`** with edits asks first: `Discard your 3 edits?`

## 5. The corrected file

`correctedCsv(source, edits)` is a pure function in `frontend/lib`.

- Lines not edited are kept **byte for byte**: header, extra columns, line
  order, delimiter, line endings.
- Only edited cells are rewritten. A cell containing the delimiter, a quote or
  a line break is quoted, with quotes doubled.
- Amounts are written in the file's convention: `0,10` in a `;` file (so
  Numbers in a comma-decimal region stores a number, not text), `0.10`
  otherwise.
- Removed lines are left out.
- Name: `<original name>-corrected.csv`. Pasted rows give
  `pasted-rows-corrected.tsv`.
- **Round trip:** `resolveRows(parseCsv(correctedCsv(…)))` yields exactly the
  rows on screen. A test asserts it.

## 6. Safeguards

- **Nothing is changed for the payer.** Every change is typed or pressed. A
  suggestion is only a reading `readAmount` computed.
- **No address is ever suggested.** An edited address passes `isAddress`, and
  the table shows it in full checksum form with `✎`.
- **Edits stay visible after Review:** `RunSummary` states `3 lines edited
  here` through Check and Pay, so the list being signed is visibly not the
  file as chosen.
- Edits live in page memory only, as the file does today. They are never
  written to `localStorage`.
- All new copy passes `plain-language.test.ts`.

## 7. Testing

**Core, unit:**

- `readAmount`: a table over `,`, `;` and tab covering read, warned,
  ambiguous and refused amounts.
- `parseCsv` keeps refused and unreadable lines, with their raw cells.
- `resolveRows` takes the delimiter.
- The existing `;` tests move to the layer that now owns the rule. None are
  deleted.

**Frontend, unit:**

- `applyEdits`: edit, remove, undo.
- `correctedCsv`: byte preservation, quoting, the file's decimal mark, and the
  round trip.
- The card view: which fields get inputs, which buttons.

**Playwright, real browser, at 1280 and 390:**

1. A Numbers-style `;` file with `1.000` → press `[1000]` → the line joins the
   table with `✎`.
2. A bad address → paste a good one → the card clears.
3. Remove a line → undo.
4. Download the corrected file → drop it back → Review shows no problems.
5. `Choose another file` with edits asks first.
6. No horizontal scroll. axe is clean.

## 8. Out of scope

- Mapping columns when the header is wrong.
- Adding lines, bulk edit, sorting.
- Keeping edits across a reload.
