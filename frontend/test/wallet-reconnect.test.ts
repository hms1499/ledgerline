import { afterEach, describe, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { reconnect, silentAccount, ArcUnreachableError, type Eip1193Provider, type EoaMemory } from "@/lib/wallet";
import { networkFor } from "@/lib/chain";

const ADDR = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

/** Records every method asked, answering eth_accounts with `accounts`. */
function wallet(accounts: unknown | (() => Promise<unknown>)) {
  const asked: string[] = [];
  const provider: Eip1193Provider = {
    request: async ({ method }) => {
      asked.push(method);
      if (method === "eth_chainId") return "0x4cef52";
      if (method !== "eth_accounts") throw new Error(`unexpected ${method}`);
      return typeof accounts === "function" ? (accounts as () => Promise<unknown>)() : accounts;
    },
  };
  return { provider, asked };
}

describe("silentAccount — reattaching without a prompt", () => {
  it("returns the account the wallet already lets the site see", async () => {
    expect(await silentAccount(wallet([ADDR]).provider)).toBe(ADDR);
  });

  it("asks eth_accounts only, which never opens the wallet", async () => {
    const w = wallet([ADDR]);
    await silentAccount(w.provider);
    expect(w.asked).toEqual(["eth_accounts"]);
  });

  it("returns nothing once the site's permission is gone or the wallet is locked", async () => {
    expect(await silentAccount(wallet([]).provider)).toBeUndefined();
  });

  it("returns nothing for an answer that is not an address", async () => {
    expect(await silentAccount(wallet(["not-an-address"]).provider)).toBeUndefined();
    expect(await silentAccount(wallet(null).provider)).toBeUndefined();
  });

  it("returns nothing when the wallet throws, rather than failing out loud", async () => {
    expect(await silentAccount(wallet(() => Promise.reject(new Error("locked"))).provider)).toBeUndefined();
  });

  it("gives up on a wallet that never answers, so Connect is never left spinning", async () => {
    const hung = wallet(() => new Promise(() => {}));
    expect(await silentAccount(hung.provider, 20)).toBeUndefined();
  });
});

// Arc's node as the page sees it, answering eth_getCode with `code`.
let server: Server | undefined;
async function node(code: string): Promise<string> {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const { id } = JSON.parse(body) as { id: number };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id, result: code }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

const on = (defaultRpc: string) => ({ ...networkFor("testnet"), defaultRpc });
const UNREACHABLE = on("http://127.0.0.1:1");
const info = { uuid: "u", name: "MetaMask", rdns: "io.metamask", icon: "" };
const memory = (known: boolean): EoaMemory & { remembered: string[] } => {
  const remembered: string[] = [];
  return { remembered, known: () => known, remember: (a) => { remembered.push(a); } };
};

describe("reconnect", () => {
  it("stays disconnected, with no prompt and no error, when the wallet shows no account", async () => {
    const w = wallet([]);
    await expect(reconnect(networkFor("testnet"), { info, provider: w.provider }, memory(true)))
      .resolves.toEqual({ kind: "none" });
    expect(w.asked).not.toContain("eth_requestAccounts");
  });

  it("reattaches an address this browser saw pass the EOA check, while Arc cannot be reached", async () => {
    const r = await reconnect(UNREACHABLE, { info, provider: wallet([ADDR]).provider }, memory(true));
    expect(r.kind).toBe("connected");
    expect(r.kind === "connected" && r.wallet.address).toBe(ADDR);
    expect(r.kind === "connected" && r.wallet.chainId).toBe(5_042_002);
  });

  it("stays disconnected for an address never checked here, and says Arc was the reason", async () => {
    const r = await reconnect(UNREACHABLE, { info, provider: wallet([ADDR]).provider }, memory(false));
    expect(r).toMatchObject({ kind: "arc-unreachable", address: ADDR });
    expect(r.kind === "arc-unreachable" && r.error).toBeInstanceOf(ArcUnreachableError);
  });

  it("never lets the memory overrule Arc saying the address holds contract code", async () => {
    const r = await reconnect(on(await node("0x6080")), { info, provider: wallet([ADDR]).provider }, memory(true));
    expect(r).toEqual({ kind: "none" });
  });

  it("records the address once Arc confirms it is an EOA", async () => {
    const mem = memory(false);
    const r = await reconnect(on(await node("0x")), { info, provider: wallet([ADDR]).provider }, mem);
    expect(r.kind).toBe("connected");
    expect(mem.remembered).toEqual([ADDR]);
  });
});
