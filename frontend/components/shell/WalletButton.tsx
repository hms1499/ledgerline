"use client";

import { useEffect } from "react";
import { Button, Dropdown, Space, message, type MenuProps } from "antd";
import { useWallet } from "@/components/wallet/WalletProvider";
import { short } from "@/lib/chain";
import { walletMenu, type WalletMenuKey } from "@/lib/wallet-menu";

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

  const address = w.wallet.address;
  const act: Partial<Record<WalletMenuKey, () => void>> = {
    copy: () => { void navigator.clipboard.writeText(address); void toast.success("Address copied"); },
    disconnect: () => void w.disconnect(),
  };
  const items: MenuProps["items"] = walletMenu({
    address, chainId: w.wallet.chainId, wrongChain: w.wrongChain, held: w.held,
  }).flatMap((i) => [
    ...(i.key === "disconnect" || (i.key === "copy" && w.wrongChain) ? [{ type: "divider" as const }] : []),
    {
      key: i.key,
      disabled: i.disabled,
      onClick: act[i.key],
      label: i.key === "explorer"
        ? <a href={`${w.net.explorer}/address/${address}`} target="_blank" rel="noreferrer">{i.label}</a>
        : i.key === "who" ? <span className="hex addr">{i.label}</span> : i.label,
    },
  ]);

  // On the wrong chain the switch is the one thing to press, replacing the
  // two primary buttons the audit found on /new. The menu stays beside it,
  // so which account is connected, and Disconnect, never wait on a switch.
  if (w.wrongChain) {
    return (
      <>
        {holder}
        <Space.Compact>
          <Button className="wallet-wrong-chain" loading={w.switching} onClick={() => void w.switchToArc()}
            title={w.switchError} aria-label={`Switch to Arc ${w.net.name}`}>
            {/* The badge beside it names the network; a phone's header has
                room for the verb alone, down to 320px. */}
            <span className="hide-sm">Switch to Arc {w.net.name}</span>
            <span className="only-sm" aria-hidden="true">Switch</span>
          </Button>
          <Dropdown trigger={["click"]} menu={{ items }}>
            <Button className="wallet-wrong-chain wallet-caret" aria-label={`Wallet ${short(address)}`}>
              <span aria-hidden="true">▾</span>
            </Button>
          </Dropdown>
        </Space.Compact>
      </>
    );
  }

  return (
    <>
      {holder}
      <Dropdown trigger={["click"]} menu={{ items }}>
        <Button className="wallet-chip"><span className="hex addr">{short(address)}</span></Button>
      </Dropdown>
    </>
  );
}
