export type Hex = `0x${string}`;
export type Address = `0x${string}`;

/** A log as returned by eth_getTransactionReceipt. */
export interface RawLog {
  address: Address;
  topics: Hex[];
  data: Hex;
  logIndex: number;
}

/** A decoded Memo event. */
export interface MemoEvent {
  sender: Address;
  target: Address;
  callDataHash: Hex;
  memoId: Hex;
  memoData: Hex;
  memoIndex: bigint;
  logIndex: number;
}

/** A decoded token Transfer, system emitter excluded. */
export interface TransferEvent {
  token: Address;
  from: Address;
  to: Address;
  value: bigint;
  logIndex: number;
}

/** A Memo cryptographically joined to its Transfer. */
export interface PaymentRecord {
  memoId: Hex;
  payer: Address;
  token: Address;
  to: Address;
  value: bigint;
  memoData: Hex;
  memoIndex: bigint;
  /** True when memo.sender !== transfer.from — an integrity violation. */
  identityBroken: boolean;
  /** The Transfer's `from` — the account that actually moved the funds, which
   *  may differ from `payer` (memo.sender) when `identityBroken` is true. */
  transferFrom: Address;
}

export interface ManifestItem {
  invoiceId: string;
  token: Address;
  to: Address;
  amount: bigint;
}

export interface Manifest {
  clientRunId: Hex;
  payer: Address;
  chainId: number;
  runSalt: Hex;
  items: ManifestItem[];
}

export type ReconcileStatus =
  | "matched"
  | "amount_mismatch"
  | "recipient_mismatch"
  | "unpaid"
  | "unexpected"
  | "unlinked";

export interface ReconcileRow {
  status: ReconcileStatus;
  memoId: Hex;
  token: Address;
  invoiceId?: string;
  payer?: Address;
  to?: Address;
  expectedTo?: Address;
  expected?: bigint;
  actual?: bigint;
  note?: string;
}

export interface ReconcileResult {
  rows: ReconcileRow[];
  payments: PaymentRecord[];
}
