import { afterEach, describe, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Address } from "viem";
import { readBalances, readBalancesWith } from "@/lib/balances";
import { networkFor } from "@/lib/chain";

const A = "0x3600000000000000000000000000000000000000" as Address;
const B = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address;

describe("readBalancesWith — what the wallet holds, per token", () => {
  it("keys each balance by the lowercased token address", async () => {
    const got = await readBalancesWith([A, B], async (t) => (t === A ? 5n : 7n));
    expect(got).toEqual({ [A.toLowerCase()]: 5n, [B.toLowerCase()]: 7n });
  });

  it("leaves a token out when its read fails: unknown, never zero", async () => {
    const got = await readBalancesWith([A, B], async (t) => {
      if (t === B) throw new Error("rpc down");
      return 0n;
    });
    expect(got).toEqual({ [A.toLowerCase()]: 0n });
    expect(B.toLowerCase() in got).toBe(false);
  });
});

// A node that never answers, counting what reaches it, so a retry cannot hide.
let server: Server | undefined;
afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

describe("readBalances — a node that never answers", () => {
  it("asks once per token and gives up at the timeout, so the dashboard is not held for ~40 s", async () => {
    let hits = 0;
    server = createServer((req) => { req.on("data", () => {}); req.on("end", () => { hits++; }); });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const net = { ...networkFor("testnet"), defaultRpc: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
    const started = Date.now();
    const got = await readBalances(net, "0x1111111111111111111111111111111111111111", [A, B], 300);
    expect(got).toEqual({});
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(hits).toBe(2);
  });
});
