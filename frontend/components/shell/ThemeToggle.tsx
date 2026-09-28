"use client";

import { Segmented } from "antd";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { Mode } from "@/lib/theme-tokens";

/**
 * Two themes, the one on screen selected. Until the viewer picks one the page
 * follows the device (choice "system"), and that is not offered as a third
 * option: on most screens it looks exactly like one of the other two. Once a
 * theme is picked, "Use device" hands the choice back to the device.
 */
export default function ThemeToggle() {
  const { choice, mode, setChoice } = useTheme();
  return (
    <span className="theme-toggle">
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
      {choice !== "system" && (
        <button type="button" className="theme-reset" aria-label="Use device setting"
          title="Use device setting" onClick={() => setChoice("system")}>
          Use device
        </button>
      )}
    </span>
  );
}
