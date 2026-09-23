import Reconciliation from "./Reconciliation";

export const metadata = { title: "Payout run — Ledgerline" };

export default async function RunPage({
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
    <Reconciliation
      txHash={txHash} networkName={one("n")} runSalt={one("s")}
      runLabel={one("label")}
    />
  );
}
