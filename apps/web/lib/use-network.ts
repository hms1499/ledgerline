"use client";

import { useSearchParams } from "next/navigation";
import { networkFor, type NetworkView } from "@/lib/chain";

/** ?n= picks the network on every route, as the pages already do. */
export function networkFromSearch(search: { get(k: string): string | null } | null): NetworkView {
  return networkFor(search?.get("n") ?? null);
}

export function useNetwork(): NetworkView {
  return networkFromSearch(useSearchParams());
}
