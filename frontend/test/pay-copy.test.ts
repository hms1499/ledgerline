import { describe, it, expect } from "vitest";
import { createWalletClient, custom } from "viem";
import { arcTestnet } from "viem/chains";
import { isCancelled, sendStop, blockedCopy, BLOCKED_COPY, CANCELLED, FEE_ADVICE } from "@/lib/pay-copy";

const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";

/** What viem throws when the wallet answers eth_chainId with `walletChain`
 *  and the payment is for Arc testnet — the real error, not a hand-built one. */
async function sendFrom(walletChain: string): Promise<unknown> {
  const wallet = createWalletClient({
    transport: custom({
      request: async ({ method }) => {
        if (method === "eth_chainId") return walletChain;
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      },
    }),
  });
  return wallet.sendTransaction({
    account: A, chain: arcTestnet, to: A, data: "0x",
    gas: 21_000n, maxFeePerGas: 25_000_000_000n, maxPriorityFeePerGas: 1n,
  }).catch((err: unknown) => err);
}

describe("isCancelled", () => {
  it("reads a 4001 however deep the wallet and viem buried it", () => {
    expect(isCancelled({ code: 4001 })).toBe(true);
    expect(isCancelled({ shortMessage: "User rejected the request.", cause: { code: 4001 } })).toBe(true);
    expect(isCancelled({ cause: { data: { code: 4001 } } })).toBe(true);
  });
  it("is not a cancel for anything else", () => {
    expect(isCancelled({ code: -32603 })).toBe(false);
    expect(isCancelled(new Error("nope"))).toBe(false);
    expect(isCancelled(undefined)).toBe(false);
  });
});

describe("sendStop", () => {
  it("reads viem's refusal to hand a payment to a wallet on another network", async () => {
    expect(sendStop(await sendFrom("0x1"))).toBe("wrong-network");
  });
  it("reads a cancel in the wallet", async () => {
    expect(sendStop(await sendFrom("0x4cef52"))).toBe("cancelled");
  });
  it("has nothing to say about any other failure", () => {
    expect(sendStop({ code: -32603 })).toBeUndefined();
    expect(sendStop(new Error("nope"))).toBeUndefined();
  });
});

describe("blockedCopy", () => {
  it("tells a wallet on another network which one to switch to", () => {
    expect(blockedCopy("signature", "wrong-network", "testnet")).toEqual({
      title: "Nothing was signed",
      body: "Your wallet is on another network, so it was never asked to sign. Nothing was signed and no money moved. Switch your wallet to Arc testnet and try again.",
    });
  });
  it("says a cancel was a cancel, whatever the executor called it", () => {
    expect(blockedCopy("signature", "cancelled", "mainnet")).toEqual(CANCELLED.payment);
  });
  it("otherwise says what the executor's reason certainly means", () => {
    expect(blockedCopy("fees", undefined, "mainnet")).toEqual({ title: "Nothing was signed", body: BLOCKED_COPY.fees });
  });
  it("never blames the wallet's network for the page's own node", () => {
    // `chain` is the page's RPC answering eth_chainId, or failing to: a node
    // that is down read as "your wallet changed network".
    expect(BLOCKED_COPY.chain).not.toMatch(/wallet/i);
    expect(BLOCKED_COPY.chain).toMatch(/could not confirm/);
  });
  it("never says the wallet is short when the balance could not be read", () => {
    // A short token, short gas and a node that failed mid-read all land on `balance`.
    expect(BLOCKED_COPY.balance).toMatch(/could not confirm/);
    expect(BLOCKED_COPY.balance).toMatch(/network fee/);
  });
});

describe("pay copy", () => {
  it("says nothing moved, for a cancel and for every blocked reason", () => {
    expect(CANCELLED.payment.body).toBe("Nothing was signed and no money moved.");
    for (const text of Object.values(BLOCKED_COPY)) expect(text).toMatch(/Nothing was signed/);
  });
  it("keeps the fee floor for the payer who edits the fee", () => {
    expect(FEE_ADVICE).toMatch(/Keep the fee it suggests/);
    expect(FEE_ADVICE).toMatch(/25 Gwei/);
  });
});
