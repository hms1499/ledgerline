import { getAddress, isAddress } from "viem";
import { isBlankLine, type ColumnId, type FileLine, type ParsedCsv, type ParsedRow } from "@ledgerline/core";
import {
  clearRole, deleteLine, dropColumn, putBack, restoreLine, undoBatch, undoCell, type SheetEdits,
} from "@/lib/sheet-edits";

export interface ChangeEntry { id: string; text: string; undo: SheetEdits }
export interface ChangesView { entries: ChangeEntry[]; note?: string }

/** A column as the payer knows it: its name in the file, or the name it was added under. */
export function columnName(sheet: ParsedCsv, edits: SheetEdits, col: ColumnId): string {
  if (col.startsWith("f")) {
    const i = Number(col.slice(1));
    return sheet.header[i]?.trim() || `Column ${i + 1}`;
  }
  return edits.newColumns.find((c) => c.id === col)?.name ?? col;
}

/**
 * Every change made on the Review step, each with the Undo that drops it:
 * the header, columns, batches, single cells by line, then lines added,
 * deleted and left out. An address shows in full, checksummed, on both sides.
 */
export function changesView({ lines, sheet, edits }: {
  lines: readonly FileLine[]; sheet: ParsedCsv; edits: SheetEdits;
}): ChangesView {
  const entries: ChangeEntry[] = [];
  const name = (col: ColumnId) => columnName(sheet, edits, col);

  if (edits.headerLine !== undefined) {
    entries.push({ id: "header", text: `Header · line ${edits.headerLine}`, undo: { ...edits, headerLine: undefined } });
  }
  for (const [col, role] of Object.entries(edits.roles) as [`f${number}`, string][]) {
    entries.push({ id: `role:${col}`, text: `${name(col)} · ${role === "unused" ? "not used" : role}`, undo: clearRole(edits, col) });
  }
  for (const c of edits.newColumns) {
    entries.push({
      id: `column:${c.id}`, text: `Column ${c.name} added${c.fill ? ` · ${c.fill} on every line` : ""}`,
      undo: dropColumn(edits, c.id),
    });
  }
  for (const b of edits.batches) entries.push({ id: `batch:${b.id}`, text: b.title, undo: undoBatch(edits, b.id) });

  const inBatch = new Set(edits.batches.flatMap((b) => b.cells.map(([l, c]) => `${l}:${c}`)));
  const byLine = new Map(sheet.rows.map((r) => [r.line, r]));
  const asRead = (row: ParsedRow | undefined, col: ColumnId) =>
    col.startsWith("f")
      ? (row && !row.unreadable ? row.cells[Number(col.slice(1))] ?? "" : "")
      : edits.newColumns.find((c) => c.id === col)?.fill ?? "";
  const show = (col: ColumnId, text: string) => {
    const t = text.trim();
    return sheet.roles[col] === "to" && isAddress(t) ? getAddress(t) : t || "(empty)";
  };
  for (const line of Object.keys(edits.cells).map(Number).sort((a, b) => a - b)) {
    if (edits.newLines.includes(line) || edits.deleted.includes(line)) continue;
    for (const col of Object.keys(edits.cells[line] ?? {}) as ColumnId[]) {
      if (inBatch.has(`${line}:${col}`)) continue;
      const before = asRead(byLine.get(line), col);
      const after = edits.cells[line]![col] ?? "";
      entries.push({
        id: `cell:${line}:${col}`, text: `Line ${line} · ${name(col)} · ${show(col, before)} → ${show(col, after)}`,
        undo: undoCell(edits, line, col),
      });
    }
  }

  for (const line of edits.newLines) entries.push({ id: `added:${line}`, text: `Line ${line} · added`, undo: deleteLine(edits, line) });
  for (const line of edits.deleted) entries.push({ id: `deleted:${line}`, text: `Line ${line} · deleted`, undo: restoreLine(edits, line) });
  for (const line of edits.leftOut) {
    entries.push({ id: `left-out:${line}`, text: `Line ${line} · left out of this run`, undo: putBack(edits, line) });
  }

  const h = sheet.headerLine;
  const above = lines.slice(0, Math.max(h - 1, 0))
    .filter((l, i) => !isBlankLine(i === 0 ? l.body.replace(/^﻿/, "") : l.body, sheet.delimiter)).length;
  const note = above === 0 ? undefined
    : h === 2 ? "Line 1 is above the header and is not in the corrected file."
    : `Lines 1–${h - 1} are above the header and are not in the corrected file.`;
  return { entries, ...(note ? { note } : {}) };
}
