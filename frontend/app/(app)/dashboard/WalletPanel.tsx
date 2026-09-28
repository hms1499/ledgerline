"use client";

import Link from "next/link";
import { Skeleton } from "antd";
import { Col } from "@/components/grid/Grid";
import StatTile from "@/components/ui/StatTile";
import { short } from "@/lib/chain";
import type { TokenCard } from "@/lib/dashboard-view";

/** What the paying wallet holds of each token, beside what it paid this
 *  month, and the one action a payer comes back for. Grid columns: place it
 *  directly inside a Grid. */
export default function WalletPanel({ address, cards, newRunHref }: {
  address: string;
  cards: TokenCard[];
  newRunHref: string;
}) {
  return (
    <>
      <Col span={12}>
        <div className="wallet-head">
          <h2 className="section-title">
            Your wallet <span className="hex addr keep-case" title={address}>{short(address)}</span>
          </h2>
          <Link href={newRunHref} className="button-primary">New payout run</Link>
        </div>
      </Col>
      {cards.map((c) => (
        <Col key={c.token} span={4} md={12}>
          <StatTile
            label={<span className="keep-case">{c.label}</span>}
            value={c.balance ?? <Skeleton.Input active />}
            sub={c.paid === null ? undefined : c.paid ?? <Skeleton.Input active size="small" />}
          />
        </Col>
      ))}
    </>
  );
}
