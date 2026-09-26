# CSV sheet editor — the file is edited on the Review step, against the template

A payer brings the file they have, not the file the app wants. On the Review
step they turn it into a run in the app: choose the header line, say which
column is which, add a column the file never had, edit any cell, add and
delete lines, and download the result. Nothing is paid that the payer did not
see and confirm, and the file as read is never written to.

**Parent specs:** `2026-09-21-ledgerline-design.md` (product, invariants),
`2026-09-21-create-run-design.md` (the create flow),
`2026-09-26-inline-row-fixes-design.md` (the overlay, the fix list, the
corrected file). Nothing here changes an invariant in `CLAUDE.md`,
`execute.ts`, `build.ts`, the run salt, `toBaseUnits`, or the wallet-session
rules. Edits exist only before anything is signed; the Check step still reads
the chain as it does today.

Claims are tagged `[measured]`, `[docs]`, `[unverified]`, as in the parents.

---

## 1. Why

Six files a payer realistically brings were fed through the app at `f1a57f1`
on `next start`. They live, git-ignored, in
`.superpowers/ux-audit/persona-*.csv` `[measured]`:

| File | What it is | Today |
|---|---|---|
| P1 `gsheets` | Google Sheets contractor list: `Wallet Address`, `Amount (USDC)`, `Invoice #`, Name/Email/Notes, no token column, `$1,250.00`, a blank `,,,,,` line and a `Total` line | Refused: missing invoiceId, token, amount |
| P2 `excel-de` | Excel in German: BOM, CRLF, `;`, `Empfänger;Wallet;Währung;Betrag;Rechnung`, `EUR`, `1.234,56` | Refused: missing invoiceId, token, amount |
| P3 `numbers` | The app's own sample after a round trip through Numbers: a `ledgerline-sample` title line above the header | Refused: missing all four |
| P4 `next-month` | Last month's clean file, reused: two amounts change, one person joins, one leaves, invoice ids still say `2026-09` | Read, but the table is read-only: none of the payer's job can be done |
| P5 `platform` | A payroll platform's report: three metadata lines and a blank line above the header, `Crypto wallet`, bank rows, `USD`, `USDT` | Refused: missing all four |
| P6 `two-columns` | `wallet,amount`: one currency, no invoice numbers | Refused: missing invoiceId, token |

Five of six stop at the first line, with no way forward but another file. The
sixth reaches Review and cannot be changed. With each header fixed by hand
and the files run through `parseCsv` → `resolveRows` → `validateRun`, the next
layer is `[measured]`: P1's three `$` amounts and its blank and `Total` lines
are refused; P2 has `EUR` three times and two amounts with thousands marks
(`1.234,56`, `2.000,00`); P5 has
a bank row with no wallet, `USD` and `USDT`; P6 has three empty invoice
references. P3 reads clean.

What payers need, from those files:

1. **Structure:** choose the header line (P3, P5); say which column is which
   (P1, P2, P5); add a column the file never had, with one value for every
   line or filled line by line (P1, P6); add and delete lines (P1, P4).
2. **Values:** edit any cell (P4); change a whole column at once — `$` out,
   `2026-09` to `2026-10`, `EUR` to `EURC` (P1, P4); the fix list's one-press
   readings, groups and Leave out, as today (P2, P5).
3. **No lost work:** Ctrl+Z, every change visible before and after and undoable,
   and a draft that survives a reload.

**Supersedes** decision 1 of `2026-09-26-inline-row-fixes-design.md`: valid
lines are no longer read-only, and file-level problems about the header no
longer need another file. An empty file and a file over 400 lines still do
(§8).

## 2. Decisions (with the product owner, 2026-09-26)

1. **A sheet editor, not a column mapper only.** Every cell of every line is
   editable; lines are added and deleted; columns are assigned and added.
2. **The Review table becomes the grid.** No new step. A clean file looks as it
   does today, with the table now editable.
3. **The template lives in the grid's header (layout C).** Each file column
   shows its role under its name. A required column the file lacks shows as a
   ghost column at the end, to be added. There is no separate template panel.
4. **Model: an overlay on the file as read.** The file is never written.
   Every change is an entry in `SheetEdits`; undo drops it. One validator, in
   core.
5. **On a phone, each line is a card (layout A).** The same overlay and the
   same actions, laid out for touch.
6. **Drafts are kept in this browser**, keyed by the file's hash, and restored
   only when the payer says so.

## 3. The data model

### 3.1 Identity

- A line is its **line number in the file as read**, 1-based, as today. It
  never changes: deleting or adding a line renumbers nothing, so cards, undo
  entries and messages keep pointing at the right line.
