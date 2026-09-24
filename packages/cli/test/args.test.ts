import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/args.js";
import { runIdFromLogs } from "../src/anchor.js";
import { RUN_COMMITTED_TOPIC, type RawLog } from "@ledgerline/core";

const TX = "0x44bce54f4b4939d495a42c0a8f930c8fd369ba0a51c27d744b7105dc056e1f3b";

describe("parseArgs", () => {
  it("defaults to mainnet and its public RPC", () => {
    const a = parseArgs([TX]);
    expect(a.network).toBe("mainnet");
    expect(a.rpcUrl).toBe("https://rpc.mainnet.arc.io");
  });

  it("--network testnet switches the default RPC", () => {
    const a = parseArgs([TX, "--network", "testnet"]);
    expect(a.network).toBe("testnet");
    expect(a.rpcUrl).toBe("https://rpc.testnet.arc.io");
  });

  it("an explicit --rpc wins over the network default", () => {
    expect(parseArgs([TX, "--network", "testnet", "--rpc", "http://x"]).rpcUrl).toBe("http://x");
  });

  it("uses the known testnet anchor unless --anchor names another", () => {
    expect(parseArgs([TX, "--network", "testnet"]).anchor).toBe(
      "0xb8907A07768D936D1D498257E5803c91033a8802",
    );
    const other = "0x1111111111111111111111111111111111111111";
    expect(parseArgs([TX, "--network", "testnet", "--anchor", other]).anchor).toBe(other);
  });

  it("rejects a network it does not know", () => {
    expect(() => parseArgs([TX, "--network", "sepolia"])).toThrow(/mainnet.*testnet/);
  });

  it("rejects a missing or malformed tx hash", () => {
    expect(() => parseArgs([])).toThrow(/usage/);
    expect(() => parseArgs(["0x1234"])).toThrow(/usage/);
  });
});

describe("runIdFromLogs", () => {
  const ANCHOR = "0xb8907A07768D936D1D498257E5803c91033a8802" as const;
  const RUN_ID = `0x${"ab".repeat(32)}` as const;
  const committed = (address: `0x${string}`): RawLog => ({
    address, topics: [RUN_COMMITTED_TOPIC, RUN_ID], data: "0x", logIndex: 0,
  });

  it("reads the run id from the trusted anchor's RunCommitted log", () => {
    expect(runIdFromLogs([committed(ANCHOR)], ANCHOR)).toBe(RUN_ID);
  });

  it("ignores the same event from any other contract", () => {
    const impostor = "0x2222222222222222222222222222222222222222";
    expect(runIdFromLogs([committed(impostor)], ANCHOR)).toBeUndefined();
  });

  it("has nothing to trust without an anchor", () => {
    expect(runIdFromLogs([committed(ANCHOR)], undefined)).toBeUndefined();
  });
});
