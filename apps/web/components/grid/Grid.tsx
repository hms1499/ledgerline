import type { CSSProperties, ReactNode } from "react";
import { colVars, gridClass, type ColProps } from "@/lib/grid";

export function Grid({ children, className, dense }: { children: ReactNode; className?: string; dense?: boolean }) {
  return <div className={gridClass({ dense, className })}>{children}</div>;
}

export function Col({
  children, className, as: Tag = "div", sticky, ...layout
}: ColProps & { children: ReactNode; className?: string; as?: "div" | "section" | "aside" }) {
  const cls = ["col", sticky ? "is-sticky" : "", className ?? ""].filter(Boolean).join(" ");
  return <Tag className={cls} style={colVars(layout) as CSSProperties}>{children}</Tag>;
}
