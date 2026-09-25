"use client";

import { Button, Modal } from "antd";
import { noWalletHelp, WALLET_INSTALL } from "@/lib/wallet-help";

/** Shown by any Connect button when no wallet is installed: what to get,
 *  and a reload for when it is. */
export default function NoWalletDialog({
  open, network, onClose,
}: { open: boolean; network: "mainnet" | "testnet"; onClose: () => void }) {
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
