export type IconName = "dashboard" | "new" | "runs" | "learn";
export interface NavItem { href: string; label: string; icon: IconName }

export const APP_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/new", label: "New payout", icon: "new" },
  { href: "/runs", label: "Runs", icon: "runs" },
];

export const LEARN_NAV: NavItem[] = [
  { href: "/why", label: "Compare", icon: "learn" },
];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** Which nav item a route belongs to. A single run (/run/…) sits under Runs. */
export function activeHref(pathname: string): string | undefined {
  if (under(pathname, "/dashboard")) return "/dashboard";
  if (under(pathname, "/new")) return "/new";
  if (under(pathname, "/runs") || pathname.startsWith("/run/")) return "/runs";
  if (under(pathname, "/why")) return "/why";
  return undefined;
}

export function pageTitle(pathname: string): string {
  if (pathname.startsWith("/run/")) return "Payout run";
  switch (activeHref(pathname)) {
    case "/dashboard": return "Dashboard";
    case "/new": return "New payout run";
    case "/runs": return "Your payout runs";
    default: return "Ledgerline";
  }
}

/** A shell link keeps the page's ?n=, or a payer on mainnet would land on
 *  the default network one click later, with their runs apparently gone. */
export function withNet(href: string, search: { get(k: string): string | null } | null): string {
  const n = search?.get("n");
  return n ? `${href}?n=${encodeURIComponent(n)}` : href;
}
