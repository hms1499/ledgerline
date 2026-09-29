"use client";

import { usePathname } from "next/navigation";
import { pageMotion } from "@/lib/motion";

/**
 * Every public page arrives with page-in, except the receipt: `/r` keeps only
 * its print-in (spec 2026-09-29 §2.1), and its markup stays as it was.
 */
export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  if (!pageMotion(usePathname())) return children;
  return <div className="page-in">{children}</div>;
}
