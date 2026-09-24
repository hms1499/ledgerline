import Receipt from "./Receipt";

export const metadata = {
  title: "Payment advice — Ledgerline",
};

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
