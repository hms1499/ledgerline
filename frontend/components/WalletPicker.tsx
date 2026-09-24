"use client";

import { Modal } from "antd";
import type { WalletChoice } from "@/lib/wallet";

/**
 * Shown only when more than one wallet answered discovery. With one wallet
 * there is no choice to make, and making the payer confirm it would be a
 * dialog whose only option is the thing they already clicked.
 */
export default function WalletPicker({
  choices, open, onPick, onCancel,
}: {
  choices: WalletChoice[];
  open: boolean;
  onPick: (choice: WalletChoice) => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      title="Which wallet should sign?"
      width={420}
    >
      <p className="because" style={{ marginTop: 0 }}>
        You have more than one wallet in this browser. Arc requires the payer to sign
        directly, so pick the one holding the funds for this run.
      </p>

      <ul className="wallet-list">
        {choices.map((c) => (
          <li key={c.info.uuid}>
            <button type="button" onClick={() => onPick(c)}>
              {c.info.icon
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.info.icon} alt="" width={26} height={26} />
                : <span className="wallet-list__blank" aria-hidden="true" />}
              <span>{c.info.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
