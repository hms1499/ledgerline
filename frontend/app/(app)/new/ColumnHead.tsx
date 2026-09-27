"use client";

import { useRef } from "react";
import { Button, Dropdown, Popover } from "antd";
import type { Role } from "@ledgerline/core";
import type { GhostColumn, GridColumn } from "@/lib/sheet-grid";
import { inMain } from "@/lib/popup-container";

const ROLES: readonly Role[] = ["invoiceId", "token", "to", "amount", "unused"];
const word = (r: Role) => (r === "unused" ? "not used" : r);

/** A column's name, and a chip saying what it holds against the template. The chip changes it. */
export function ColumnHead({ column, onRole, onReplace }: {
  column: GridColumn;
  onRole: (role: Role) => void;
  onReplace: () => void;
}) {
  // A pick closes the menu, and the item that had focus goes with it: the
  // chip takes focus back, where the payer was.
  const chip = useRef<HTMLButtonElement>(null);
  const items = [
    ...ROLES.map((r) => ({ key: r, label: `${column.role === r ? "✓ " : ""}${word(r)}` })),
    { type: "divider" as const },
    { key: "replace", label: "Find and replace in this column…" },
  ];
  return (
    <>
      <span className="col-name">{column.name}</span>
      <Dropdown
        trigger={["click"]}
        getPopupContainer={inMain}
        menu={{ items, onClick: ({ key }) => {
          if (key === "replace") { onReplace(); return; }
          onRole(key as Role);
          requestAnimationFrame(() => chip.current?.focus());
        } }}
      >
        <button
          ref={chip}
          type="button"
          className={`role-chip ${column.role === "unused" ? "is-unused" : "is-set"}`}
          aria-label={`${column.name}: ${word(column.role)}. Change what this column holds`}
        >
          {column.role === "unused" ? "not used" : `${column.role} ✓`} ▾
        </button>
      </Dropdown>
    </>
  );
}

/** A column the template needs and the file lacks, and the ways to add it.
 *  Numbering shows what it will write before it writes it. */
export function GhostHead({ ghost, symbols, numberPreview, onFill, onEmpty, onNumber }: {
  ghost: GhostColumn;
  symbols: readonly string[];
  /** "October-1 to October-3, one per line." */
  numberPreview: string;
  onFill: (value: string) => void;
  onEmpty: () => void;
  onNumber: () => void;
}) {
  const content = (
    <div className="ghost-menu">
      <p className="because">{ghost.rule}</p>
      {ghost.role === "token" && (
        <>
          <p>Same token on every line:</p>
          <div className="fix-choices">
            {symbols.map((s) => <Button key={s} size="small" onClick={() => onFill(s)}>{s}</Button>)}
          </div>
        </>
      )}
      {ghost.role === "invoiceId" && (
        <>
          <p className="because">{numberPreview}</p>
          <Button size="small" onClick={onNumber}>Number them</Button>
        </>
      )}
      <Button size="small" type="link" onClick={onEmpty}>Add it empty and fill each line</Button>
      <p className="because">A column you already have under another name: choose it under that column&apos;s name.</p>
    </div>
  );
  return (
    <Popover trigger="click" getPopupContainer={inMain} title={`Add the ${ghost.role} column`} content={content}>
      <button type="button" className="role-chip is-missing" aria-label={`${ghost.role} is missing. Add it`}>
        {ghost.role} ✗ missing · + Add
      </button>
    </Popover>
  );
}
