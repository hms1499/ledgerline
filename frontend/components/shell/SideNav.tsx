"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { APP_NAV, LEARN_NAV, activeHref, withNet, type NavItem } from "@/lib/nav";
import { useLeaveGuard } from "@/components/wallet/WalletProvider";
import { NavIcon } from "./icons";
import ThemeToggle from "./ThemeToggle";
import Brand from "./Brand";

function Item({ item, active }: { item: NavItem; active: boolean }) {
  const search = useSearchParams();
  const guard = useLeaveGuard();
  return (
    <Link href={withNet(item.href, search)} onClick={guard} className="nav-item" aria-current={active ? "page" : undefined} title={item.label}>
      <NavIcon name={item.icon} />
      <span className="nav-label">{item.label}</span>
    </Link>
  );
}

export default function SideNav() {
  const current = activeHref(usePathname() ?? "");
  const search = useSearchParams();
  const guard = useLeaveGuard();
  return (
    <nav className="side-nav" aria-label="Main">
      <Brand href={withNet("/", search)} onClick={guard} />
      {APP_NAV.map((i) => <Item key={i.href} item={i} active={current === i.href} />)}
      <p className="nav-group">Learn</p>
      {LEARN_NAV.map((i) => <Item key={i.href} item={i} active={current === i.href} />)}
      <div className="side-foot"><ThemeToggle /></div>
    </nav>
  );
}
