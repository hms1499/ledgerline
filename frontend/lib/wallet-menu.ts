import { chainName, short } from "@/lib/chain";

export type WalletMenuKey = "who" | "copy" | "explorer" | "disconnect";

export interface WalletMenuItem {
  key: WalletMenuKey;
  label: string;
  disabled?: boolean;
}

/**
 * The wallet menu's entries, the same on every chain. On the wrong chain the
 * top bar's one button is the switch, and this menu stays one click away
 * beside it: which account is connected, and Disconnect, must never depend on
 * first agreeing to change network. It opens with who and where, since the
 * switch button has taken the address's place.
 */
export function walletMenu(ctx: {
  address: string; chainId: number; wrongChain: boolean; held: boolean;
}): WalletMenuItem[] {
  return [
    ...(ctx.wrongChain
      ? [{ key: "who" as const, label: `${short(ctx.address)} on ${chainName(ctx.chainId)}`, disabled: true }]
      : []),
    { key: "copy", label: "Copy address" },
    { key: "explorer", label: "View on explorer" },
    {
      key: "disconnect",
      label: ctx.held ? "Disconnect (after this payment settles)" : "Disconnect",
      // Disabled while a payment holds the only copy of its hash.
      disabled: ctx.held,
    },
  ];
}
