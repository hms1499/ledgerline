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
- Real mistakes are systematic more often than scattered. The Numbers case hit
  every line in the same way. So does an Excel column formatted with thousands
  marks (every amount from 1000 up becomes `1,250.50`), or a token column that
  says `USD` throughout. How often each happens is `[unverified]`, but each
  comes from one setting and so hits a whole column. Fixing line by line has
  to scale to 300 lines.

**Supersedes** decision 1 of `2026-09-25-non-tech-ux-design.md` ("any `.` in
an amount there is refused"). Since `bf00a73`, a `.` in a `;` file is read as
the decimal when it cannot group thousands (`0.10`, `1.5`, `0.000001`).
`1.000` and `12.500` are still refused, naming both readings.

## 2. Decisions (with the product owner, 2026-09-26)

1. **Scope: lines with a problem.** A line with an error or a warning gets an
   input for each field with a problem, and it can be left out of the run.
   Fields without a problem, and valid lines, are read-only. File-level
   problems (missing or duplicate columns, an empty file, over 400 rows) still
   need another file.
2. **Records: mark, and offer the corrected file.** Edited cells are marked
   `edited here`. Once anything is edited, Review offers `Download the
   corrected file` (optional), in the payer's own columns and line order, and
   the Result screen reminds the payer to download it.
3. **Suggestions are buttons the payer presses.** They are never applied on
   their own. A token is chosen from the chain's tokens. A recipient address is
   never suggested.
4. **Layout: fix cards in the problem list,** not cells in the table and not
   a dialog. The layout works on a phone, and each message sits next to its
   field.
5. **Approach: edits are an overlay on the file as read.** The file as read is
   never overwritten. Everything shown is derived through core's rules. There
   is no second validator in the UI.
6. **The same problem on many lines is fixed once.** Three or more lines with
   the same problem and the same fix share one group card, one button and one
   Undo.
7. **A card stays where it is.** A fixed or left-out line keeps its card, in
   place, showing what changed, so nothing on the page moves under the
   pointer.
8. **Leaving a line out is not deleting it.** A left-out line is still owed. It
   stays in the corrected file, unchanged.

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

**`resolveRows(rows, tokens, decimals, delimiter)` reads meaning.** The
delimiter is the last parameter, with default `","`, so existing callers are
unchanged.

- An amount goes through the new `readAmount(text, delimiter)`, then
  `toBaseUnits`. The token, address and invoice rules are unchanged.
- `readAmount` returns one of:
  - `{ ok: true, amount, warning?, readings?, kind? }`, where `amount` is
    dot-decimal text. The warning is the `;` case of `1,000`, read as 1; its
    `readings` are `["1", "1000"]`, with `kind: "comma-or-thousands"`.
  - `{ ok: false, message, readings?, kind? }`. `readings` lists each amount
    the text could mean, as dot-decimal text:
    - `1.000` in a `;` file: `["1", "1000"]`, `kind: "dot-or-thousands"`;
    - `1,250.50` in a `,` or tab file: `["1250.50"]`,
      `kind: "thousands-marks"`.
- `kind` names the pattern, so lines with the same problem can be grouped
  (§4.2). An amount with no `readings` has no `kind`.
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
| same recipient and token paid twice (warning) | none: the card offers only `Leave out of this run` |
| no on-chain decimals for a token | none: not the payer's to fix; the card offers only `Leave out of this run` |
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
  In a `;` file, `12,5` and `0.10` are both read, and `1.000` offers
  `[1 EURC]` `[1000 EURC]`, exactly as the same cell in the file would.
- **Cards are derived, not remembered.** A line with a problem has an open
  card. A line with edits and no problem has a fixed card. A left-out line has
  a left-out card. Going to Check and back shows the same list.

## 4. The Review step

### 4.1 The problem list

It replaces `ReviewIssues`. It is titled `Fix these lines`, or `Check these
lines` when only warnings remain, with a count such as `2 lines stop this run
· 3 fixed · 1 left out`.

In order:

1. File-level problems, as text, with no card.
2. Group cards (§4.2).
3. One card per line not in a group, **by line number only**. Errors and
   warnings are told apart by their mark, not their position, so a card never
   moves when its state changes.

Over 25 line cards, the list shows 25, then `Show N more`.

### 4.2 Group cards

Three or more open lines with the same problem and the same fix share one
group card. Only these problems group:

| Problem | Same when | Card |
|---|---|---|
| unknown token | same text, ignoring case | `40 lines use the token "USD".` `Change all to` `[USDC]` `[EURC]` `[cirBTC]` |
| `thousands-marks` | same `kind` | `12 amounts are written like 1,250.50.` `[Read all without the marks]` |
| `dot-or-thousands` | same `kind` | `9 amounts like 1.000 could be read two ways.` `[All are thousands]` `[All are decimals]` |
| `comma-or-thousands` warning (`;` file) | same `kind` | `5 amounts like 1,000 are read as 1.` `[All are thousands]` |
| `comma-or-thousands` error (`,` or tab file) | same `kind` | `5 amounts like 1,000 could be read two ways.` `[All are thousands]` `[All are decimals]` |

A token is chosen with one button per chain token, not a select: the chain
pays only three tokens (`CLAUDE.md`), and a button needs one press where a
select needs two (open it, then choose). The same is true of a line card's own
token field (§4.3).

In a `,` or tab file, `1,000` is not read as a warning the way it is in a `;`
file: with `,` as the delimiter, `1,000` could mean the same two things a `;`
file's `1.000` does, so it is refused rather than guessed, naming both
readings. It still shares `kind: "comma-or-thousands"` with the `;` file's
warning case, but groups with two buttons, not one, matching
`dot-or-thousands`.

- Each card shows two examples as `line 3: 1.000 → 1000 EURC`, and `Show the 9
  lines`. Expanded, each line has its own input and buttons, for the one that
  is different.
- Pressing the group button writes one edit per line, in one step. The group
  card then shows `✓ 9 lines changed · Undo`, and one Undo drops them all.
- Addresses, invoices and too-precise amounts never group: each needs its own
  value.
- A line whose problems are all in groups has no line card of its own. A line
  with another problem as well keeps a line card, with inputs only for the
  fields no group covers.

### 4.3 A line card

- Heading `Line 5 · INV-4`, then its messages as today.
- Only the fields that have a problem get an input:
  - **Amount:** a text input, plus one button per reading when `readings` is
    present. **A button carries the token and no grouping mark:**
    `[1 EURC]` `[1000 EURC]`, `[1250.50 USDC]`, and `[12,5 EURC]` in a `;`
    file. The grouping mark is where the doubt came from, so the button never
    repeats it.
  - **Token:** one button per chain token, not a select. There are only three
    tokens, and a button costs one press where a select costs two.
  - **Recipient:** a text input, never a suggestion. Help text: `Paste the full
    address. Check it against the one you were given.`
  - **Invoice:** a text input. A duplicate names the other line.
  - **Unreadable line:** the raw text, read-only, above four empty inputs.
- `Leave out of this run` on every card.

**Re-checking** happens on blur or Enter, not on every keystroke. A suggestion
button applies at once.

### 4.4 A card stays in place

- **Fixed:** the card keeps its place and becomes `✓ Line 5 ·
  ready to pay`. Each edited field shows before and after, with the address in
  full checksum form: `vitalik.eth → 0xe48A096B9E74f064b13c17734af29F85E02d732a`.
  It has one `Undo`, which drops that line's edits.
- **Left out:** `Line 7 · left out of this run · Undo`.
- **New problem:** an edit that causes one (a duplicate invoice) keeps the card
  open, with the new message. A field the card no longer asks for shows as a
  change, before and after, with the card's `Undo`: a recipient already paid
  has no field, and the card must not hide the address that raised it. A
  field still wrong keeps its input and adds no change, so a blur that
  commits it moves nothing under the pointer.
- **Focus** never falls to the page. After a button press, focus moves to the
  same card's `Undo`. After an `Undo`, it moves to the reopened card's first
  control. A polite live region announces `Line 5 is ready to pay`.
- The payments table shows the line at its line number with `✎ edited here`.
  Undo lives on the card, not in the table.

### 4.5 Actions

- **Primary action:** while anything blocks, it reads `Fix N lines first` and
  **stays enabled**. Pressing it scrolls to the first open card and focuses its
  first input. It never proceeds.
- **`Choose another file`** with edits asks first: `Discard your 3 edits?`

## 5. The corrected file

`correctedCsv(source, edits)` is a pure function in `frontend/lib`.

- Lines not edited are kept **byte for byte**: header, extra columns, line
  order, delimiter, line endings.
- Only edited cells are rewritten. A cell containing the delimiter, a quote or
  a line break is quoted, with quotes doubled.
- Amounts are written in the file's convention: `0,10` in a `;` file (so
  Numbers in a comma-decimal region stores a number, not text), `0.10`
  otherwise.
