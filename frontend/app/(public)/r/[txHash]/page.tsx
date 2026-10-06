import type { Metadata } from "next";
import Receipt from "./Receipt";

/**
 * The one link a payer sends: it should share as a receipt, not as a bare
 * URL. The title carries the transaction, so a chat preview already says
 * what the page is before anyone opens it.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ txHash: string }>;
}): Promise<Metadata> {
  const { txHash } = await params;
  return {
    title: `Payment advice ${txHash.slice(0, 6)}…${txHash.slice(-4)} — Ledgerline`,
    description:
      "A receipt that checks itself: the invoice, its reference and the proof all come from the chain.",
  };
}

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ txHash: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { txHash } = await params;
  const q = await searchParams;
  const one = (k: string) => {
    const v = q[k];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };

  return (
    <Receipt
      txHash={txHash}
      invoiceId={one("i")}
      runSalt={one("s")}
      proofRaw={one("p")}
      networkName={one("n")}
    />
  );
}
