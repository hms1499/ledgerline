"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAV, LEARN_NAV, activeHref, type NavItem } from "@/lib/nav";
import { NavIcon } from "./icons";
import ThemeToggle from "./ThemeToggle";

function Item({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} className="nav-item" aria-current={active ? "page" : undefined} title={item.label}>
      <NavIcon name={item.icon} />
      <span className="nav-label">{item.label}</span>
    </Link>
  );
}

export default function SideNav() {
  const current = activeHref(usePathname() ?? "");
  return (
    <nav className="side-nav" aria-label="Main">
      <Link href="/" className="side-brand">Ledgerline</Link>
      {APP_NAV.map((i) => <Item key={i.href} item={i} active={current === i.href} />)}
      <p className="nav-group">Learn</p>
      {LEARN_NAV.map((i) => <Item key={i.href} item={i} active={current === i.href} />)}
      <div className="side-foot"><ThemeToggle /></div>
    </nav>
  );
}
