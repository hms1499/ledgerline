import Link from "next/link";

export default function Home() {
  return (
    <main className="sheet">
      <div className="masthead">
        <strong>Ledgerline</strong>
        <span>Arc</span>
      </div>

      <section className="line">
        <div>
          <p className="amount">
            0.10<span className="unit">USDC</span>
          </p>
          <p className="payee">to 0xe48A…732a</p>
        </div>
        <span className="reference">INV-US-001</span>
      </section>

      <section className="verdict ok">
        <h1>A payment that carries its own invoice</h1>
        <p>
          Batched stablecoin payouts on Arc where every payment records what it paid for,
          on chain. Payer and recipient can each reconcile the same transaction without
          trusting the other, or us.
        </p>
      </section>

      <p style={{ marginTop: "2rem", maxWidth: "62ch" }}>
        Open a receipt at <code>/r/&lt;txHash&gt;?i=&lt;invoice&gt;&amp;s=&lt;salt&gt;</code>, or
        rebuild the whole reconciliation table from a transaction hash with{" "}
        <code>npx arc-reconcile</code>.
      </p>

      <footer className="footer">
        <Link href="/why">How this differs from an ordinary batch</Link>
      </footer>
    </main>
  );
}
