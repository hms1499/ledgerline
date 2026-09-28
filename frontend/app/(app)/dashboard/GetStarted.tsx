"use client";

import Link from "next/link";
import { Button, Skeleton } from "antd";
import type { Address } from "@ledgerline/core";
import Tape from "@/components/ui/Tape";
import OpenRunByHash from "@/components/OpenRunByHash";
import { short } from "@/lib/chain";
import { sampleCsvHref } from "@/lib/sample-csv";
import { feeHelp, setupSteps, type SetupStep } from "@/lib/dashboard-view";

const MARK: Record<SetupStep["state"], string> = { done: "✓", todo: "✗", unknown: "?", loading: "…" };
const SAID: Record<SetupStep["state"], string> = { done: "done", todo: "to do", unknown: "not known", loading: "checking" };

/** A wallet and no runs yet: what is still needed, one action each (spec §3.2). */
export default function GetStarted({
  address, network, wrongChain, switching, balances, usdc, newRunHref, tryTestnetHref, onSwitch, onRetry,
}: {
  address: string;
  network: "mainnet" | "testnet";
  wrongChain: boolean;
  switching: boolean;
  /** Undefined while reading; USDC absent = its read failed. */
  balances: Record<string, bigint> | undefined;
  usdc: Address;
  newRunHref: string;
  /** Mainnet only: the same flow on testnet, where nothing has value. */
  tryTestnetHref: string | undefined;
  onSwitch: () => void;
  onRetry: () => void;
}) {
  const fee = feeHelp(network);
  const body = (s: SetupStep) => {
    switch (s.key) {
      case "wallet":
        return <span className="hex addr" title={address}>{short(address)}</span>;
      case "network":
        return s.state === "todo"
          ? <Button size="small" loading={switching} onClick={onSwitch}>Switch to Arc {network}</Button>
          : null;
      case "fees":
        if (s.state === "loading") return <Skeleton.Input active size="small" />;
        if (s.state === "unknown") {
          return <>Couldn&apos;t read this wallet&apos;s balance. <Button size="small" onClick={onRetry}>Retry</Button></>;
        }
        if (s.state === "done") return "Arc takes its network fee in USDC.";
        return (
          <>
            Arc takes its network fee in USDC. {fee.text}
            {fee.link && <> <a href={fee.link.href} target="_blank" rel="noreferrer">{fee.link.text}</a></>}
          </>
        );
      case "first":
        return (
          <span className="setup-actions">
            <Link href={newRunHref} className="button-primary">Create a payout run</Link>
            <a href={sampleCsvHref()} download="ledgerline-sample.csv">Download the sample file</a>
            {tryTestnetHref && <Link href={tryTestnetHref}>Try it on testnet first</Link>}
          </span>
        );
    }
  };

  return (
    <Tape title="Get started">
      <ol className="setup">
        {setupSteps({ wrongChain, balances, usdc, network }).map((s) => (
          <li key={s.key} className={`is-${s.state}`}>
            <span className="mark" aria-hidden="true">{MARK[s.state]}</span>
            <span className="setup-text">
              <strong>{s.title}</strong> <span className="sr-only">({SAID[s.state]})</span>
              <span className="setup-body">{body(s)}</span>
            </span>
          </li>
        ))}
      </ol>
      <OpenRunByHash network={network} />
    </Tape>
  );
}
