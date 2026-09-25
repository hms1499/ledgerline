"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LEARN_NAV, withNet } from "@/lib/nav";
import NetworkBadge from "./NetworkBadge";
import ThemeToggle from "./ThemeToggle";
import MoreMenu from "./MoreMenu";
import Brand from "./Brand";

/** For people who were sent a link, or are deciding whether to use the app.
 *  No wallet: a recipient reading a receipt has nothing to connect. */
export default function PublicShell({ children }: { children: React.ReactNode }) {
  const search = useSearchParams();
  return (
    <div className="public-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="public-bar">
        <div className="frame public-bar-inner">
          <Brand href={withNet("/", search)} />
          <nav className="public-links" aria-label="Main">
            <Link href={withNet(LEARN_NAV[0]!.href, search)} className="nav-link hide-sm">{LEARN_NAV[0]!.label}</Link>
            <NetworkBadge />
            <span className="hide-sm"><ThemeToggle /></span>
            <span className="only-sm"><MoreMenu /></span>
            <Link href={withNet("/dashboard", search)} className="button-primary">Open app</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="public-main">
        <div className="frame">{children}</div>
      </main>
    </div>
  );
}
