# Plain-user flows — a payer who is not technical

A payer who has never used a crypto wallet should get from nothing to paid
receipts without meeting a dead end, a raw error or a word they cannot act on;
a recipient should understand their receipt at a glance. This spec turns the
UX audit of 2026-09-25 into one change set.

**Parent specs:** `2026-09-21-ledgerline-design.md` (product, chain
constraints), `2026-09-21-create-run-design.md` (the create flow),
`2026-09-24-tape-design-system-design.md` (the look). Nothing here changes an
invariant in `CLAUDE.md`, the payout sequence in `packages/core/src/execute.ts`,
or the wallet-session rules. The one core change is the CSV reader and the
wording of core's user-facing messages.

Claims are tagged as in the parent specs: `[measured]` (run here and read),
`[docs]`, `[unverified]`.

---

## 1. Why: what the audit measured

Driven in Playwright on a production build, at 1280 and 390 wide, with a
keyless wallet that reports an address, answers the free message prompt with a
stand-in signature and rejects every transaction as a user clicking Reject
would. No money moved. `[measured]`

| # | Finding | Evidence |
|---|---|---|
| 1 | Rejecting the payment in the wallet prints viem's raw error (`Request Arguments… data: 0x82ad56cb000… viem@2.56.8`) under "Nothing was signed", and the unbroken hex widens the page | `scrollWidth` 31,900 at 1280, 31,634 at 390 |
| 2 | No wallet installed is a dead end: a toast and an inline alert repeat "No wallet found… MetaMask or Rabby… smart-contract wallets", with no link and no list of what is needed | `/new` review step |
| 3 | A spreadsheet's own CSV is refused whole: `Invoice ID,Token,Recipient,Amount` and the `;`-separated file Excel writes in Vietnamese and European locales both fail on "The header must read exactly…" | `excel.csv`, `semicolon.csv` |
| 4 | Row errors are one Alert each, stacked above the table out of line order (3, 4, 5, 6, 9, 7, 8); failing rows vanish from the table; copy says "zero address", "scientific notation", "burning a payroll", "This chain has usdc, eurc, cirbtc" | `mistakes.csv` |
| 5 | "Choose another file" empties the run name | input value `""` after going back |
| 6 | A short balance disables the button ("Top up the short token first") with no way to top up and no way to re-read balances | empty-wallet run |
| 7 | On phones `/new` shows antd's vertical Steps (240px) and "Step 1 of 5" together; the name field starts at y≈606 of 844. `.hide-sm` loses to antd's later `.ant-steps { display: flex }` — the same cascade trap as `bdf786f`, present before the tape work | computed `display: flex` at 390 |
| 8 | Dropping a file before naming the run: nothing prevents the browser default, so the browser opens or downloads the file; the drop zone gives no reason it is inert | `dragover`/`drop` not default-prevented |
| 9 | After paying, the payer is told to keep four things: the run name ("Write it down"), the run file, the transaction hash, the receipt links | Result screen |
| 10 | The dashboard says a run can be opened "by its transaction hash", but nothing on any page takes one | no hash input on `/`, `/dashboard`, `/runs` |
| 11 | Fee copy ("do not lower them below 25 Gwei… a revert"); "Your wallet is on chain 5042"; receipt has no date and hides the payer in a fold; "calldata" on the receipt; "6 dp" chips; a hex "List fingerprint"; "in the run file" in every Invoice cell | copy read on screen |

What already works and must not regress: the receipt reaches a verdict in
0.85–1.1 s on a phone `[measured]`; the Check step tries every payment before
money moves; two wallet prompts in total; the wrong-chain fix is one button;
the parser already accepts a BOM, CRLF, stray spaces, lowercase tokens and
lowercase addresses `[measured]`.

## 2. Decisions

Made with the product owner on 2026-09-25:

1. **Semicolon files take decimal commas.** In a `;` file `0,10` is read as
   0.10. Any `.` in an amount there is refused, because `1.000` is one thousand
   in the locales that write `;` files. Never guess an amount.
2. **The run name is prefilled** with `Payroll YYYY-MM` from the local date, and
   stays editable. The drop zone is always live.
