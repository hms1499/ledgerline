/**
 * A coin, struck in the tape's ink: a rim, an engraved inner ring and the
 * currency's sign. Drawn from theme tokens, so it follows light and dark.
 * Decorative — the token's name always sits beside it as text.
 */
export default function Coin({ glyph }: { glyph: string }) {
  const drawn = DRAWN[glyph];
  return (
    <svg className="coin" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true" focusable="false">
      <circle cx="14" cy="14" r="13" className="coin-face" />
      <circle cx="14" cy="14" r="10" className="coin-ring" />
      {drawn ? (
        <path className="coin-glyph-path" d={drawn} />
      ) : (
        <text x="14" y="14" className="coin-glyph" textAnchor="middle" dominantBaseline="central">{glyph}</text>
      )}
    </svg>
  );
}

/**
 * Signs Martian Mono does not have, drawn at its weight instead of falling
 * back to another face. Its latin-ext subset declares U+20BF but carries no
 * glyph for it: a ₿ set in type measured 57.9 wide against the face's 70.0
 * advance, so it came from a system font.
 */
const DRAWN: Record<string, string> = {
  "₿":
    "M10.5 9V19" +
    "M10.5 9H14.3A2.4 2.4 0 0 1 14.3 13.8H10.5" +
    "M10.5 13.8H14.9A2.6 2.6 0 0 1 14.9 19H10.5" +
    "M12.3 6.4V9M14.1 6.4V9M12.3 19V21.6M14.1 19V21.6",
};
