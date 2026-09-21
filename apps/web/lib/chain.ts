import { arc, arcTestnet } from "viem/chains";
import { tokensForChain } from "@ledgerline/core";
import type { Chain } from "viem";

export interface NetworkView {
  name: "mainnet" | "testnet";
  chain: Chain;
  defaultRpc: string;
  explorer: string;
  anchor?: `0x${string}`;
}

const MAINNET: NetworkView = {
  name: "mainnet",
  chain: arc,
  defaultRpc: "https://rpc.mainnet.arc.io",
  explorer: "https://explorer.arc.io",
  anchor: process.env.NEXT_PUBLIC_ANCHOR_MAINNET as `0x${string}` | undefined,
};

const TESTNET: NetworkView = {
  name: "testnet",
  chain: arcTestnet,
  defaultRpc: "https://rpc.testnet.arc.io",
  explorer: "https://explorer.testnet.arc.io",
  anchor: process.env.NEXT_PUBLIC_ANCHOR_TESTNET as `0x${string}` | undefined,
};

export function networkFor(name: string | null | undefined): NetworkView {
  return name === "mainnet" ? MAINNET : name === "testnet" ? TESTNET : defaultNetwork();
}

export function defaultNetwork(): NetworkView {
  return process.env.NEXT_PUBLIC_DEFAULT_NETWORK === "mainnet" ? MAINNET : TESTNET;
}

export const tokensFor = tokensForChain;

/** base64url, so a Merkle proof survives being pasted into a chat window. */
export function decodeProof(raw: string | null): `0x${string}`[] | undefined {
  if (!raw) return undefined;
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (bytes.length === 0 || bytes.length % 32 !== 0) return undefined;
    const out: `0x${string}`[] = [];
    for (let i = 0; i < bytes.length; i += 32) {
      out.push(
        ("0x" +
          [...bytes.slice(i, i + 32)].map((b) => b.toString(16).padStart(2, "0")).join(
            "",
          )) as `0x${string}`,
      );
    }
    return out;
  } catch {
    return undefined;
  }
}

export function encodeProof(proof: readonly `0x${string}`[]): string {
  const bytes = new Uint8Array(proof.length * 32);
  proof.forEach((h, i) => {
    const hex = h.slice(2);
    for (let b = 0; b < 32; b++) bytes[i * 32 + b] = parseInt(hex.slice(b * 2, b * 2 + 2), 16);
  });
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * The headline figure on a payment advice. Exact, but never fewer than two
 * decimal places: "0.1 USDC" reads as a truncation to anyone who works with
 * money, where "0.10 USDC" reads as a figure.
 */
export function formatHeadline(value: bigint, decimals: number): string {
  const exact = formatAmount(value, decimals);
  if (!exact.includes(".")) return `${exact}.00`;
  const [whole, frac = ""] = exact.split(".");
  return frac.length >= 2 ? exact : `${whole}.${frac.padEnd(2, "0")}`;
}

/** Amounts are never rendered without their token's on-chain decimals. */
export function formatAmount(value: bigint, decimals: number): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${v / base}${frac ? "." + frac : ""}`;
}
