import { describe, it, expect } from "vitest";
import { runIdFor, type Address, type Hex, type Manifest } from "@ledgerline/core";
import { summarySource, runSummaryView } from "@/lib/run-summary-view";

const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
const ORDER = [USDC, EURC, CIRBTC];
const decimals = { [USDC]: 6, [EURC.toLowerCase()]: 6, [CIRBTC]: 8 };
const symbols = { [USDC]: "USDC", [EURC.toLowerCase()]: "EURC", [CIRBTC]: "cirBTC" };
const PAYER = "0x1111111111111111111111111111111111111111" as Address;
const R = "0x2222222222222222222222222222222222222222" as Address;

const draft = { rows: [{ token: USDC, amount: 1_000_000n }] };
const manifest: Manifest = {
  clientRunId: ("0x" + "ab".repeat(32)) as Hex, payer: PAYER, chainId: 5042002,
  runSalt: ("0x" + "00".repeat(32)) as Hex,
  items: [{ invoiceId: "A", token: USDC as Address, to: R, amount: 2_000_000n }],
};

describe("summarySource — which list the summary describes at each step", () => {
  it("nothing on Upload or on the receipts screen", () => {
    expect(summarySource(0, draft, undefined)).toBeUndefined();
    expect(summarySource(4, draft, manifest)).toBeUndefined();
  });

  it("the draft on Review and Check, with no run ID yet", () => {
    expect(summarySource(1, draft, undefined)).toEqual({ items: draft.rows });
    expect(summarySource(2, draft, undefined)).toEqual({ items: draft.rows });
  });

  it("on Pay, exactly what is signed — the prepared list, its payer and run ID — not the draft", () => {
    const s = summarySource(3, draft, manifest)!;
    expect(s.items).toBe(manifest.items);
    expect(s.payer).toBe(PAYER);
    expect(s.runId).toBe(runIdFor(PAYER, manifest.clientRunId));
  });

  it("on Pay with nothing prepared (reset by a wallet change), nothing rather than the draft", () => {
    expect(summarySource(3, draft, undefined)).toBeUndefined();
  });
});

describe("runSummaryView — the summary's words", () => {
  it("one total per token, in the chain's token order, never pooled", () => {
    const v = runSummaryView("Payroll 2026-09", {
      items: [
        { token: EURC, amount: 500_000n }, { token: USDC, amount: 1_000_000n },
        { token: USDC, amount: 2_000_000n }, { token: CIRBTC, amount: 1n },
      ],
    }, ORDER, decimals, symbols);
    expect(v).toEqual({
      name: "Payroll 2026-09", payments: "4 payments",
      toPay: ["3 USDC", "0.5 EURC", "0.00000001 cirBTC"], runId: undefined,
    });
  });

  it("singular for one payment, and the run ID when there is one", () => {
    const v = runSummaryView("x", { items: [{ token: USDC, amount: 1n }], runId: "0xrun" }, ORDER, decimals, symbols);
    expect(v.payments).toBe("1 payment");
    expect(v.runId).toBe("0xrun");
  });

  it("a token without decimals shows its raw integer", () => {
    const v = runSummaryView("x", { items: [{ token: CIRBTC, amount: 5n }] }, ORDER, {}, {});
    expect(v.toPay).toEqual(["5 (0x171a…baa0)"]);
  });
});
