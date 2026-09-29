"use client";

import { usePathname } from "next/navigation";
import { pageMotion } from "@/lib/motion";
import PageIn from "@/components/shell/PageIn";

/**
 * A template, not a layout: Next mounts a new one for each page, so every
 * navigation plays page-in (spec 2026-09-29 §2.1). A change of search
 * parameters alone (the ?n= network) does not remount it.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  if (!pageMotion(usePathname())) return children;
  return <PageIn>{children}</PageIn>;
}
