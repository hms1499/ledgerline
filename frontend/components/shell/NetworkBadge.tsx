"use client";

import { useNetwork } from "@/lib/use-network";

/** Testnet sits on the highlighter: its tokens have no value. On a phone the
 *  "Arc" is only spoken, so the header fits down to 320px. */
export default function NetworkBadge() {
  const net = useNetwork();
  return (
    <span className={`network-badge${net.name === "testnet" ? " is-test" : ""}`}>
      <span className="badge-arc">Arc </span>{net.name}
    </span>
  );
}
