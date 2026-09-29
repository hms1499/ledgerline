/**
 * The recordings' wallet: announced to the page over EIP-6963 as "Demo
 * wallet", with every request crossing to Node, where the key signs exactly
 * what the app asked for. It draws no UI, so nothing imitates a real wallet.
 * Shared by record-demo.ts and record-walkthrough.ts: it is the code that
 * refuses a fee Arc would drop, and two copies of it could drift.
 */
import { createPublicClient, createWalletClient, http, parseGwei, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc, arcTestnet } from "viem/chains";

export type DemoNetwork = "testnet" | "mainnet";

/** execute.ts floors at 25 Gwei; under 20 the mempool drops a transaction
 *  without a word. Anything under the floor means something upstream broke. */
export const FEE_FLOOR = parseGwei("25");

export interface TxRequest {
  from?: Hex; to?: Hex; data?: Hex; value?: Hex; gas?: Hex; nonce?: Hex;
  maxFeePerGas?: Hex; maxPriorityFeePerGas?: Hex; gasPrice?: Hex;
}

export function defaultRpc(network: DemoNetwork): string {
  return network === "mainnet"
    ? process.env.ARC_MAINNET_RPC || "https://rpc.mainnet.arc.io"
    : process.env.ARC_TESTNET_RPC || "https://arc-testnet.drpc.org";
}

/** Why the demo wallet refuses to send this, or undefined when it may. */
export function refusal(tx: TxRequest, wallet: Hex): string | undefined {
  if (tx.from && tx.from.toLowerCase() !== wallet.toLowerCase()) {
    return `asked to send from ${tx.from}, but the demo wallet is ${wallet}`;
  }
  const maxFee = tx.maxFeePerGas ?? tx.gasPrice;
  if (!maxFee || BigInt(maxFee) < FEE_FLOOR) {
    return `refusing a fee of ${maxFee ?? "none"}: under 25 Gwei Arc drops it silently`;
  }
  return undefined;
}

export function demoWallet(network: DemoNetwork, key: Hex, rpcUrl: string) {
  const chain = network === "mainnet" ? arc : arcTestnet;
  const account = privateKeyToAccount(key);
  const transport = http(rpcUrl);
  const client = createPublicClient({ chain, transport });
  const signer = createWalletClient({ account, chain, transport });
  const sent: Hex[] = [];

  /** The wallet side of every EIP-1193 request the page makes. */
  async function answer(method: string, params: unknown[]): Promise<unknown> {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return toHex(chain.id);
      case "wallet_switchEthereumChain": {
        const want = Number((params[0] as { chainId: string }).chainId);
        if (want !== chain.id) throw new Error(`Demo wallet is on Arc ${network} only, asked for ${want}`);
        return null;
      }
      case "wallet_revokePermissions":
        return null;
      case "personal_sign":
        return account.signMessage({ message: { raw: params[0] as Hex } });
      case "eth_sendTransaction": {
        const tx = params[0] as TxRequest;
        const no = refusal(tx, account.address);
        if (no) throw new Error(no);
        const maxFee = (tx.maxFeePerGas ?? tx.gasPrice)!;
        const hash = await signer.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : undefined,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
          nonce: tx.nonce ? Number(tx.nonce) : undefined,
          maxFeePerGas: BigInt(maxFee),
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : undefined,
        });
        sent.push(hash);
        return hash;
      }
      default:
        return client.request({ method, params } as never);
    }
  }

  return { account, chain, client, sent, answer };
}

/**
 * Runs in the page: announces the Demo wallet. Plain JavaScript in a string,
 * because tsx rewrites a function body with helpers (`__name`) that do not
 * exist in the page.
 */
export const WALLET_ANNOUNCE = String.raw`(() => {
  const provider = {
    request: ({ method, params }) => window.__demoWallet(method, params ?? []),
    on() {},
    removeListener() {},
  };
  const icon = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#161616"/>' +
    '<text x="16" y="23" font-size="20" text-anchor="middle" fill="#FDFDFA">✱</text></svg>');
  const detail = Object.freeze({
    info: { uuid: "3f1c6e2a-demo-wallet", name: "Demo wallet", rdns: "local.ledgerline.demo", icon },
    provider,
  });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();`;
