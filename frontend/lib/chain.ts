import { arc, arcTestnet } from "viem/chains";
import { tokensForChain } from "@ledgerline/core";
import type { Chain } from "viem";

export interface NetworkView {
  name: "mainnet" | "testnet";
  chain: Chain;
  defaultRpc: string;
  explorer: string;
  anchor?: `0x${string}`;
  /** The two runs `/why` puts side by side. Configured, never hardcoded, so
   *  the page can be repointed at the mainnet pair without a code change. */
  demo: DemoRun;
}

export interface DemoRun {
  /** A referenced run through Multicall3From → Memo → transfer. */
  ours?: `0x${string}`;
  /** The same payment through the standard Multicall3, with no reference. */
  naive?: `0x${string}`;
  /** The approval the naive route needs before it can move anything. */
  naiveApprove?: `0x${string}`;
}

const MAINNET: NetworkView = {
  name: "mainnet",
  chain: arc,
  defaultRpc: "https://rpc.mainnet.arc.io",
  explorer: "https://explorer.arc.io",
  anchor: process.env.NEXT_PUBLIC_ANCHOR_MAINNET as `0x${string}` | undefined,
  demo: {
    ours: process.env.NEXT_PUBLIC_WHY_OURS_MAINNET as `0x${string}` | undefined,
    naive: process.env.NEXT_PUBLIC_WHY_NAIVE_MAINNET as `0x${string}` | undefined,
    naiveApprove: process.env.NEXT_PUBLIC_WHY_APPROVE_MAINNET as `0x${string}` | undefined,
  },
};

const TESTNET: NetworkView = {
  name: "testnet",
  chain: arcTestnet,
  defaultRpc: "https://rpc.testnet.arc.io",
  explorer: "https://explorer.testnet.arc.io",
  anchor: process.env.NEXT_PUBLIC_ANCHOR_TESTNET as `0x${string}` | undefined,
  demo: {
    ours: process.env.NEXT_PUBLIC_WHY_OURS_TESTNET as `0x${string}` | undefined,
    naive: process.env.NEXT_PUBLIC_WHY_NAIVE_TESTNET as `0x${string}` | undefined,
    naiveApprove: process.env.NEXT_PUBLIC_WHY_APPROVE_TESTNET as `0x${string}` | undefined,
  },
};

export function networkFor(name: string | null | undefined): NetworkView {
  return name === "mainnet" ? MAINNET : name === "testnet" ? TESTNET : defaultNetwork();
}

/** Mainnet unless testnet is asked for by name: the product runs on mainnet,
 *  and testnet is the place to try it without real funds (`?n=testnet`). */
export function defaultNetwork(): NetworkView {
  return process.env.NEXT_PUBLIC_DEFAULT_NETWORK === "testnet" ? TESTNET : MAINNET;
}

/** A wallet's network, in words: the id only when it is not one of Arc's. */
export function chainName(id: number | undefined): string {
  if (id === arc.id) return "Arc mainnet";
  if (id === arcTestnet.id) return "Arc testnet";
  return id ? `another network (chain ${id})` : "a network it did not name";
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

/**
 * A receipt link carries everything the recipient's page needs to verify on
 * its own: the invoice, the run salt that turns it into a reference, and the
 * Merkle proof for the anchor. Built in one place, because a link missing any
 * of them opens as "incomplete" in front of the person being paid.
 */
export function receiptUrl({
  origin = "", txHash, invoiceId, runSalt, proof, network,
}: {
  origin?: string;
  txHash: string;
  invoiceId: string;
  runSalt: `0x${string}`;
  proof: readonly `0x${string}`[];
  network: NetworkView["name"];
}): string {
  return `${origin}/r/${txHash}?i=${encodeURIComponent(invoiceId)}`
    + `&s=${runSalt}`
    + `&p=${encodeProof(proof)}`
    + `&n=${network}`;
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
