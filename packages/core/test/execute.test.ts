import { describe, it, expect, vi } from "vitest";
import { encodeAbiParameters, keccak256, toHex } from "viem";
import { executeRun, type ExecuteIO, type ExecuteRunArgs } from "../src/execute.js";
import { clientRunIdFor } from "../src/build.js";
import { EURC_TESTNET_ADDRESS } from "../src/constants.js";
import type { Address, Hex, Manifest } from "../src/types.js";

const PAYER = "0x595558B91DFAA97840F2F00bF6728A74B8E6de17" as Address;
const TO = "0xe48A096B9E74f064b13c17734af29F85E02d732a" as Address;
const USDC = "0x3600000000000000000000000000000000000000" as Address;
const ANCHOR = "0xb8907A07768D936D1D498257E5803c91033a8802" as Address;
const HASH = ("0x" + "ab".repeat(32)) as Hex;
const CHAIN_ID = 5042002;

const items = [{ invoiceId: "INV-1", token: USDC, to: TO, amount: 100_000n }];
const manifest: Manifest = {
  clientRunId: clientRunIdFor(PAYER, items, "test-run"),
  payer: PAYER,
  chainId: CHAIN_ID,
  runSalt: keccak256(toHex("salt")),
  items,
};

// Pins the gas-affordability arithmetic (finding I2) so a future 10^12 slip
// fails loudly instead of quietly making every check pass. Mirrors exactly
// what executeRun computes from the default io() fixture below: gas 240_000
// (200_000 padded 20%) * maxFeePerGas 30 Gwei (20 Gwei scaled 1.5x) = a
// wei-denominated cost, converted DOWN into USDC's 6 decimals.
const GAS_COST_WEI = 240_000n * 30_000_000_000n;
const GAS_COST_USDC_UNITS = GAS_COST_WEI / 1_000_000_000_000n; // 7_200, exact
const USDC_NEEDED_TOTAL = 100_000n + GAS_COST_USDC_UNITS; // payout + gas = 107_200

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
    chainId: async () => CHAIN_ID,
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

