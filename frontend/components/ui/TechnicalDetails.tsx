import type { ReactNode } from "react";
import { Collapse } from "antd";

/** The original error or identifier, folded away: there for whoever needs it,
 *  never in front of the sentence a payer reads. */
export default function TechnicalDetails({ children }: { children: ReactNode }) {
  return (
    <Collapse
      ghost
      style={{ marginTop: 14 }}
      items={[{ key: "technical", label: "Technical details", children }]}
    />
  );
}