- **Left-out lines stay, unchanged.** They are still owed. Dropped back in,
  they show their problems again, which is true.
- Name: `<original name>-corrected.<ext>`, keeping the chosen file's own `.csv`
  or `.tsv` extension (any other extension, or none, becomes `.csv`). Pasted
  rows give `pasted-rows-corrected.tsv`. [Task 4 ruling.]
- **Round trip:** for every line not left out,
  `resolveRows(parseCsv(correctedCsv(…)))` yields exactly the row on screen. A
  test asserts it.

**Where it is offered:**

- **Review**, once anything is edited: `Download the corrected file`,
  optional.
- **Result**, after paying, when the run had edits or left-out lines: `You
  edited 3 lines and left 1 out of this run. Download the corrected file to
  update your spreadsheet.` This is when the file matters: the run is paid,
  and the spreadsheet is what the payer opens next month.

## 6. Safeguards

- **Nothing is changed for the payer.** Every change is typed or pressed. A
  suggestion is only a reading `readAmount` computed. A group button states
  how many lines it changes and shows examples first.
- **No address is ever suggested or grouped.** An edited address passes
  `isAddress`, and its fixed card shows it in full checksum form.
- **Edits stay visible after Review:** `RunSummary` states `3 lines edited
  here · 1 left out` through Check and Pay, so the list being signed is
  visibly not the file as chosen.
