import Link from "next/link";
import { Grid, Col } from "@/components/grid/Grid";

export const metadata = { title: "Dashboard — Ledgerline" };

export default function DashboardPage() {
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
          <Link href="/new">Create a payout run</Link>
          <Link href="/runs">Runs you have sent</Link>
        </p>
      </Col>
    </Grid>
  );
}
