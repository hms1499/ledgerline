/**
 * The ✱: an adding machine's total key, the final answer (spec §6.3). Three
 * square-capped bars at 0°, 60° and 120°. Decorative wherever it sits beside
 * the word "Ledgerline".
 */
export default function Mark({ size = 16 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32"
      aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="5.2" strokeLinecap="butt">
        <line x1="16" y1="3" x2="16" y2="29" />
        <line x1="4.7" y1="9.5" x2="27.3" y2="22.5" />
        <line x1="4.7" y1="22.5" x2="27.3" y2="9.5" />
      </g>
    </svg>
  );
}
