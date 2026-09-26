"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "antd";
import type { ColumnId } from "@ledgerline/core";
import { cellId, type GhostColumn, type GridColumn, type GridView } from "@/lib/sheet-grid";
import CellEditor, { type Move } from "./CellEditor";
import LineMenu, { type LineAction } from "./LineMenu";

export interface CellPos { line: number; col: ColumnId }
type Dir = "up" | "down" | "left" | "right";
const ARROWS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

function AboveHeader({ above, onUse }: { above: GridView["above"]; onUse: (line: number) => void }) {
  const [shown, setShown] = useState(false);
  const first = above[0]!.line;
  const last = above.at(-1)!.line;
  return (
    <div className="sheet-above">
      <Button type="link" size="small" aria-expanded={shown} onClick={() => setShown(!shown)}>
        {first === last ? `Line ${first} is above the header` : `Lines ${first}–${last} are above the header`}
      </Button>
      {shown && (
        <ul className="fix-rows">
          {above.map((a) => (
            <li key={a.line}>
              <span className="hex">line {a.line}: {a.text}</span>
              <Button size="small" onClick={() => onUse(a.line)}>Use as the header line</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The file as a grid (spec 2026-09-26-csv-sheet-editor §5.2). Cells are text
 * and one opens at a time, so 400 lines are 400 rows of text and one input.
 * One cell is in the tab order; arrow keys move it.
 */
export default function SheetGrid({ view, onEdit, onLine, onAddLine, open, focusSeq, head, ghostHead, status }: {
  view: GridView;
  onEdit: (line: number, col: ColumnId, text: string) => void;
  onLine: (line: number, action: LineAction) => void;
  onAddLine: () => void;
  /** A cell to open, asked for from outside. A new `seq` asks again. */
  open?: CellPos & { seq: number };
  /** A new value moves focus to the grid's current cell. */
  focusSeq?: number;
  head?: (c: GridColumn) => ReactNode;
  ghostHead?: (g: GhostColumn) => ReactNode;
  /** Beside `+ Add a line`: the draft's state. */
  status?: ReactNode;
}) {
  const cols = view.columns.map((c) => c.id);
  const lines = view.rows.map((r) => r.line);
  const [active, setActive] = useState<CellPos>();
  const [editing, setEditing] = useState<{ pos: CellPos; initial: string }>();
  const focusNext = useRef<CellPos | undefined>(undefined);
  // Whether the cell pressed already had focus when the press began.
  // Focusing it re-renders before the click lands, so the click alone cannot
  // tell a first press (select) from a second (open); and the grid's current
  // cell is not enough, since focus may have left the grid since.
  const pressedCurrent = useRef(false);

  const pos: CellPos | undefined = active && lines.includes(active.line) && cols.includes(active.col)
    ? active
    : lines[0] !== undefined && cols[0] !== undefined ? { line: lines[0], col: cols[0] } : undefined;
  const cellAt = (p: CellPos) => view.rows.find((r) => r.line === p.line)?.cells.find((c) => c.col === p.col);
  const colName = (col: ColumnId) => view.columns.find((c) => c.id === col)?.name ?? col;

  useEffect(() => {
    const p = focusNext.current;
    if (!p) return;
    focusNext.current = undefined;
    document.getElementById(cellId(p.line, p.col))?.focus();
  });

  useEffect(() => {
    if (!open) return;
    const cell = cellAt(open);
    if (!cell) return;
    setActive({ line: open.line, col: open.col });
    setEditing({ pos: { line: open.line, col: open.col }, initial: cell.text });
    document.getElementById(cellId(open.line, open.col))?.scrollIntoView({ block: "center" });
    // `open` is a new object each time it is asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (focusSeq === undefined || !pos) return;
    document.getElementById(cellId(pos.line, pos.col))?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq]);

  const move = (from: CellPos, dir: Dir): CellPos | undefined => {
    const r = lines.indexOf(from.line) + (dir === "up" ? -1 : dir === "down" ? 1 : 0);
    const c = cols.indexOf(from.col) + (dir === "left" ? -1 : dir === "right" ? 1 : 0);
    if (r < 0 || r >= lines.length || c < 0 || c >= cols.length) return undefined;
    return { line: lines[r]!, col: cols[c]! };
  };
  const go = (p: CellPos) => { setActive(p); focusNext.current = p; };
  const startEdit = (p: CellPos, initial?: string) => {
    const row = view.rows.find((r) => r.line === p.line);
    const cell = cellAt(p);
    if (!row || !cell || row.state === "deleted") return;
    setActive(p);
    setEditing({ pos: p, initial: initial ?? cell.text });
  };
  const keep = (p: CellPos, before: string, text: string, m: Move) => {
    setEditing(undefined);
    if (text !== before) onEdit(p.line, p.col, text);
    if (m) go(move(p, m) ?? p);
  };
  const onKey = (e: KeyboardEvent<HTMLTableCellElement>, p: CellPos) => {
    const dir = ARROWS[e.key];
    if (dir) { e.preventDefault(); go(move(p, dir) ?? p); }
    else if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); startEdit(p); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); startEdit(p, e.key); }
  };

  const current = pos && cellAt(pos);
  const said = current
    ? [current.problem, current.edited ? `was ${current.was || "(empty)"}` : undefined].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="sheet">
      {view.above.length > 0 && <AboveHeader above={view.above} onUse={(line) => onLine(line, "header")} />}
      <p className="sheet-status because" aria-live="polite">{said}</p>
      <div className="table-scroll" role="region" aria-label="The file as a table">
        <table className="sheet-grid" role="grid" aria-label="The file" aria-rowcount={view.rows.length + 1}>
          <thead>
            <tr>
              <th scope="col" className="line-head">Line</th>
              {view.columns.map((c) => (
                <th key={c.id} scope="col" className={c.isNew ? "is-new" : undefined}>
                  {head ? head(c) : (
                    <>
                      <span className="col-name">{c.name}</span>
                      <span className={`role-chip ${c.role === "unused" ? "is-unused" : "is-set"}`}>
                        {c.role === "unused" ? "not used" : `${c.role} ✓`}
                      </span>
                    </>
                  )}
                </th>
              ))}
              {view.ghosts.map((g) => (
                <th key={g.role} scope="col" className="ghost">
                  {ghostHead ? ghostHead(g) : <span className="role-chip is-missing">{g.role} ✗ missing</span>}
                </th>
              ))}
              <th scope="col"><span className="sr-only">Line actions</span></th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.line} className={`is-${r.state}${r.isNew ? " is-new" : ""}`}>
                <th scope="row" className="line-head">
                  {r.label}
                  {r.cells.some((c) => c.edited) && <span className="edited-mark" aria-label="edited here">✎</span>}
                  {r.message && (
                    <>
                      <span className="line-flag" title={r.message} aria-hidden="true">!</span>
                      <span className="sr-only">{r.message}</span>
                    </>
                  )}
                  {r.raw !== undefined && <span className="sr-only">As written: {r.raw}</span>}
                </th>
                {r.cells.map((c) => {
                  const p = { line: r.line, col: c.col };
                  const isActive = pos?.line === r.line && pos.col === c.col;
                  const isEditing = editing?.pos.line === r.line && editing.pos.col === c.col;
                  return (
                    <td
                      key={c.col}
                      id={c.id}
                      role="gridcell"
                      tabIndex={isActive && !isEditing ? 0 : -1}
                      className={[c.problem ? "has-problem" : "", c.edited ? "is-edited" : ""].join(" ").trim() || undefined}
                      aria-invalid={c.problem ? true : undefined}
                      aria-describedby={c.problem ? `${c.id}-p` : undefined}
                      onMouseDown={(e) => { pressedCurrent.current = !isEditing && document.activeElement === e.currentTarget; }}
                      onFocus={() => { if (!isActive) setActive(p); }}
                      onClick={() => { if (!isEditing && pressedCurrent.current) startEdit(p); }}
                      onDoubleClick={() => { if (!isEditing) startEdit(p); }}
                      onKeyDown={(e) => { if (!isEditing) onKey(e, p); }}
                    >
                      {isEditing ? (
                        <CellEditor
                          initial={editing!.initial}
                          label={`Line ${r.line}, ${colName(c.col)}`}
                          onKeep={(text, m) => keep(p, c.text, text, m)}
                          onCancel={() => { setEditing(undefined); focusNext.current = p; }}
                        />
                      ) : (
                        <span className="cell-text hex">{c.text}</span>
                      )}
                      {c.problem && <span id={`${c.id}-p`} className="sr-only">{c.problem}</span>}
                    </td>
                  );
                })}
                {view.ghosts.map((g) => <td key={g.role} className="ghost" />)}
                <td className="line-actions">
                  <LineMenu line={r.line} state={r.state} isNew={r.isNew} onAction={(a) => onLine(r.line, a)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sheet-foot">
        <Button onClick={onAddLine}>+ Add a line</Button>
        {status}
      </p>
    </div>
  );
}
