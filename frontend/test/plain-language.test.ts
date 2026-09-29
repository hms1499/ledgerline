import { describe, it, expect } from "vitest";
import { pad } from "viem";
import {
  verifyReceipt, assessCompleteness, checkManifestAgainstRoot, explainRevert,
  RUN_EXISTS_SELECTOR, EMPTY_RUN_SELECTOR, reconcile,
  parseCsv, tokensForChain, MEMO_TOPIC,
  type Manifest, type RawLog, type ReconcileStatus, type ReceiptState, type Address,
} from "@ledgerline/core";
import { statusView } from "@/lib/reconcile-view";
import { runStatsView } from "@/lib/run-view";
import { preflightRows } from "@/lib/preflight-view";
import { RECEIPT_COPY } from "@/lib/receipt-view";
import { accountLostNotice, connectWaitingNotice, describeConnectError, reconnectUnreachableNotice } from "@/lib/connect-error";
import { ArcUnreachableError } from "@/lib/wallet";
import { recoverGate, wrongWalletText } from "@/lib/recover-view";
import { needsYou, runStatus, feeHelp, setupSteps, coverageLine } from "@/lib/dashboard-view";
import type { RunRead } from "@/lib/run-reads";
import type { RunRecord } from "@/lib/history";
import { runSummaryView } from "@/lib/run-summary-view";
import { checkRows, ALL_LEFT_OUT } from "@/lib/review-view";
import { fixList, RECIPIENT_HELP } from "@/lib/fix-list";
import { NO_EDITS, changesText, correctionReminder, headerWarning } from "@/lib/sheet-edits";
import { NOTHING_CHANGED } from "@/lib/changes-view";
import { DRAFT_REFUSED, DRAFT_SAVED, draftPrompt } from "@/lib/draft-store";
import { noWalletHelp, phoneWalletHelp } from "@/lib/wallet-help";
import { EOA_ONLY_NOTE, topUpHint, treasuryTopUp } from "@/lib/funding-view";
import { BLOCKED_COPY, CANCELLED, FEE_ADVICE, CHECK_FAILED, RUN_FILE_COPY } from "@/lib/pay-copy";
import { TX_HASH_HINT } from "@/lib/tx-hash";
import { spreadsheetRefusal } from "@/lib/run-file";
import { controlComparison } from "@/lib/mainnet-proof";
import { DEMO_BRIDGE } from "@/lib/demo-run";
import fixture from "../../packages/core/test/fixtures/mainnet-2pay.json" with { type: "json" };

/**
 * The words the protocol is built from, which the people using it should
 * never need: a payer or recipient meets "the run file", "the reference
 * code" and "the payer's recorded list", not a manifest, a salt or an anchor.
 * /why and developer output keep the real terms; the screens do not.
 */
const JARGON = /\b(manifests?|anchor\w*|salt|merkle|preflight|commit\w*|root|run label)\b/i;

const clean = (text: string | undefined) => {
  if (text !== undefined) expect(text, text).not.toMatch(JARGON);
};

const logs = fixture.logs as unknown as RawLog[];
const memoIdFor = () =>
  "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7" as const;
const SALT = ("0x" + "00".repeat(32)) as `0x${string}`;

