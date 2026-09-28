import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The send screen and its provider are React; their guarantees are pinned in
// source, as the result screen's are. A payment being sent is the one moment
// when leaving the page can cost money: the hash is the only handle on it.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const provider = read("../components/wallet/WalletProvider.tsx");
const createRun = read("../app/(app)/new/CreateRun.tsx");
const stepSend = read("../app/(app)/new/StepSend.tsx");

describe("a payment being sent survives the payer leaving", () => {
  it("guards a reload or a closed tab with the same warning as the shell's links", () => {
    expect(provider).toContain('window.addEventListener("beforeunload", hold)');
    expect(provider).toMatch(/const unloadWarning = leaveWarning\(\{ held: session\.held, unsavedRun \}\)/);
    expect(provider).toContain("leaveWarning: unloadWarning");
  });

  it("hands the hash over the moment the wallet returns it, before any wait", () => {
    expect(stepSend).toMatch(/const hash = await wallet\.walletClient\.sendTransaction\([^)]*\);\s*onSent\?\.\(hash\);/);
  });

  it("records the run at broadcast as awaiting its receipt, and again once it has one", () => {
    expect(createRun).toMatch(/onSent=\{\(txHash\) => recordRun\(\{[\s\S]*?awaitingReceipt: true,/);
    expect(createRun).toContain("onReverted={(txHash) => forgetRun(txHash, wallet.address, net.chain.id)}");
  });
});

describe("reconnecting never overrides a deliberate forget", () => {
  it("restores only before the provider's first wallet, so an account change stays forgotten", () => {
    expect(provider).toMatch(/if \(wallet\) \{ restoreTried\.current = true; return; \}\s*if \(restoreTried\.current\) return;/);
  });

  it("forgets the remembered wallet on Disconnect", () => {
    expect(provider).toMatch(/const disconnect = useCallback\(async \(\) => \{[\s\S]*?forgetWallet\(\);/);
  });
});
