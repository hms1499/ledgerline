import type { ReactNode } from "react";

/**
 * The one-line answer a page gives, and why. `level` follows the shell: the
 * app shell's top bar already holds the page's h1, so verdicts there are h2;
 * public pages have no title bar, so their verdict is the h1.
 */
export default function Verdict({
  tone, title, body, level = 2,
}: {
  /** ok | error | critical | degraded, or none. */
  tone?: string;
  title: ReactNode;
  body?: ReactNode;
  level?: 1 | 2;
}) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <section className={tone ? `verdict ${tone}` : "verdict"}>
      <H>{title}</H>
      {body !== undefined && <p>{body}</p>}
    </section>
  );
}
