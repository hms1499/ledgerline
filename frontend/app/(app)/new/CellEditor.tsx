"use client";

import { useRef, useState } from "react";

export type Move = "down" | "right" | "left" | null;

/**
 * The one open cell. Enter keeps and moves down, Tab keeps and moves right
 * (Shift+Tab left), Escape cancels; leaving it any other way keeps it. Every
 * key stops here, so arrows move the caret, not the grid, and Ctrl+Z is the
 * input's own undo, not the sheet's.
 */
export default function CellEditor({ initial, label, onKeep, onCancel }: {
  initial: string;
  label: string;
  onKeep: (text: string, move: Move) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };
  return (
    <input
      className="cell-input hex"
      aria-label={label}
      value={text}
      autoFocus
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(() => onKeep(text, null))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); finish(() => onKeep(text, "down")); }
        else if (e.key === "Tab") { e.preventDefault(); finish(() => onKeep(text, e.shiftKey ? "left" : "right")); }
        else if (e.key === "Escape") { e.preventDefault(); finish(onCancel); }
      }}
    />
  );
}
