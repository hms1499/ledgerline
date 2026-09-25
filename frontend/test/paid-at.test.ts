import { afterEach, describe, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { arcTestnet } from "viem/chains";
import { readPaidAt } from "@/lib/paid-at";

// A node that answers eth_getBlockByNumber with a fixed timestamp, fails, or
// never answers. Counts what reaches it, so a retry cannot hide.
let server: Server | undefined;
async function node(mode: "ok" | "500" | "hang"): Promise<{ url: string; hits: () => number }> {
  let hits = 0;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      hits++;
      if (mode === "hang") return;
      if (mode === "500") { res.writeHead(500).end(); return; }
      const { id } = JSON.parse(body) as { id: number };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        jsonrpc: "2.0", id,
        result: {
          number: "0x10", hash: `0x${"ab".repeat(32)}`, parentHash: `0x${"00".repeat(32)}`,
          timestamp: "0x68d4f2a0", transactions: [], logsBloom: `0x${"00".repeat(256)}`,
          gasLimit: "0x1", gasUsed: "0x0", baseFeePerGas: "0x1", difficulty: "0x0",
          miner: `0x${"00".repeat(20)}`, extraData: "0x", size: "0x1", uncles: [],
          nonce: "0x0000000000000000", mixHash: `0x${"00".repeat(32)}`,
          receiptsRoot: `0x${"00".repeat(32)}`, sha3Uncles: `0x${"00".repeat(32)}`,
          stateRoot: `0x${"00".repeat(32)}`, transactionsRoot: `0x${"00".repeat(32)}`,
          totalDifficulty: "0x0",
        },
      }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, hits: () => hits };
}

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

describe("readPaidAt", () => {
  it("reads the block's timestamp", async () => {
    const { url } = await node("ok");
    expect(await readPaidAt(url, arcTestnet, 16n)).toBe(0x68d4f2a0n);
  });

  it("asks a failing node once, and leaves the time off", async () => {
    const { url, hits } = await node("500");
    expect(await readPaidAt(url, arcTestnet, 16n)).toBeUndefined();
    expect(hits()).toBe(1);
  });

  it("stops waiting for a node that never answers", async () => {
    const { url, hits } = await node("hang");
    const started = Date.now();
    expect(await readPaidAt(url, arcTestnet, 16n, 300)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(hits()).toBe(1);
  });
});
