import { writeFileSync, mkdirSync } from "node:fs";
import { encodeFunctionData, keccak256, toHex } from "viem";

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
