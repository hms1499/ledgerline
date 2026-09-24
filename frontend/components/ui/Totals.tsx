/**
 * Per-token amounts as an adding machine prints them (spec §6.2): one ◇
 * subtotal line per token — never pooled across tokens — and an optional ✱
 * line that counts rather than sums. `lines` are already formatted amounts,
 * each with its own symbol.
 */
export default function Totals({ lines, total }: { lines: string[]; total?: string }) {
  return (
    <div className="totals-slip">
      <ul className="totals-lines">
        {lines.map((line) => (
          <li key={line} className="leader">
            <span className="leader-dots" aria-hidden="true" />
            <span className="leader-val">{line}</span>
            <span className="key-mark" aria-hidden="true">◇</span>
          </li>
        ))}
      </ul>
      {total && (
        <p className="leader totals-sum">
          <span className="leader-key">{total}</span>
          <span className="leader-dots" aria-hidden="true" />
          <span className="key-mark" aria-hidden="true">✱</span>
        </p>
      )}
    </div>
  );
}
