"use client";

import Link from "next/link";
import { Skeleton } from "antd";
import type { Address } from "@ledgerline/core";
import Tape from "@/components/ui/Tape";
import { short } from "@/lib/chain";
import { balanceText, type TokenMeta } from "@/lib/dashboard-view";

/** What the paying wallet holds now, from balanceOf in each token's own
 *  decimals, beside the one action a payer comes back for (spec §3.3). */
export default function WalletPanel({ address, tokens, balances, meta, newRunHref }: {
  address: string;
  tokens: Address[];
  /** Keyed by lowercased token; absent = could not be read. Undefined while reading. */
  balances: Record<string, bigint> | undefined;
  meta: Record<string, TokenMeta> | undefined;
  newRunHref: string;
}) {
  return (
    <Tape title="Your wallet">
      <p className="wallet-addr"><span className="hex addr" title={address}>{short(address)}</span></p>
      <ul className="balances">
        {tokens.map((t) => (
          <li key={t}>
            {balances && meta
              ? balanceText(balances[t.toLowerCase()], t, meta[t.toLowerCase()] ?? {})
              : <Skeleton.Input active size="small" />}
          </li>
        ))}
      </ul>
      <p className="wallet-cta"><Link href={newRunHref} className="button-primary">New payout run</Link></p>
    </Tape>
  );
}
