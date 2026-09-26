"use client";

import { useEffect, useRef, useState } from "react";
import { Button, type GetRef } from "antd";
import { afterRowFix, rowId, type FixListView, type GroupAction, type GroupCard } from "@/lib/fix-list";
import {
  applyBatch, deleteLine, editCells, leaveOut, putBack, undoBatch, undoLine, type CellEdit, type SheetEdits,
} from "@/lib/sheet-edits";
import LineCardView from "./LineCard";

const SHOWN = 25;

function GroupCardView({ group, onApply, onApplyOne, onUndo }: {
  group: GroupCard;
  onApply: (a: GroupAction) => void;
  onApplyOne: (line: number, changes: CellEdit[]) => void;
  onUndo: () => void;
}) {
  const [shown, setShown] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const undoRef = useRef<GetRef<typeof Button>>(null);
  // Set true by an action that asked for focus. Consumed on the very next
  // render this group takes part in, so a later unrelated change can never
  // steal focus on the strength of an old, already-superseded action. An
  // applied group focuses its Undo; one opened again by Undo focuses its
  // first button, since the Undo that had focus is gone.
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const el = cardRef.current;
    if (group.state !== "open") undoRef.current?.focus();
    else if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>("input, button")?.focus();
  }, [group]);

  if (group.state === "applied") {
    return (
      <article ref={cardRef} id={group.id} className="fix-card fixed">
        <p className="fix-heading"><span aria-hidden="true">✓ </span>{group.title}</p>
        <Button size="small" ref={undoRef} aria-label={`Undo: ${group.title}`}
          onClick={() => { pending.current = true; onUndo(); }}>Undo</Button>
      </article>
    );
  }
  return (
    <article ref={cardRef} id={group.id} className={`fix-card ${group.blocking ? "fail" : "warn"}`} aria-labelledby={`${group.id}-h`}>
      <p id={`${group.id}-h`} className="fix-heading">{group.title}</p>
      <ul className="fix-examples">{group.examples.map((e) => <li key={e} className="hex">{e}</li>)}</ul>
      <div className="fix-choices">
        {group.lead && <span>{group.lead}</span>}
        {group.actions.map((a) => (
          <Button key={a.label} size="small" onClick={() => { pending.current = true; onApply(a); }}>{a.label}</Button>
        ))}
      </div>
      <Button type="link" size="small" aria-expanded={shown} onClick={() => setShown(!shown)}>
        {shown ? "Hide the lines" : `Show the ${group.lines.length} lines`}
      </Button>
      {shown && (
        <ul className="fix-rows">
          {group.rows.map((r) => (
            <li key={r.line} id={rowId(r.line, group.field)}>
              <span className="hex">line {r.line}: {r.raw || "(empty)"}</span>
              {r.choices.map((c) => (
                <Button key={c.label} size="small"
                  onClick={() => onApplyOne(r.line, [{ line: r.line, col: group.col, text: c.text }])}>
                  {c.label}
                </Button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** The Review step's problems, as cards to work down (spec 2026-09-26 §4). */
export default function FixList({ view, edits, onEdits }: {
  view: FixListView; edits: SheetEdits; onEdits: (e: SheetEdits) => void;
}) {
  const [all, setAll] = useState(false);
  const [said, setSaid] = useState("");
  // Each card's state on the last render, so a card that just turned ready is announced.
  const before = useRef(new Map<string, string>());
  useEffect(() => {
    for (const c of view.cards) {
      if (c.state === "fixed" && before.current.get(c.id) === "open") setSaid(`Line ${c.line} is ready to pay`);
    }
    for (const g of view.groups) {
      if (g.state === "applied" && before.current.get(g.id) === "open") setSaid(`${g.lines.length} lines changed`);
    }
    before.current = new Map([...view.cards, ...view.groups].map((x) => [x.id, x.state]));
  }, [view]);

  // A line fixed on its own inside a group leaves the group, and the button
  // that had focus leaves with it. Set by that press, consumed on the next
  // render: focus moves on down the group (afterRowFix), and is announced.
  const rowFix = useRef<{ key: string; lines: number[]; line: number }>(undefined);
  useEffect(() => {
    const fixed = rowFix.current;
    if (!fixed) return;
    rowFix.current = undefined;
    const next = afterRowFix(view, fixed.key, fixed.lines, fixed.line);
    const el = document.getElementById(next.focus) ?? document.getElementById("fix-list");
    (el?.querySelector<HTMLElement>("input, button") ?? el)?.focus();
    setSaid(next.said);
  }, [view]);

  // A new line deleted from its card takes the card with it: focus the list.
  const deleted = useRef(false);
  useEffect(() => {
    if (!deleted.current) return;
    deleted.current = false;
    document.getElementById("fix-list")?.focus();
  }, [view]);

  if (view.fileProblems.length + view.groups.length + view.cards.length === 0) return null;
  const cards = all ? view.cards : view.cards.slice(0, SHOWN);
  return (
    <section id="fix-list" className="fix-list" aria-labelledby="fix-list-title" tabIndex={-1}>
      <h2 id="fix-list-title" className="label">{view.title}</h2>
      {view.counts && <p className="fix-counts">{view.counts}</p>}
      {view.summary && <p className="because">{view.summary}</p>}
      {view.fileProblems.length > 0 && (
        <ul className="ladder">
          {view.fileProblems.map((m) => (
            <li key={m} className="rung fail">
              <span className="claim">This file</span>
              <span className="mark" aria-hidden="true">✗</span>
              <span className="because">{m}</span>
            </li>
          ))}
        </ul>
      )}
      {view.groups.map((g) => (
        <GroupCardView key={g.id} group={g}
          onApply={(a) => onEdits(applyBatch(edits, a.batch, a.changes))}
          onApplyOne={(line, changes) => {
            rowFix.current = { key: g.key, lines: g.lines, line };
            onEdits(editCells(edits, changes));
          }}
          onUndo={() => onEdits(undoBatch(edits, g.key))} />
      ))}
      {cards.map((c) => (
        <LineCardView key={c.id} card={c}
          onApply={(changes) => onEdits(editCells(edits, changes))}
          onUndo={() => onEdits(undoLine(edits, c.line))}
          onLeaveOut={() => onEdits(leaveOut(edits, c.line))}
          onPutBack={() => onEdits(putBack(edits, c.line))}
          onDelete={() => { deleted.current = true; onEdits(deleteLine(edits, c.line)); }} />
      ))}
      {!all && view.cards.length > SHOWN && (
        <Button type="link" onClick={() => setAll(true)}>Show {view.cards.length - SHOWN} more</Button>
      )}
      <p className="sr-only" aria-live="polite">{said}</p>
    </section>
  );
}
