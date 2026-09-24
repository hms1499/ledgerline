import { short, type NetworkView } from "@/lib/chain";

/**
 * The recorded-lists contract for the footer's last line: its short address
 * and explorer page, or nothing when this deployment has none configured
 * (it comes from an env variable).
 */
export function contractLine(
  net: Pick<NetworkView, "anchor" | "explorer">,
): { short: string; href: string } | undefined {
  if (!net.anchor) return undefined;
  return { short: short(net.anchor), href: `${net.explorer}/address/${net.anchor}` };
}
