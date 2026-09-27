"use client";

import { useRef } from "react";
import { Button, Dropdown } from "antd";
import type { GridRow } from "@/lib/sheet-grid";
import { inMain } from "@/lib/popup-container";

export type LineAction = "leave-out" | "put-back" | "delete" | "restore" | "header";

/** A line's ⋯ menu. A deleted line shows its Undo in place instead. */
export default function LineMenu({ line, state, isNew, onAction }: {
  line: number;
  state: GridRow["state"];
  isNew: boolean;
  onAction: (a: LineAction) => void;
}) {
  // Leaving out or putting back keeps this ⋯, but the menu item that had focus
  // closes with the menu: the ⋯ takes focus back, where the payer was.
  const trigger = useRef<HTMLButtonElement>(null);
  if (state === "deleted") {
    return (
      <>
        <span className="because">deleted</span>{" "}
        <Button size="small" aria-label={`Put line ${line} back in the file`} onClick={() => onAction("restore")}>Undo</Button>
      </>
    );
  }
  const items = isNew
    ? [{ key: "delete", label: "Delete this line" }]
    : [
      state === "left-out"
        ? { key: "put-back", label: "Put back in this run" }
        : { key: "leave-out", label: "Leave out of this run" },
      { key: "delete", label: "Delete from the file" },
      { key: "header", label: "Use as the header line" },
    ];
  return (
    <Dropdown trigger={["click"]} getPopupContainer={inMain} menu={{ items, onClick: ({ key }) => {
      onAction(key as LineAction);
      if (key === "leave-out" || key === "put-back") requestAnimationFrame(() => trigger.current?.focus());
    } }}>
      <Button ref={trigger} size="small" type="text" aria-label={`Line ${line} actions`}>⋯</Button>
    </Dropdown>
  );
}
