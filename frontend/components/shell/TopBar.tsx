"use client";

import { usePathname } from "next/navigation";
import { pageTitle } from "@/lib/nav";
import NetworkBadge from "./NetworkBadge";
import WalletButton from "./WalletButton";
import MoreMenu from "./MoreMenu";

export default function TopBar() {
  return (
    <header className="top-bar">
      <div className="frame top-bar-inner">
        <h1 className="top-title">{pageTitle(usePathname() ?? "")}</h1>
        <div className="top-actions">
          <NetworkBadge />
          <WalletButton />
          {/* Below 1024px the sidebar has no room for the theme toggle. */}
          <span className="below-lg"><MoreMenu /></span>
        </div>
      </div>
    </header>
  );
}