- A **new line** is numbered after the file's last line: a 12-line file's first
  new line is 13, the next 14. New lines are only ever appended.
- A **column** is a `ColumnId`: `f<i>` for the file's column at index `i` on the
  header line, `n<k>` for the k-th column added here.

### 3.2 `SheetEdits`

`frontend/lib/sheet-edits.ts` replaces `run-edits.ts`:

```ts
type ColumnId = `f${number}` | `n${number}`;
type Role = CsvField | "unused";

interface SheetEdits {
  /** The header line; default the first line with a non-empty cell. */
  headerLine?: number;
  /** Roles set here for the file's columns, over those read from their names. */
  roles: Readonly<Record<`f${number}`, Role>>;
  /** Columns the file never had, each with its role. `fill` is the value of
   *  every line that has no cell of its own in that column. */
  newColumns: readonly { id: ColumnId; name: string; role: Role; fill: string }[];
  /** Line → column → text, as typed. File lines and new lines alike. */
  cells: Readonly<Record<number, Readonly<Partial<Record<ColumnId, string>>>>>;
  newLines: readonly number[];
  /** Deleted from the file: not in this run, not in the corrected file. */
  deleted: readonly number[];
  /** Left out of this run: still owed, kept in the corrected file unchanged. */
  leftOut: readonly number[];
  /** A change made to many cells at once, undone at once: a group fix, a
   *  column fill, a find and replace, "Number them". */
  batches: readonly { id: string; title: string; cells: readonly (readonly [number, ColumnId])[] }[];
}
```

Every operation is a pure function `SheetEdits → SheetEdits` with its inverse
(§4). Ctrl+Z and Ctrl+Shift+Z are a stack of `SheetEdits` values held by the
Review step; the model is immutable, so a snapshot costs nothing. The stack
does not survive a reload; the draft (§6) does.

### 3.3 Core: `readLines` and `readSheet`

In `packages/core/src/csv.ts`:

- `readLines(text): { body: string; end: string }[]` moves here from
  `frontend/lib/corrected-file.ts`. Reading and writing number lines through
  the same function, so they cannot disagree.
