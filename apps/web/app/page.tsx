import Link from "next/link";
import { defaultNetwork } from "@/lib/chain";
import { sampleCsvHref } from "@/lib/sample-csv";

export default function Home() {
  const net = defaultNetwork();
  const testnet = net.name === "testnet";

  return (
    <main className="sheet">
      <div className="masthead">
        <strong>Ledgerline</strong>
        <span className={testnet ? "network network--test" : "network"}>Arc {net.name}</span>
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
          Pay a list of invoices in USDC, EURC or cirBTC in one transaction on Arc. Each
          payment records which invoice it settles, on chain, so you and the people you pay
          can each check it without a shared spreadsheet — or trusting us.
        </p>
      </section>

      <div className="home-actions">
        <Link href="/new" className="button-primary">Create a payout run</Link>
        <Link href="/runs">Runs you have sent</Link>
      </div>

      {testnet && (
        <p className="testnet-note">
          This is Arc testnet: tokens here have no value, so nothing you do can lose real
          money. Get test USDC from the{" "}
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle faucet</a>
          {" "}— you need a little USDC for network fees even when paying other tokens.
        </p>
      )}

      <section className="how">
        <h2>How a run works</h2>
        <ol>
          <li>
            <span className="how-step">1</span>
            <div>
              <h3>Upload a list of invoices</h3>
              <p>
                A CSV with one line per payment: invoice, token, recipient, amount.{" "}
                <a href={sampleCsvHref()} download="ledgerline-sample.csv">Download a sample</a>{" "}
                to start from. It stays in your browser.
              </p>
            </div>
          </li>
          <li>
            <span className="how-step">2</span>
            <div>
              <h3>Check it, then pay in one transaction</h3>
              <p>
                Every payment is tried against the chain before you pay, so a short balance
                or a transfer the token would refuse shows up before any money moves. Then
                one transaction pays every line.
              </p>
            </div>
          </li>
          <li>
            <span className="how-step">3</span>
            <div>
              <h3>Send each recipient their receipt link</h3>
              <p>
                The link shows what was paid and which invoice it settles, checked against
                the chain in their own browser. They need no account and nothing from us.
              </p>
            </div>
          </li>
        </ol>
        <p className="how-note">
          Your wallet signs directly, so it must be an ordinary wallet such as MetaMask or
          Rabby. Safe and other smart-contract wallets can&apos;t pay through Arc&apos;s memo
          contract.
        </p>
      </section>

      <footer className="footer home-footer">
        <Link href="/why">How this differs from an ordinary batch payment</Link>
        <span>
          For developers: rebuild any run&apos;s reconciliation with{" "}
          <code>npx arc-reconcile</code>.
        </span>
      </footer>
    </main>
  );
}
