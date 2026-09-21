import { describe, it, expect } from "vitest";
import { decodeMemoLogs, decodeTransferLogs } from "../src/logs.js";
import { SYSTEM_EMITTER, USDC_ADDRESS } from "../src/constants.js";
import type { RawLog } from "../src/types.js";
import fixture from "./fixtures/mainnet-2pay.json" with { type: "json" };

const logs = fixture.logs as unknown as RawLog[];

describe("decodeMemoLogs", () => {
  it("finds both Memo events", () => {
    expect(decodeMemoLogs(logs)).toHaveLength(2);
  });

  it("decodes sender, target and memoId from indexed topics", () => {
    const [first] = decodeMemoLogs(logs);
    expect(first!.sender.toLowerCase()).toBe("0x1111111111111111111111111111111111111111");
    expect(first!.target.toLowerCase()).toBe(USDC_ADDRESS.toLowerCase());
    expect(first!.memoId).toBe(
      "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7",
    );
  });

  it("decodes callDataHash from the data section", () => {
    const [first] = decodeMemoLogs(logs);
    expect(first!.callDataHash).toBe(
      "0x0de6e58d18583848333f41b9271e2c5831975016f9d7e78f6f7c7c1d88f2e6d1",
    );
  });

  it("ignores BeforeMemo logs", () => {
    expect(decodeMemoLogs(logs).every((m) => m.callDataHash.length === 66)).toBe(true);
  });
});

describe("decodeTransferLogs", () => {
  it("excludes the system emitter so USDC is not double counted", () => {
    const transfers = decodeTransferLogs(logs);
    expect(transfers).toHaveLength(2);
    expect(
      transfers.every((t) => t.token.toLowerCase() !== SYSTEM_EMITTER),
    ).toBe(true);
  });

  it("decodes the 6-decimal token value, not the 18-decimal native one", () => {
    const [first] = decodeTransferLogs(logs);
    expect(first!.value).toBe(1_000_000n);
    expect(first!.to.toLowerCase()).toBe("0x2222222222222222222222222222222222222222");
    expect(first!.from.toLowerCase()).toBe("0x1111111111111111111111111111111111111111");
  });

  it("returns nothing for an empty log list", () => {
    expect(decodeTransferLogs([])).toEqual([]);
  });
});
