# Ledgerline Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a verifiable, referenced, multi-token payout on Arc mainnet — one transaction paying USDC, EURC and cirBTC with per-payment invoice references, plus a CLI that rebuilds the full reconciliation table from a transaction hash alone.

**Architecture:** Payments ride Arc's predeployed `Multicall3From` → `Memo` → ERC-20 `transfer` path, so every payment carries an indexed `memoId` while the token still sees the payer EOA as `msg.sender`. A single ~50-line `PayoutAnchor` contract rides along as a sibling subcall, committing a Merkle root of the intended manifest. Reconciliation is a pure function over receipt logs that joins each `Memo` to its `Transfer` by recomputing `keccak(calldata)` against the memo's `callDataHash` — a cryptographic join, not positional matching, so it is immune to log ordering.

**Tech Stack:** TypeScript + viem + vitest (pnpm workspace), Solidity + Foundry + OpenZeppelin `MerkleProof`.

**Spec:** `docs/superpowers/specs/2026-09-21-ledgerline-design.md` — read it alongside this plan. Claims there are tagged `[measured]`, `[docs]`, `[unverified]`; respect those tags.

**Scope:** This plan covers the core libraries, the contract, the CLI, and the real mainnet proof (spec tasks T1–T8, T13, T14). The web surfaces (receipt page, reconciliation view, `/why`, create-run) are **Plan 2**, deliberately deferred because their layout depends on the reconciler's final output shape.

## Global Constraints

- **Chain:** Arc mainnet, chainId `5042`. viem ships `arc` — never hand-roll a chain definition.
- **Gas floor:** `maxFeePerGas` at least **25 Gwei**. Below 20 Gwei transactions are silently dropped with no receipt and no error.
- **Priority fee:** floor **1 Gwei**, but Uniswap's Arc playbook says ~5 Gwei is typical while `eth_maxPriorityFeePerGas` returns 0.33 Gwei. Treat a stuck transaction as evidence the floor is too low.
- **Never report a payment successful without a receipt.** `pending` is a visible state.
- **Ignore emitter `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`** in all log processing. USDC emits two `Transfer` logs; EURC and cirBTC emit one. This single rule handles both.
- **Decimals come from `decimals()` on chain**, never hardcoded. USDC 6, EURC 6, cirBTC 8.
- **EOA only.** `Memo` rejects smart-contract callers. No Safe, no ERC-4337.
- **Our contract is never the caller in the payment path** — only a sibling subcall inside `aggregate3`.
- **Never hardcode Uniswap pool addresses** in product code. They are acquisition logistics only.

---

## File Structure

```
ledgerline/
├── contracts/
│   ├── foundry.toml
│   ├── src/PayoutAnchor.sol           # the only contract we deploy
│   ├── test/PayoutAnchor.t.sol
│   └── script/DeployAnchor.s.sol
├── packages/
│   ├── core/                          # @ledgerline/core
│   │   ├── src/
│   │   │   ├── constants.ts           # addresses, topics, selectors
│   │   │   ├── types.ts               # shared types — single source of truth
│   │   │   ├── memo.ts                # memoId derivation
│   │   │   ├── logs.ts                # decode Memo / Transfer logs
│   │   │   ├── join.ts                # the cryptographic join
│   │   │   ├── reconcile.ts           # manifest ↔ payments, 6 statuses
│   │   │   ├── merkle.ts              # OZ-compatible Merkle tree
│   │   │   ├── build.ts               # aggregate3 calldata
│   │   │   └── index.ts
│   │   └── test/
│   │       ├── fixtures/mainnet-2pay.json
│   │       └── *.test.ts
│   └── cli/                           # @ledgerline/cli — npx arc-reconcile
│       └── src/index.ts
├── scripts/capture-fixture.ts         # regenerates the fixture from mainnet
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Split by responsibility, not layer. `join.ts` is separate from `logs.ts` because the join is the product's core claim and deserves its own test surface; `reconcile.ts` is separate again because it is the only file that knows about intent.

---

## Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `contracts/foundry.toml`
- Test: `packages/core/test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a green `pnpm test` and `forge test`, workspace package name `@ledgerline/core`

- [ ] **Step 1: Create the workspace root**

`package.json`:
```json
{
  "name": "ledgerline",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  },
  "packageManager": "pnpm@10.33.0"
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
```

- [ ] **Step 2: Create the core package**

`packages/core/package.json`:
```json
{
  "name": "@ledgerline/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "viem": "^2.56.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "typescript": "^5.7.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 3: Write a smoke test**

`packages/core/test/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { keccak256, toHex } from "viem";

describe("toolchain", () => {
  it("has a working viem keccak256", () => {
    expect(keccak256(toHex("INV-001"))).toBe(
      "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7",
    );
  });
});
```

This value was measured against Arc mainnet tooling; if it fails, the hashing
assumptions behind the whole design are wrong and nothing else should proceed.

- [ ] **Step 4: Install and run**

Run: `pnpm install && pnpm test`
Expected: 1 test passes.

- [ ] **Step 5: Scaffold Foundry**

Run:
```bash
cd contracts && forge init --no-git --no-commit . && forge install OpenZeppelin/openzeppelin-contracts --no-commit
```

`contracts/foundry.toml`:
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.28"
optimizer = true
optimizer_runs = 200
remappings = ["@openzeppelin/=lib/openzeppelin-contracts/"]

[rpc_endpoints]
arc = "https://rpc.mainnet.arc.io"
arc_testnet = "https://rpc.testnet.arc.io"
```

Delete the generated `src/Counter.sol`, `test/Counter.t.sol`, `script/Counter.s.sol`.

- [ ] **Step 6: Run Foundry**

Run: `cd contracts && forge build && forge test`
Expected: builds clean, 0 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm workspace and foundry project"
```

---

## Task 2: Constants and types

**Files:**
- Create: `packages/core/src/constants.ts`, `packages/core/src/types.ts`
- Test: `packages/core/test/constants.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: every address, topic and selector used by later tasks; the shared
  type vocabulary (`RawLog`, `PaymentRecord`, `ManifestItem`, `Manifest`,
  `ReconcileStatus`, `ReconcileRow`, `ReconcileResult`)

- [ ] **Step 1: Write the failing test**

`packages/core/test/constants.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { keccak256, toHex } from "viem";
import {
  MEMO_TOPIC,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ledgerline/core test`
Expected: FAIL — cannot resolve `../src/constants.js`.

- [ ] **Step 3: Write constants**

`packages/core/src/constants.ts`:
```ts
import type { Address, Hex } from "./types.js";

/** Arc mainnet. */
export const ARC_CHAIN_ID = 5042;

/** Predeployed transaction-extension contracts. */
export const MEMO_ADDRESS: Address = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
export const MULTICALL3FROM_ADDRESS: Address = "0x522fAf9A91c41c443c66765030741e4AaCe147D0";

/** Protocol-level tokens. */
export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";
export const EURC_ADDRESS: Address = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
export const CIRBTC_ADDRESS: Address = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";

/**
 * EIP-7708 system emitter. Emits an 18-decimal Transfer for every native USDC
 * movement, so a single ERC-20 USDC transfer produces TWO Transfer logs while
 * EURC and cirBTC produce one. Excluding this emitter everywhere is the single
 * rule that keeps USDC from being double-counted without halving the others.
 */
export const SYSTEM_EMITTER: Address = "0xfffffffffffffffffffffffffffffffffffffffe";

export const MEMO_TOPIC: Hex =
  "0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4";
export const BEFORE_MEMO_TOPIC: Hex =
  "0xb252e055da754c72fbf7542cf424b190808a9b541e912894c5e15b4238c41501";
export const TRANSFER_TOPIC: Hex =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** `transfer(address,uint256)` */
export const TRANSFER_SELECTOR: Hex = "0xa9059cbb";

/** Minimum maxFeePerGas. Below 20 Gwei Arc silently drops transactions. */
export const MIN_MAX_FEE_WEI = 25_000_000_000n;
export const MIN_PRIORITY_FEE_WEI = 1_000_000_000n;
```

- [ ] **Step 4: Write types**

`packages/core/src/types.ts`:
```ts
export type Hex = `0x${string}`;
export type Address = `0x${string}`;

/** A log as returned by eth_getTransactionReceipt. */
export interface RawLog {
  address: Address;
  topics: Hex[];
  data: Hex;
  logIndex: number;
}

/** A decoded Memo event. */
export interface MemoEvent {
  sender: Address;
  target: Address;
  callDataHash: Hex;
  memoId: Hex;
  memoData: Hex;
  memoIndex: bigint;
  logIndex: number;
}

/** A decoded token Transfer, system emitter excluded. */
export interface TransferEvent {
  token: Address;
  from: Address;
  to: Address;
  value: bigint;
  logIndex: number;
}

/** A Memo cryptographically joined to its Transfer. */
export interface PaymentRecord {
  memoId: Hex;
  payer: Address;
  token: Address;
  to: Address;
  value: bigint;
  memoData: Hex;
  memoIndex: bigint;
  /** True when memo.sender !== transfer.from — an integrity violation. */
  identityBroken: boolean;
}

export interface ManifestItem {
  invoiceId: string;
  token: Address;
  to: Address;
  amount: bigint;
}

export interface Manifest {
  clientRunId: Hex;
  payer: Address;
  chainId: number;
  runSalt: Hex;
  items: ManifestItem[];
}

export type ReconcileStatus =
  | "matched"
  | "amount_mismatch"
  | "recipient_mismatch"
  | "unpaid"
  | "unexpected"
  | "unlinked";

export interface ReconcileRow {
  status: ReconcileStatus;
  memoId: Hex;
  token: Address;
  invoiceId?: string;
  payer?: Address;
  to?: Address;
  expectedTo?: Address;
  expected?: bigint;
  actual?: bigint;
  note?: string;
}

export interface ReconcileResult {
  rows: ReconcileRow[];
  payments: PaymentRecord[];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ledgerline/core test`
Expected: PASS, 5 assertions.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/constants.ts packages/core/src/types.ts packages/core/test/constants.test.ts
git commit -m "feat(core): add Arc constants and shared types"
```

---

## Task 3: memoId derivation

**Files:**
- Create: `packages/core/src/memo.ts`
- Test: `packages/core/test/memo.test.ts`

**Interfaces:**
- Consumes: `Hex` from `types.ts`
- Produces: `memoIdFor(runSalt: Hex, invoiceId: string): Hex`

- [ ] **Step 1: Write the failing test**

`packages/core/test/memo.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { memoIdFor } from "../src/memo.js";

const SALT = "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

