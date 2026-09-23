import CreateRun from "./CreateRun";

export const metadata = { title: "New payout run — Ledgerline" };

export default async function NewRunPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const v = q["n"];
  return <CreateRun networkName={Array.isArray(v) ? (v[0] ?? null) : (v ?? null)} />;
}
