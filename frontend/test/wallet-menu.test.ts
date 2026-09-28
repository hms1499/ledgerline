import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { walletMenu } from "@/lib/wallet-menu";

const A = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const keys = (m: ReturnType<typeof walletMenu>) => m.map((i) => i.key);

describe("the wallet menu", () => {
  it("offers copy, explorer and disconnect on Arc", () => {
    expect(keys(walletMenu({ address: A, chainId: 5042, wrongChain: false, held: false })))
      .toEqual(["copy", "explorer", "disconnect"]);
  });

  it("keeps Disconnect on the wrong chain, and opens with who is connected and where", () => {
    const m = walletMenu({ address: A, chainId: 1, wrongChain: true, held: false });
    expect(keys(m)).toEqual(["who", "copy", "explorer", "disconnect"]);
    expect(m[0]).toEqual({ key: "who", label: "0xe48A…732a on another network (chain 1)", disabled: true });
    expect(m.find((i) => i.key === "disconnect")!.disabled).toBe(false);
  });

  it("holds Disconnect while a payment holds the only copy of its hash, on any chain", () => {
    for (const wrongChain of [false, true]) {
      const d = walletMenu({ address: A, chainId: 1, wrongChain, held: true }).find((i) => i.key === "disconnect")!;
      expect(d).toEqual({ key: "disconnect", label: "Disconnect (after this payment settles)", disabled: true });
    }
  });
});

describe("the top bar's wallet button", () => {
  const src = readFileSync(fileURLToPath(new URL("../components/shell/WalletButton.tsx", import.meta.url)), "utf8");

  it("builds one menu for both chains, and shows it beside the switch on the wrong one", () => {
    expect(src).toContain("walletMenu({");
    expect(src.match(/<Dropdown trigger=\{\["click"\]\} menu=\{\{ items \}\}>/g)).toHaveLength(2);
    expect(src).toMatch(/<Space\.Compact>[\s\S]*Switch to Arc \{w\.net\.name\}[\s\S]*<Dropdown[\s\S]*<\/Space\.Compact>/);
    // A phone shows the verb alone; the button's name stays whole.
    expect(src).toContain("aria-label={`Switch to Arc ${w.net.name}`}");
  });
});