describe("memoIdFor", () => {
  it("derives keccak256(runSalt ‖ invoiceId)", () => {
    expect(memoIdFor(SALT, "INV-US-001")).toBe(
      "0x8cf5f36075be5855e3561e3c04cd418ff8b943ad0b3951ad32167836da7fd270",
    );
    expect(memoIdFor(SALT, "INV-EU-002")).toBe(
      "0x9fb8233237109dbd92a4c1e0909917c1617d88ff5b1e13bd16c19a75b96d976d",
    );
  });

  it("is salt-dependent, so observers cannot read invoice ids", () => {
    const other = "0x0000000000000000000000000000000000000000000000000000000000000002" as const;
    expect(memoIdFor(SALT, "INV-US-001")).not.toBe(memoIdFor(other, "INV-US-001"));
  });

  it("rejects a salt that is not 32 bytes", () => {
    expect(() => memoIdFor("0x01", "INV-US-001")).toThrow(/32 bytes/);
  });

  it("rejects an empty invoiceId", () => {
    expect(() => memoIdFor(SALT, "")).toThrow(/empty/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ledgerline/core test memo`
Expected: FAIL — cannot resolve `../src/memo.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/memo.ts`:
```ts
import { concatHex, keccak256, toHex } from "viem";
import type { Hex } from "./types.js";

/**
 * memoId = keccak256(runSalt ‖ utf8(invoiceId))
 *
 * Salted so that an observer reading the chain sees a payment and its amount
 * but cannot recover the invoice id, and therefore cannot reconstruct
 * counterparty relationships or payment cycles. The recipient holds the salt
 * and can verify their own line. Borrowed from Request Network's design.
 */
export function memoIdFor(runSalt: Hex, invoiceId: string): Hex {
  if (runSalt.length !== 66) {
    throw new Error(`runSalt must be 32 bytes, got ${(runSalt.length - 2) / 2}`);
  }
  if (invoiceId.length === 0) {
    throw new Error("invoiceId must not be empty");
  }
  return keccak256(concatHex([runSalt, toHex(invoiceId)]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ledgerline/core test memo`
Expected: PASS, 4 assertions.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memo.ts packages/core/test/memo.test.ts
git commit -m "feat(core): derive salted memoId from runSalt and invoiceId"
```

---

## Task 4: Capture the mainnet fixture

**Files:**
- Create: `scripts/capture-fixture.ts`
- Create: `packages/core/test/fixtures/mainnet-2pay.json` (generated, committed)

**Interfaces:**
- Consumes: constants from Task 2
- Produces: a committed fixture of real Arc mainnet logs for a two-payment
  batched memo transaction, shaped exactly like `eth_getTransactionReceipt`
  logs, consumed by Tasks 5–7

This runs `debug_traceCall` against real mainnet state with a balance override,
so it costs nothing and sends no transaction. Regenerating it re-validates the
architecture at implementation time.

- [ ] **Step 1: Write the capture script**

`scripts/capture-fixture.ts`:
```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { encodeFunctionData, encodeAbiParameters, keccak256, toHex } from "viem";

const RPC = "https://rpc.drpc.mainnet.arc.io"; // public RPC lacks debug_traceCall
const PAYER = "0x1111111111111111111111111111111111111111";
const MEMO = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
const MCF = "0x522fAf9A91c41c443c66765030741e4AaCe147D0";
const USDC = "0x3600000000000000000000000000000000000000";

const memoAbi = [{
  type: "function", name: "memo", stateMutability: "nonpayable",
  inputs: [
    { name: "target", type: "address" }, { name: "data", type: "bytes" },
    { name: "memoId", type: "bytes32" }, { name: "memoData", type: "bytes" },
  ], outputs: [],
}] as const;

const aggAbi = [{
  type: "function", name: "aggregate3", stateMutability: "nonpayable",
  inputs: [{
    name: "calls", type: "tuple[]", components: [
      { name: "target", type: "address" },
      { name: "allowFailure", type: "bool" },
      { name: "callData", type: "bytes" },
    ],
  }],
  outputs: [{
    name: "returnData", type: "tuple[]", components: [
      { name: "success", type: "bool" }, { name: "returnData", type: "bytes" },
    ],
  }],
}] as const;

const erc20Abi = [{
  type: "function", name: "transfer", stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

function memoCall(to: `0x${string}`, value: bigint, invoiceId: string) {
  const inner = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, value] });
  return encodeFunctionData({
    abi: memoAbi, functionName: "memo",
    args: [USDC, inner, keccak256(toHex(invoiceId)), toHex(invoiceId)],
  });
}

const calls = [
  { target: MEMO as `0x${string}`, allowFailure: false,
    callData: memoCall("0x2222222222222222222222222222222222222222", 1_000_000n, "INV-001") },
  { target: MEMO as `0x${string}`, allowFailure: false,
    callData: memoCall("0x3333333333333333333333333333333333333333", 2_500_000n, "INV-002") },
];

const data = encodeFunctionData({ abi: aggAbi, functionName: "aggregate3", args: [calls] });

const res = await fetch(RPC, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "debug_traceCall",
    params: [
      { from: PAYER, to: MCF, data, gas: "0x500000" },
      "latest",
      {
        tracer: "callTracer",
        tracerConfig: { withLog: true },
        stateOverrides: { [PAYER]: { balance: "0x3635C9ADC5DEA00000" } },
      },
    ],
  }),
});

const body = await res.json();
if (body.error) throw new Error(`trace failed: ${JSON.stringify(body.error)}`);

// Flatten the call tree into receipt-shaped logs, in call order.
type Frame = { logs?: { address: string; topics: string[]; data: string }[]; calls?: Frame[] };
const logs: { address: string; topics: string[]; data: string; logIndex: number }[] = [];
(function walk(f: Frame) {
  for (const l of f.logs ?? []) {
    logs.push({ address: l.address, topics: l.topics, data: l.data, logIndex: logs.length });
  }
  for (const c of f.calls ?? []) walk(c);
})(body.result);

if (logs.length === 0) throw new Error("no logs captured — trace returned an empty tree");

mkdirSync("packages/core/test/fixtures", { recursive: true });
writeFileSync(
  "packages/core/test/fixtures/mainnet-2pay.json",
  JSON.stringify({ description: "2 memo'd USDC payments via Multicall3From, Arc mainnet state", logs }, null, 2),
);
console.log(`captured ${logs.length} logs`);
```

- [ ] **Step 2: Run it**

Run: `pnpm dlx tsx scripts/capture-fixture.ts`
Expected: prints `captured 8 logs` (2 payments × [BeforeMemo, Memo, ERC-20 Transfer, system Transfer]). Any count other than 8 means the chain's behaviour changed — stop and investigate before continuing.

- [ ] **Step 3: Sanity-check the fixture by eye**

Run: `cat packages/core/test/fixtures/mainnet-2pay.json | head -40`
Expected: the first log's `topics[0]` is the `BeforeMemo` topic; at least one log has `address` equal to `0xffff…fffe` (the system emitter we will exclude).

- [ ] **Step 4: Commit**

```bash
git add scripts/capture-fixture.ts packages/core/test/fixtures/mainnet-2pay.json
git commit -m "test(core): capture real Arc mainnet logs as a reconciler fixture"
```

---

## Task 5: Decode Memo and Transfer logs

**Files:**
- Create: `packages/core/src/logs.ts`
- Test: `packages/core/test/logs.test.ts`

**Interfaces:**
- Consumes: `constants.ts`, `types.ts`, the Task 4 fixture
- Produces:
  - `decodeMemoLogs(logs: RawLog[]): MemoEvent[]`
  - `decodeTransferLogs(logs: RawLog[]): TransferEvent[]` — system emitter excluded

- [ ] **Step 1: Write the failing test**

`packages/core/test/logs.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ledgerline/core test logs`
Expected: FAIL — cannot resolve `../src/logs.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/logs.ts`:
```ts
import { decodeAbiParameters, getAddress } from "viem";
import {
  MEMO_TOPIC,
  TRANSFER_TOPIC,
  SYSTEM_EMITTER,
} from "./constants.js";
import type { Address, Hex, MemoEvent, RawLog, TransferEvent } from "./types.js";

function topicToAddress(topic: Hex): Address {
  return getAddress(`0x${topic.slice(-40)}`);
}

/**
 * Memo(address indexed sender, address indexed target, bytes32 callDataHash,
 *      bytes32 indexed memoId, bytes memo, uint256 memoIndex)
 *
 * Indexed: sender, target, memoId. The data section holds callDataHash,
 * the memo bytes, and memoIndex.
 */
export function decodeMemoLogs(logs: RawLog[]): MemoEvent[] {
  const out: MemoEvent[] = [];
  for (const log of logs) {
    if (log.topics[0] !== MEMO_TOPIC) continue;
    if (log.topics.length < 4) continue;

    const [callDataHash, memoData, memoIndex] = decodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes" }, { type: "uint256" }],
      log.data,
    );

    out.push({
      sender: topicToAddress(log.topics[1]!),
      target: topicToAddress(log.topics[2]!),
      memoId: log.topics[3]!,
      callDataHash: callDataHash as Hex,
      memoData: memoData as Hex,
      memoIndex: memoIndex as bigint,
      logIndex: log.logIndex,
    });
  }
  return out;
}

/**
 * Token Transfer events, with the EIP-7708 system emitter excluded.
 *
 * On Arc a single ERC-20 USDC transfer emits two Transfer logs: the 6-decimal
 * one from the token contract, and an 18-decimal one from the system emitter
 * because USDC is the native gas token. EURC and cirBTC emit only the first.
 * Excluding the system emitter keeps USDC from being double counted without
 * halving the others — one rule, no per-token branching.
 */
export function decodeTransferLogs(logs: RawLog[]): TransferEvent[] {
  const out: TransferEvent[] = [];
  for (const log of logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    if (log.address.toLowerCase() === SYSTEM_EMITTER) continue;
    if (log.topics.length < 3) continue;

    const [value] = decodeAbiParameters([{ type: "uint256" }], log.data);

    out.push({
      token: getAddress(log.address),
      from: topicToAddress(log.topics[1]!),
      to: topicToAddress(log.topics[2]!),
      value: value as bigint,
      logIndex: log.logIndex,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ledgerline/core test logs`
Expected: PASS, 7 assertions.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/logs.ts packages/core/test/logs.test.ts
git commit -m "feat(core): decode Memo and Transfer logs, excluding the system emitter"
```

---

## Task 6: The cryptographic join

**Files:**
- Create: `packages/core/src/join.ts`
- Test: `packages/core/test/join.test.ts`

**Interfaces:**
- Consumes: `logs.ts`, `constants.ts`, `types.ts`
- Produces: `joinPayments(logs: RawLog[]): { payments: PaymentRecord[]; unlinkedMemoIds: Hex[] }`

This is the product's core claim. `Memo` emits `callDataHash = keccak256(forwarded calldata)`, and the forwarded calldata is exactly `transfer(to, value)`. So a candidate `Transfer` can be **proven** to belong to a memo by rebuilding and hashing. No positional matching, so log ordering is irrelevant.

- [ ] **Step 1: Write the failing test**

`packages/core/test/join.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { joinPayments } from "../src/join.js";
import type { RawLog } from "../src/types.js";
import fixture from "./fixtures/mainnet-2pay.json" with { type: "json" };

const logs = fixture.logs as unknown as RawLog[];

describe("joinPayments", () => {
  it("joins both payments by callDataHash", () => {
    const { payments, unlinkedMemoIds } = joinPayments(logs);
    expect(payments).toHaveLength(2);
    expect(unlinkedMemoIds).toEqual([]);
  });

  it("carries the invoice reference and the real amounts", () => {
    const { payments } = joinPayments(logs);
    expect(payments[0]!.memoId).toBe(
      "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7",
    );
    expect(payments[0]!.value).toBe(1_000_000n);
    expect(payments[1]!.value).toBe(2_500_000n);
  });

  it("records the payer as the EOA, not the batching contract", () => {
    const { payments } = joinPayments(logs);
    for (const p of payments) {
      expect(p.payer.toLowerCase()).toBe("0x1111111111111111111111111111111111111111");
      expect(p.identityBroken).toBe(false);
    }
  });

  it("is independent of log order", () => {
    const shuffled = [...logs].reverse();
    const a = joinPayments(logs).payments.map((p) => p.memoId).sort();
    const b = joinPayments(shuffled).payments.map((p) => p.memoId).sort();
    expect(b).toEqual(a);
  });

  it("reports a memo with no matching transfer as unlinked", () => {
    const withoutTransfers = logs.filter(
      (l) => l.topics[0] !== "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );
    const { payments, unlinkedMemoIds } = joinPayments(withoutTransfers);
    expect(payments).toEqual([]);
    expect(unlinkedMemoIds).toHaveLength(2);
  });

  it("does not join a transfer whose amount was tampered with", () => {
    const tampered = logs.map((l) =>
      l.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        ? { ...l, data: ("0x" + (999n).toString(16).padStart(64, "0")) as `0x${string}` }
        : l,
    );
    const { unlinkedMemoIds } = joinPayments(tampered as RawLog[]);
    expect(unlinkedMemoIds).toHaveLength(2);
  });
});
```

The last test is the property that matters: change one byte of the payment and the join refuses it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ledgerline/core test join`
Expected: FAIL — cannot resolve `../src/join.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/join.ts`:
```ts
import { concatHex, keccak256, pad, toHex } from "viem";
import { TRANSFER_SELECTOR } from "./constants.js";
import { decodeMemoLogs, decodeTransferLogs } from "./logs.js";
import type { Hex, PaymentRecord, RawLog, TransferEvent } from "./types.js";

/** Rebuild the exact calldata `Memo` forwarded: transfer(to, value). */
function rebuildTransferCalldata(t: TransferEvent): Hex {
  return concatHex([
    TRANSFER_SELECTOR,
    pad(t.to, { size: 32 }),
    pad(toHex(t.value), { size: 32 }),
  ]);
}

/**
 * Join each Memo to its Transfer by recomputing keccak256 of the calldata the
 * memo says it forwarded. A match is proof of association, so this never needs
 * to guess from log positions — which matters because EIP-7708 can hoist
 * system logs and nested memos unwind innermost-first.
 *
 * A memo with no matching transfer is `unlinked`: a reference exists with no
 * payment behind it. That is an anomaly, not a user error.
 */
export function joinPayments(logs: RawLog[]): {
  payments: PaymentRecord[];
  unlinkedMemoIds: Hex[];
} {
  const memos = decodeMemoLogs(logs);
  const transfers = decodeTransferLogs(logs);

  const payments: PaymentRecord[] = [];
  const unlinkedMemoIds: Hex[] = [];
  const consumed = new Set<number>();

  for (const memo of memos) {
    const match = transfers.find(
      (t) =>
        !consumed.has(t.logIndex) &&
        t.token.toLowerCase() === memo.target.toLowerCase() &&
        keccak256(rebuildTransferCalldata(t)) === memo.callDataHash,
    );

    if (!match) {
      unlinkedMemoIds.push(memo.memoId);
      continue;
    }

    consumed.add(match.logIndex);
    payments.push({
      memoId: memo.memoId,
      payer: memo.sender,
      token: memo.target,
      to: match.to,
      value: match.value,
      memoData: memo.memoData,
      memoIndex: memo.memoIndex,
      identityBroken: memo.sender.toLowerCase() !== match.from.toLowerCase(),
    });
  }

  return { payments, unlinkedMemoIds };
}
```

`consumed` prevents two identical payments (same recipient, same amount, same token) in one run from both matching the first transfer.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ledgerline/core test join`
Expected: PASS, 6 assertions.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/join.ts packages/core/test/join.test.ts
git commit -m "feat(core): join payments to references by callDataHash"
```

---

## Task 7: Reconcile against the manifest

**Files:**
- Create: `packages/core/src/reconcile.ts`
- Test: `packages/core/test/reconcile.test.ts`

**Interfaces:**
- Consumes: `join.ts`, `memo.ts`, `types.ts`
- Produces: `reconcile(logs: RawLog[], manifest?: Manifest): ReconcileResult`

- [ ] **Step 1: Write the failing test**

`packages/core/test/reconcile.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { reconcile } from "../src/reconcile.js";
import { USDC_ADDRESS } from "../src/constants.js";
import type { Manifest, RawLog } from "../src/types.js";
import fixture from "./fixtures/mainnet-2pay.json" with { type: "json" };

const logs = fixture.logs as unknown as RawLog[];

/**
 * The fixture's memoIds are keccak256(utf8(invoiceId)) — i.e. an empty salt
 * path — so the manifest here uses a salt of all zeros and invoice ids chosen
 * to reproduce those same memoIds is NOT possible. Instead we assert on the
 * salt-free behaviours, and cover salted matching with a synthetic manifest.
 */
const R1 = "0x2222222222222222222222222222222222222222" as const;
const R2 = "0x3333333333333333333333333333333333333333" as const;

function manifestWith(items: Manifest["items"]): Manifest {
  return {
    // Parenthesised: `a + b as T` parses as `a + (b as T)`, which is not what we want.
    clientRunId: ("0x" + "11".repeat(32)) as `0x${string}`,
    payer: "0x1111111111111111111111111111111111111111",
    chainId: 5042,
    runSalt: ("0x" + "00".repeat(32)) as `0x${string}`,
    items,
  };
}

describe("reconcile without a manifest", () => {
  it("lists every payment as unexpected, because intent is unknown", () => {
    const res = reconcile(logs);
    expect(res.payments).toHaveLength(2);
    expect(res.rows.every((r) => r.status === "unexpected")).toBe(true);
  });
});

describe("reconcile with a manifest", () => {
  it("marks a payment matched when memoId, recipient and amount all agree", () => {
    const m = manifestWith([
      { invoiceId: "INV-001", token: USDC_ADDRESS, to: R1, amount: 1_000_000n },
    ]);
    // Override memoId derivation by matching on the fixture's actual ids.
    const res = reconcile(logs, m, {
      memoIdFor: () => "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7",
    });
    const row = res.rows.find((r) => r.invoiceId === "INV-001");
    expect(row!.status).toBe("matched");
    expect(row!.actual).toBe(1_000_000n);
  });

  it("flags amount_mismatch and reports both numbers", () => {
    const m = manifestWith([
      { invoiceId: "INV-001", token: USDC_ADDRESS, to: R1, amount: 999_999n },
    ]);
    const res = reconcile(logs, m, {
      memoIdFor: () => "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7",
    });
    const row = res.rows.find((r) => r.invoiceId === "INV-001");
    expect(row!.status).toBe("amount_mismatch");
    expect(row!.expected).toBe(999_999n);
    expect(row!.actual).toBe(1_000_000n);
  });

  it("flags recipient_mismatch and reports both addresses", () => {
    const m = manifestWith([
      { invoiceId: "INV-001", token: USDC_ADDRESS, to: R2, amount: 1_000_000n },
    ]);
    const res = reconcile(logs, m, {
      memoIdFor: () => "0xd8cfa05a5abbf6550eea65d446fb2b01f81c661d406f3653a8c4f8c6d8c79bc7",
    });
    const row = res.rows.find((r) => r.invoiceId === "INV-001");
    expect(row!.status).toBe("recipient_mismatch");
    expect(row!.expectedTo!.toLowerCase()).toBe(R2);
    expect(row!.to!.toLowerCase()).toBe(R1);
  });

  it("marks an intended payment with no matching payment as unpaid", () => {
    const m = manifestWith([
      { invoiceId: "GHOST", token: USDC_ADDRESS, to: R1, amount: 5n },
    ]);
    const res = reconcile(logs, m);
    expect(res.rows.find((r) => r.invoiceId === "GHOST")!.status).toBe("unpaid");
  });

  it("marks an on-chain payment absent from the manifest as unexpected", () => {
    const res = reconcile(logs, manifestWith([]));
    expect(res.rows.filter((r) => r.status === "unexpected")).toHaveLength(2);
  });

  it("marks a memo with no payment behind it as unlinked", () => {
    const withoutTransfers = logs.filter(
      (l) => l.topics[0] !== "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );
    const res = reconcile(withoutTransfers, manifestWith([]));
    expect(res.rows.filter((r) => r.status === "unlinked")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ledgerline/core test reconcile`
Expected: FAIL — cannot resolve `../src/reconcile.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/reconcile.ts`:
```ts
import { joinPayments } from "./join.js";
import { memoIdFor as defaultMemoIdFor } from "./memo.js";
import type {
  Hex,
  Manifest,
  PaymentRecord,
  ReconcileResult,
  ReconcileRow,
  RawLog,
} from "./types.js";

export interface ReconcileOptions {
  /** Injectable for tests and for fixtures that predate salted ids. */
  memoIdFor?: (runSalt: Hex, invoiceId: string) => Hex;
}

/**
 * Pure. No database, no network. Given the logs of one transaction and
 * optionally the manifest of intent, produce the reconciliation table.
 *
 * Without a manifest every payment is `unexpected`, because intent is unknown —
 * the caller still learns what was paid, to whom, and under which reference.
 */
export function reconcile(
  logs: RawLog[],
  manifest?: Manifest,
  options: ReconcileOptions = {},
): ReconcileResult {
  const memoIdFor = options.memoIdFor ?? defaultMemoIdFor;
  const { payments, unlinkedMemoIds } = joinPayments(logs);

  const rows: ReconcileRow[] = [];

  const unlinkedRows: ReconcileRow[] = unlinkedMemoIds.map((memoId) => ({
    status: "unlinked",
    memoId,
    token: "0x0000000000000000000000000000000000000000",
    note: "A reference exists with no payment behind it.",
  }));

  if (!manifest) {
    for (const p of payments) rows.push(unexpectedRow(p));
    return { rows: [...unlinkedRows, ...rows], payments };
  }

  const byMemoId = new Map<string, PaymentRecord>();
  for (const p of payments) byMemoId.set(p.memoId.toLowerCase(), p);

  for (const item of manifest.items) {
    const memoId = memoIdFor(manifest.runSalt, item.invoiceId);
    const payment = byMemoId.get(memoId.toLowerCase());

    if (!payment) {
      rows.push({
        status: "unpaid",
        memoId,
        token: item.token,
        invoiceId: item.invoiceId,
        expectedTo: item.to,
        expected: item.amount,
        note: "Intended, but no payment for this reference is present.",
      });
      continue;
    }

    byMemoId.delete(memoId.toLowerCase());

    const base = {
      memoId,
      token: payment.token,
      invoiceId: item.invoiceId,
      payer: payment.payer,
      to: payment.to,
      expectedTo: item.to,
      expected: item.amount,
      actual: payment.value,
    };

    if (payment.to.toLowerCase() !== item.to.toLowerCase()) {
      rows.push({ ...base, status: "recipient_mismatch" });
    } else if (payment.value !== item.amount) {
      rows.push({ ...base, status: "amount_mismatch" });
    } else {
      rows.push({ ...base, status: "matched" });
    }
  }

  for (const leftover of byMemoId.values()) rows.push(unexpectedRow(leftover));

  return { rows: [...unlinkedRows, ...rows], payments };
}

function unexpectedRow(p: PaymentRecord): ReconcileRow {
  return {
    status: "unexpected",
    memoId: p.memoId,
    token: p.token,
    payer: p.payer,
    to: p.to,
    actual: p.value,
    note: "On chain, but not present in the manifest.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ledgerline/core test reconcile`
Expected: PASS, 7 assertions.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/reconcile.ts packages/core/test/reconcile.test.ts
git commit -m "feat(core): reconcile payments against manifest with six statuses"
```

---

## Task 8: OZ-compatible Merkle tree

**Files:**
- Create: `packages/core/src/merkle.ts`
- Test: `packages/core/test/merkle.test.ts`

**Interfaces:**
- Consumes: `types.ts`
- Produces:
  - `leafFor(memoId: Hex, token: Address, to: Address, amount: bigint): Hex`
  - `buildTree(leaves: Hex[]): { root: Hex; proofFor(index: number): Hex[] }`

Uses OpenZeppelin's commutative sorted-pair hashing so proofs generated here
verify inside `MerkleProof.verify` without modification. Leaves are single-hashed:
the leaf preimage is 128 bytes (bytes32 + address + address + uint256 ABI-encoded)
while an internal node preimage is always 64 bytes, so the two can never be
confused and second-preimage protection is already structural.

- [ ] **Step 1: Write the failing test**

`packages/core/test/merkle.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { keccak256, encodeAbiParameters, concatHex } from "viem";
import { leafFor, buildTree } from "../src/merkle.js";
import { USDC_ADDRESS } from "../src/constants.js";

const A = "0x2222222222222222222222222222222222222222" as const;
const B = "0x3333333333333333333333333333333333333333" as const;
const ID1 = ("0x" + "aa".repeat(32)) as `0x${string}`;
const ID2 = ("0x" + "bb".repeat(32)) as `0x${string}`;
const ID3 = ("0x" + "cc".repeat(32)) as `0x${string}`;

describe("leafFor", () => {
  it("is keccak256(abi.encode(memoId, token, to, amount))", () => {
    expect(leafFor(ID1, USDC_ADDRESS, A, 1_000_000n)).toBe(
      keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
          [ID1, USDC_ADDRESS, A, 1_000_000n],
        ),
      ),
    );
  });

  it("changes when any field changes", () => {
    const base = leafFor(ID1, USDC_ADDRESS, A, 1_000_000n);
    expect(leafFor(ID2, USDC_ADDRESS, A, 1_000_000n)).not.toBe(base);
    expect(leafFor(ID1, USDC_ADDRESS, B, 1_000_000n)).not.toBe(base);
    expect(leafFor(ID1, USDC_ADDRESS, A, 1_000_001n)).not.toBe(base);
  });
});

describe("buildTree", () => {
  it("returns the single leaf as the root for a one-item tree", () => {
    const leaf = leafFor(ID1, USDC_ADDRESS, A, 1n);
    const { root, proofFor } = buildTree([leaf]);
    expect(root).toBe(leaf);
    expect(proofFor(0)).toEqual([]);
  });

  it("hashes pairs in sorted order, matching OpenZeppelin", () => {
    const l1 = leafFor(ID1, USDC_ADDRESS, A, 1n);
    const l2 = leafFor(ID2, USDC_ADDRESS, B, 2n);
    const [lo, hi] = l1.toLowerCase() <= l2.toLowerCase() ? [l1, l2] : [l2, l1];
    expect(buildTree([l1, l2]).root).toBe(keccak256(concatHex([lo, hi])));
  });

  it("produces a proof that reproduces the root for every leaf", () => {
    const leaves = [
      leafFor(ID1, USDC_ADDRESS, A, 1n),
      leafFor(ID2, USDC_ADDRESS, B, 2n),
      leafFor(ID3, USDC_ADDRESS, A, 3n),
    ];
    const { root, proofFor } = buildTree(leaves);

    for (let i = 0; i < leaves.length; i++) {
      let computed = leaves[i]!;
      for (const sibling of proofFor(i)) {
        const [lo, hi] =
          computed.toLowerCase() <= sibling.toLowerCase()
            ? [computed, sibling]
            : [sibling, computed];
        computed = keccak256(concatHex([lo, hi]));
      }
      expect(computed).toBe(root);
    }
  });

  it("rejects an empty leaf set", () => {
    expect(() => buildTree([])).toThrow(/at least one/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ledgerline/core test merkle`
Expected: FAIL — cannot resolve `../src/merkle.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/merkle.ts`:
```ts
import { concatHex, encodeAbiParameters, keccak256 } from "viem";
import type { Address, Hex } from "./types.js";

export function leafFor(memoId: Hex, token: Address, to: Address, amount: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
      [memoId, token, to, amount],
    ),
  );
}

/** OpenZeppelin MerkleProof._hashPair — commutative, sorted. */
function hashPair(a: Hex, b: Hex): Hex {
  return a.toLowerCase() <= b.toLowerCase()
    ? keccak256(concatHex([a, b]))
    : keccak256(concatHex([b, a]));
}

/**
 * A leaf's Merkle proof lets a recipient prove their own line is in the
 * committed manifest without seeing anyone else's amount — which is what makes
 * this usable for payroll at all.
 */
export function buildTree(leaves: Hex[]): { root: Hex; proofFor(index: number): Hex[] } {
  if (leaves.length === 0) throw new Error("buildTree needs at least one leaf");

  const levels: Hex[][] = [leaves];
  while (levels[levels.length - 1]!.length > 1) {
    const current = levels[levels.length - 1]!;
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = current[i + 1];
      next.push(right === undefined ? left : hashPair(left, right));
    }
    levels.push(next);
  }

  const root = levels[levels.length - 1]![0]!;

  function proofFor(index: number): Hex[] {
    if (index < 0 || index >= leaves.length) throw new Error(`no leaf at index ${index}`);
    const proof: Hex[] = [];
    let idx = index;
    for (let level = 0; level < levels.length - 1; level++) {
      const nodes = levels[level]!;
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      const sibling = nodes[siblingIdx];
      if (sibling !== undefined) proof.push(sibling);
      idx = Math.floor(idx / 2);
    }
    return proof;
  }

  return { root, proofFor };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ledgerline/core test merkle`
Expected: PASS, 5 assertions.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/merkle.ts packages/core/test/merkle.test.ts
git commit -m "feat(core): add OZ-compatible Merkle tree for manifest commitments"
```

---

## Task 9: PayoutAnchor contract

**Files:**
- Create: `contracts/src/PayoutAnchor.sol`
- Test: `contracts/test/PayoutAnchor.t.sol`

**Interfaces:**
- Consumes: OpenZeppelin `MerkleProof`
- Produces, for Tasks 10–12:
  - `commit(bytes32 clientRunId, bytes32 root, uint32 itemCount)`
  - `runs(bytes32 runId) → (address payer, bytes32 root, uint32 itemCount, uint64 timestamp)`
  - `verifyItem(bytes32 runId, bytes32 leaf, bytes32[] proof) → bool`
  - `runIdFor(address payer, bytes32 clientRunId) → bytes32`
  - `event RunCommitted(bytes32 indexed runId, address indexed payer, bytes32 root, uint32 itemCount)`

- [ ] **Step 1: Write the failing test**

`contracts/test/PayoutAnchor.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayoutAnchor} from "../src/PayoutAnchor.sol";

contract PayoutAnchorTest is Test {
    PayoutAnchor anchor;

    address payerA = address(0xA11CE);
    address payerB = address(0xB0B);
    bytes32 constant CLIENT_RUN = keccak256("RUN-2026-09");
    bytes32 constant ROOT = keccak256("root");

    function setUp() public {
        anchor = new PayoutAnchor();
    }

    function test_commitStoresRunUnderDerivedId() public {
        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, ROOT, 3);

        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);
        (address payer, bytes32 root, uint32 itemCount,) = anchor.runs(runId);

        assertEq(payer, payerA);
        assertEq(root, ROOT);
        assertEq(itemCount, 3);
    }

    function test_twoPayersCannotCollideOnTheSameClientRunId() public {
        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, ROOT, 1);
        vm.prank(payerB);
        anchor.commit(CLIENT_RUN, ROOT, 1); // must not revert

        assertTrue(anchor.runIdFor(payerA, CLIENT_RUN) != anchor.runIdFor(payerB, CLIENT_RUN));
    }

    function test_replayIsRejected() public {
        vm.startPrank(payerA);
        anchor.commit(CLIENT_RUN, ROOT, 1);
        vm.expectRevert(PayoutAnchor.RunExists.selector);
        anchor.commit(CLIENT_RUN, ROOT, 1);
        vm.stopPrank();
    }

    function test_rejectsEmptyRun() public {
        vm.startPrank(payerA);
        vm.expectRevert(PayoutAnchor.EmptyRun.selector);
        anchor.commit(CLIENT_RUN, bytes32(0), 1);
        vm.expectRevert(PayoutAnchor.EmptyRun.selector);
        anchor.commit(CLIENT_RUN, ROOT, 0);
        vm.stopPrank();
    }

    function test_verifyItemAcceptsAValidProof() public {
        bytes32 l1 = keccak256("leaf-1");
        bytes32 l2 = keccak256("leaf-2");
        bytes32 root = l1 <= l2 ? keccak256(abi.encodePacked(l1, l2)) : keccak256(abi.encodePacked(l2, l1));

        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, root, 2);
        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = l2;
        assertTrue(anchor.verifyItem(runId, l1, proof));
    }

    function test_verifyItemRejectsAForgedLeaf() public {
        bytes32 l1 = keccak256("leaf-1");
        bytes32 l2 = keccak256("leaf-2");
        bytes32 root = l1 <= l2 ? keccak256(abi.encodePacked(l1, l2)) : keccak256(abi.encodePacked(l2, l1));

        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, root, 2);
        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = l2;
        assertFalse(anchor.verifyItem(runId, keccak256("forged"), proof));
    }

    function test_verifyItemReturnsFalseForAnUncommittedRun() public {
        bytes32[] memory proof = new bytes32[](0);
        assertFalse(anchor.verifyItem(keccak256("nope"), keccak256("leaf"), proof));
    }

    function test_emitsRunCommitted() public {
        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);
        vm.expectEmit(true, true, false, true);
        emit PayoutAnchor.RunCommitted(runId, payerA, ROOT, 3);
        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, ROOT, 3);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd contracts && forge test`
Expected: FAIL — `PayoutAnchor.sol` not found.

- [ ] **Step 3: Write the contract**

`contracts/src/PayoutAnchor.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title PayoutAnchor
 * @notice Commits the Merkle root of an intended payout run so recipients can
 *         prove their own line was part of it, and so payments present on chain
 *         but absent from the manifest are detectable.
 *
 * @dev Holds no funds, has no owner, is not upgradeable, and cannot block a
 *      payment. It is an evidence layer only.
 *
 *      Called as a sibling subcall inside Multicall3From.aggregate3, where
 *      Arc's CallFrom precompile preserves the payer EOA as msg.sender — which
 *      is why deriving runId from msg.sender is safe. This contract must never
 *      be the caller in the payment path: CallFrom rejects sender spoofing, so
 *      a contract calling Memo reverts.
 */
contract PayoutAnchor {
    struct Run {
        address payer;
        bytes32 root;
        uint32 itemCount;
        uint64 timestamp;
    }

    mapping(bytes32 => Run) public runs;

    event RunCommitted(
        bytes32 indexed runId, address indexed payer, bytes32 root, uint32 itemCount
    );

    error RunExists();
    error EmptyRun();

    /// @dev Derived from msg.sender so two payers can never collide and nobody
    ///      can front-run and squat another payer's run id.
    function runIdFor(address payer, bytes32 clientRunId) public pure returns (bytes32) {
        return keccak256(abi.encode(payer, clientRunId));
    }

    function commit(bytes32 clientRunId, bytes32 root, uint32 itemCount) external {
        if (root == bytes32(0) || itemCount == 0) revert EmptyRun();

        bytes32 runId = runIdFor(msg.sender, clientRunId);
        if (runs[runId].payer != address(0)) revert RunExists();

        runs[runId] = Run({
            payer: msg.sender,
            root: root,
            itemCount: itemCount,
            timestamp: uint64(block.timestamp)
        });

        emit RunCommitted(runId, msg.sender, root, itemCount);
    }

    function verifyItem(bytes32 runId, bytes32 leaf, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        bytes32 root = runs[runId].root;
        if (root == bytes32(0)) return false;
        return MerkleProof.verify(proof, root, leaf);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd contracts && forge test -vv`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/PayoutAnchor.sol contracts/test/PayoutAnchor.t.sol
git commit -m "feat(contracts): add PayoutAnchor for manifest commitments"
```

---

## Task 10: Cross-check TypeScript proofs against the contract

**Files:**
- Create: `contracts/test/MerkleCrossCheck.t.sol`
- Create: `packages/core/test/merkle-vectors.test.ts`
- Create: `packages/core/test/fixtures/merkle-vectors.json` (generated)

**Interfaces:**
- Consumes: `merkle.ts` (Task 8), `PayoutAnchor.verifyItem` (Task 9)
- Produces: proof that a proof generated in TypeScript verifies inside Solidity

Without this, the two Merkle implementations can silently disagree and the
failure surfaces only on mainnet, with real money and no easy diagnosis.

- [ ] **Step 1: Generate vectors from the TypeScript implementation**

`packages/core/test/merkle-vectors.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { leafFor, buildTree } from "../src/merkle.js";
import { USDC_ADDRESS, EURC_ADDRESS, CIRBTC_ADDRESS } from "../src/constants.js";

describe("merkle vectors", () => {
  it("writes vectors for the Solidity cross-check", () => {
    const items = [
      { memoId: ("0x" + "a1".repeat(32)) as `0x${string}`, token: USDC_ADDRESS,
        to: "0x2222222222222222222222222222222222222222" as const, amount: 1_500_000n },
      { memoId: ("0x" + "b2".repeat(32)) as `0x${string}`, token: EURC_ADDRESS,
        to: "0x3333333333333333333333333333333333333333" as const, amount: 900_000n },
      { memoId: ("0x" + "c3".repeat(32)) as `0x${string}`, token: CIRBTC_ADDRESS,
        to: "0x4444444444444444444444444444444444444444" as const, amount: 1_000n },
    ];

    const leaves = items.map((i) => leafFor(i.memoId, i.token, i.to, i.amount));
    const { root, proofFor } = buildTree(leaves);

    mkdirSync("test/fixtures", { recursive: true });
    writeFileSync(
      "test/fixtures/merkle-vectors.json",
      JSON.stringify(
        { root, leaves, proofs: leaves.map((_, i) => proofFor(i)) },
        null,
        2,
      ),
    );

    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(leaves).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it to produce the vectors**

Run: `pnpm --filter @ledgerline/core test merkle-vectors`
Expected: PASS, and `packages/core/test/fixtures/merkle-vectors.json` exists.

- [ ] **Step 3: Write the Solidity cross-check**

`contracts/test/MerkleCrossCheck.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayoutAnchor} from "../src/PayoutAnchor.sol";

/// @dev Reads vectors produced by the TypeScript Merkle implementation and
///      verifies them on chain. If these two ever disagree, real payouts would
///      anchor roots whose proofs nobody can verify.
contract MerkleCrossCheckTest is Test {
    PayoutAnchor anchor;
    address payer = address(0xA11CE);

    function setUp() public {
        anchor = new PayoutAnchor();
    }

    function test_typescriptProofsVerifyOnChain() public {
        string memory json = vm.readFile("../packages/core/test/fixtures/merkle-vectors.json");

        bytes32 root = vm.parseJsonBytes32(json, ".root");
        bytes32[] memory leaves = vm.parseJsonBytes32Array(json, ".leaves");

        vm.prank(payer);
        anchor.commit(keccak256("RUN"), root, uint32(leaves.length));
        bytes32 runId = anchor.runIdFor(payer, keccak256("RUN"));

        for (uint256 i = 0; i < leaves.length; i++) {
            bytes32[] memory proof = vm.parseJsonBytes32Array(
                json, string.concat(".proofs[", vm.toString(i), "]")
            );
            assertTrue(anchor.verifyItem(runId, leaves[i], proof), "proof failed");
        }
    }

    function test_forgedLeafIsRejected() public {
        string memory json = vm.readFile("../packages/core/test/fixtures/merkle-vectors.json");
        bytes32 root = vm.parseJsonBytes32(json, ".root");

        vm.prank(payer);
        anchor.commit(keccak256("RUN"), root, 3);
        bytes32 runId = anchor.runIdFor(payer, keccak256("RUN"));

        bytes32[] memory proof = vm.parseJsonBytes32Array(json, ".proofs[0]");
        assertFalse(anchor.verifyItem(runId, keccak256("not-in-tree"), proof));
    }
}
```

- [ ] **Step 4: Allow Foundry to read the fixture**

Append to `contracts/foundry.toml` under `[profile.default]`:
```toml
fs_permissions = [{ access = "read", path = "../packages/core/test/fixtures" }]
```

- [ ] **Step 5: Run the cross-check**

Run: `cd contracts && forge test --match-contract MerkleCrossCheck -vv`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add contracts/test/MerkleCrossCheck.t.sol contracts/foundry.toml \
        packages/core/test/merkle-vectors.test.ts packages/core/test/fixtures/merkle-vectors.json
git commit -m "test: cross-check TypeScript Merkle proofs against PayoutAnchor"
```

---

## Task 11: Build the payout calldata

**Files:**
- Create: `packages/core/src/build.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/build.test.ts`

**Interfaces:**
- Consumes: `constants.ts`, `memo.ts`, `merkle.ts`, `types.ts`
- Produces:
  - `clientRunIdFor(payer: Address, items: ManifestItem[]): Hex`
  - `buildRun(manifest: Manifest, anchor: Address, opts?: { allowFailure?: boolean }): BuiltRun`
  - `BuiltRun = { to: Address; data: Hex; root: Hex; leaves: Hex[]; proofs: Hex[][]; memoIds: Hex[]; itemCount: number }`

- [ ] **Step 1: Write the failing test**

`packages/core/test/build.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { decodeFunctionData, keccak256 } from "viem";
import { buildRun, clientRunIdFor } from "../src/build.js";
import { joinPayments } from "../src/join.js";
import {
  MULTICALL3FROM_ADDRESS, MEMO_ADDRESS, USDC_ADDRESS, EURC_ADDRESS, CIRBTC_ADDRESS,
} from "../src/constants.js";
import { memoIdFor } from "../src/memo.js";
import type { Manifest } from "../src/types.js";

const ANCHOR = "0x9999999999999999999999999999999999999999" as const;
const SALT = ("0x" + "07".repeat(32)) as `0x${string}`;

const manifest: Manifest = {
  clientRunId: ("0x" + "11".repeat(32)) as `0x${string}`,
  payer: "0x1111111111111111111111111111111111111111",
  chainId: 5042,
  runSalt: SALT,
  items: [
    { invoiceId: "INV-US-001", token: USDC_ADDRESS, to: "0x2222222222222222222222222222222222222222", amount: 1_500_000n },
    { invoiceId: "INV-EU-002", token: EURC_ADDRESS, to: "0x3333333333333333333333333333333333333333", amount: 900_000n },
    { invoiceId: "INV-BTC-003", token: CIRBTC_ADDRESS, to: "0x4444444444444444444444444444444444444444", amount: 1_000n },
  ],
};

describe("buildRun", () => {
  it("targets Multicall3From", () => {
    expect(buildRun(manifest, ANCHOR).to).toBe(MULTICALL3FROM_ADDRESS);
  });

  it("puts the anchor commit first, then one memo per item", () => {
    const built = buildRun(manifest, ANCHOR);
    const { args } = decodeFunctionData({
      abi: [{
        type: "function", name: "aggregate3", stateMutability: "nonpayable",
        inputs: [{ name: "calls", type: "tuple[]", components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" }]}],
        outputs: [],
      }] as const,
      data: built.data,
    });
    const calls = args![0] as readonly { target: string; allowFailure: boolean }[];
    expect(calls).toHaveLength(4);
    expect(calls[0]!.target.toLowerCase()).toBe(ANCHOR.toLowerCase());
    for (let i = 1; i < 4; i++) {
      expect(calls[i]!.target.toLowerCase()).toBe(MEMO_ADDRESS.toLowerCase());
    }
  });

  it("defaults allowFailure to false — a partial payroll is worse than none", () => {
    const built = buildRun(manifest, ANCHOR);
    const { args } = decodeFunctionData({
      abi: [{
        type: "function", name: "aggregate3", stateMutability: "nonpayable",
        inputs: [{ name: "calls", type: "tuple[]", components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" }]}],
        outputs: [],
      }] as const,
      data: built.data,
    });
    const calls = args![0] as readonly { allowFailure: boolean }[];
    expect(calls.every((c) => c.allowFailure === false)).toBe(true);
  });

  it("derives memoIds from the run salt", () => {
    const built = buildRun(manifest, ANCHOR);
    expect(built.memoIds[0]).toBe(memoIdFor(SALT, "INV-US-001"));
    expect(built.memoIds).toHaveLength(3);
  });

  it("produces one proof per item, all verifying against the root", () => {
    const built = buildRun(manifest, ANCHOR);
    expect(built.proofs).toHaveLength(3);
    expect(built.itemCount).toBe(3);
    expect(built.root).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects a duplicate invoiceId, which would make reconciliation ambiguous", () => {
    const dup: Manifest = { ...manifest, items: [manifest.items[0]!, manifest.items[0]!] };
    expect(() => buildRun(dup, ANCHOR)).toThrow(/duplicate invoiceId/i);
  });

  it("rejects the zero address, which Arc reverts on", () => {
    const bad: Manifest = {
      ...manifest,
      items: [{ ...manifest.items[0]!, to: "0x0000000000000000000000000000000000000000" }],
    };
    expect(() => buildRun(bad, ANCHOR)).toThrow(/zero address/i);
  });

  it("rejects a zero amount", () => {
    const bad: Manifest = { ...manifest, items: [{ ...manifest.items[0]!, amount: 0n }] };
    expect(() => buildRun(bad, ANCHOR)).toThrow(/amount/i);
  });

  it("derives a deterministic clientRunId from payer and items", () => {
    const a = clientRunIdFor(manifest.payer, manifest.items);
    const b = clientRunIdFor(manifest.payer, [...manifest.items]);
    expect(a).toBe(b);
  });

  it("changes clientRunId when any item changes, so a corrected run is a new run", () => {
    const base = clientRunIdFor(manifest.payer, manifest.items);
    const edited = [...manifest.items];
    edited[0] = { ...edited[0]!, amount: 1_500_001n };
    expect(clientRunIdFor(manifest.payer, edited)).not.toBe(base);
  });

  it("is payer-scoped, so two payers submitting the same list do not collide", () => {
    const other = "0x5555555555555555555555555555555555555555" as const;
    expect(clientRunIdFor(other, manifest.items)).not.toBe(
      clientRunIdFor(manifest.payer, manifest.items),
    );
  });

  it("ignores item order, so re-sorting a spreadsheet is not a new run", () => {
    const reversed = [...manifest.items].reverse();
    expect(clientRunIdFor(manifest.payer, reversed)).toBe(
      clientRunIdFor(manifest.payer, manifest.items),
    );
  });

  it("rejects more than 400 items, to stay under the block gas limit", () => {
    const many: Manifest = {
      ...manifest,
      items: Array.from({ length: 401 }, (_, i) => ({
        invoiceId: `INV-${i}`, token: USDC_ADDRESS,
        to: "0x2222222222222222222222222222222222222222" as const, amount: 1n,
      })),
    };
    expect(() => buildRun(many, ANCHOR)).toThrow(/400/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ledgerline/core test build`
Expected: FAIL — cannot resolve `../src/build.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/build.ts`:
```ts
import { concatHex, encodeFunctionData, keccak256, toHex } from "viem";
import { MEMO_ADDRESS, MULTICALL3FROM_ADDRESS } from "./constants.js";
import { memoIdFor } from "./memo.js";
import { buildTree, leafFor } from "./merkle.js";
import type { Address, Hex, Manifest, ManifestItem } from "./types.js";

export const MAX_ITEMS_PER_RUN = 400;

/**
 * Deterministic run id: the same payout list, submitted twice, produces the
 * same id — and PayoutAnchor rejects a repeat with RunExists. Double payment
 * is therefore blocked at the contract layer rather than in the UI, which
 * survives a closed browser tab, a double-clicked button, or a retry after a
 * timeout.
 *
 * Order-independent, because re-sorting a spreadsheet is not a different
 * payroll. Payer-scoped, so two companies paying identical lists never clash.
 */
export function clientRunIdFor(payer: Address, items: ManifestItem[]): Hex {
  const canonical = items
    .map((i) =>
      [i.invoiceId, i.token.toLowerCase(), i.to.toLowerCase(), i.amount.toString()].join("|"),
    )
    .sort()
    .join("\n");
  return keccak256(concatHex([payer.toLowerCase() as Hex, toHex(canonical)]));
}

export interface BuiltRun {
  to: Address;
  data: Hex;
  root: Hex;
  leaves: Hex[];
  proofs: Hex[][];
  memoIds: Hex[];
  itemCount: number;
}

const erc20Abi = [{
  type: "function", name: "transfer", stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

const memoAbi = [{
  type: "function", name: "memo", stateMutability: "nonpayable",
  inputs: [
    { name: "target", type: "address" }, { name: "data", type: "bytes" },
    { name: "memoId", type: "bytes32" }, { name: "memoData", type: "bytes" },
  ], outputs: [],
}] as const;

const anchorAbi = [{
  type: "function", name: "commit", stateMutability: "nonpayable",
  inputs: [
    { name: "clientRunId", type: "bytes32" }, { name: "root", type: "bytes32" },
    { name: "itemCount", type: "uint32" },
  ], outputs: [],
}] as const;

const aggregateAbi = [{
  type: "function", name: "aggregate3", stateMutability: "nonpayable",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target", type: "address" },
    { name: "allowFailure", type: "bool" },
    { name: "callData", type: "bytes" },
  ]}],
  outputs: [{ name: "returnData", type: "tuple[]", components: [
    { name: "success", type: "bool" }, { name: "returnData", type: "bytes" },
  ]}],
}] as const;

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Build one transaction that commits the manifest root and pays every item,
 * each carrying its own reference.
 *
 * allowFailure defaults to false: a partially-paid payroll is harder to
 * reconcile and harder to retry safely than one that did not happen. A failed
 * run reverts entirely, writes no anchor, and is safe to re-run with the same
 * CSV — the contract's replay guard makes double payment impossible.
 */
export function buildRun(
  manifest: Manifest,
  anchor: Address,
  opts: { allowFailure?: boolean } = {},
): BuiltRun {
  const allowFailure = opts.allowFailure ?? false;
  const { items, runSalt, clientRunId } = manifest;

  if (items.length === 0) throw new Error("manifest has no items");
  if (items.length > MAX_ITEMS_PER_RUN) {
    throw new Error(
      `run has ${items.length} items; the maximum is ${MAX_ITEMS_PER_RUN} to stay under Arc's 30M block gas limit`,
    );
  }

  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.invoiceId)) {
      throw new Error(`duplicate invoiceId "${item.invoiceId}" would make reconciliation ambiguous`);
    }
    seen.add(item.invoiceId);
    if (item.to.toLowerCase() === ZERO) {
      throw new Error(`invoice ${item.invoiceId} pays the zero address, which Arc reverts on`);
    }
    if (item.amount <= 0n) {
      throw new Error(`invoice ${item.invoiceId} has a non-positive amount`);
    }
  }

  const memoIds = items.map((i) => memoIdFor(runSalt, i.invoiceId));
  const leaves = items.map((i, idx) => leafFor(memoIds[idx]!, i.token, i.to, i.amount));
  const { root, proofFor } = buildTree(leaves);

  const calls = [
    {
      target: anchor,
      allowFailure: false, // the anchor must never be optional
      callData: encodeFunctionData({
        abi: anchorAbi, functionName: "commit",
        args: [clientRunId, root, items.length],
      }),
    },
    ...items.map((item, idx) => ({
      target: MEMO_ADDRESS,
      allowFailure,
      callData: encodeFunctionData({
        abi: memoAbi, functionName: "memo",
        args: [
          item.token,
          encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [item.to, item.amount] }),
          memoIds[idx]!,
          "0x",
        ],
      }),
    })),
  ];

  return {
    to: MULTICALL3FROM_ADDRESS,
    data: encodeFunctionData({ abi: aggregateAbi, functionName: "aggregate3", args: [calls] }),
    root,
    leaves,
    proofs: leaves.map((_, i) => proofFor(i)),
    memoIds,
    itemCount: items.length,
  };
}
```

Note `memoData` is `"0x"`: the memo bytes are public, so nothing identifying goes there. The reference lives in the salted `memoId`.

- [ ] **Step 4: Create the package entry point**

`packages/core/src/index.ts`:
```ts
export * from "./constants.js";
export * from "./types.js";
export * from "./memo.js";
export * from "./logs.js";
export * from "./join.js";
export * from "./reconcile.js";
export * from "./merkle.js";
export * from "./build.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ledgerline/core test`
Expected: PASS — all suites, including the 9 new build assertions.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/build.ts packages/core/src/index.ts packages/core/test/build.test.ts
git commit -m "feat(core): build anchored, referenced multi-token payout calldata"
```

---

## Task 12: Preflight and gas policy

**Files:**
- Create: `packages/core/src/preflight.ts`
- Test: `packages/core/test/preflight.test.ts`

**Interfaces:**
- Consumes: `build.ts`, `constants.ts`
- Produces:
  - `buildPreflightData(manifest, anchor): Hex` — same calls, `allowFailure: true`
  - `decodePreflightResult(returnData: Hex): { success: boolean; returnData: Hex }[]`
  - `gasPolicy(suggestedGasPrice: bigint, suggestedTip: bigint): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }`

Preflight simulates with `allowFailure: true` even when execution uses `false`.
That is how per-payment outcomes are obtained on any RPC, with no
`debug_traceCall` required — and it is the only way to detect Arc's runtime
blocklist, which has no pre-check function.

- [ ] **Step 1: Write the failing test**

`packages/core/test/preflight.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { encodeAbiParameters } from "viem";
import { buildPreflightData, decodePreflightResult, gasPolicy } from "../src/preflight.js";
import { decodeFunctionData } from "viem";
import { USDC_ADDRESS } from "../src/constants.js";
import type { Manifest } from "../src/types.js";

const ANCHOR = "0x9999999999999999999999999999999999999999" as const;
const manifest: Manifest = {
  clientRunId: ("0x" + "11".repeat(32)) as `0x${string}`,
  payer: "0x1111111111111111111111111111111111111111",
  chainId: 5042,
  runSalt: ("0x" + "07".repeat(32)) as `0x${string}`,
  items: [
    { invoiceId: "A", token: USDC_ADDRESS, to: "0x2222222222222222222222222222222222222222", amount: 1n },
    { invoiceId: "B", token: USDC_ADDRESS, to: "0x3333333333333333333333333333333333333333", amount: 2n },
  ],
};

const aggAbi = [{
  type: "function", name: "aggregate3", stateMutability: "nonpayable",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target", type: "address" },
    { name: "allowFailure", type: "bool" },
    { name: "callData", type: "bytes" }]}],
  outputs: [],
}] as const;

describe("buildPreflightData", () => {
  it("sets allowFailure true on the payment calls so each outcome is visible", () => {
    const { args } = decodeFunctionData({ abi: aggAbi, data: buildPreflightData(manifest, ANCHOR) });
    const calls = args![0] as readonly { allowFailure: boolean }[];
    expect(calls.slice(1).every((c) => c.allowFailure === true)).toBe(true);
  });
});

describe("decodePreflightResult", () => {
  it("decodes per-call success flags", () => {
    const encoded = encodeAbiParameters(
      [{ type: "tuple[]", components: [{ type: "bool" }, { type: "bytes" }] }],
      [[[true, "0x"], [false, "0xdeadbeef"], [true, "0x01"]]],
    );
    const results = decodePreflightResult(encoded);
    expect(results.map((r) => r.success)).toEqual([true, false, true]);
    expect(results[1]!.returnData).toBe("0xdeadbeef");
  });
});

describe("gasPolicy", () => {
  it("never falls below the 25 Gwei floor, because Arc silently drops cheaper transactions", () => {
    const { maxFeePerGas } = gasPolicy(1_000_000_000n, 0n);
    expect(maxFeePerGas).toBeGreaterThanOrEqual(25_000_000_000n);
  });

  it("scales above the floor when the network suggests more", () => {
    const { maxFeePerGas } = gasPolicy(40_000_000_000n, 0n);
    expect(maxFeePerGas).toBe(60_000_000_000n);
  });

  it("applies a 1 Gwei tip floor", () => {
    expect(gasPolicy(20_000_000_000n, 330_000_000n).maxPriorityFeePerGas).toBe(1_000_000_000n);
  });

  it("respects a higher suggested tip", () => {
    expect(gasPolicy(20_000_000_000n, 5_000_000_000n).maxPriorityFeePerGas).toBe(5_000_000_000n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ledgerline/core test preflight`
Expected: FAIL — cannot resolve `../src/preflight.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/preflight.ts`:
```ts
import { decodeAbiParameters } from "viem";
import { buildRun } from "./build.js";
import { MIN_MAX_FEE_WEI, MIN_PRIORITY_FEE_WEI } from "./constants.js";
import type { Address, Hex, Manifest } from "./types.js";

/**
 * Calldata for simulation. Identical to the real run except allowFailure is
 * true on the payment calls, so eth_call returns a per-payment success flag
 * instead of reverting on the first problem. Works on any RPC — no
 * debug_traceCall needed — and it is the only way to detect Arc's runtime
 * blocklist, which exposes no pre-check.
 */
export function buildPreflightData(manifest: Manifest, anchor: Address): Hex {
  return buildRun(manifest, anchor, { allowFailure: true }).data;
}

export function decodePreflightResult(
  returnData: Hex,
): { success: boolean; returnData: Hex }[] {
  const [results] = decodeAbiParameters(
    [{ type: "tuple[]", components: [{ type: "bool" }, { type: "bytes" }] }],
    returnData,
  );
  return (results as readonly (readonly [boolean, Hex])[]).map(([success, data]) => ({
    success,
    returnData: data,
  }));
}

/**
 * Arc pins its base fee at a 20 Gwei floor and SILENTLY DROPS transactions
 * priced below it — no receipt, no error, no revert. In a payout tool that
 * means reporting success while nothing happened, so the floor here is
 * deliberately above the protocol minimum.
 */
export function gasPolicy(
  suggestedGasPrice: bigint,
  suggestedTip: bigint,
): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
  const scaled = (suggestedGasPrice * 3n) / 2n;
  return {
    maxFeePerGas: scaled > MIN_MAX_FEE_WEI ? scaled : MIN_MAX_FEE_WEI,
    maxPriorityFeePerGas:
      suggestedTip > MIN_PRIORITY_FEE_WEI ? suggestedTip : MIN_PRIORITY_FEE_WEI,
  };
}
```

- [ ] **Step 4: Export it**

Add to `packages/core/src/index.ts`:
```ts
export * from "./preflight.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ledgerline/core test preflight`
Expected: PASS, 6 assertions.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/preflight.ts packages/core/src/index.ts packages/core/test/preflight.test.ts
git commit -m "feat(core): add preflight simulation and Arc gas policy"
```

---

## Task 13: The `arc-reconcile` CLI

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/src/index.ts`, `packages/cli/tsconfig.json`
- Test: `packages/cli/test/format.test.ts`

**Interfaces:**
- Consumes: `@ledgerline/core`
- Produces: `npx arc-reconcile <txHash> [--rpc <url>] [--manifest <path>]` printing the reconciliation table

This is submission artifact #5 and the executable proof of the spec's
source-of-truth principle: given only a transaction hash and an RPC URL, it
rebuilds the table without touching our infrastructure.

- [ ] **Step 1: Create the package**

`packages/cli/package.json`:
```json
{
  "name": "@ledgerline/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "arc-reconcile": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ledgerline/core": "workspace:*",
    "viem": "^2.56.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "typescript": "^5.7.0",
    "tsx": "^4.19.0"
  }
}
```

`packages/cli/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Write the failing test for the formatter**

`packages/cli/test/format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatAmount, formatRows } from "../src/format.js";
import type { ReconcileRow } from "@ledgerline/core";

describe("formatAmount", () => {
  it("renders 6-decimal USDC", () => {
    expect(formatAmount(1_500_000n, 6)).toBe("1.5");
  });
  it("renders 8-decimal cirBTC without losing precision", () => {
    expect(formatAmount(1_000n, 8)).toBe("0.00001");
  });
  it("renders a zero", () => {
    expect(formatAmount(0n, 6)).toBe("0");
  });
});

describe("formatRows", () => {
  it("puts the most severe rows first, because problems are why you opened this", () => {
    const rows: ReconcileRow[] = [
      { status: "matched", memoId: "0x01", token: "0x36" } as ReconcileRow,
      { status: "unlinked", memoId: "0x02", token: "0x36" } as ReconcileRow,
      { status: "unpaid", memoId: "0x03", token: "0x36" } as ReconcileRow,
    ];
    const out = formatRows(rows, new Map());
    const order = out.map((l) => l.status);
    expect(order[0]).toBe("unlinked");
    expect(order[1]).toBe("unpaid");
    expect(order[2]).toBe("matched");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ledgerline/cli test`
Expected: FAIL — cannot resolve `../src/format.js`.

- [ ] **Step 4: Write the formatter**

`packages/cli/src/format.ts`:
```ts
import type { Address, ReconcileRow, ReconcileStatus } from "@ledgerline/core";

const SEVERITY: Record<ReconcileStatus, number> = {
  unlinked: 0,
  unpaid: 1,
  recipient_mismatch: 2,
  amount_mismatch: 3,
  unexpected: 4,
  matched: 5,
};

export function formatAmount(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const v = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export interface FormattedRow {
  status: ReconcileStatus;
  line: string;
}

export function formatRows(
  rows: ReconcileRow[],
  decimalsByToken: Map<Address, number>,
): FormattedRow[] {
  return [...rows]
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status])
    .map((r) => {
      const d = decimalsByToken.get(r.token) ?? 6;
      const parts = [
        r.status.padEnd(20),
        (r.invoiceId ?? "—").padEnd(16),
        r.to ? `${r.to.slice(0, 10)}…` : "—".padEnd(11),
        r.actual !== undefined ? formatAmount(r.actual, d) : "—",
      ];
      if (r.status === "amount_mismatch" && r.expected !== undefined) {
        parts.push(`(expected ${formatAmount(r.expected, d)})`);
      }
      return { status: r.status, line: parts.join("  ") };
    });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ledgerline/cli test`
Expected: PASS, 4 assertions.

- [ ] **Step 6: Write the CLI entry point**

`packages/cli/src/index.ts`:
```ts
#!/usr/bin/env -S npx tsx
import { createPublicClient, http, type Address } from "viem";
import { arc } from "viem/chains";
import { readFileSync } from "node:fs";
import { reconcile, type Manifest, type RawLog } from "@ledgerline/core";
import { formatRows } from "./format.js";

const args = process.argv.slice(2);
const txHash = args[0];
if (!txHash?.startsWith("0x")) {
  console.error("usage: arc-reconcile <txHash> [--rpc <url>] [--manifest <path>]");
  process.exit(1);
}

const rpcUrl = valueOf("--rpc") ?? "https://rpc.mainnet.arc.io";
const manifestPath = valueOf("--manifest");

function valueOf(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const client = createPublicClient({ chain: arc, transport: http(rpcUrl) });

const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

if (receipt.status === "reverted") {
  console.log(`\n  This payout run did not execute — the transaction reverted.`);
  console.log(`  No money moved and nothing was paid.\n`);
  process.exit(0);
}

const logs: RawLog[] = receipt.logs.map((l, i) => ({
  address: l.address,
  topics: l.topics as `0x${string}`[],
  data: l.data,
  logIndex: l.logIndex ?? i,
}));

let manifest: Manifest | undefined;
if (manifestPath) {
  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest = {
    ...raw,
    items: raw.items.map((i: { amount: string }) => ({ ...i, amount: BigInt(i.amount) })),
  };
}

const result = reconcile(logs, manifest);

// Decimals come from chain, never hardcoded.
const tokens = [...new Set(result.payments.map((p) => p.token))];
const decimalsByToken = new Map<Address, number>();
for (const token of tokens) {
  const decimals = await client.readContract({
    address: token,
    abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }] as const,
    functionName: "decimals",
  });
  decimalsByToken.set(token, Number(decimals));
}

console.log(`\n  Ledgerline reconciliation — ${txHash}`);
console.log(`  RPC: ${rpcUrl}   block ${receipt.blockNumber}\n`);
console.log(`  ${"status".padEnd(20)}  ${"invoice".padEnd(16)}  recipient     amount`);
console.log(`  ${"─".repeat(72)}`);
for (const row of formatRows(result.rows, decimalsByToken)) {
  console.log(`  ${row.line}`);
}
console.log(`\n  ${result.payments.length} referenced payment(s) found.\n`);
```

- [ ] **Step 7: Run it against the design-phase fixture data**

Run: `pnpm --filter @ledgerline/cli exec tsx src/index.ts 0x0000000000000000000000000000000000000000000000000000000000000000`
Expected: fails with a "transaction not found" error from viem — which confirms the CLI wires up, reaches the RPC, and reports honestly rather than printing an empty success. A real hash is used in Task 16.

- [ ] **Step 8: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): add arc-reconcile, rebuilding the table from a tx hash alone"
```

---

## Task 14: Testnet validation of the unverified rules

**Files:**
- Create: `contracts/script/DeployAnchor.s.sol`
- Create: `scripts/testnet-run.ts`
- Create: `docs/notes/2026-XX-testnet-findings.md` (dated on the day it is run)

**Interfaces:**
- Consumes: everything above
- Produces: confirmed answers to the spec's two `[unverified]` claims, and the
  first real end-to-end run

The spec flags two things simulation cannot test, because `eth_call` and
`debug_traceCall` force `msg.sender == tx.origin`:
1. `Memo` must reject smart-contract callers
2. The true priority-fee floor on Arc

Both are settled here, on testnet, with faucet funds.

- [ ] **Step 1: Write the deploy script**

`contracts/script/DeployAnchor.s.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {PayoutAnchor} from "../src/PayoutAnchor.sol";

contract DeployAnchor is Script {
    function run() external returns (PayoutAnchor anchor) {
        vm.startBroadcast();
        anchor = new PayoutAnchor();
        vm.stopBroadcast();
    }
}
```

- [ ] **Step 2: Fund a testnet wallet**

Run: `cast wallet new` and save the key to `.env` as `PRIVATE_KEY` (already gitignored).
Then visit https://faucet.circle.com, select Arc Testnet, and fund the address.

Verify: `cast balance $ADDRESS --rpc-url https://rpc.testnet.arc.io`
Expected: non-zero.

- [ ] **Step 3: Deploy to testnet**

Run:
```bash
cd contracts && forge script script/DeployAnchor.s.sol:DeployAnchor \
  --rpc-url arc_testnet --private-key $PRIVATE_KEY --broadcast
```
Expected: prints a deployed address. Save it as `ANCHOR_TESTNET` in `.env`.

- [ ] **Step 4: Execute a real two-payment run on testnet**

`scripts/testnet-run.ts`:
```ts
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { buildRun, gasPolicy, USDC_ADDRESS, type Manifest } from "@ledgerline/core";
import { keccak256, toHex } from "viem";

const RPC = process.env.ARC_TESTNET_RPC ?? "https://rpc.testnet.arc.io";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const anchor = process.env.ANCHOR_TESTNET as `0x${string}`;

const manifest: Manifest = {
  clientRunId: keccak256(toHex(`testnet-${Date.now()}`)),
  payer: account.address,
  chainId: arcTestnet.id,
  runSalt: keccak256(toHex("salt-testnet-1")),
  items: [
    { invoiceId: "T-001", token: USDC_ADDRESS, to: "0x2222222222222222222222222222222222222222", amount: 1_000n },
    { invoiceId: "T-002", token: USDC_ADDRESS, to: "0x3333333333333333333333333333333333333333", amount: 2_000n },
  ],
};

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(RPC) });

const built = buildRun(manifest, anchor);

const suggested = await publicClient.getGasPrice();
const tip = await publicClient.estimateMaxPriorityFeePerGas();
const fees = gasPolicy(suggested, tip);
console.log("gas policy:", fees, "| suggested:", suggested, "tip:", tip);

const hash = await walletClient.sendTransaction({
  to: built.to, data: built.data, ...fees, gas: 2_000_000n,
});
console.log("sent:", hash);

const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
console.log("status:", receipt.status, "logs:", receipt.logs.length);
```

Run: `pnpm dlx tsx scripts/testnet-run.ts`
Expected: `status: success`, and a log count consistent with 2 payments plus the anchor.

- [ ] **Step 5: Reconcile the real transaction**

Run: `pnpm --filter @ledgerline/cli exec tsx src/index.ts <hash> --rpc https://rpc.testnet.arc.io`
Expected: two `unexpected` rows (no manifest passed), both with the right amounts.

- [ ] **Step 6: Settle unverified claim #1 — smart-contract callers**

Deploy a trivial forwarder and confirm `Memo` rejects it:

```bash
cd contracts && cat > test/MemoCallerProbe.sol <<'SOL'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MemoCallerProbe {
    function tryMemo(address memo, bytes calldata data) external returns (bool ok) {
        (ok,) = memo.call(data);
    }
}
SOL
```

Deploy it to testnet and call `tryMemo` with valid memo calldata.
Expected: **`ok == false`** — the docs' rule holds in a real transaction.
If it returns `true`, the spec's §6.1 claim is wrong; record that and reassess
whether smart-contract wallets could be supported after all.

- [ ] **Step 7: Settle unverified claim #2 — the priority-fee floor**

Send one transaction at `maxPriorityFeePerGas = 1 Gwei` and one at `5 Gwei`,
recording inclusion time for each.
Expected: both included within a few blocks. If the 1 Gwei transaction stalls,
raise `MIN_PRIORITY_FEE_WEI` in `constants.ts` to `5_000_000_000n` and rerun
the Task 12 tests.

- [ ] **Step 8: Record findings**

Write `docs/notes/<date>-testnet-findings.md` containing: the deployed testnet
anchor address, the run transaction hash, the observed log count and ordering,
the smart-contract-caller result, and the two inclusion times. Then update the
spec's §6.1 tag from `[unverified]` to `[measured]` or correct it.

- [ ] **Step 9: Commit**

```bash
git add contracts/script/DeployAnchor.s.sol scripts/testnet-run.ts docs/notes/ \
        docs/superpowers/specs/2026-09-21-ledgerline-design.md packages/core/src/constants.ts
git commit -m "test: validate Memo caller rule and gas floor on Arc testnet"
```

---

## Task 15: Deploy to mainnet and verify the source

**Files:**
- Modify: `.env` (not committed)
- Create: `docs/notes/<date>-mainnet-deploy.md`

**Interfaces:**
- Consumes: Task 9 contract, Task 14 confirmation
- Produces: `ANCHOR_MAINNET` — the verified mainnet address used by Task 16

- [ ] **Step 1: Fund a mainnet wallet**

Bridge a few USDC to Arc via CCTP, then swap small amounts to EURC and cirBTC
on Uniswap (chain 5042). Target holdings: ~5 USDC, ~1 EURC, ~0.00002 cirBTC.

Verify:
```bash
cast call 0x3600000000000000000000000000000000000000 "balanceOf(address)(uint256)" $ADDR --rpc-url https://rpc.mainnet.arc.io
cast call 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1 "balanceOf(address)(uint256)" $ADDR --rpc-url https://rpc.mainnet.arc.io
cast call 0x171a4217b86a807a64eb94757db6849fb4bdbaa0 "balanceOf(address)(uint256)" $ADDR --rpc-url https://rpc.mainnet.arc.io
```
Expected: all three non-zero. **Do not proceed until they are.**

- [ ] **Step 2: Deploy**

Run:
```bash
cd contracts && forge script script/DeployAnchor.s.sol:DeployAnchor \
  --rpc-url arc --private-key $PRIVATE_KEY --broadcast
```
Expected: a deployed address. Save as `ANCHOR_MAINNET`.

- [ ] **Step 3: Verify the source on the explorer**

Run:
```bash
cd contracts && forge verify-contract $ANCHOR_MAINNET src/PayoutAnchor.sol:PayoutAnchor \
  --chain-id 5042 --verifier blockscout --verifier-url https://explorer.arc.io/api/
```
Expected: verification succeeds.

- [ ] **Step 4: Confirm by eye**

Open `https://explorer.arc.io/address/<ANCHOR_MAINNET>` in a browser.
Expected: a **Contract** tab showing source, ABI, and a read/write UI.
This is submission artifact #1 — it must be visibly true, not just reported.

- [ ] **Step 5: Commit the record**

```bash
git add docs/notes/
git commit -m "chore: deploy and verify PayoutAnchor on Arc mainnet"
```

---

## Task 16: The real three-token mainnet run

**Files:**
- Create: `scripts/mainnet-run.ts`
- Create: `scripts/naive-batch.ts`
- Create: `docs/notes/<date>-mainnet-proof.md`

**Interfaces:**
- Consumes: everything
- Produces: submission artifacts #2, #3, #6 and #7 — the real run, the negative
  control, the measured cost, and the double-payment rejection

- [ ] **Step 1: Write the mainnet run script**

`scripts/mainnet-run.ts`:
```ts
import { createWalletClient, createPublicClient, http, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";
import { writeFileSync } from "node:fs";
import {
  buildRun, buildPreflightData, clientRunIdFor, decodePreflightResult, gasPolicy,
  USDC_ADDRESS, EURC_ADDRESS, CIRBTC_ADDRESS, type Manifest, type ManifestItem,
} from "@ledgerline/core";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const anchor = process.env.ANCHOR_MAINNET as `0x${string}`;
const RECIPIENT = process.env.DEMO_RECIPIENT as `0x${string}`;

const items: ManifestItem[] = [
  { invoiceId: "INV-US-001",  token: USDC_ADDRESS,   to: RECIPIENT, amount: 100_000n }, // 0.10 USDC
  { invoiceId: "INV-EU-002",  token: EURC_ADDRESS,   to: RECIPIENT, amount: 100_000n }, // 0.10 EURC
  { invoiceId: "INV-BTC-003", token: CIRBTC_ADDRESS, to: RECIPIENT, amount: 1_000n },   // 0.00001 cirBTC
];

const manifest: Manifest = {
  // Derived from the list itself, so re-running this script is the same run —
  // which is exactly what Step 6 relies on to prove double payment is blocked.
  clientRunId: clientRunIdFor(account.address, items),
  payer: account.address,
  chainId: arc.id,
  runSalt: keccak256(toHex("ledgerline-demo-salt-1")),
  items,
};

const publicClient = createPublicClient({ chain: arc, transport: http() });
const walletClient = createWalletClient({ account, chain: arc, transport: http() });

// Preflight first — never sign blind.
const preflight = await publicClient.call({
  account: account.address,
  to: buildRun(manifest, anchor).to,
  data: buildPreflightData(manifest, anchor),
});
const outcomes = decodePreflightResult(preflight.data!);
outcomes.forEach((o, i) => {
  const label = i === 0 ? "anchor" : manifest.items[i - 1]!.invoiceId;
  console.log(`  ${o.success ? "OK  " : "FAIL"}  ${label}`);
});
if (outcomes.some((o) => !o.success)) {
  console.error("\nPreflight found failures. Not signing.");
  process.exit(1);
}

const built = buildRun(manifest, anchor);
const fees = gasPolicy(await publicClient.getGasPrice(), await publicClient.estimateMaxPriorityFeePerGas());
const gas = await publicClient.estimateGas({
  account: account.address, to: built.to, data: built.data,
});

const hash = await walletClient.sendTransaction({
  to: built.to, data: built.data, ...fees, gas: (gas * 12n) / 10n,
});
console.log("\nsent:", hash);

const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
const cost = receipt.gasUsed * receipt.effectiveGasPrice;
console.log("status:", receipt.status);
console.log("gasUsed:", receipt.gasUsed);
console.log("cost USDC:", Number(cost) / 1e18);

writeFileSync(
  "docs/notes/mainnet-manifest.json",
  JSON.stringify(
    { ...manifest, items: manifest.items.map((i) => ({ ...i, amount: i.amount.toString() })),
      txHash: hash, root: built.root, proofs: built.proofs, memoIds: built.memoIds },
    null, 2,
  ),
);
```

- [ ] **Step 2: Run it**

Run: `pnpm dlx tsx scripts/mainnet-run.ts`
Expected: preflight shows 4 × `OK`, then `status: success`. Record the hash.
If preflight reports any failure, fix the cause — **do not** override it.

- [ ] **Step 3: Reconcile the real run with the manifest**

Run:
```bash
pnpm --filter @ledgerline/cli exec tsx src/index.ts <hash> --manifest docs/notes/mainnet-manifest.json
```
Expected: three rows, all `matched`, with USDC and EURC at 6 decimals and
cirBTC at 8.

- [ ] **Step 4: Prove the payer identity claim**

Run:
```bash
cast receipt <hash> --rpc-url https://rpc.mainnet.arc.io --json \
  | npx tsx -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));
      const T='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      r.logs.filter(l=>l.topics[0]===T && l.address.toLowerCase()!=='0xfffffffffffffffffffffffffffffffffffffffe')
       .forEach(l=>console.log('from', '0x'+l.topics[1].slice(-40)));"
```
Expected: every `from` equals the payer EOA — **not** `Multicall3From`. This is
the hardest claim in the spec, now demonstrated on mainnet.

- [ ] **Step 5: Produce the negative control**

`scripts/naive-batch.ts`: send the same three payments through the standard
`Multicall3` at `0xcA11bde05977b3631167028862bE2a173976CA11`, using
`approve` + `transferFrom` as an ordinary batcher must.

```ts
import { createWalletClient, createPublicClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";
import { gasPolicy, USDC_ADDRESS } from "@ledgerline/core";

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const RECIPIENT = process.env.DEMO_RECIPIENT as `0x${string}`;

const erc20 = [
  { type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transferFrom", stateMutability: "nonpayable",
    inputs: [{ name: "f", type: "address" }, { name: "t", type: "address" }, { name: "a", type: "uint256" }],
    outputs: [{ type: "bool" }] },
] as const;

const agg = [{
  type: "function", name: "aggregate3", stateMutability: "payable",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target", type: "address" }, { name: "allowFailure", type: "bool" }, { name: "callData", type: "bytes" }]}],
  outputs: [{ name: "r", type: "tuple[]", components: [{ name: "success", type: "bool" }, { name: "returnData", type: "bytes" }]}],
}] as const;

const publicClient = createPublicClient({ chain: arc, transport: http() });
const walletClient = createWalletClient({ account, chain: arc, transport: http() });
const fees = gasPolicy(await publicClient.getGasPrice(), await publicClient.estimateMaxPriorityFeePerGas());

// A normal batcher needs an allowance first.
const approveHash = await walletClient.sendTransaction({
  to: USDC_ADDRESS,
  data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [MULTICALL3, 300_000n] }),
  ...fees, gas: 100_000n,
});
await publicClient.waitForTransactionReceipt({ hash: approveHash });

const hash = await walletClient.sendTransaction({
  to: MULTICALL3,
  data: encodeFunctionData({ abi: agg, functionName: "aggregate3", args: [[{
    target: USDC_ADDRESS, allowFailure: false,
    callData: encodeFunctionData({
      abi: erc20, functionName: "transferFrom", args: [account.address, RECIPIENT, 100_000n],
    }),
  }]] }),
  ...fees, gas: 300_000n,
});
console.log("naive batch:", hash);
console.log("Inspect the Transfer log: `from` will be the batching contract, and there is no reference.");
```

Run: `pnpm dlx tsx scripts/naive-batch.ts`
Expected: a second mainnet hash whose `Transfer` log carries no reference. The
two hashes side by side are submission artifact #3.

- [ ] **Step 6: Prove double-payment rejection**

Run `scripts/mainnet-run.ts` again unchanged.
Expected: it **reverts** at preflight or on chain with `RunExists`, because
`clientRunId` is deterministic and the anchor is write-once. This is submission
artifact #7 — double payment is blocked at the contract layer, not in the UI.

- [ ] **Step 7: Record everything**

Write `docs/notes/<date>-mainnet-proof.md` with: both transaction hashes, the
measured `gasUsed` and USDC cost, the reconciliation output, the `Transfer.from`
comparison between the two approaches, and the `RunExists` revert.

- [ ] **Step 8: Commit**

```bash
git add scripts/mainnet-run.ts scripts/naive-batch.ts docs/notes/
git commit -m "feat: execute the three-token referenced payout on Arc mainnet"
```

---

## What Plan 2 covers

The receipt page (`/r/<txHash>`), the reconciliation view (`/run/<txHash>`), the
`/why` comparison page, and the create-run screen — spec §4.5, tasks T9–T12 and
T15. Written after this plan completes, when the reconciler's output shape is
settled and there is a real mainnet transaction to render.

Note that after Task 16 the hackathon's hard requirements are already met: a
live mainnet deployment, a public repo, and a working system. Plan 2 improves
the submission; it does not rescue it.
