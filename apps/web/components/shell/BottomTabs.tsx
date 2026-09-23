"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAV, activeHref } from "@/lib/nav";
import { NavIcon } from "./icons";

export default function BottomTabs() {
  const current = activeHref(usePathname() ?? "");
  return (
    <nav className="bottom-tabs" aria-label="Main">
      {APP_NAV.map((i) => (
        <Link key={i.href} href={i.href} className="tab" aria-current={current === i.href ? "page" : undefined}>
          <NavIcon name={i.icon} />
          <span>{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
