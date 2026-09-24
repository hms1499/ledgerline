import type { ReactNode } from "react";

export type StatTone = "success" | "warning" | "danger";

/** A figure with its label. Tone colours the value; the value's words carry
 *  the meaning, so colour is never the only signal. */
export default function StatTile({
  label, value, tone, sub,
}: { label: string; value: ReactNode; tone?: StatTone; sub?: ReactNode }) {
  return (
    <div className="stat-tile">
      <p className="stat-label">{label}</p>
      <div className={tone ? `stat-value is-${tone}` : "stat-value"}>{value}</div>
      {sub !== undefined && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
