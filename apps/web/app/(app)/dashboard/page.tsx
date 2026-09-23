import Link from "next/link";
import { Grid, Col } from "@/components/grid/Grid";
import { withNet } from "@/lib/nav";

export const metadata = { title: "Dashboard — Ledgerline" };

export default async function DashboardPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const n = (await searchParams)["n"];
  const search = { get: (k: string) => (k === "n" && typeof n === "string" ? n : null) };
  return (
    <Grid>
      <Col span={8} md={12}>
        <section className="verdict">
          <h1>Your dashboard is coming next</h1>
          <p>
            For now, start a payout or open the runs you have sent from this browser.
          </p>
        </section>
        <p style={{ marginTop: 16, display: "flex", gap: 16 }}>
          <Link href={withNet("/new", search)}>Create a payout run</Link>
          <Link href={withNet("/runs", search)}>Runs you have sent</Link>
        </p>
      </Col>
    </Grid>
  );
}
