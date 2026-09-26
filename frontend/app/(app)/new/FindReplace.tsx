"use client";

import { useState } from "react";
import { Input, Modal } from "antd";
import type { ColumnId } from "@ledgerline/core";
import { replaceInColumn, type CellEdit } from "@/lib/sheet-edits";

/** Find and replace in one column: plain text, capitals counting, the count shown before anything changes. */
export default function FindReplace({ column, values, onApply, onClose }: {
  column: { id: ColumnId; name: string };
  values: readonly { line: number; text: string }[];
  onApply: (changes: CellEdit[], title: string) => void;
  onClose: () => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const changes = replaceInColumn(values, column.id, find, replace);
  const n = changes.length;
  const cells = `${n} cell${n === 1 ? "" : "s"}`;
  return (
    <Modal
      open
      title={`Find and replace in ${column.name}`}
      okText={n > 0 ? `Replace in ${cells}` : "Replace"}
      okButtonProps={{ disabled: n === 0 }}
      cancelText="Cancel"
      focusTriggerAfterClose={false}
      onOk={() => onApply(changes, `"${find}" → "${replace}" in ${column.name}`)}
      onCancel={onClose}
    >
      <label className="fix-field">
        <span className="fix-label">Find</span>
        <Input autoFocus value={find} spellCheck={false} onChange={(e) => setFind(e.target.value)} />
      </label>
      <label className="fix-field" style={{ marginTop: 12 }}>
        <span className="fix-label">Replace with</span>
        <Input value={replace} spellCheck={false} onChange={(e) => setReplace(e.target.value)} />
      </label>
      <p className="because" aria-live="polite">
        {find === "" ? "Type the text to find. Capitals count." : `${cells} will change.`}
      </p>
    </Modal>
  );
}
