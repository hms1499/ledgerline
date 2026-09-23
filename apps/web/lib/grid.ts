export interface ColLayout { span?: number; start?: number }
export interface ColProps extends ColLayout {
  /** 640–1023px. A number is a span. Absent: same as lg. */
  md?: ColLayout | number;
  /** Below 640px. A number is a span. Absent: full width. */
  sm?: ColLayout | number;
  /** Sticks while scrolling, at lg only. */
  sticky?: boolean;
}

const asLayout = (l: ColLayout | number | undefined): ColLayout | undefined =>
  typeof l === "number" ? { span: l } : l;

function check({ span = 12, start }: ColLayout): void {
  if (!Number.isInteger(span) || span < 1 || span > 12) {
    throw new RangeError(`span must be 1–12, got ${span}`);
  }
  if (start !== undefined && (!Number.isInteger(start) || start < 1 || start + span > 13)) {
    throw new RangeError(`start ${start} with span ${span} does not fit 12 columns`);
  }
}

/**
 * CSS custom properties that globals.css turns into grid-column at each
 * breakpoint. Variables rather than 12×3 generated classes: one rule per
 * breakpoint, and the placement is readable in devtools.
 */
export function colVars(p: ColProps): Record<string, string> {
  const lg: ColLayout = { span: p.span ?? 12, start: p.start };
  const md: ColLayout = asLayout(p.md) ?? lg;
  const sm: ColLayout = asLayout(p.sm) ?? { span: 12 };
  for (const l of [lg, md, sm]) check(l);
  const out = (l: ColLayout) => [String(l.span ?? 12), l.start ? String(l.start) : "auto"] as const;
  const [s, st] = out(lg); const [ms, mst] = out(md); const [ss, sst] = out(sm);
  return {
    "--span": s, "--start": st,
    "--md-span": ms, "--md-start": mst,
    "--sm-span": ss, "--sm-start": sst,
  };
}

/**
 * `dense` lets a column placed to the right with `start` share a row with a
 * column that comes after it in the DOM. /new needs that: its summary comes
 * first in reading order (so a phone shows it before the Send button) but
 * sits on the right at lg. Opt-in, because dense packing can reorder
 * anything that leaves a hole.
 */
export function gridClass({ dense, className }: { dense?: boolean; className?: string }): string {
  return ["grid", dense ? "is-dense" : "", className ?? ""].filter(Boolean).join(" ");
}
