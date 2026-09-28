"use client";

import Link from "next/link";
import { Button, Skeleton } from "antd";
import Tape from "@/components/ui/Tape";
import { feeHelp, type NeedItem } from "@/lib/dashboard-view";

/** The top of the page: what the payer has to do, one action each (spec §3.3). */
export default function NeedsYou({ items, network, runHref, newRunHref, onRetry, onRemove }: {
  /** Undefined while any read is in flight: no all-clear before then. */
  items: NeedItem[] | undefined;
  network: "mainnet" | "testnet";
  runHref: (txHash: string, runLabel: string) => string;
  newRunHref: string;
  onRetry: () => void;
  onRemove: (txHash: string) => void;
}) {
  if (!items) {
    return (
      <Tape title="Needs you" state="feeding">
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      </Tape>
    );
  }
  if (items.length === 0) {
    return <Tape title="Needs you"><p className="all-clear">✓ Nothing needs you.</p></Tape>;
  }

  const fee = feeHelp(network);
  // One Retry re-reads everything, so it is offered once, on the first item that needs it.
  const firstRetry = items.find((i) => i.kind === "unreadable" || i.kind === "balances")?.key;
  const actions = (it: NeedItem) => {
    switch (it.kind) {
      case "reverted":
        return (
          <>
            <Link href={newRunHref}>Send again</Link>
            <button type="button" className="linkish" onClick={() => onRemove(it.txHash!)}>Remove</button>
          </>
        );
      case "waiting":
        return <Link href={runHref(it.txHash!, it.runLabel ?? "")}>Check</Link>;
      case "attention":
        return <Link href={runHref(it.txHash!, it.runLabel ?? "")}>Open</Link>;
      case "unreadable":
      case "balances":
        return it.key === firstRetry ? <Button size="small" onClick={onRetry}>Retry</Button> : null;
      case "no_fee":
        return fee.link
          ? <span>{fee.text} <a href={fee.link.href} target="_blank" rel="noreferrer">{fee.link.text}</a></span>
          : <span>{fee.text}</span>;
    }
  };

  return (
    <Tape title="Needs you">
      <ul className="needs">
        {items.map((it) => (
          <li key={it.key} className={`need is-${it.kind}`}>
            <span className="mark" aria-hidden="true">{it.kind === "reverted" ? "✗" : "!"}</span>
            <span className="need-text">{it.text}</span>
            <span className="need-actions">{actions(it)}</span>
          </li>
        ))}
      </ul>
    </Tape>
  );
}
