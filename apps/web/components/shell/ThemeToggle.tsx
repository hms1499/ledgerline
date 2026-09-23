"use client";

import { Segmented } from "antd";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemeChoice } from "@/lib/theme";

export default function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  return (
    <Segmented<ThemeChoice>
      size="small"
      aria-label="Theme"
      value={choice}
      onChange={setChoice}
      options={[
        { label: "Dark", value: "dark" },
        { label: "Light", value: "light" },
        { label: "System", value: "system" },
      ]}
    />
  );
}