const run = (
  over: Partial<ExecuteIO> = {},
  send: ExecuteRunArgs["send"] = async () => HASH,
) =>
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

  // The payer watches this wait for as long as receiptTimeoutMs. Learning
  // why no receipt is coming only after it expires is learning it too late
  // to do anything with.
  it("reports an under-floor fee before it starts waiting for a receipt", async () => {
    const order: string[] = [];
    const out = await executeRun({
      manifest, anchor: ANCHOR, send: async () => HASH,
      dropCheck: { attempts: 1, delayMs: 0 },
      io: {
        ...io({ findTransaction: async () => ({ maxFeePerGas: 10_000_000_000n }) }),
        waitForReceipt: async (hash, timeout) => {
          order.push("waitForReceipt");
          return io().waitForReceipt(hash, timeout);
        },
      },
      onFeeWarning: (w) => { order.push(`warned:${/25 Gwei/.test(w)}`); },
    });
    expect(out.state).toBe("confirmed");
    expect(order).toEqual(["warned:true", "waitForReceipt"]);
  });

  it("does not announce a fee warning when the fee was left alone", async () => {
    const onFeeWarning = vi.fn();
    await executeRun({
      manifest, anchor: ANCHOR, io: io(), send: async () => HASH,
      dropCheck: { attempts: 1, delayMs: 0 }, onFeeWarning,
    });
    expect(onFeeWarning).not.toHaveBeenCalled();
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

  // --- C1: a failure to observe the chain must not be reported as a fact
  // about the chain. Both directions: throw -> pending, null -> dropped. ---

  it("reports an unreachable RPC as pending, never as dropped (C1)", async () => {
    const send = vi.fn(async () => HASH);
    const out = await run(
      { findTransaction: async () => { throw new Error("fetch failed: ECONNRESET"); } },
      send,
    );
    expect(out.state).toBe("pending");
    if (out.state === "pending") {
      expect(out.txHash).toBe(HASH);
      expect(out.feeWarning).toMatch(/ECONNRESET/);
    }
  });

  it("still reports a node's genuine not-found answer as dropped (C1)", async () => {
    const out = await run({ findTransaction: async () => null });
    expect(out.state).toBe("dropped");
  });

  // --- I2: gas on Arc is USDC, so affordability is checked on top of the
  // amounts being paid out, with an explicit 18-vs-6-decimal conversion. ---

  it("blocks when USDC covers the payouts but not payouts + gas (I2)", async () => {
    const send = vi.fn(async () => HASH);
    const out = await run({ balanceOf: async () => USDC_NEEDED_TOTAL - 1n }, send);
    expect(out.state).toBe("blocked");
    if (out.state === "blocked") {
      expect(out.reason).toBe("balance");
      expect(out.details).toMatch(/gas/i);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("does not block when USDC exactly covers payouts + gas, pinning the 10^12 conversion (I2)", async () => {
    const out = await run({ balanceOf: async () => USDC_NEEDED_TOTAL });
    expect(out.state).not.toBe("blocked");
  });

  it("still requires USDC for gas on a run that pays no USDC at all (I2)", async () => {
    const eurcItems = [{ invoiceId: "INV-2", token: EURC_TESTNET_ADDRESS, to: TO, amount: 500n }];
    const eurcManifest: Manifest = {
      clientRunId: clientRunIdFor(PAYER, eurcItems, "eurc-run"),
      payer: PAYER,
      chainId: CHAIN_ID,
      runSalt: keccak256(toHex("salt")),
      items: eurcItems,
    };
    const send = vi.fn(async () => HASH);
    const balanceOf = vi.fn(async (token: Address) =>
      token.toLowerCase() === USDC.toLowerCase() ? 0n : 1_000_000n,
    );
    const out = await executeRun({
      manifest: eurcManifest,
      anchor: ANCHOR,
      io: io({ balanceOf }),
      send,
      dropCheck: { attempts: 1, delayMs: 0 },
    });
    expect(out.state).toBe("blocked");
    if (out.state === "blocked") expect(out.reason).toBe("balance");
    expect(send).not.toHaveBeenCalled();
  });

  // --- I3: nothing before signing should escape as an unhandled rejection;
  // every phase that can throw returns a RunOutcome instead. ---

  it("turns a balance-phase RPC failure into blocked, not a rejected promise (I3)", async () => {
    await expect(
      run({ balanceOf: async () => { throw new Error("rpc timeout"); } }),
    ).resolves.toMatchObject({ state: "blocked", reason: "balance" });
  });

  it("turns a fee-phase RPC failure into blocked, not a rejected promise (I3)", async () => {
    await expect(
      run({ gasPrice: async () => { throw new Error("rpc timeout"); } }),
    ).resolves.toMatchObject({ state: "blocked", reason: "fees" });
  });

  it("turns a malformed manifest (buildRun throws) into blocked, not a crash (I3)", async () => {
    const badManifest: Manifest = { ...manifest, items: [] };
    const out = await executeRun({
      manifest: badManifest, anchor: ANCHOR, io: io(), send: async () => HASH,
      dropCheck: { attempts: 1, delayMs: 0 },
    });
    expect(out.state).toBe("blocked");
    if (out.state === "blocked") expect(out.reason).toBe("preflight");
  });

  // --- I4: preflight must assert the outcome count instead of indexing
  // blindly into a possibly short or long array. ---

  it("blocks when preflight returns a different number of outcomes than expected (I4)", async () => {
    const out = await run({ simulate: async () => preflight([true, true, true]) });
    expect(out.state).toBe("blocked");
    if (out.state === "blocked") {
      expect(out.reason).toBe("preflight");
      expect(out.details).toMatch(/3/);
      expect(out.details).toMatch(/2/);
    }
  });

  // --- I5: "could not verify" must never render the same as "verified
  // fine" — and a legacy transaction's gasPrice is checked against the
  // floor too. ---

  it("warns distinctly when the broadcast fee cannot be verified at all (I5)", async () => {
    const unverifiable = await run({ findTransaction: async () => ({}) });
    const belowFloor = await run({
      findTransaction: async () => ({ maxFeePerGas: 15_000_000_000n }),
    });
    expect(unverifiable.state).toBe("confirmed");
    expect(belowFloor.state).toBe("confirmed");
    if (unverifiable.state === "confirmed" && belowFloor.state === "confirmed") {
      expect(unverifiable.feeWarning).toBeDefined();
      expect(unverifiable.feeWarning).toMatch(/could not verify/i);
      expect(belowFloor.feeWarning).toBeDefined();
      expect(unverifiable.feeWarning).not.toBe(belowFloor.feeWarning);
    }
  });

  it("warns on a legacy transaction whose gasPrice alone is below the floor (I5)", async () => {
    const out = await run({ findTransaction: async () => ({ gasPrice: 15_000_000_000n }) });
    expect(out.state).toBe("confirmed");
    if (out.state === "confirmed") expect(out.feeWarning).toMatch(/25 Gwei/);
  });

  // --- I7: the client must be on the manifest's chain before anything else
  // is read, since USDC shares its predeploy address across chains. ---

  it("blocks before any balance read when the client is on the wrong chain (I7)", async () => {
    const balanceOf = vi.fn(async () => 10_000_000n);
    const send = vi.fn(async () => HASH);
    const out = await run({ chainId: async () => 1, balanceOf }, send);
    expect(out.state).toBe("blocked");
    if (out.state === "blocked") expect(out.reason).toBe("chain");
    expect(balanceOf).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
