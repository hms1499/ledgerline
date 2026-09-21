import Why from "./Why";

export const metadata = { title: "Why this differs — Ledgerline" };

export default async function WhyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const one = (k: string) => {
    const v = q[k];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };

  // Every hash is overridable from the URL. A judge who wants to check the
  // comparison against a different pair of transactions should not have to
  // take our configured pair on trust.
  return (
    <Why
      networkName={one("n")}
      oursHash={one("ours")}
      naiveHash={one("naive")}
      approveHash={one("approve")}
    />
  );
}
