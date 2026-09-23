import { describe, it, expect } from "vitest";
import type { RawLog } from "@ledgerline/core";
import { readRuns, readRunsWith, describeCoverage, type GetReceipt, type RunRead } from "@/lib/run-reads";
import { networkFor } from "@/lib/chain";
import mainnet from "../../../packages/core/test/fixtures/mainnet-2pay.json" with { type: "json" };

const net = networkFor("testnet");
const PAYER = "0x1111111111111111111111111111111111111111";
// A record's stored `payer` must never be trusted (M1): every `rec()` here
// carries a decoy value that does not match any payment in the fixture, so a
// test only passes if `readRuns`/`readRunsWith` use the payer passed in
// explicitly rather than `record.payer`.
const DECOY_PAYER = "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead";
const logs = mainnet.logs as unknown as RawLog[];
const rec = (txHash: string) => ({ txHash, payer: DECOY_PAYER });
const ok: GetReceipt = async () => ({ status: "success", logs });

describe("readRuns — one state per recorded run", () => {
  it("summarises a successful receipt, using the payer passed explicitly", async () => {
    const [r] = await readRuns([rec("0xa")], PAYER, net, { getReceipt: ok });
    expect(r!.state).toBe("read");
    expect(r!.state === "read" && r!.summary.payments).toBe(2);
  });

  it("ignores a record's stored payer entirely (M1)", async () => {
    // Passing the decoy as the payer must summarise as nobody's, even
    // though the record itself already carries that same decoy value.
    const [r] = await readRuns([rec("0xa")], DECOY_PAYER, net, { getReceipt: ok });
    expect(r!.state).toBe("read");
    expect(r!.state === "read" && r!.summary.payments).toBe(0);
  });

  it("maps a reverted receipt to reverted, and a missing one to not_found", async () => {
    const getReceipt: GetReceipt = async (h) => (h === "0xr" ? { status: "reverted", logs: [] } : null);
    const reads = await readRuns([rec("0xr"), rec("0xm")], PAYER, net, { getReceipt });
    expect(reads.map((r) => r.state)).toEqual(["reverted", "not_found"]);
  });

  it("marks a run as needing attention when a payment's identity is broken", async () => {
    // No real receipt has a broken identity, so the summariser is injected.
    const reads = await readRunsWith(
      [rec("0xa")],
      PAYER,
      async () => ({ status: "success", logs }),
      () => ({ paid: new Map(), payments: 0, identityBroken: 1 }),
    );
    expect(reads[0]!.state).toBe("attention");
  });

  it("turns a thrown error into unreadable with its message", async () => {
    const getReceipt: GetReceipt = async () => { throw new Error("rpc down"); };
    const [r] = await readRuns([rec("0xa")], PAYER, net, { getReceipt });
    expect(r).toEqual({ txHash: "0xa", state: "unreadable", reason: "rpc down" });
  });

  it("gives up on a read that outlives the timeout", async () => {
    const getReceipt: GetReceipt = () => new Promise(() => {});
    const [r] = await readRuns([rec("0xa")], PAYER, net, { getReceipt, timeoutMs: 20 });
    expect(r!.state).toBe("unreadable");
  });

  it("never has more than the allowed number of reads in flight", async () => {
    let live = 0;
    let peak = 0;
    const getReceipt: GetReceipt = async () => {
      live++; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return { status: "success", logs };
    };
    const records = Array.from({ length: 12 }, (_, i) => rec(`0x${i.toString(16)}`));
    const reads = await readRuns(records, PAYER, net, { getReceipt, concurrency: 4 });
    expect(reads).toHaveLength(12);
    expect(peak).toBe(4);
  });

  it("keeps input order and reads a repeated hash once", async () => {
    const seen: string[] = [];
    const getReceipt: GetReceipt = async (h) => { seen.push(h); return { status: "success", logs }; };
    const reads = await readRuns([rec("0xB"), rec("0xa"), rec("0xb")], PAYER, net, { getReceipt });
    expect(reads.map((r) => r.txHash)).toEqual(["0xB", "0xa"]);
    expect(seen).toHaveLength(2);
  });
});

describe("describeCoverage — how much of the history the totals stand on", () => {
  const read = (txHash: string): RunRead => ({ txHash, state: "read", summary: { paid: new Map(), payments: 0, identityBroken: 0 } });

  it("all read", () => {
    expect(describeCoverage([read("0x1"), read("0x2")])).toEqual({ total: 2, covered: 2, missing: [], attention: [] });
  });

  it("a reverted run is covered; not found and unreadable are missing", () => {
    const c = describeCoverage([
      read("0x1"), { txHash: "0x2", state: "reverted" },
      { txHash: "0x3", state: "not_found" }, { txHash: "0x4", state: "unreadable", reason: "x" },
    ]);
    expect(c).toEqual({ total: 4, covered: 2, missing: ["0x3", "0x4"], attention: [] });
  });

  it("none readable", () => {
    const c = describeCoverage([{ txHash: "0x1", state: "unreadable", reason: "x" }]);
    expect(c.covered).toBe(0);
    expect(c.missing).toEqual(["0x1"]);
  });

  it("an attention run is covered and listed", () => {
    const c = describeCoverage([{ txHash: "0x1", state: "attention", summary: { paid: new Map(), payments: 0, identityBroken: 1 } }]);
    expect(c).toEqual({ total: 1, covered: 1, missing: [], attention: ["0x1"] });
  });
});
