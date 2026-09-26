"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, type GetRef } from "antd";
import type { FieldFix, LineCard } from "@/lib/fix-list";
import type { CellEdit } from "@/lib/run-edits";

type Apply = (changes: CellEdit[], focusUndo: boolean) => void;

/** One field of one line: its input, and a button per reading core found. */
function FieldInput({ line, fix, onApply }: { line: number; fix: FieldFix; onApply: Apply }) {
  const [text, setText] = useState(fix.value);
  // A button or an undo changes the value from outside: follow it.
  const [seen, setSeen] = useState(fix.value);
  if (seen !== fix.value) { setSeen(fix.value); setText(fix.value); }

  const id = `fix-${line}-${fix.field}`;
  const commit = (focusUndo: boolean) => {
    if (text.trim() !== fix.value.trim()) onApply([{ line, field: fix.field, text }], focusUndo);
  };
  return (
    <div className="fix-field">
      {fix.field === "token"
        ? <span className="fix-label">{fix.label}</span>
        : <label className="fix-label" htmlFor={id}>{fix.label}</label>}
      {fix.field !== "token" && (
        <Input
          id={id}
          value={text}
          spellCheck={false}
          autoComplete="off"
          className={fix.field === "to" ? "hex" : undefined}
          inputMode={fix.field === "amount" ? "decimal" : undefined}
          aria-describedby={fix.help ? `${id}-help` : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(false)}
          onPressEnter={(e) => { e.preventDefault(); commit(true); }}
        />
      )}
      {fix.choices.length > 0 && (
        <div className="fix-choices" role="group" aria-label={fix.field === "token" ? "Token" : "Read it as"}>
          {fix.choices.map((c) => (
            <Button key={c.label} size="small" onClick={() => onApply([{ line, field: fix.field, text: c.text }], true)}>
              {c.label}
            </Button>
          ))}
        </div>
      )}
      {fix.help && <span id={`${id}-help`} className="because">{fix.help}</span>}
    </div>
  );
}

/**
 * One line's card. It stays where it is when fixed or left out, showing what
 * changed, so nothing moves under the pointer; after a button press focus
 * moves to its own Undo, never to the page. An open card shows the changes
 * whose field it no longer asks for, with the same Undo.
 */
export default function LineCardView({ card, onApply, onUndo, onLeaveOut, onPutBack }: {
  card: LineCard;
  onApply: (changes: CellEdit[]) => void;
  onUndo: () => void;
  onLeaveOut: () => void;
  onPutBack: () => void;
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
      {card.fields.map((f) => <FieldInput key={f.field} line={card.line} fix={f} onApply={apply} />)}
      <Button size="small" type="text" onClick={() => { pending.current = true; onLeaveOut(); }}>
        Leave out of this run
      </Button>
    </article>
  );
}
