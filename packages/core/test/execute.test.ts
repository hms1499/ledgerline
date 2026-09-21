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
