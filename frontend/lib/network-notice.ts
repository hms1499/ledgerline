import type { NetworkView } from "@/lib/chain";

export interface RealFundsNotice {
  title: string;
  body: string;
  /** The same flow on testnet, where nothing has value. */
  tryHref: string;
}

/**
 * Said before anything is signed on mainnet. Testnet flags itself (the
 * badge, the home page note); mainnet looked the same as testnet until
 * this, so nothing told a payer that the next click moves real money.
 * The sample file pays a real address, so it is named here too.
 */
export function realFundsNotice(net: NetworkView): RealFundsNotice | undefined {
  if (net.name !== "mainnet") return undefined;
  return {
    title: "This run pays real money on Arc mainnet",
    body:
      "Check every recipient and amount before you pay. A payment cannot be taken back. " +
      "The sample file's recipients are placeholders: replace them with your own.",
    tryHref: "/new?n=testnet",
  };
}
