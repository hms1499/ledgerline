import { describe, it, expect } from "vitest";
import { reconcile } from "../src/reconcile.js";
import { USDC_ADDRESS } from "../src/constants.js";
import type { Manifest, RawLog } from "../src/types.js";
import fixture from "./fixtures/mainnet-2pay.json" with { type: "json" };

const logs = fixture.logs as unknown as RawLog[];

/**
 * The fixture's memoIds are keccak256(utf8(invoiceId)) — i.e. an empty salt
 * path — so the manifest here uses a salt of all zeros and invoice ids chosen
 * to reproduce those same memoIds is NOT possible. Instead we assert on the
 * salt-free behaviours, and cover salted matching with a synthetic manifest.
 */
const R1 = "0x2222222222222222222222222222222222222222" as const;
const R2 = "0x3333333333333333333333333333333333333333" as const;

function manifestWith(items: Manifest["items"]): Manifest {
  return {
    // Parenthesised: `a + b as T` parses as `a + (b as T)`, which is not what we want.
    clientRunId: ("0x" + "11".repeat(32)) as `0x${string}`,
    payer: "0x1111111111111111111111111111111111111111",
    chainId: 5042,
    runSalt: ("0x" + "00".repeat(32)) as `0x${string}`,
    items,
  };
}

describe("reconcile without a manifest", () => {
  it("lists every payment as unexpected, because intent is unknown", () => {
    const res = reconcile(logs);
    expect(res.payments).toHaveLength(2);
    expect(res.rows.every((r) => r.status === "unexpected")).toBe(true);
  });
});

describe("reconcile with a manifest", () => {
  it("marks a payment matched when memoId, recipient and amount all agree", () => {
    const m = manifestWith([
      { invoiceId: "INV-001", token: USDC_ADDRESS, to: R1, amount: 1_000_000n },
    ]);
    // Override memoId derivation by matching on the fixture's actual ids.
    const res = reconcile(logs, m, {
      memoIdFor: () => "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7",
    });
    const row = res.rows.find((r) => r.invoiceId === "INV-001");
    expect(row!.status).toBe("matched");
    expect(row!.actual).toBe(1_000_000n);
  });

  it("flags amount_mismatch and reports both numbers", () => {
    const m = manifestWith([
      { invoiceId: "INV-001", token: USDC_ADDRESS, to: R1, amount: 999_999n },
    ]);
    const res = reconcile(logs, m, {
      memoIdFor: () => "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7",
    });
    const row = res.rows.find((r) => r.invoiceId === "INV-001");
    expect(row!.status).toBe("amount_mismatch");
    expect(row!.expected).toBe(999_999n);
    expect(row!.actual).toBe(1_000_000n);
  });

  it("flags recipient_mismatch and reports both addresses", () => {
    const m = manifestWith([
      { invoiceId: "INV-001", token: USDC_ADDRESS, to: R2, amount: 1_000_000n },
    ]);
    const res = reconcile(logs, m, {
      memoIdFor: () => "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7",
    });
    const row = res.rows.find((r) => r.invoiceId === "INV-001");
    expect(row!.status).toBe("recipient_mismatch");
    expect(row!.expectedTo!.toLowerCase()).toBe(R2);
    expect(row!.to!.toLowerCase()).toBe(R1);
  });

  it("marks an intended payment with no matching payment as unpaid", () => {
    const m = manifestWith([
      { invoiceId: "GHOST", token: USDC_ADDRESS, to: R1, amount: 5n },
    ]);
    const res = reconcile(logs, m);
    expect(res.rows.find((r) => r.invoiceId === "GHOST")!.status).toBe("unpaid");
  });

  it("marks an on-chain payment absent from the manifest as unexpected", () => {
    const res = reconcile(logs, manifestWith([]));
    expect(res.rows.filter((r) => r.status === "unexpected")).toHaveLength(2);
  });

  it("marks a memo with no payment behind it as unlinked", () => {
    const withoutTransfers = logs.filter(
      (l) => l.topics[0] !== "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );
    const res = reconcile(withoutTransfers, manifestWith([]));
    expect(res.rows.filter((r) => r.status === "unlinked")).toHaveLength(2);
  });
});
