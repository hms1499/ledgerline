"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Dropdown } from "antd";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemeChoice } from "@/lib/theme";
import { LEARN_NAV, withNet } from "@/lib/nav";
import { useLeaveGuard } from "@/components/wallet/WalletProvider";

/** Below 640px the sidebar is gone; Compare and the theme live here,
 *  whether or not a wallet is connected. */
export default function MoreMenu() {
  const { choice, setChoice } = useTheme();
  const search = useSearchParams();
  const guard = useLeaveGuard();
  const theme = (c: ThemeChoice, label: string) => ({
    key: `theme-${c}`, label: `${choice === c ? "✓ " : ""}Theme: ${label}`, onClick: () => setChoice(c),
  });
  return (
    <Dropdown
      trigger={["click"]}
      menu={{ items: [
        { key: "why", label: <Link href={withNet(LEARN_NAV[0]!.href, search)} onClick={guard}>{LEARN_NAV[0]!.label}</Link> },
        { type: "divider" },
        theme("dark", "dark"), theme("light", "light"), theme("system", "system"),
      ] }}
    >
      <Button className="more-menu" aria-label="More">⋯</Button>
    </Dropdown>
  );
}
