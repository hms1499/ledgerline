import { describe, it, expect } from "vitest";
import { reconnect, silentAccount, type Eip1193Provider } from "@/lib/wallet";
import { networkFor } from "@/lib/chain";

const ADDR = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

/** Records every method asked, answering eth_accounts with `accounts`. */
function wallet(accounts: unknown | (() => Promise<unknown>)) {
  const asked: string[] = [];
  const provider: Eip1193Provider = {
    request: async ({ method }) => {
      asked.push(method);
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

describe("reconnect", () => {
  it("stays disconnected, with no prompt and no error, when the wallet shows no account", async () => {
    const w = wallet([]);
    const info = { uuid: "u", name: "MetaMask", rdns: "io.metamask", icon: "" };
    await expect(reconnect(networkFor("testnet"), { info, provider: w.provider })).resolves.toBeUndefined();
    expect(w.asked).not.toContain("eth_requestAccounts");
  });
});
