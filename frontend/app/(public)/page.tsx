import Link from "next/link";
import { defaultNetwork } from "@/lib/chain";
import { sampleCsvHref } from "@/lib/sample-csv";
import { MAINNET_PROOF as P } from "@/lib/mainnet-proof";
import { Grid, Col } from "@/components/grid/Grid";
import Tape from "@/components/ui/Tape";
import SiteFooter from "@/components/ui/SiteFooter";

const PAYS_IN = ["USDC", "EURC", "cirBTC"] as const;

const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`;

export default function Home() {
  const net = defaultNetwork();
  const testnet = net.name === "testnet";

  return (
    <Grid>
      <Col span={8} md={12}>
        <p className="label">Batched stablecoin payouts on Arc</p>
        <h1 className="display">A payment that carries its own invoice</h1>
        <p className="lede">
          Pay a list of invoices in one transaction. Each payment records which invoice it
          settles, on chain, so you and the people you pay can each check it without a shared
          spreadsheet — or trusting us.
        </p>
        <div className="home-actions">
          <Link href="/new" className="button-primary">Create a payout run</Link>
          <Link href="/dashboard">Open your dashboard</Link>
        </div>
        <p className="pays-in">
          <span className="label">Pays in</span>
          {PAYS_IN.map((symbol) => (
            <span key={symbol} className="chip">{symbol}</span>
          ))}
        </p>
        {testnet ? (
          <p className="home-note">
            <span className="hl home-note-mark" aria-hidden="true">!</span>
            This is Arc testnet: tokens here have no value, so nothing you do can lose real
            money. Get test USDC from the{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle faucet</a>
            {" "}— you need a little USDC for network fees even when paying other tokens.
          </p>
        ) : (
          <p className="home-note">
            <span className="hl home-note-mark" aria-hidden="true">!</span>
            This is Arc mainnet: a run moves real money.{" "}
            <Link href="/new?n=testnet">Try it on testnet first</Link>.
          </p>
        )}
      </Col>

      <Col span={4} md={12}>
        {/* Labelled so it is never read as someone's real payment. */}
        <Tape head={<><strong>Payment advice</strong><span className="hl">Example</span></>}>
          <p className="leader">
            <span className="leader-key">Invoice</span>
            <span className="leader-dots" aria-hidden="true" />
            <span className="leader-val"><span aria-hidden="true"># </span>INV-US-001</span>
          </p>
          <p className="leader">
            <span className="leader-key">To</span>
            <span className="leader-dots" aria-hidden="true" />
            <span className="leader-val hex addr">0xe48A…732a</span>
          </p>
          <p className="amount slip-amount">0.10<span className="unit">USDC</span></p>
          <div className="rule-dashed" aria-hidden="true" />
          <p className="leader">
            <span className="leader-key">Five checks against the chain</span>
            <span className="leader-dots" aria-hidden="true" />
            <span className="leader-val">✓</span>
          </p>
          <p className="stamp">Verified</p>
        </Tape>
        <p className="label example-caption">What a recipient sees</p>
      </Col>

      <Col span={12}>
        <Tape head={<><strong>How a run works</strong><span>3 steps · one transaction</span></>}>
          <ol className="how">
            <li>
              <span className="label">1 · Upload</span>
              <h3>Upload a list of invoices</h3>
              <p className="because">
                A CSV with one line per payment: invoice, token, recipient, amount.{" "}
                <a href={sampleCsvHref()} download="ledgerline-sample.csv">Download a sample</a>{" "}
                to start from. It stays in your browser.
              </p>
            </li>
            <li>
              <span className="label">2 · Check, then pay</span>
              <h3>Check it, then pay in one transaction</h3>
              <p className="because">
                Every payment is tried against the chain before you pay, so a short balance or
                a transfer the token would refuse shows up before any money moves. Then one
                transaction pays every line.
              </p>
            </li>
            <li>
              <span className="label">3 · Send receipts</span>
              <h3>Send each recipient their receipt link</h3>
              <p className="because">
                The link shows what was paid and which invoice it settles, checked against the
                chain in their own browser. They need no account and nothing from us.
              </p>
            </li>
          </ol>
          <p className="because how-need">
            You need a browser wallet (MetaMask or Rabby) and USDC on Arc for the network fee.
            {!testnet && <> <Link href="/new?n=testnet">Try it on testnet first</Link>.</>}
          </p>
        </Tape>
      </Col>

      <Col span={12}>
        <Tape
          head={
            <>
              <strong>Proof · Arc mainnet</strong>
              <span>
                <span className="sr-only">block </span><span aria-hidden="true"># </span>
                {P.block.toLocaleString("en-US")} · {P.date}
              </span>
            </>
          }
        >
          <dl className="proof">
            <div>
              <dt>Tokens, one transaction</dt>
              <dd className="proof-fig">3<span className="key-mark" aria-hidden="true">◇</span></dd>
              <dd className="because">{P.payments.join(" · ")}, each carrying its invoice.</dd>
            </div>
            <div>
              <dt>Checks on every receipt</dt>
              <dd className="proof-fig">{P.checksPerReceipt}<span className="key-mark" aria-hidden="true">✓</span></dd>
              <dd className="because">Run in the recipient&apos;s own browser, against the chain. No account, and nothing from us.</dd>
            </div>
            <div>
              <dt>USDC in fees, all three</dt>
              <dd className="proof-fig">{P.feeUsdc}</dd>
              <dd className="because">{P.gasUsed.toLocaleString("en-US")} gas at {P.gasPriceGwei} Gwei, measured on the run itself.</dd>
            </div>
            <div>
              <dt>Referenced by a plain batch</dt>
              <dd className="proof-fig">{P.control.referenced}<span className="proof-of"> / {P.control.payments}</span></dd>
              <dd className="because">The same payment through the standard Multicall3, same day, as a control.</dd>
            </div>
          </dl>
          <div className="proof-foot">
            <span className="hex">
              <span aria-hidden="true"># </span>{shortHash(P.txHash)} <span aria-hidden="true">✱</span>
            </span>
            <span className="proof-links">
              <a href={`https://explorer.arc.io/tx/${P.txHash}`} target="_blank" rel="noreferrer">View on explorer ↗</a>
              <Link href={`/run/${P.txHash}?n=mainnet`}>Open the run here</Link>
              <Link href="/why?n=mainnet">Compare with the control</Link>
            </span>
          </div>
        </Tape>
      </Col>

      <Col span={12}>
        <SiteFooter network={net.name} />
      </Col>
    </Grid>
  );
}