describe("copy a payer or recipient reads is free of protocol jargon", () => {
  it("the home page's demo description", () => {
    clean(DEMO_BRIDGE);
  });

  it("the home page's comparison with an ordinary batch", () => {
    for (const r of controlComparison()) { clean(r.claim); clean(r.ours); clean(r.ordinary); }
  });

  it("the notices when a wallet is slow to answer, or already asking", () => {
    for (const n of [connectWaitingNotice(), describeConnectError({ code: -32002 })]) {
      clean(n.title); clean(n.description);
    }
  });

  it("the run page's warning when the wrong wallet would rebuild links", () => {
    const g = recoverGate("0x2222222222222222222222222222222222222222", "0xe48A096B9E74f064b13c17734af29F85E02d732a");
    if (g.kind !== "wrong_wallet") throw new Error("expected wrong_wallet");
    const t = wrongWalletText(g);
    clean(t.title); clean(t.body);
  });

  it("the notice when the wallet changes account on its own", () => {
    for (const n of [accountLostNotice(), accountLostNotice("0x2222222222222222222222222222222222222222")]) {
      clean(n.title); clean(n.description);
    }
  });

  it("the notice when a reload cannot reach Arc to reconnect the wallet", () => {
    const n = reconnectUnreachableNotice(new ArcUnreachableError("mainnet", "HTTP 503"), "0x2222222222222222222222222222222222222222");
    clean(n.title); clean(n.description);
  });

  it("the receipt page's verdicts", () => {
    for (const state of Object.keys(RECEIPT_COPY) as ReceiptState[]) {
      clean(RECEIPT_COPY[state]!.headline);
      clean(RECEIPT_COPY[state]!.body);
    }
  });

  it("the receipt page's checks, in every outcome", () => {
    const base = { chainId: 5042, invoiceId: "INV-001", runSalt: SALT, receiptStatus: "success" as const, logs, memoIdFor };
    // The same run paid in a lookalike of USDC: the token's logs and the
    // Memo's target both moved to another address.
    const usdc = tokensForChain(5042).USDC.toLowerCase() as `0x${string}`;
    const lookalike = "0x00000000000000000000000000000000000fa4e0" as const;
    const lookalikeLogs = logs.map((l) => {
      if (l.address.toLowerCase() === usdc) return { ...l, address: lookalike };
      if (l.topics[0] === MEMO_TOPIC && l.topics[2]?.toLowerCase() === pad(usdc, { size: 32 })) {
        return { ...l, topics: [l.topics[0], l.topics[1]!, pad(lookalike, { size: 32 }), ...l.topics.slice(3)] };
      }
      return l;
    });
    expect(verifyReceipt({ ...base, logs: lookalikeLogs }).state).toBe("unknown_token");
    for (const input of [
      base,
      { ...base, logs: lookalikeLogs },
      { ...base, runSalt: undefined },
      { ...base, runCommitted: false },
      { ...base, runCommitted: true },
      { ...base, runCommitted: true, anchorProofValid: false },
      { ...base, runCommitted: true, anchorProofValid: true },
    ]) {
      for (const rung of verifyReceipt(input).rungs) { clean(rung.label); clean(rung.detail); }
    }
  });

  it("the run page's completeness and run-file notes", () => {
    for (const c of [
      { anchoredItemCount: undefined, paymentsFound: 2 },
      { anchoredItemCount: 3, paymentsFound: 2 },
      { anchoredItemCount: 1, paymentsFound: 2 },
      { anchoredItemCount: 2, paymentsFound: 2, unlinkedCount: 1 },
    ]) clean(assessCompleteness(c).note);

    const manifest: Manifest = {
      clientRunId: SALT, payer: "0x1111111111111111111111111111111111111111", chainId: 5042002,
      runSalt: SALT, items: [{ invoiceId: "A", token: "0x3600000000000000000000000000000000000000",
        to: "0x2222222222222222222222222222222222222222", amount: 1n }],
    };
    clean(checkManifestAgainstRoot(manifest, undefined).note);
    clean(checkManifestAgainstRoot(manifest, ("0x" + "ab".repeat(32)) as `0x${string}`).note);
    clean(checkManifestAgainstRoot({ ...manifest, items: [] }, ("0x" + "ab".repeat(32)) as `0x${string}`).note);
  });

  it("the run page's status tags and notes", () => {
    const statuses: ReconcileStatus[] = ["unlinked", "unpaid", "recipient_mismatch", "amount_mismatch", "unexpected", "matched"];
    for (const s of statuses) for (const m of [true, false]) {
      const v = statusView(s, m);
      clean(v.label); clean(v.note);
    }
    for (const row of reconcile(logs).rows) clean(row.note);
  });

  it("the check step's rows and the anchor's refusals", () => {
    clean(preflightRows([{ success: true, returnData: "0x" }], [])[0]!.label);
    clean(explainRevert({ data: RUN_EXISTS_SELECTOR }).message);
    clean(explainRevert({ data: EMPTY_RUN_SELECTOR }).message);
  });

  it("the dashboard's needs, steps, statuses and totals lines", () => {
    const now = new Date(2026, 8, 28, 14, 30).getTime();
    const rec = (txHash: string, over: Partial<RunRecord> = {}): RunRecord =>
      ({ txHash, payer: "0x1", chainId: 5_042_002, runLabel: "", seenAt: now - 60_000, itemCount: 1, ...over });
    const summary = (identityBroken: number) => ({ paid: new Map(), payments: 0, identityBroken });
    const reads: RunRead[] = [
      { txHash: "0x1", state: "reverted" },
      { txHash: "0x2", state: "not_found" },
      { txHash: "0x3", state: "not_found" },
      { txHash: "0x4", state: "attention", summary: summary(1) },
      { txHash: "0x5", state: "attention", summary: summary(2) },
      { txHash: "0x6", state: "unreadable", reason: "x" },
      { txHash: "0x7", state: "read", summary: summary(0) },
    ];
    const records = [rec("0x1"), rec("0x2", { awaitingReceipt: true }),
      rec("0x3", { awaitingReceipt: true, seenAt: now - 3_600_000 }), rec("0x4"), rec("0x5"), rec("0x6"), rec("0x7")];
    const usdc = tokensForChain(5_042_002).USDC as Address;
    const items = needsYou({ records, reads, balances: { [usdc.toLowerCase()]: 0n },
      tokens: [usdc, "0x0000000000000000000000000000000000000002"], usdc, now })!;
    expect(items.map((i) => i.kind)).toEqual(["reverted", "waiting", "waiting", "attention", "attention", "unreadable", "balances", "no_fee"]);
    for (const it of items) clean(it.text);
    for (const r of reads) {
      clean(runStatus(r, { awaitingReceipt: true }).label);
      clean(runStatus(r, {}).label);
    }
    for (const network of ["mainnet", "testnet"] as const) {
      clean(feeHelp(network).text);
      for (const s of setupSteps({ wrongChain: true, balances: {}, usdc, network })) clean(s.title);
    }
    clean(coverageLine({ total: 3, covered: 1, missing: ["0x1", "0x2"], attention: ["0x3"] }, 1, "testnet", new Date(now)).text);
    clean(coverageLine({ total: 2, covered: 0, missing: ["0x1", "0x2"], attention: [] }, 0, "testnet", new Date(now)).text);
  });

  it("the run page's tiles", () => {
    for (const hasManifest of [true, false]) {
      for (const verdict of ["complete", "incomplete", "over", "unknown"] as const) {
        for (const s of runStatsView({
          payments: [], rows: [], hasManifest, blockNumber: 1n, meta: new Map(),
          completeness: { verdict, found: 0, missing: 1, surplus: 1, note: "" },
        })) { clean(s.label); clean(s.value); s.sub.forEach(clean); }
      }
    }
  });

  it("the create flow's run summary", () => {
    const v = runSummaryView("Payroll", { items: [], runId: "0x1" }, [], {}, {});
    clean(v.name); clean(v.payments); v.toPay.forEach(clean);
    for (const label of ["This run", "Name", "Payments", "To pay", "Network", "Paying wallet", "Run ID", "Not connected"]) clean(label);
    clean(runSummaryView("P", { items: [] }, [], {}, {}, { cells: 1, columns: 1, added: 1, deleted: 1, leftOut: 1, header: 2 }).changes);
    for (const label of ["Changed here"]) clean(label);
  });
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
      `invoiceId;token;to;amount\nINV-1;EURC;${A};1.000\nINV-2;EURC;${A};2.000\nINV-3;EURC;${A};3.000`,
      `invoiceId,token,to,amount\nINV-1,USD,${A},1\nINV-2,USD,${A},2\nINV-3,USD,${A},3`,
      `id,coin\n1,2`,
      `ledgerline-sample\ninvoiceId,token,to,amount`,
    ]) {
      const source = parseCsv(text);
      const f = fixList({ checked: checkRows(source, NO_EDITS, TOKENS, DECIMALS), source, edits: NO_EDITS, tokens: TOKENS });
      [f.title, f.summary, f.counts, f.fixFirst, ...f.fileProblems].forEach(plain);
      for (const g of f.groups) { plain(g.title); plain(g.lead); g.actions.forEach((a) => { plain(a.label); plain(a.batch.title); }); }
      for (const c of f.cards) { plain(c.heading); c.messages.forEach((m) => plain(m.text)); c.fields.forEach((x) => plain(x.help)); }
    }
    plain(ALL_LEFT_OUT);
    plain(RECIPIENT_HELP);
    const counts = { cells: 3, columns: 2, added: 1, deleted: 1, leftOut: 1, header: 5 };
    plain(changesText(counts));
    plain(correctionReminder(counts));
    plain(headerWarning(3));
    plain(NOTHING_CHANGED);
    plain(DRAFT_SAVED);
    plain(DRAFT_REFUSED);
    plain(draftPrompt(12, Date.UTC(2026, 8, 26)));
    for (const label of ["Show in table", "Continue them", "Start over", "Undo last change", "Redo", "Problems", "Changes",
      "Nothing to fix."]) plain(label);
    for (const label of ["+ Add a line", "Leave out of this run", "Put back in this run", "Delete from the file",
      "Delete this line", "Use as the header line", "Use it", "Keep the header", "The file as a table",
      "Line 1 is above the header", "Lines 1–4 are above the header",
      "Find and replace in this column…", "Number them", "Add it empty and fill each line", "Same token on every line:",
      "Type the text to find. Capitals count.",
      "A column you already have under another name: choose it under that column's name.", "not used",
      "Replace in 3 cells", "3 cells will change.", "October-1 to October-3, one per line."]) plain(label);
    for (const label of ["Leave out of this run", "Undo", "Download the corrected file", "Choose another file",
      "Show the 3 lines", "Hide the lines", "Keep editing", "Discard your 3 edits?",
      "Undo the changes to line 5", "Put line 5 back in this run",
      "Undo: 3 lines use the token \"USD\".", "Payments table", "Delete this line",
      "Line 3 changed. 4 lines left in this group.", "Line 3 changed."]) plain(label);

    for (const n of ["mainnet", "testnet"] as const) {
      const h = noWalletHelp(n);
      plain(h.title); plain(h.install); plain(h.funds); plain(h.kind);
      const p = phoneWalletHelp(n);
      plain(p.title); plain(p.body); plain(p.metamask); plain(p.metamaskMissing); plain(p.others);
      plain(topUpHint("USDC", n).text); plain(topUpHint("cirBTC", n).text);
      const t = treasuryTopUp({
        lines: [{ token: TOKENS.EURC, need: 2n, hold: 1n, short: 1n }],
        wallet: A, network: n, decimals: DECIMALS, symbols: { [TOKENS.EURC.toLowerCase()]: "EURC" },
      });
      plain(t?.text); plain(t?.fee);
    }
    plain(EOA_ONLY_NOTE);
    Object.values(BLOCKED_COPY).forEach(plain);
    plain(CANCELLED.message.title); plain(CANCELLED.payment.title); plain(CANCELLED.payment.body);
    plain(FEE_ADVICE); plain(CHECK_FAILED); plain(RUN_FILE_COPY); plain(TX_HASH_HINT);
    for (const name of ["a.numbers", "a.xlsx", "a.csv"]) {
      plain(spreadsheetRefusal(name, new Uint8Array([0x50, 0x4b, 0x03, 0x04])));
    }
  });
});
