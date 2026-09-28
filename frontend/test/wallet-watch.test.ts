import { describe, it, expect } from "vitest";
import { watchWallet, type ConnectedWallet, type Eip1193Provider } from "@/lib/wallet";

const MINE = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const OTHER = "0x2222222222222222222222222222222222222222";

function setup() {
  const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  const provider: Eip1193Provider = {
    request: async () => null,
    on: (ev, h) => { (handlers[ev] ??= []).push(h); },
    removeListener: (ev, h) => { handlers[ev] = (handlers[ev] ?? []).filter((x) => x !== h); },
  };
  const lost: (string | undefined)[] = [];
  const chains: number[] = [];
  const wallet: ConnectedWallet = {
    address: MINE, provider, chainId: 5042,
    info: { uuid: "u", name: "MockMask", rdns: "io.mock", icon: "" },
    // watchWallet only listens; it never signs.
    walletClient: undefined as unknown as ConnectedWallet["walletClient"],
  };
  const stop = watchWallet(wallet, {
    accountLost: (next) => lost.push(next),
    chainChanged: (id) => chains.push(id),
  });
  const emit = (ev: string, v: unknown) => (handlers[ev] ?? []).forEach((h) => h(v));
  return { lost, chains, stop, emit, handlers };
}

describe("watchWallet", () => {
  it("reports the account the wallet switched to", () => {
    const w = setup();
    w.emit("accountsChanged", [OTHER]);
    expect(w.lost).toEqual([OTHER]);
  });

  it("reports no account when the wallet locks or stops sharing one", () => {
    const w = setup();
    w.emit("accountsChanged", []);
    expect(w.lost).toEqual([undefined]);
  });

  it("is not a change while the list still holds the connected account", () => {
    const w = setup();
    w.emit("accountsChanged", [OTHER, MINE.toLowerCase()]);
    expect(w.lost).toEqual([]);
  });

  it("never names something that is not an address as the new account", () => {
    const w = setup();
    w.emit("accountsChanged", ["nonsense"]);
    expect(w.lost).toEqual([undefined]);
  });

  it("reports a chain change as a chain, and stops listening when asked", () => {
    const w = setup();
    w.emit("chainChanged", "0x13b2");
    w.stop();
    w.emit("chainChanged", "0x1");
    w.emit("accountsChanged", [OTHER]);
    expect(w.chains).toEqual([5042]);
    expect(w.lost).toEqual([]);
  });
});
