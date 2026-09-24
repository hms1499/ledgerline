"use client";

import Link from "next/link";
import type { MouseEventHandler } from "react";
import Mark from "@/components/ui/Mark";

/** ✱ LEDGERLINE. Its own class, so no shell's rule can hide another shell's logo. */
export default function Brand({ href, onClick }: { href: string; onClick?: MouseEventHandler }) {
  return (
    <Link href={href} onClick={onClick} className="brand">
      <Mark size={15} />
      <span className="brand-word">Ledgerline</span>
    </Link>
  );
}
