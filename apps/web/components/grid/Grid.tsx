import type { CSSProperties, ReactNode } from "react";
import { colVars, type ColProps } from "@/lib/grid";

export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `grid ${className}` : "grid"}>{children}</div>;
}

export function Col({
  children, className, as: Tag = "div", sticky, ...layout
}: ColProps & { children: ReactNode; className?: string; as?: "div" | "section" | "aside" }) {
  const cls = ["col", sticky ? "is-sticky" : "", className ?? ""].filter(Boolean).join(" ");
  return <Tag className={cls} style={colVars(layout) as CSSProperties}>{children}</Tag>;
}
