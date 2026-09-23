"use client";

import { useNetwork } from "@/lib/use-network";

/** Testnet is flagged in the warning colour: its tokens have no value. */
export default function NetworkBadge() {
  const net = useNetwork();
  return (
    <span className={`network-badge${net.name === "testnet" ? " is-test" : ""}`}>
      Arc {net.name}
    </span>
  );
}
