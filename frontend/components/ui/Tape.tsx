import { useId, type ReactNode } from "react";
import { tapeClass, type TapeState } from "@/lib/tape";

/**
 * One block of a page: paper from the roll (spec §6.1). Ours rather than
 * antd's Card, which renders its title in a div and drops the section out of
 * a screen reader's heading outline.
 */
export default function Tape({
  title, head, state = "torn", className, level = 2, children,
}: {
  title?: string;
  /** The printed header row: a label on the left, meta on the right. */
  head?: ReactNode;
  state?: TapeState;
  className?: string;
  level?: 2 | 3;
  children: ReactNode;
}) {
  const id = useId();
  const H = level === 3 ? "h3" : "h2";
  return (
    <section className={tapeClass(state, className)} aria-labelledby={title ? id : undefined}>
      {head && <div className="tape-head">{head}</div>}
      {title && <H id={id} className="tape-title">{title}</H>}
      {children}
    </section>
  );
}
