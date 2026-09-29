"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import Mark from "@/components/ui/Mark";
import { contractLine } from "@/lib/site-footer";
import { networkFor, type NetworkView } from "@/lib/chain";

const RECONCILE = "npx arc-reconcile <tx>";

/**
 * The end of / and /why (home polish spec §3.5): a full-width band like the
 * header, its content in the same frame. PublicShell renders it after <main>,
 * so it is the page's contentinfo landmark. Not on /r — a recipient needs
 * only their receipt.
 *
 * Takes the network's name, not its view: viem's chain object carries
 * functions that cannot cross from a server component into this one.
 */
export default function SiteFooter({ network }: { network: NetworkView["name"] }) {
  const net = networkFor(network);
  const [copied, setCopied] = useState(false);
  const contract = contractLine(net);

  const copy = async (e: MouseEvent<HTMLButtonElement>) => {
    const code = e.currentTarget.parentElement?.querySelector("code");
    try {
      await navigator.clipboard.writeText(RECONCILE);
      setCopied(true);
    } catch {
      // Some browsers refuse the clipboard: select the command to copy by hand.
      if (code) window.getSelection()?.selectAllChildren(code);
    }
  };

  return (
    <footer className="site-footer">
      <div className="frame">
        <div className="tape-head">
          <strong className="brand-inline"><Mark size={11} /> Ledgerline</strong>
          <span>Arc {net.name} · chain {net.chain.id}</span>
        </div>
        <div className="site-footer-cols">
          <section>
            <h2 className="label site-footer-h">Check it without us</h2>
            <div className="command">
              <code>{RECONCILE}</code>
              <button type="button" className="command-copy" onClick={(e) => void copy(e)}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="because">
              Rebuilds any run&apos;s table from the chain alone. Receipts do the same in the
              recipient&apos;s own browser.
            </p>
          </section>
          <section>
            <h2 className="label site-footer-h">Read more</h2>
            <ul className="site-footer-links">
              <li><Link href={`/why?n=${net.name}`}>How this differs from an ordinary batch</Link></li>
              <li><a href="https://github.com/hms1499/ledgerline" target="_blank" rel="noreferrer">Source code</a></li>
              {contract && (
                <li><a href={contract.href} target="_blank" rel="noreferrer">The recorded-lists contract ↗</a></li>
              )}
            </ul>
          </section>
        </div>
        <div className="site-footer-end">
          {contract && <span><span aria-hidden="true"># </span>Recorded lists {contract.short}</span>}
          <span>Never holds funds · no admin · no upgrades</span>
        </div>
        <p className="site-footer-fin" aria-hidden="true">✱ ✱ ✱</p>
      </div>
    </footer>
  );
}
