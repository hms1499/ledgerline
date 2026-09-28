"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Dropdown } from "antd";
import { useTheme } from "@/components/theme/ThemeProvider";
import { themeMenu } from "@/lib/theme";
import { LEARN_NAV, withNet } from "@/lib/nav";
import { useLeaveGuard } from "@/components/wallet/WalletProvider";

/** Below 1024px the sidebar has no room for the theme, and below 640px it is
 *  gone; Compare and the theme live here, whether or not a wallet is
 *  connected. */
export default function MoreMenu() {
  const { choice, mode, setChoice } = useTheme();
  const search = useSearchParams();
  const guard = useLeaveGuard();
  return (
    <Dropdown
      trigger={["click"]}
      menu={{ items: [
        { key: "why", label: <Link href={withNet(LEARN_NAV[0]!.href, search)} onClick={guard}>{LEARN_NAV[0]!.label}</Link> },
        { type: "divider" },
        ...themeMenu(choice, mode).map((i) => ({
          key: i.key, label: `${i.checked ? "✓ " : ""}${i.label}`, onClick: () => setChoice(i.choice),
        })),
      ] }}
    >
      <Button className="more-menu" aria-label="More">⋯</Button>
    </Dropdown>
  );
}
