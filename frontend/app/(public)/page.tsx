import Link from "next/link";
import { defaultNetwork } from "@/lib/chain";
import { sampleCsvHref } from "@/lib/sample-csv";
import { Grid, Col } from "@/components/grid/Grid";
import Tape from "@/components/ui/Tape";

export default function Home() {
  const net = defaultNetwork();
  const testnet = net.name === "testnet";

  return (
    <Grid>
      <Col span={7} md={12}>
        <section className="verdict ok hero">
          <h1>A payment that carries its own invoice</h1>
          <p>
            Pay a list of invoices in USDC, EURC or cirBTC in one transaction on Arc. Each
            payment records which invoice it settles, on chain, so you and the people you pay
            can each check it without a shared spreadsheet — or trusting us.
          </p>
        </section>
        <div className="home-actions">
          <Link href="/new" className="button-primary">Create a payout run</Link>
          <Link href="/dashboard">Open your dashboard</Link>
        </div>
      </Col>

      <Col span={5} md={12}>
        {/* Labelled so it is never read as someone's real payment. */}
        <Tape head={<><strong>Example</strong><span>what a recipient sees</span></>}>
          <section className="line">
            <div>
              <p className="amount">0.10<span className="unit">USDC</span></p>
              <p className="payee">to 0xe48A…732a</p>
            </div>
            <span className="reference">INV-US-001</span>
          </section>
        </Tape>
      </Col>

      {!testnet && (
        <Col span={12}>
          <p className="network-note">
            This is Arc mainnet: a payout run moves real money. To try it first with tokens
            that have no value, use the{" "}
            <Link href="/new?n=testnet">testnet version</Link>.
          </p>
        </Col>
      )}

      {testnet && (
        <Col span={12}>
          <p className="network-note">
            This is Arc testnet: tokens here have no value, so nothing you do can lose real
            money. Get test USDC from the{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle faucet</a>
            {" "}— you need a little USDC for network fees even when paying other tokens.
          </p>
        </Col>
      )}

      <Col span={12}><h2 className="section-title">How a run works</h2></Col>

      <Col span={4} md={12}>
        <Tape className="how-card">
          <span className="how-step">1</span>
          <h3>Upload a list of invoices</h3>
          <p>
            A CSV with one line per payment: invoice, token, recipient, amount.{" "}
            <a href={sampleCsvHref()} download="ledgerline-sample.csv">Download a sample</a>{" "}
            to start from. It stays in your browser.
          </p>
        </Tape>
      </Col>
      <Col span={4} md={12}>
        <Tape className="how-card">
          <span className="how-step">2</span>
          <h3>Check it, then pay in one transaction</h3>
          <p>
            Every payment is tried against the chain before you pay, so a short balance
            or a transfer the token would refuse shows up before any money moves. Then
            one transaction pays every line.
          </p>
        </Tape>
      </Col>
      <Col span={4} md={12}>
        <Tape className="how-card">
          <span className="how-step">3</span>
          <h3>Send each recipient their receipt link</h3>
          <p>
            The link shows what was paid and which invoice it settles, checked against
            the chain in their own browser. They need no account and nothing from us.
          </p>
        </Tape>
      </Col>

      <Col span={12}>
        <p className="how-note">
          Your wallet signs directly, so it must be an ordinary wallet such as MetaMask or
          Rabby. Safe and other smart-contract wallets can&apos;t pay this way on
          Arc.
        </p>
        <footer className="footer home-footer">
          <Link href="/why">How this differs from an ordinary batch payment</Link>
          <span>
            For developers: rebuild any run&apos;s reconciliation with{" "}
            <code>pnpm reconcile &lt;tx&gt;</code> from the{" "}
            <a href="https://github.com/hms1499/ledgerline" target="_blank" rel="noreferrer">source</a>.
          </span>
        </footer>
      </Col>
    </Grid>
  );
}
