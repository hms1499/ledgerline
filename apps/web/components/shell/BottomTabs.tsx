"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { APP_NAV, activeHref, withNet } from "@/lib/nav";
import { useLeaveGuard } from "@/components/wallet/WalletProvider";
import { NavIcon } from "./icons";

export default function BottomTabs() {
  const current = activeHref(usePathname() ?? "");
  const search = useSearchParams();
  const guard = useLeaveGuard();
  return (
    <nav className="bottom-tabs" aria-label="Main">
      {APP_NAV.map((i) => (
        <Link key={i.href} href={withNet(i.href, search)} onClick={guard} className="tab" aria-current={current === i.href ? "page" : undefined}>
          <NavIcon name={i.icon} />
          <span>{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
