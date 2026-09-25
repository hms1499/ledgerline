import { describe, it, expect } from "vitest";
import {
  verifyReceipt, assessCompleteness, checkManifestAgainstRoot, explainRevert,
  RUN_EXISTS_SELECTOR, EMPTY_RUN_SELECTOR, reconcile,
  parseCsv, resolveRows, validateRun, tokensForChain,
  type Manifest, type RawLog, type ReconcileStatus, type ReceiptState,
} from "@ledgerline/core";
import { statusView } from "@/lib/reconcile-view";
import { runStatsView } from "@/lib/run-view";
import { preflightRows } from "@/lib/preflight-view";
import { RECEIPT_COPY } from "@/lib/receipt-view";
import { coverageView, RUN_STATUS } from "@/lib/dashboard-view";
import { runSummaryView } from "@/lib/run-summary-view";
import { reviewView } from "@/lib/review-view";
import { noWalletHelp } from "@/lib/wallet-help";
import { topUpHint } from "@/lib/funding-view";
import { BLOCKED_COPY, CANCELLED, FEE_ADVICE, CHECK_FAILED, RUN_FILE_COPY } from "@/lib/pay-copy";
import { TX_HASH_HINT } from "@/lib/tx-hash";
import { controlComparison } from "@/lib/mainnet-proof";
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
  it("the home page's comparison with an ordinary batch", () => {
    for (const r of controlComparison()) { clean(r.claim); clean(r.ours); clean(r.ordinary); }
  });

  it("the receipt page's verdicts", () => {
    for (const state of Object.keys(RECEIPT_COPY) as ReceiptState[]) {
      clean(RECEIPT_COPY[state]!.headline);
      clean(RECEIPT_COPY[state]!.body);
    }
  });

  it("the receipt page's checks, in every outcome", () => {
    const base = { invoiceId: "INV-001", runSalt: SALT, receiptStatus: "success" as const, logs, memoIdFor };
    for (const input of [
      base,
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

  it("the dashboard's coverage line and statuses", () => {
    const cases = [
      { total: 2, covered: 2, missing: [], attention: [] },
      { total: 2, covered: 1, missing: ["0x1"], attention: ["0x2"] },
      { total: 2, covered: 0, missing: ["0x1", "0x2"], attention: [] },
    ];
    for (const c of cases) {
      const v = coverageView(c, "testnet");
      clean(v.text);
      clean(v.attentionNote);
    }
    for (const s of Object.values(RUN_STATUS)) clean(s.label);
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
});
