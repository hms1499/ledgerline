"use client";

import { Segmented } from "antd";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { Mode } from "@/lib/theme-tokens";

/**
 * Two themes, the one on screen selected. Until the viewer picks one the page
 * follows the device (choice "system"), and that is not offered as a third
 * option: on most screens it looks exactly like one of the other two. The way
 * back to the device's setting is in the ⋯ menu, below 1024px.
 */
export default function ThemeToggle() {
  const { mode, setChoice } = useTheme();
  return (
    <Segmented<Mode>
      size="small"
      aria-label="Theme"
      value={mode}
      onChange={setChoice}
      options={[
        { label: "Dark", value: "dark" },
        { label: "Light", value: "light" },
      ]}
    />
  );
}
