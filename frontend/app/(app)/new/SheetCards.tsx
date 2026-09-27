"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "antd";
import type { ColumnId, CsvField } from "@ledgerline/core";
import { type GhostColumn, type GridColumn, type GridRow, type GridView } from "@/lib/sheet-grid";
import CellEditor from "./CellEditor";
import LineMenu, { type LineAction } from "./LineMenu";
import { AboveHeader, type CellPos } from "./SheetGrid";

/**
 * A fold that opens when asked (`force`) and otherwise stays as the payer
 * left it. Bound to a prop alone, it would close by itself the moment the
 * prop went false, hiding what the payer was working on.
 */
function Fold({ className, summary, force, children }: {
  className: string; summary: ReactNode; force: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(force);
  useEffect(() => { if (force) setOpen(true); }, [force]);
  return (
    <details className={className} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

const LABEL: Record<CsvField, string> = { invoiceId: "Invoice", token: "Token", to: "Recipient", amount: "Amount" };
const ORDER: readonly CsvField[] = ["invoiceId", "token", "to", "amount"];

/**
 * The sheet on a phone (spec 2026-09-26-csv-sheet-editor §5.3): the columns
 * and their roles first, then one card per line with the fields the template
 * names; other columns fold under More. A tap opens a field in place.
 */
export default function SheetCards({ view, onEdit, onLine, onAddLine, open, focusSeq, head, ghostHead, status }: {
  view: GridView;
  onEdit: (line: number, col: ColumnId, text: string) => void;
  onLine: (line: number, action: LineAction) => void;
  onAddLine: () => void;
  open?: CellPos & { seq: number };
  focusSeq?: number;
  head?: (c: GridColumn) => ReactNode;
  ghostHead?: (g: GhostColumn) => ReactNode;
  status?: ReactNode;
}) {
  const [editing, setEditing] = useState<CellPos & { initial: string }>();
  const focusNext = useRef<string | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    focusNext.current = undefined;
    document.getElementById(id)?.focus();
  });

  useEffect(() => {
    if (!open) return;
    const cell = view.rows.find((r) => r.line === open.line)?.cells.find((c) => c.col === open.col);
    if (!cell) return;
    setEditing({ line: open.line, col: open.col, initial: cell.text });
    document.getElementById(cell.id)?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (focusSeq === undefined) return;
    rootRef.current?.querySelector<HTMLElement>(".card-value")?.focus();
  }, [focusSeq]);

  const roleCols = ORDER.map((f) => view.columns.find((c) => c.role === f)).filter((c): c is GridColumn => !!c);
  const shown = roleCols.length > 0 ? roleCols : view.columns;
  const more = roleCols.length > 0 ? view.columns.filter((c) => c.role === "unused") : [];

  const field = (r: GridRow, c: GridColumn, label: string) => {
    const cell = r.cells.find((x) => x.col === c.id)!;
    const isEditing = editing?.line === r.line && editing.col === c.id;
    return (
      <div key={c.id} className={`card-field${cell.problem ? " has-problem" : ""}${cell.edited ? " is-edited" : ""}`}>
        <span className="card-label">{label}</span>
        {isEditing ? (
          <CellEditor
            initial={editing!.initial}
            label={`Line ${r.line}, ${label}`}
            onKeep={(text) => { setEditing(undefined); if (text !== cell.text) onEdit(r.line, c.id, text); focusNext.current = cell.id; }}
            onCancel={() => { setEditing(undefined); focusNext.current = cell.id; }}
          />
        ) : (
          <button
            type="button"
            id={cell.id}
            className="card-value hex"
            disabled={r.state === "deleted"}
            aria-describedby={cell.problem ? `${cell.id}-p` : undefined}
            onClick={() => setEditing({ line: r.line, col: c.id, initial: cell.text })}
          >
            {cell.text || "(empty)"}
          </button>
        )}
        {cell.problem && <span id={`${cell.id}-p`} className="card-problem">{cell.problem}</span>}
        {cell.edited && !isEditing && <span className="because">was {cell.was || "(empty)"}</span>}
      </div>
    );
  };

  return (
    <div className="sheet sheet-narrow" ref={rootRef}>
      <Fold className="sheet-columns" summary="Columns" force={view.ghosts.length > 0}>
        <ul>
          {view.columns.map((c) => <li key={c.id}>{head ? head(c) : c.name}</li>)}
          {view.ghosts.map((g) => <li key={g.role}>{ghostHead ? ghostHead(g) : `${g.role} missing`}</li>)}
        </ul>
      </Fold>
      {view.above.length > 0 && <AboveHeader above={view.above} onUse={(line) => onLine(line, "header")} />}
      <ol className="sheet-cards">
        {view.rows.map((r) => {
          const invoice = roleCols.find((c) => c.role === "invoiceId");
          const title = (invoice && r.cells.find((x) => x.col === invoice.id)?.text) || r.cells.find((x) => x.text)?.text || "";
          const inMore = more.some((c) => editing?.line === r.line && editing.col === c.id);
          return (
            <li key={r.line} className={`sheet-card is-${r.state}`}>
              <div className="card-head">
                <strong>Line {r.label}{title ? ` · ${title}` : ""}</strong>
                <LineMenu line={r.line} state={r.state} isNew={r.isNew} onAction={(a) => onLine(r.line, a)} />
              </div>
              {r.message && <p className="card-problem">{r.message}</p>}
              {r.raw !== undefined && <pre className="hex fix-raw">{r.raw}</pre>}
              {shown.map((c) => field(r, c, c.role === "unused" ? c.name : LABEL[c.role]))}
              {more.length > 0 && (
                <Fold className="card-more" summary={`More: ${more.map((c) => c.name).join(", ")}`} force={inMore}>
                  {more.map((c) => field(r, c, c.name))}
                </Fold>
              )}
            </li>
          );
        })}
      </ol>
      <p className="sheet-foot">
        <Button onClick={onAddLine}>+ Add a line</Button>
        {status}
      </p>
    </div>
  );
}
