import { describe, it, expect } from "vitest";
import { keccak256, toHex } from "viem";
import {
  ARC_CHAIN_ID,
  ARC_TESTNET_CHAIN_ID,
  USDC_ADDRESS,
  EURC_ADDRESS,
  CIRBTC_ADDRESS,
  tokensForChain,
  MEMO_TOPIC,
  RUN_COMMITTED_TOPIC,
  BEFORE_MEMO_TOPIC,
  TRANSFER_TOPIC,
  TRANSFER_SELECTOR,
  SYSTEM_EMITTER,
} from "../src/constants.js";

describe("constants", () => {
  it("derives the Memo event topic from its signature", () => {
    expect(keccak256(toHex("Memo(address,address,bytes32,bytes32,bytes,uint256)")))
      .toBe(MEMO_TOPIC);
  });

  it("derives the BeforeMemo topic", () => {
    expect(keccak256(toHex("BeforeMemo(uint256)"))).toBe(BEFORE_MEMO_TOPIC);
  });

  it("derives the RunCommitted topic, measured against a live Arc log", () => {
    expect(keccak256(toHex("RunCommitted(bytes32,address,bytes32,uint32)")))
      .toBe(RUN_COMMITTED_TOPIC);
  });

  it("derives the Transfer topic", () => {
    expect(keccak256(toHex("Transfer(address,address,uint256)"))).toBe(TRANSFER_TOPIC);
  });

  it("uses the canonical ERC-20 transfer selector", () => {
    expect(TRANSFER_SELECTOR).toBe("0xa9059cbb");
  });

  it("stores the system emitter lowercased for comparison", () => {
    expect(SYSTEM_EMITTER).toBe(SYSTEM_EMITTER.toLowerCase());
  });
});

describe("tokensForChain", () => {
  it("returns mainnet tokens for 5042", () => {
    const t = tokensForChain(ARC_CHAIN_ID);
    expect(t.USDC).toBe(USDC_ADDRESS);
    expect(t.EURC).toBe(EURC_ADDRESS);
    expect(t.cirBTC).toBe(CIRBTC_ADDRESS);
  });

  it("returns testnet tokens for 5042002, which are not the mainnet ones", () => {
    const t = tokensForChain(ARC_TESTNET_CHAIN_ID);
    expect(t.USDC).toBe(USDC_ADDRESS); // native predeploy, same on both
    expect(t.EURC).not.toBe(EURC_ADDRESS);
    expect(t.cirBTC).not.toBe(CIRBTC_ADDRESS);
  });

  it("refuses an unknown chain rather than defaulting to mainnet", () => {
    // Silently falling back to mainnet addresses is how a testnet rehearsal
    // ends up pointing at real money.
    expect(() => tokensForChain(1)).toThrow(/unsupported chain/i);
  });
});
