import Tape from "@/components/ui/Tape";
import Totals from "@/components/ui/Totals";
import { short } from "@/lib/chain";
import type { RunSummaryView } from "@/lib/run-summary-view";

/** What is about to be paid, kept in view while the steps change. */
export default function RunSummary({
  view, network, payer, line,
}: { view: RunSummaryView; network: string; payer?: string; line?: boolean }) {
  if (line) {
    return (
      <section className="run-summary-line" aria-label="This run">
        <strong>{view.name}</strong>
        <span>{view.payments}</span>
        {view.toPay.length > 0 && <span className="hex">{view.toPay.join(" · ")}</span>}
        {view.changes && <span>Changed here · {view.changes}</span>}
        <span>Arc {network}</span>
      </section>
    );
  }
  return (
    <Tape title="This run">
      <dl className="detail run-summary">
        <dt>Name</dt><dd>{view.name}</dd>
        <dt>Payments</dt><dd>{view.payments}</dd>
        {view.changes && (<><dt>Changed here</dt><dd>{view.changes}</dd></>)}
        <dt>To pay</dt>
        <dd className="is-wide"><Totals lines={view.toPay} /></dd>
        <dt>Network</dt><dd>Arc {network}</dd>
        <dt>Paying wallet</dt>
        <dd>{payer ? <span className="hex addr" title={payer}>{short(payer)}</span> : "Not connected"}</dd>
        {view.runId && (<><dt>Run ID</dt><dd className="hex">{view.runId}</dd></>)}
      </dl>
    </Tape>
  );
}
