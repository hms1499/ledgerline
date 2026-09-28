import { afterEach, describe, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { networkFor } from "@/lib/chain";
import { assertEoa, ArcUnreachableError, EoaRequiredError } from "@/lib/wallet";
import {
  accountLostNotice, connectWaitingNotice, describeConnectError, CONNECT_PATIENCE_MS,
} from "@/lib/connect-error";

const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

// Arc's node as the page sees it: answering eth_getCode, or failing.
let server: Server | undefined;
async function node(answer: { status: number; code?: string }): Promise<string> {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      if (answer.status !== 200) { res.writeHead(answer.status).end(); return; }
      const { id } = JSON.parse(body) as { id: number };
      res.writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ jsonrpc: "2.0", id, result: answer.code ?? "0x" }));
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

describe("assertEoa", () => {
  it("passes an ordinary account", async () => {
    await expect(assertEoa(on(await node({ status: 200 })), A)).resolves.toBeUndefined();
  });

  it("refuses a smart-contract wallet", async () => {
    await expect(assertEoa(on(await node({ status: 200, code: "0x6080" })), A)).rejects.toBeInstanceOf(EoaRequiredError);
  });

  it("says Arc's node could not be read, and keeps the status, when the node fails", async () => {
    const err = await assertEoa(on(await node({ status: 503 })), A).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArcUnreachableError);
    expect((err as ArcUnreachableError).network).toBe("testnet");
    expect((err as ArcUnreachableError).reason).toMatch(/HTTP 503/);
  });

  it("says the same when the node cannot be reached at all", async () => {
    const err = await assertEoa(on("http://127.0.0.1:1"), A).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArcUnreachableError);
    expect((err as ArcUnreachableError).reason).toMatch(/fetch failed/);
  });
});

describe("describeConnectError", () => {
  it("blames Arc's node, not the wallet, and folds the reason away", () => {
    // "Couldn't connect to your wallet. HTTP request failed." was the page's
    // own read of the account failing, after the wallet had answered.
    const e = describeConnectError(new ArcUnreachableError("mainnet", "https://rpc.mainnet.arc.io: HTTP 503"));
    expect(e).toEqual({
      type: "error",
      title: "Couldn't reach Arc",
      description: "Your wallet answered, but this page could not reach Arc mainnet to check your account. Nothing was signed. Try again in a moment.",
      detail: "https://rpc.mainnet.arc.io: HTTP 503",
    });
  });
});

describe("accountLostNotice — why the page disconnected on its own", () => {
  it("names the account the wallet switched to, and says the page did not follow it", () => {
    const n = accountLostNotice("0x2222222222222222222222222222222222222222");
    expect(n.type).toBe("info");
    expect(n.title).toBe("Your wallet switched accounts");
    expect(n.description).toContain("0x2222…2222");
    expect(n.description).toMatch(/Connect again/);
  });

  it("says the wallet stopped sharing an account when it offers none", () => {
    const n = accountLostNotice();
    expect(n.type).toBe("info");
    expect(n.title).toBe("Your wallet stopped sharing an account");
  });

  it("tells a payer mid-run where the run went", () => {
    for (const n of [accountLostNotice(), accountLostNotice("0x2222222222222222222222222222222222222222")]) {
      expect(n.description).toContain("the run goes back to Review and is checked again");
    }
  });
});

describe("a wallet that does not answer", () => {
  it("names a request already waiting in the wallet (-32002), not a failure", () => {
    const e = describeConnectError({ code: -32002, message: "Request of type 'wallet_requestPermissions' already pending" });
    expect(e.type).toBe("info");
    expect(e.title).toBe("Your wallet is already asking");
    expect(e.description).toMatch(/answer it there/);
  });

  it("reads -32002 through a wrapper, as it does 4001", () => {
    expect(describeConnectError({ cause: { code: -32002 } }).title).toBe("Your wallet is already asking");
  });

  it("stops the spinner after a while and says where to look, without giving up", () => {
    expect(CONNECT_PATIENCE_MS).toBe(15_000);
    const n = connectWaitingNotice();
    expect(n.type).toBe("info");
    expect(n.description).toMatch(/connects as soon as you do/);
  });
});
