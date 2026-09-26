"use client";

import { useEffect, useRef } from "react";
import { Button, type GetRef } from "antd";
import type { ColumnId } from "@ledgerline/core";
import type { FieldFix, LineCard } from "@/lib/fix-list";
import type { CellEdit } from "@/lib/sheet-edits";

type Apply = (changes: CellEdit[], focusUndo: boolean) => void;

/** One field of one line: what it holds, a button per reading core found,
 *  and the way to its cell, where it is typed. */
function FieldRow({ line, fix, onApply, onShow }: {
  line: number; fix: FieldFix; onApply: Apply; onShow: (line: number, col: ColumnId) => void;
}) {
  return (
    <div className="fix-field">
      <span className="fix-label">{fix.label}: <span className="hex">{fix.value || "(empty)"}</span></span>
      {fix.choices.length > 0 && (
        <div className="fix-choices" role="group" aria-label={fix.field === "token" ? "Token" : "Read it as"}>
          {fix.choices.map((c) => (
            <Button key={c.label} size="small" onClick={() => onApply([{ line, col: fix.col, text: c.text }], true)}>
              {c.label}
            </Button>
          ))}
        </div>
      )}
      <Button
        id={`fix-${line}-${fix.field}`}
        size="small"
        aria-label={`Show line ${line}'s ${fix.label.toLowerCase()} in the table`}
        onClick={() => onShow(line, fix.col)}
      >
        Show in table
      </Button>
      {fix.help && <span className="because">{fix.help}</span>}
    </div>
  );
}

/**
 * One line's card. It stays where it is when fixed or left out, showing what
 * changed, so nothing moves under the pointer; after a button press focus
 * moves to its own Undo, never to the page. An open card shows the changes
 * whose field it no longer asks for, with the same Undo.
 */
export default function LineCardView({ card, onApply, onUndo, onLeaveOut, onPutBack, onDelete, onShow }: {
  card: LineCard;
  onApply: (changes: CellEdit[]) => void;
  onUndo: () => void;
  onLeaveOut: () => void;
  onPutBack: () => void;
  onDelete: () => void;
  onShow: (line: number, col: ColumnId) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const undoRef = useRef<GetRef<typeof Button>>(null);
  // Set true by an action that asked for focus: a commit, a button, an Undo.
  // Consumed on the very next render this card takes part in, so a later,
  // unrelated change can never steal focus on the strength of an old action.
  // A closed card focuses its Undo. An open one keeps focus where it is,
  // unless the control that had it is gone (an Undo, or a field that no
  // longer has a problem): then its first control, never the page.
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const el = cardRef.current;
    if (card.state !== "open") undoRef.current?.focus();
    else if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>("input, button")?.focus();
  }, [card]);
  const apply: Apply = (changes, focusUndo) => { pending.current = focusUndo; onApply(changes); };
  // What the payer changed on this line, and the one Undo that drops it.
  const changed = (
    <>
      <dl className="fix-changes">
        {card.changes.map((c) => (
          <div key={c.label}>
            <dt>{c.label}</dt>
            <dd><span className="hex">{c.before || "(empty)"}</span> → <span className="hex">{c.after}</span></dd>
          </div>
        ))}
      </dl>
      <Button size="small" ref={undoRef} aria-label={`Undo the changes to line ${card.line}`} onClick={() => { pending.current = true; onUndo(); }}>Undo</Button>
    </>
  );

  if (card.state === "left-out") {
    return (
      <article ref={cardRef} id={card.id} className="fix-card left-out">
        <p className="fix-heading">{card.heading}</p>
        <Button size="small" ref={undoRef} aria-label={`Put line ${card.line} back in this run`} onClick={() => { pending.current = true; onPutBack(); }}>Undo</Button>
      </article>
    );
  }
  if (card.state === "fixed") {
    return (
      <article ref={cardRef} id={card.id} className="fix-card fixed">
        <p className="fix-heading"><span aria-hidden="true">✓ </span>{card.heading}</p>
        {changed}
      </article>
    );
  }
  return (
    <article ref={cardRef} id={card.id} className={`fix-card ${card.blocking ? "fail" : "warn"}`} aria-labelledby={`${card.id}-h`}>
      <p id={`${card.id}-h`} className="fix-heading">{card.heading}</p>
      <ul className="fix-messages">
        {card.messages.map((m) => (
          <li key={m.text} className={m.level}>
            <span aria-hidden="true">{m.level === "error" ? "✗ " : "! "}</span>{m.text}
          </li>
        ))}
      </ul>
      {card.unreadableText !== undefined && <pre className="hex fix-raw">{card.unreadableText}</pre>}
      {card.changes.length > 0 && changed}
      {card.fields.map((f) => <FieldRow key={f.field} line={card.line} fix={f} onApply={apply} onShow={onShow} />)}
      {card.isNew ? (
        <Button size="small" type="text" onClick={onDelete}>Delete this line</Button>
      ) : (
        <Button size="small" type="text" onClick={() => { pending.current = true; onLeaveOut(); }}>
          Leave out of this run
        </Button>
      )}
    </article>
  );
}
