"use client";

import { useEffect, useRef } from "react";
import { Button } from "antd";
import { NOTHING_CHANGED, type ChangesView } from "@/lib/changes-view";
import type { SheetEdits } from "@/lib/sheet-edits";

/** The Changes tab: every change, with its own Undo. Focus stays in the list after an Undo. */
export default function ChangesList({ view, onEdits }: { view: ChangesView; onEdits: (e: SheetEdits) => void }) {
  const listRef = useRef<HTMLUListElement>(null);
  const undone = useRef<number | undefined>(undefined);
  useEffect(() => {
    const i = undone.current;
    if (i === undefined) return;
    undone.current = undefined;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button");
    const next = buttons && buttons.length > 0 ? buttons[Math.min(i, buttons.length - 1)] : undefined;
    (next ?? document.getElementById("changes-empty"))?.focus();
  }, [view]);

  if (view.entries.length === 0) {
    return <p id="changes-empty" className="because" tabIndex={-1}>{view.note ?? NOTHING_CHANGED}</p>;
  }
  return (
    <section className="changes-list" aria-label="Changes made here">
      {view.note && <p className="because">{view.note}</p>}
      <ul ref={listRef}>
        {view.entries.map((x, i) => (
          <li key={x.id}>
            <span className="hex">{x.text}</span>
            <Button size="small" aria-label={`Undo: ${x.text}`} onClick={() => { undone.current = i; onEdits(x.undo); }}>
              Undo
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
