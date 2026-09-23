"use client";

import Link from "next/link";
import { Button, Dropdown } from "antd";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemeChoice } from "@/lib/theme";

/** Below 640px the sidebar is gone; How it works and the theme live here,
 *  whether or not a wallet is connected. */
export default function MoreMenu() {
  const { choice, setChoice } = useTheme();
  const theme = (c: ThemeChoice, label: string) => ({
    key: `theme-${c}`, label: `${choice === c ? "✓ " : ""}Theme: ${label}`, onClick: () => setChoice(c),
  });
  return (
    <Dropdown
      trigger={["click"]}
      menu={{ items: [
        { key: "why", label: <Link href="/why">How it works</Link> },
        { type: "divider" },
        theme("dark", "dark"), theme("light", "light"), theme("system", "system"),
      ] }}
    >
      <Button className="more-menu" aria-label="More">⋯</Button>
    </Dropdown>
  );
}
