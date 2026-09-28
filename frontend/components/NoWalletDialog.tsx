"use client";

import { useEffect, useState } from "react";
import { Button, Modal } from "antd";
import {
  isPhoneBrowser, metamaskDappLink, noWalletHelp, phoneWalletHelp, WALLET_INSTALL,
} from "@/lib/wallet-help";

/** Shown by any Connect button when no wallet is installed: what to get,
 *  and a reload for when it is. On a phone, where nothing can be installed
 *  into the browser, how to open this page inside a wallet app instead. */
export default function NoWalletDialog({
  open, network, onClose,
}: { open: boolean; network: "mainnet" | "testnet"; onClose: () => void }) {
  // Read when the dialog opens, never during render: the server has no
  // navigator, and a first paint that disagreed with it would not hydrate.
  const [here, setHere] = useState<{ phone: boolean; href: string }>();
  useEffect(() => {
    if (open) setHere({ phone: isPhoneBrowser(navigator), href: window.location.href });
  }, [open]);

  if (here?.phone) return <PhoneHelp open={open} network={network} href={here.href} onClose={onClose} />;

  const h = noWalletHelp(network);
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={h.title}
      width={440}
      footer={[
        <Button key="close" onClick={onClose}>Close</Button>,
        <Button key="reload" type="primary" onClick={() => window.location.reload()}>Reload the page</Button>,
      ]}
    >
      <p style={{ marginTop: 0 }}>
        {h.install}{" "}
        {WALLET_INSTALL.map((w, i) => (
          <span key={w.name}>
            {i > 0 && " · "}
            <a href={w.href} target="_blank" rel="noreferrer">{w.name}</a>
          </span>
        ))}
      </p>
      <p>
        {h.funds}
        {h.fundsLink && <> <a href={h.fundsLink.href} target="_blank" rel="noreferrer">{h.fundsLink.text}</a>.</>}
      </p>
      <p className="because" style={{ marginBottom: 0 }}>{h.kind}</p>
    </Modal>
  );
}

function PhoneHelp({
  open, network, href, onClose,
}: { open: boolean; network: "mainnet" | "testnet"; href: string; onClose: () => void }) {
  const h = phoneWalletHelp(network);
  const metamask = metamaskDappLink(href);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <Modal open={open} onCancel={onClose} title={h.title} width={440}
      footer={[<Button key="close" onClick={onClose}>Close</Button>]}>
      <p style={{ marginTop: 0 }}>{h.body}</p>
      {metamask && (
        <>
          <Button type="primary" block href={metamask}>{h.metamask}</Button>
          <p className="because" style={{ marginTop: 8 }}>{h.metamaskMissing}</p>
        </>
      )}
      <p>{h.others}</p>
      <p style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Shown as text too, so it can be copied by hand where the
            clipboard is refused. */}
        <span className="hex" style={{ wordBreak: "break-all", flex: "1 1 12rem" }}>{href}</span>
        <Button onClick={() => {
          void navigator.clipboard?.writeText(href).then(() => setCopied(true), () => {});
        }}>
          {copied ? "Copied" : "Copy link"}
        </Button>
      </p>
      <p>
        {h.funds}
        {h.fundsLink && <> <a href={h.fundsLink.href} target="_blank" rel="noreferrer">{h.fundsLink.text}</a>.</>}
      </p>
      <p className="because" style={{ marginBottom: 0 }}>{h.kind}</p>
    </Modal>
  );
}