3. **Home puts "How a run works" before the Proof.** The Proof's content stays
   as it is, for the judges; it moves down.
4. **Core carries the CSV change,** so any reader of the format reads it the
   same way. The CLI does not parse CSV today `[measured]`; the web app is the
   only caller of `parseCsv`.

## 3. The CSV format (core)

`packages/core/src/csv.ts`.

**Delimiter.** Read from the header line: `;` when the header contains a `;`
outside quotes and no `,` outside quotes; `,` otherwise. The whole file uses
that delimiter.

**Columns by name, in any order.** Each header cell is normalised: lowercased,
with spaces, `_`, `-` and `.` removed. It maps to a field when it equals one of:

| Field | Accepted names (normalised) |
|---|---|
| `invoiceId` | `invoiceid`, `invoice`, `invoiceno`, `invoicenumber`, `reference`, `ref` |
| `token` | `token`, `currency`, `asset` |
| `to` | `to`, `recipient`, `address`, `wallet`, `recipientaddress`, `walletaddress` |
| `amount` | `amount`, `value` |

- A column matching no field is ignored (Name, Notes, Department).
- A field matched by two columns refuses the file:
  `Two columns could be the amount: "Amount" and "Value". Keep one.`
- A missing field refuses the file, naming what is missing and what was found:
  `The first line must name the columns invoiceId, token, to and amount, in any order. Missing: amount. Found: Invoice ID, Token, Recipient, Salary.`
- Every data row must have as many cells as the header; otherwise:
  `This line has 5 values but the first line names 4 columns. A value that contains a comma needs quotes around it.`
  (with `;` in place of the comma for a `;` file).

Mapping by name is safer than the old fixed order: a reordered column can no
longer be read as the wrong field.

**Amounts.**

