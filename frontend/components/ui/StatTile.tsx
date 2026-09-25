import type { ReactNode } from "react";

export type StatTone = "success" | "warning" | "danger";

/**
 * A figure with its label, on a small torn tape. Only exceptions get colour
 * (spec §3.1): "danger" prints in the ribbon, "warning" sits on the
 * highlighter, "success" stays ink. The value's words carry the meaning.
 */
export default function StatTile({
  label, value, tone, sub,
}: { label: ReactNode; value: ReactNode; tone?: StatTone; sub?: ReactNode }) {
  return (
    <div className="stat-tile">
      <p className="stat-label">{label}</p>
      <div className={tone ? `stat-value is-${tone}` : "stat-value"}><span>{value}</span></div>
      {sub !== undefined && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
