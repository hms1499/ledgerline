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

  it("keeps an edit that raised a new problem on its open card, so it can be undone", () => {
    // The payer pasted the address line 2 already pays. The warning has no
    // field, so without its change the card would hide the edit it came from.
    const text = csv(`INV-1,USDC,${A},1`, `INV-2,USDC,nope,2`);
    const c = view(text, withEdits(NO_EDITS, [{ line: 3, field: "to", text: A.toLowerCase() }])).cards[0]!;
    expect(c).toMatchObject({
      line: 3, state: "open", heading: "Line 3 · INV-2", fields: [],
      changes: [{ label: "Recipient", before: "nope", after: A }],
    });
    expect(c.messages.map((m) => m.text)).toEqual([expect.stringMatching(/already paid on line 2/)]);
  });

  it("shows the change of a field that has lost its input, and no other", () => {
    // Fixing the recipient leaves the amount open: the address shows as a
    // change. A field still wrong keeps its input, and adds nothing, so a
    // blur that commits it moves nothing under the pointer.
    const text = csv(`INV-1,EURC,nope,"1,000"`);
    const fixedOne = view(text, withEdits(NO_EDITS, [{ line: 2, field: "to", text: A }])).cards[0]!;
    expect(fixedOne.fields.map((f) => f.field)).toEqual(["amount"]);
    expect(fixedOne.changes).toEqual([{ label: "Recipient", before: "nope", after: A }]);
    const stillWrong = view(text, withEdits(NO_EDITS, [{ line: 2, field: "to", text: "0xbad" }])).cards[0]!;
    expect(stillWrong.fields.map((f) => [f.field, f.value])).toEqual([["to", "0xbad"], ["amount", "1,000"]]);
    expect(stillWrong.changes).toEqual([]);
  });

  it("leaves a group's change to the group's own Undo on a line's open card", () => {
    const text = csv(`INV-1,USD,nope,1`, `INV-2,USD,${A},2`, `INV-3,USD,${B},3`);
    const e = applyGroup(NO_EDITS, view(text).groups[0]!.actions[0]!);
    const c = view(text, e).cards[0]!;
    expect(c).toMatchObject({ line: 2, state: "open", changes: [] });
    expect(view(csv(`INV-1,USDC,nope,1`)).cards[0]!.changes).toEqual([]);
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
