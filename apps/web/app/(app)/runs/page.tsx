import RunHistory from "./RunHistory";

export const metadata = { title: "Your payout runs — Ledgerline" };

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const v = q["n"];
  return <RunHistory networkName={Array.isArray(v) ? (v[0] ?? null) : (v ?? null)} />;
}