- `readSheet(lines, options?): ParsedCsv`, with
  `options = { headerLine?, roles?, newColumns?, cells?, newLines?, skip? }`:
  - The header is `headerLine`, or the first line with a non-empty cell.
    Lines above it are not part of the table.
  - **The delimiter is read from the header line chosen**, not from line 1.
    (P3's title line has no delimiter; read from it, P3 is `,`-separated
    `[measured]`.)
  - Roles: from the header's names through `fieldFor`, as today, then
    `roles` over them. A role held by two columns is the same "Two columns
    could be the amount" problem as today; a required role held by none is
    the same "Missing" problem. Both now name the grid, not the file (§5.5).
  - A line whose every cell is empty (P1's `,,,,,`) is read as a blank line.
    It holds no data, so nothing is guessed.
  - Cells come from the line as split, with `cells` over them and each new
    column's `fill` where a line has no cell of its own. `newLines` are read
    from `cells` alone. `skip` (deleted and left-out lines) are not read.
  - The result is today's `ParsedCsv`, so `resolveRows`, `validateRun`,
    `checkRows` and `fixList` read it unchanged.
- `parseCsv(text)` becomes `readSheet(readLines(text))`. Its behaviour does
  not change, and every existing core test stays green.

`ParsedCsv` gains `headerLine: number`, and `columns` maps each role to a
`ColumnId` instead of an index. The four `ParsedRow` fields stay, derived from
the roles.

## 4. Operations

Each is a function in `sheet-edits.ts`, and each is listed in the Changes tab
with its undo (§5.4).

| Operation | Writes | Undo |
|---|---|---|
| Edit a cell | `cells[line][col]` | Drop that cell |
| Set a column's role | `roles[col]`, or a new column's `role`; a role already held moves here | Restore the previous roles |
| Add a missing column: one value for every line | `newColumns` with `fill` | Drop the column |
| Add a missing column: empty | `newColumns` with `fill: ""` | Drop the column |
| Number them (invoiceId only) | `newColumns` with `fill: ""`, and a batch of cells `<run name>-1`, `-2`… on every line not deleted, in line order | Drop the column and the batch |
| Find and replace in a column | A batch of the cells whose text changes | The batch |
| A group fix (today's) | A batch | The batch |
| Add a line | `newLines` | Drop the line and its cells |
| Delete a line | `deleted` | Drop the entry |
| Leave a line out | `leftOut` | Drop the entry |
| Use a line as the header | `headerLine` | Restore the previous one |

Rules:

- Nothing is applied that the payer did not press. A token for a whole column
  is chosen with one button per chain token, as today; an address is never
  suggested; "Number them" and find and replace show what they will change
  (`3 cells will change`) before they do.
- Find and replace is plain text, case-sensitive, in one column. No patterns.
- "Number them" is offered on the ghost invoice column only, because every
  line needs its own reference. The prefix is the run name, so a monthly run
  numbers differently each month. A left-out line is numbered too: it is
  still owed. The references go through the same checks as any other.
- Changing the header line clears `roles` and `newColumns` set for the old
  one (their `ColumnId`s named other columns), and says so before it does.
  Lines between the old header and the new one join the lines above the
  header: not read, not written.

## 5. The Review step

### 5.1 Layout (desktop and tablet, above 639px)

Top to bottom, full width:

1. The run summary as one line (payable count and totals, `Changed here`,
   network). On the Review step only, it leaves the right-hand column it has
   today; the other steps keep it there.
2. Problems | Changes (§5.4).
3. The grid (§5.2), and `+ Add a line` under it, with `Ctrl+Z` and the draft
   status beside it.
4. The funding check and the actions, as today.

On a tablet the grid keeps today's `.table-scroll` region: it scrolls
sideways inside itself, is keyboard-reachable, and the page never does.

### 5.2 The grid

- One row per line from the header down, in file order, then new lines.
  Lines above the header show as one dimmed row: `Lines 1–4 are above the
  header`, with `Use line N as the header` on each when expanded.
- One column per file column, in file order, then new columns, then one ghost
  column per required role nobody holds.
- **Header cell:** the column's name as in the file, and under it a role chip:
  `to ✓` (holds a role, filled), `not used` (dashed). The chip opens a menu:
  the four roles, `not used`, and `Find and replace in this column…`.
- **Ghost column:** `token ✗ missing · + Add`. Its menu: for token, one
  button per chain token (`USDC` `EURC` `cirBTC`: same value on every line) or
  `Add it empty`; for invoiceId, `Number them` or `Add it empty`; for to and
  amount, `Add it empty`. It also states the template's rule for the column
  (`USDC, EURC or cirBTC`; `as on an invoice: 1250.00`; `0x and 40
  characters`). A column the payer already has under another name is found
  through the role chip, not here.
- **Cells are text.** One cell edits at a time: click, Enter or F2 opens it;
  Enter or Tab keeps it (and moves right on Tab), Escape cancels. The line is
  checked when a cell is kept, not on every key, as today.
- **Marks:** a cell with a problem has the ribbon outline and names its
  message through `aria-describedby`; an edited cell has the shade fill and,
  while focused, `was $980.00`. A left-out line is dimmed, a deleted line is
  struck through with `deleted · Undo` in place: nothing moves under the
  pointer.
- **Line menu (⋯):** `Leave out of this run`, `Delete from the file`,
  `Use as the header line`. A new line's menu has `Delete` only.
- `+ Add a line` appends an empty line and opens its first cell.
- Over 25 lines the grid still renders every line (at most 400 plus the
  header): cells are text, so this is 400 rows of text and one input, not
  thousands of inputs. `[unverified]` until measured (§9).

### 5.3 On a phone (639px and below)

- `Columns ▾`, collapsible, first: each file column's name with its role chip,
  then the ghost columns. The same menus.
- Problems | Changes.
- One card per line: `Line 3 · Bob Tran` (the invoice, else the first
  non-empty cell), then the four role fields as label and value; a tap edits
  in place, with the same keep and cancel rules. Other columns fold under
  `More: Name, Email, Notes`. The ⋯ menu is the same.
- Every target is at least 44px high; the page never scrolls sideways.

### 5.4 Problems | Changes

Two tabs over the same `SheetEdits`, replacing today's fix list:

- **Problems** keeps what needs no typing: file-level problems as text, group
  cards with their buttons, a line's reading and token buttons,
  `Leave out of this run`, and `Show in table`, which scrolls to the cell and
  opens it. Free text is typed in the grid (or the card on a phone), not in a
  second input. The title, counts and `Fix N problems first` are today's.
- **Changes** lists every entry of `SheetEdits`, newest first: `Line 3 ·
  Amount · $980.00 → 1100 · Undo`; `3 cells in Amount · "$" removed · Undo`;
  `Line 6 · deleted · Undo`; `Header · line 5 · Undo`; and, when there are
  any, `Lines 1–4 above the header are not in the corrected file`. An address
  shows in full checksum form on both sides.
- Focus rules from the inline fixes spec hold: focus never falls to the page;
  after a button, focus moves to the undo it created or the next thing to do.

### 5.5 Copy that changes

- File-level problems now say what to do here: `No column is the amount.
  Choose it under a column's name, or add it.`; `Two columns could be the
  amount: "Amount" and "Value". Mark one not used.`; for a title line,
  `The first line, "ledgerline-sample", does not name columns. If the names
  are on a later line, use that line as the header.` All pass
  `plain-language.test.ts`.
- `Changed here` counts cells, lines added, deleted and left out:
  `6 cells · 1 line added · 1 deleted · 1 left out`.
- The Result reminder names the same counts.

## 6. Drafts

`frontend/lib/draft-store.ts`:

- Key `ledgerline:draft:<sha-256 of the file's text as read>`. Value
  `{ v: 1, savedAt, edits }`: the edits, never the file.
- Saved 500 ms after the last change. Every read and write is in `try/catch`.
  When storage refuses (a private window, blocked site data), a quiet line
  says `Changes can't be saved in this browser`, and everything else works.
- On a file whose hash has a draft, Review asks before anything is applied:
  `You have 12 changes to this file from Sep 26, 14:02.` `[Continue them]`
  `[Start over]`. A draft whose `v` is not 1 is ignored.
- A draft is deleted when the run is paid, on `Start over`, and on
  `Choose another file` → `Discard`. At most five drafts are kept, oldest
  dropped first; a draft older than 30 days is dropped.
- The status line says `Draft saved in this browser only`.

## 7. The corrected file

The property that matters: **read back unchanged, the corrected file is the
run on screen** — the same payable lines with the same values, and no
file-level problem. It is tested for every persona file (§9).

- Lines above the header are not written. They are not part of the table,
  and kept they would stop the file again. The Changes tab says so.
- Header: a column holding a role keeps its name when `fieldFor` reads that
  name as that role; otherwise it is written as the role's name (`Amount
  (USDC)` → `amount`). A `not used` column whose name `fieldFor` would read as
  a role is written `<name> (not used)` (`Currency` → `Currency (not used)`).
  New columns are appended under their role's name.
- A line with no changed cell, when no column was added, is written byte for
  byte: BOM and line endings included, as today.
- A deleted line is not written. A left-out line is written unchanged: it is
  still owed.
- New lines are appended in the file's delimiter and line ending. When the
  file's last line has no line ending (P3), one is added before them.
- Amounts are written in the file's own convention and cells are quoted as
  today (`amountCell`, `cellText`).
- Name: `<name>-corrected.csv`, `.tsv` for a tab file and for pasted rows, as
  today.

## 8. Safeguards and limits

- The riskiest edit is a valid line's recipient. Changes shows the address in
  full on both sides, `Changed here` counts it, and the Result reminds the
  payer to download the corrected file.
- An empty file shows its problem as today; there is no table to edit. A
  file over 400 lines is still a file-level problem: split it into runs
  (invariant 6). Deleting lines here does not lift the limit silently; the
  count is read from the lines that remain.
- EOA-only payers, the gas floor and every Check-step rule are unchanged.

## 9. Testing

TDD throughout.

- **Core:** `readLines`; `readSheet` — header line chosen, delimiter read from
  it, roles over names, missing and duplicate roles, new-column fill, a line
  of empty cells read as blank, `cells` and `newLines`; `parseCsv` behaviour
  unchanged (every existing test green).
- **Frontend lib:** each operation of §4 and its undo; batches; roles moving
  between columns; header change clearing roles; the Problems and Changes
  views; the corrected file; the draft store (key, version, retention, expiry,
  storage throwing).
- **Round trip:** for P1–P6 and the fixtures `fix-numbers.csv` and
  `fix-crlf.csv`: read, apply the edits a payer would make, write the
  corrected file, read it back with no edits, compare runs.
- **Plain language:** every new string.
- **Browser, 1280 and 390, `next start`:** each persona to ready to pay (P5
  with its bank and USDT lines left out); Enter, Tab, Escape, F2, Ctrl+Z;
  edit, reload, `Continue them`, same state; storage throwing; axe clean;
  `scrollWidth <= innerWidth`; focus never on `BODY` after an action; a
  400-line file, time from keeping a cell to the re-checked grid.

## 10. Order of work

1. Core `readLines`, `readSheet`; `sheet-edits.ts`; the corrected file with
   its round trip; the draft store. All pure.
2. The grid, header roles, ghost columns, line menu, Problems | Changes, at
   desktop width.
3. The phone cards.
4. Browser acceptance with the persona files.

## 11. Out of scope

- Pasting many cells into the grid; sorting; filtering; moving columns;
  deleting a file column (`not used` covers it).
- Undo history across reloads (the edits persist; the Ctrl+Z stack does not).
- Splitting a file over 400 lines into runs.
- Editing on the Check or Pay steps.
- Patterns in find and replace.
