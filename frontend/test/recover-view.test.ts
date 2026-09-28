import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { recoverGate, wrongWalletText } from "@/lib/recover-view";

const PAYER = "0xe48A096B9E74f064b13c17734af29F85E02d732a";
const OTHER = "0x2222222222222222222222222222222222222222";

describe("rebuilding receipt links, before the click", () => {
  it("asks for the paying wallet when none is connected", () => {
    expect(recoverGate(undefined, PAYER)).toEqual({ kind: "connect" });
  });

  it("is ready for the account that paid, whatever the address's case", () => {
    expect(recoverGate(PAYER.toLowerCase(), PAYER)).toEqual({ kind: "ready" });
  });

  it("says another account cannot rebuild them, before any signature is asked", () => {
    const g = recoverGate(OTHER, PAYER);
    expect(g).toEqual({ kind: "wrong_wallet", connected: OTHER, payer: PAYER });
    const t = wrongWalletText(g as Extract<typeof g, { kind: "wrong_wallet" }>);
    expect(t.body).toContain("0x2222…2222");
    expect(t.body).toContain("0xe48A…732a");
    // The page disconnects on an account change rather than following it.
    expect(t.body).toContain("then connect again");
  });

  it("leaves it to the chain check when the payer on record is unknown", () => {
    expect(recoverGate(OTHER, undefined)).toEqual({ kind: "ready" });
  });
});

describe("the run page's rebuild uses the page's one wallet session", () => {
  const src = readFileSync(fileURLToPath(new URL("../app/(app)/run/[txHash]/Reconciliation.tsx", import.meta.url)), "utf8");

  it("takes the wallet from the provider and never connects on its own", () => {
    expect(src).toContain("const { wallet, connect, connecting } = useWallet();");
    expect(src).not.toMatch(/from "@\/lib\/wallet"/);
    expect(src).not.toContain("WalletPicker");
    expect(src).not.toContain("watchWalletList");
  });

  it("disables signing for any account but the one that paid", () => {
    expect(src).toMatch(/disabled=\{gate\.kind !== "ready"\} onClick=\{\(\) => void recover\(\)\}/);
  });
});
