"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "antd";
import { isTxHash, TX_HASH_HINT } from "@/lib/tx-hash";

/** A run sent from another browser is still on chain; its hash opens it. */
export default function OpenRunByHash({ network }: { network: "mainnet" | "testnet" }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);

  const open = () => {
    const hash = value.trim().toLowerCase();
    if (!isTxHash(hash)) { setBad(true); return; }
    router.push(`/run/${hash}?n=${network}`);
  };

  return (
    <form className="open-run" onSubmit={(e) => { e.preventDefault(); open(); }}>
      <label htmlFor="open-run-hash" className="label">Open a run by its transaction hash</label>
      <div className="open-run-row">
        <Input
          id="open-run-hash"
          placeholder="0x…"
          value={value}
          status={bad ? "error" : undefined}
          aria-invalid={bad}
          aria-describedby={bad ? "open-run-error" : undefined}
          onChange={(e) => { setValue(e.target.value); setBad(false); }}
        />
        <Button htmlType="submit">Open</Button>
      </div>
      {bad && <p id="open-run-error" className="because field-error" role="alert">{TX_HASH_HINT}</p>}
    </form>
  );
}
