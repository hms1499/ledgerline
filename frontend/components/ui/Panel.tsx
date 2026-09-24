import { useId, type ReactNode } from "react";

/**
 * One block of a page, on the surface colour. Ours rather than antd's Card:
 * Card renders its title in a div, which drops the section out of a screen
 * reader's heading outline.
 */
export default function Panel({
  title, head, className, children,
}: {
  title?: string;
  /** A small row above everything else, e.g. "Payment advice · Arc testnet at block N". */
  head?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={className ? `panel ${className}` : "panel"} aria-labelledby={title ? id : undefined}>
      {head && <div className="panel-head">{head}</div>}
      {title && <h2 id={id} className="panel-title">{title}</h2>}
      {children}
    </section>
  );
}
