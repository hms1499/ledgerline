/**
 * A token's own icon, as a coin. Decorative — the token's name always sits
 * beside it as text — so it carries no alt text of its own.
 */
export default function Coin({ icon }: { icon: string }) {
  // A plain <img>: a 2 KB, 64px PNG gains nothing from next/image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="coin" src={icon} width={28} height={28} alt="" decoding="async" />;
}
