import { describe, it, expect } from "vitest";
import { initialSession, sessionReducer, shouldResetPrepared, type SessionWallet } from "@/lib/wallet-session";

const A: SessionWallet = { address: "0xaaa", chainId: 5042002 };
const B: SessionWallet = { address: "0xbbb", chainId: 5042002 };
const connected = sessionReducer(initialSession<SessionWallet>(), { type: "connected", wallet: A });

describe("sessionReducer — the wallet the shell holds", () => {
  it("forgets the wallet at once when nothing is held", () => {
    expect(sessionReducer(connected, { type: "forget" }).wallet).toBeUndefined();
  });

  it("defers a forget while a transaction hash is held, and applies it on release", () => {
    // Dropping the wallet mid-send unmounts the only copy of the hash.
    const held = sessionReducer(connected, { type: "hold", on: true });
    const asked = sessionReducer(held, { type: "forget" });
    expect(asked.wallet).toEqual(A);
    expect(asked.forgetQueued).toBe(true);
    const released = sessionReducer(asked, { type: "hold", on: false });
    expect(released.wallet).toBeUndefined();
    expect(released.forgetQueued).toBe(false);
    expect(released.held).toBe(false);
  });

  it("keeps the wallet when a hold is released with nothing queued", () => {
    const held = sessionReducer(connected, { type: "hold", on: true });
    expect(sessionReducer(held, { type: "hold", on: false }).wallet).toEqual(A);
  });

  it("records a chain change on the wallet", () => {
    expect(sessionReducer(connected, { type: "chain", chainId: 1 }).wallet?.chainId).toBe(1);
  });

  it("ignores a chain change with no wallet", () => {
    const empty = initialSession<SessionWallet>();
    expect(sessionReducer(empty, { type: "chain", chainId: 1 })).toEqual(empty);
  });

  it("clears a queued forget when a new wallet connects", () => {
    // held -> forget (queued) -> hold off (released, wallet gone) -> connected B
    const held = sessionReducer(connected, { type: "hold", on: true });
    const asked = sessionReducer(held, { type: "forget" });
    const released = sessionReducer(asked, { type: "hold", on: false });
    expect(released.wallet).toBeUndefined();
    const reconnected = sessionReducer(released, { type: "connected", wallet: B });
    expect(reconnected.wallet).toEqual(B);
    expect(reconnected.forgetQueued).toBe(false);
    expect(reconnected.held).toBe(false);
  });

  it("ignores a connect while a transaction hash is held", () => {
    const held = sessionReducer(connected, { type: "hold", on: true });
    const stillHeld = sessionReducer(held, { type: "connected", wallet: B });
    expect(stillHeld.wallet).toEqual(A);
    expect(stillHeld.held).toBe(true);
    expect(stillHeld.forgetQueued).toBe(held.forgetQueued);

    const asked = sessionReducer(held, { type: "forget" });
    const stillHeldWithForget = sessionReducer(asked, { type: "connected", wallet: B });
    expect(stillHeldWithForget.wallet).toEqual(A);
    expect(stillHeldWithForget.forgetQueued).toBe(true);
    expect(stillHeldWithForget.held).toBe(true);
  });
});

describe("shouldResetPrepared — when a prepared run no longer belongs to the wallet", () => {
  const idle = { confirmed: false, held: false };
  it("resets on a different account, a lost wallet, or a different chain", () => {
    expect(shouldResetPrepared(A, B, idle)).toBe(true);
    expect(shouldResetPrepared(A, undefined, idle)).toBe(true);
    expect(shouldResetPrepared(A, { ...A, chainId: 1 }, idle)).toBe(true);
  });
  it("keeps it when nothing that binds the salt changed", () => {
    expect(shouldResetPrepared(A, { ...A }, idle)).toBe(false);
    expect(shouldResetPrepared(undefined, A, idle)).toBe(false);
  });
  it("never resets a confirmed run or one being sent", () => {
    expect(shouldResetPrepared(A, B, { confirmed: true, held: false })).toBe(false);
    expect(shouldResetPrepared(A, B, { confirmed: false, held: true })).toBe(false);
  });
});
