"use client";

import { useEffect } from "react";
import { Button, Dropdown, message } from "antd";
import { useWallet } from "@/components/wallet/WalletProvider";
import { short } from "@/lib/chain";

export default function WalletButton() {
  const w = useWallet();
  const [toast, holder] = message.useMessage();

  // A connect failure is announced where the click happened, briefly. A page
  // that needs it to persist (the create flow's review step) shows it too.
  useEffect(() => {
    if (!w.error) return;
    void toast.open({
      type: w.error.type === "info" ? "info" : "error",
      content: `${w.error.title}. ${w.error.description}`,
      duration: 6,
    });
  }, [w.error, toast]);

  // A failed network switch is said out loud, not left in a tooltip that
  // touch screens and most screen readers never show.
  useEffect(() => {
    if (w.switchError) void toast.open({ type: "warning", content: w.switchError, duration: 8 });
  }, [w.switchError, toast]);

  if (!w.wallet) {
    return (
      <>
        {holder}
        <Button type="primary" loading={w.connecting} onClick={w.connect}>Connect wallet</Button>
      </>
    );
  }

  // One action on the wrong chain, replacing the two primary buttons the
  // audit found on /new.
  if (w.wrongChain) {
    return (
      <>
        {holder}
        <Button className="wallet-wrong-chain" loading={w.switching} onClick={() => void w.switchToArc()}
          title={w.switchError}>
          Switch to Arc {w.net.name}
        </Button>
      </>
    );
  }

  const address = w.wallet.address;
  return (
    <>
      {holder}
      <Dropdown
        trigger={["click"]}
        menu={{ items: [
          { key: "copy", label: "Copy address", onClick: () => { void navigator.clipboard.writeText(address); void toast.success("Address copied"); } },
          { key: "explorer", label: <a href={`${w.net.explorer}/address/${address}`} target="_blank" rel="noreferrer">View on explorer</a> },
          { type: "divider" },
          {
            key: "disconnect",
            label: w.held ? "Disconnect (after this payment settles)" : "Disconnect",
            // Disabled while a payment holds the only copy of its hash.
            disabled: w.held,
            onClick: () => void w.disconnect(),
          },
        ] }}
      >
        <Button className="wallet-chip"><span className="hex addr">{short(address)}</span></Button>
      </Dropdown>
    </>
  );
}