- Edits live in page memory only, as the file does today. They are never
  written to `localStorage`.
- All new copy passes `plain-language.test.ts`.

## 7. Testing

**Core, unit:**

- `readAmount`: a table over `,`, `;` and tab covering read, warned,
  ambiguous and refused amounts, with their `readings` and `kind`.
- `parseCsv` keeps refused and unreadable lines, with their raw cells.
- `resolveRows` takes the delimiter, and every issue carries its `field`.
- The existing `;` tests move to the layer that now owns the rule. None are
  deleted.

**Frontend, unit:**

- `applyEdits`: edit, leave out, undo a line, undo a group.
- `correctedCsv`: byte preservation, quoting, the file's decimal mark,
  left-out lines kept, and the round trip.
- The list view: which lines group and which never do, the order by line
  number, card state (open, fixed, left out), which fields get inputs, and the
  button labels with token and no grouping mark.
- The Result reminder: shown only with edits or left-out lines.

**Playwright, real browser, at 1280 and 390:**

1. A Numbers-style `;` file with `1.000` on 9 lines → one group card →
   `[All are thousands]` → 9 lines join the table with `✎` → one Undo returns
   them.
2. A bad address → paste a good one → the card turns `✓` in place, and a
   pointer on the next card's input still lands there.
3. Leave a line out → Undo.
4. `Fix N lines first` → focus on the first open card's input.
5. Download the corrected file → the left-out line is in it, unchanged → drop
   it back → only that line has a problem.
6. `Choose another file` with edits asks first.
7. No horizontal scroll. axe is clean.

The Result reminder is covered by the unit test of its view. Reaching Result in
a browser needs a paid run.

## 8. Out of scope

- Mapping columns when the header is wrong.
- Adding lines, free-form bulk edit, sorting.
- Keeping edits across a reload.
