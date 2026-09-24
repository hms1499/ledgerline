import Tape from "@/components/ui/Tape";
import { short } from "@/lib/chain";
import type { RunSummaryView } from "@/lib/run-summary-view";

/** What is about to be paid, kept in view while the steps change. */
export default function RunSummary({
  view, network, payer,
}: { view: RunSummaryView; network: string; payer?: string }) {
  return (
    <Tape title="This run">
      <dl className="detail run-summary">
        <dt>Name</dt><dd>{view.name}</dd>
        <dt>Payments</dt><dd>{view.payments}</dd>
        <dt>To pay</dt>
        <dd>{view.toPay.map((t) => <span key={t} className="hex stat-line">{t}</span>)}</dd>
        <dt>Network</dt><dd>Arc {network}</dd>
        <dt>Paying wallet</dt>
        <dd>{payer ? <span className="hex addr" title={payer}>{short(payer)}</span> : "Not connected"}</dd>
        {view.runId && (<><dt>Run ID</dt><dd className="hex">{view.runId}</dd></>)}
      </dl>
    </Tape>
  );
}