- `,` file: an amount must match `^\d*\.?\d*$` (today's rule).
- `;` file: an amount must match `^\d*,?\d*$`; the comma becomes the decimal
  point before `toBaseUnits`. An amount containing `.` is refused on its line:
  `In a file separated by ";", write amounts with a comma for decimals and no other marks, like 1250,50.`

`toBaseUnits` keeps its arithmetic and its refusals; only its words change.

**Messages.** Every message says what to do. The replacements:

| Where | Old | New |
|---|---|---|
| `toBaseUnits` | `"1,000" is not a plain decimal number. Scientific notation, thousands separators and negative values are not accepted.` | `"1,000" is not an amount this page can read. Write it with digits and a dot only, like 1000 or 12.50.` |
| `toBaseUnits` | `…has 7 decimal places but this token has 6… Rounding a payment is not something this tool will do quietly.` | `"0.1234567" has 7 decimal places, but USDC has 6. Round it yourself, so the amount paid is exactly what you mean.` (symbol passed in) |
| `toBaseUnits` | `Amount is zero, which is legal on chain but meaningless in a payout.` | `The amount is zero. Enter the amount owed, or remove this line.` |
| `resolveRows` | `Unknown token "USDT". This chain has usdc, eurc, cirbtc.` | `"USDT" is not a token this page pays. Use one of: USDC, EURC, cirBTC.` |
| `resolveRows` | `"vitalik.eth" is not a valid address.` | `"vitalik.eth" is not a wallet address. Use the full address: 0x followed by 40 letters and digits.` |
| `resolveRows` | `Invoice reference is empty.` | `The invoice reference is empty. Every payment needs one.` |
| `validateRun` | `Pays the zero address. Arc reverts on this, and burning a payroll is not a thing this tool will do.` | `This pays 0x0000…0000, an address nobody owns. Arc refuses the payment. Check the recipient.` |
| `validateRun` | `Invoice "INV-1" already appears on line 2. Two payments under one reference cannot be told apart when reconciling.` | `Invoice "INV-1" is also on line 2. Give each payment its own invoice reference, or the two cannot be told apart.` |
| `validateRun` | `This file has no rows to pay.` | `This file has no payments in it.` |
| `verify.ts` | `Proven by rebuilding the transfer calldata and matching its hash against the reference — not by position or amount.` | `Proven by rebuilding this payment and matching it to the invoice's reference — not by its position or amount.` |

`build.ts` keeps its thrown messages: they guard callers that skip validation
and never reach a screen.

## 4. Upload and Review (`/new`)

**Run name.** `CreateRun` owns the name, so "Choose another file" returns to a
filled field. It starts as `Payroll YYYY-MM` (`defaultRunLabel(date)`, pure, in
`lib/`). The helper line becomes: `Saved in the run file you download after
paying.`

**Drop zone.** Always enabled. A file chosen while the name is empty is kept;
the name field shows `Name the run first` below it and takes focus; a
`Continue with <file name>` button reads the kept file once a name exists.

**Review: one list of problems.** The per-issue Alerts are replaced by one tape,
`Fix these lines` (or `Check these lines` when only warnings remain), above the
payments table:

- a count: `3 lines need fixing before this run can be paid`;
- one entry per issue, sorted by line: `Line 5 · INV-4 · "1,000"` then the
  message; entries without a line (header, whole-run) come first;
- warnings in the same list, marked `!`, after the errors of their line;
- the payments table keeps showing the rows that are valid.

The row values come from `parseCsv`'s rows, kept on the draft by line.

**Primary action.** With blocking problems it reads `Fix N lines first` and is
disabled, whether or not a wallet is connected. `Connect a wallet to continue`
appears only for a file with nothing to fix.

**CSV help.** States: columns in any order; `Recipient` or `Address` work for
`to`; a `;` file writes amounts as `0,10`.

## 5. Wallet

**No wallet: one dialog.** `connect()` finding no wallet no longer raises a
toast and an inline error. Every Connect button opens `NoWalletDialog`:

- Title: `You need a browser wallet`.
- `Install one, then reload this page:` [MetaMask](https://metamask.io/download)
  · [Rabby](https://rabby.io). Both links resolve (200) `[measured]`.
- Testnet: `Get free test tokens at faucet.circle.com.` Mainnet: `Your wallet
  also needs USDC on Arc mainnet: it pays each run's network fee.` No bridge or
  swap link: none is verified.
- `Use an ordinary wallet account. Multisig and smart-contract wallets, like
  Safe, cannot sign these payments.`
- Buttons: `Reload the page` (primary), `Close`.

`describeConnectError` gains a third kind, `no-wallet`, for this case; the
dialog is driven by it. The other two kinds keep today's toast and inline alert.

**Cancelled in the wallet.** A wallet error with code 4001 is a cancellation:

- Check step, message prompt: `You cancelled the message in your wallet.
  Nothing was signed and no money moved.` + `Try again`.
- Pay step: `StepSend` wraps `send` to note a 4001 before rethrowing, so
  `execute.ts` is untouched. The outcome reads `You cancelled the payment in
  your wallet. Nothing was signed and no money moved.` + `Try the run again`.

**Any other failure** shows one plain sentence plus a closed `Technical details`
fold holding the original text. Verdict paragraphs and alert descriptions get
`overflow-wrap: anywhere`, so no string can widen the page.

**Wrong network.** `chainName(chainId)` (pure, `lib/chain.ts`) returns
`Arc mainnet`, `Arc testnet`, or `another network (chain N)`. The banner reads
`Your wallet is on Arc mainnet. This run pays on Arc testnet.`

**Short balance.** Each short line adds how to fix it: testnet links the faucet;
mainnet says `Add cirBTC to this wallet on Arc mainnet.` A `Check balances
again` button re-reads every balance.

## 6. Check and Pay

- Check: the `List fingerprint` moves into a closed `Technical details` fold.
- Pay: `Your wallet will show a network fee. Keep the fee it suggests. If you
  change it, do not go below 25 Gwei: Arc silently drops cheaper transactions,
  with no error.` The floor stays stated: it is the chain's most dangerous
  behaviour (`CLAUDE.md`, gas floor).

## 7. Result: one file

The run file already holds the run name, the transaction hash, the run salt and
every proof, and the run page rebuilds receipt links from it `[measured]`
(`Reconciliation.tsx`, `receiptUrl` from the loaded manifest). So the payer
keeps one thing.

In order:

1. The stamp `Paid, with a receipt`; the summary line reads `Recorded in block
   N` (no gas figure).
2. `Save the run file` with `This one file keeps everything: the run name, the
   transaction and every receipt link. Load it on the run page any time.` and
   the primary button `Download the run file`. Leaving before it is saved still
   asks first.
3. `Send each recipient their link`: `Copy all links`, `Download links as CSV`,
   and the table with `Copy link` per row. `Copied` returns to its label after
   2 s.
4. Two links: `Open this run`, `On the explorer`. The `Keep two things` alert is
   removed.

## 8. Receipt, run page, finding a run

**Receipt `/r/[tx]`.** Two leader lines join the slip's face, after `TO`:

- `FROM` — the payer, shortened (`0x5955…de17`), full address in `title`.
- `PAID` — the block's timestamp in English (`en-GB`: `24 Sep 2026, 14:46`),
  in the viewer's time zone, with the zone named (`GMT+7`), since the interface
  is English. Read with `getBlock` on the block already known. If the read fails
  the line is left out; nothing is estimated.

**Run page `/run/[tx]`.** An Invoice cell with no run file loaded shows `—`
instead of `in the run file`; the alert above already says why.

**Open a run by its hash.** `OpenRunByHash` on the empty dashboard and on
`/runs`: one input, `Transaction hash`, accepting `0x` + 64 hex (surrounding
spaces trimmed), and `Open`. Anything else shows `That is not a transaction
hash: it starts with 0x and has 64 more letters and digits.` under the field.
It opens `/run/<hash>?n=<network>`. The check is `isTxHash` in `lib/`.

## 9. Home and phones

**Home.** Order: hero, How a run works, Proof, footer. How a run works gains
one line under its steps: `You need a browser wallet (MetaMask or Rabby) and
USDC on Arc for the network fee.` with `Try it on testnet first`. The token
chips read `USDC`, `EURC`, `cirBTC`, without `dp`.

**Phones.** `.hide-sm` and `.only-sm` become `html .hide-sm` and
`html .only-sm`, above antd's rules. A test holds it, next to the font guard
from `bdf786f`.

## 10. Out of scope

- A Vietnamese (or any) translation of the interface.
- Bridge or swap links for mainnet funding: none verified.
- Paying the lines that are funded and dropping the short ones: a payroll that
  quietly loses a line is worse than one that waits.
- Any change to what is signed, what is sent, or how a receipt is verified.

## 11. Testing and definition of done

**Unit (core):** `parseCsv` — every alias, reordered columns, an ignored extra
column, a doubled field, a missing field, `;` with `0,10`, `;` with `1.000`
refused, `;` row-count message; the new message texts; the existing
fail-closed tests unchanged in intent.

**Unit (web):** `defaultRunLabel`, `chainName`, `isTxHash`, the `no-wallet`
kind and the 4001 detection in `describeConnectError`, the issue list's
ordering; `plain-language.test.ts` extended to the new copy; CSS guards for
`html .hide-sm` and for `overflow-wrap` on verdicts and alert descriptions.

**Browser acceptance** — the audit's own scenarios, re-run:

1. Reject at Pay: `scrollWidth` equals the viewport at 1280 and 390, and the
   screen shows the cancellation sentence, not viem's text.
2. `excel.csv` and `semicolon.csv` reach Review with the right amounts
   (`1250.00` and `0.10`); `mistakes.csv` shows one list in line order.
3. "Choose another file" keeps the name; a file dropped with an empty name is
   kept and the name field asks for one.
4. Connect with no wallet opens the dialog, with both install links.
5. At 390, `/new` shows one progress indicator and the name field above the fold.
6. The receipt shows FROM and PAID.
7. A pasted hash opens its run; a bad one is refused under the field.

Then: axe on every route in both themes with no serious or critical issue; no
horizontal scroll on every route at 320, 390, 768, 1024 and 1280; `pnpm test &&
pnpm typecheck && pnpm build` from the root.
