import type { Address, Hex } from "./types.js";

/** Arc mainnet. */
export const ARC_CHAIN_ID = 5042;

/** Predeployed transaction-extension contracts. */
export const MEMO_ADDRESS: Address = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
export const MULTICALL3FROM_ADDRESS: Address = "0x522fAf9A91c41c443c66765030741e4AaCe147D0";

/** Protocol-level tokens. */
export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";
export const EURC_ADDRESS: Address = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
export const CIRBTC_ADDRESS: Address = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";

/**
 * EIP-7708 system emitter. Emits an 18-decimal Transfer for every native USDC
 * movement, so a single ERC-20 USDC transfer produces TWO Transfer logs while
 * EURC and cirBTC produce one. Excluding this emitter everywhere is the single
 * rule that keeps USDC from being double-counted without halving the others.
 */
export const SYSTEM_EMITTER: Address = "0xfffffffffffffffffffffffffffffffffffffffe";

export const MEMO_TOPIC: Hex =
  "0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4";
export const BEFORE_MEMO_TOPIC: Hex =
  "0xb252e055da754c72fbf7542cf424b190808a9b541e912894c5e15b4238c41501";
/**
 * RunCommitted(bytes32 indexed runId, address indexed payer, bytes32 root, uint32 itemCount)
 *
 * runId is topics[1], so a receipt alone is enough to find which run a
 * transaction anchored — no extra URL parameter, no log search.
 */
export const RUN_COMMITTED_TOPIC: Hex =
  "0x0f45a5f974bf76498b4b8c4af496aad573f7c44a335744555aca6043762745d7";

export const TRANSFER_TOPIC: Hex =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** `transfer(address,uint256)` */
export const TRANSFER_SELECTOR: Hex = "0xa9059cbb";

/** Minimum maxFeePerGas. Below 20 Gwei Arc silently drops transactions. */
export const MIN_MAX_FEE_WEI = 25_000_000_000n;
export const MIN_PRIORITY_FEE_WEI = 1_000_000_000n;

/** Arc testnet, chainId 5042002. */
export const ARC_TESTNET_CHAIN_ID = 5042002;

/**
 * Testnet token addresses. USDC keeps the same predeploy address as mainnet
 * because it is the native gas token, but EURC and cirBTC are deployed
 * elsewhere — the mainnet addresses have no code on testnet, so reusing them
 * fails with an opaque "contract does not have any code" rather than a
 * sensible error. All three verified live via symbol(), decimals() and
 * balanceOf() on 2026-09-21.
 */
export const USDC_TESTNET_ADDRESS: Address = "0x3600000000000000000000000000000000000000";
export const EURC_TESTNET_ADDRESS: Address = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
export const CIRBTC_TESTNET_ADDRESS: Address = "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF";

export interface TokenSet {
  USDC: Address;
  EURC: Address;
  cirBTC: Address;
}

/**
 * Token addresses for a chain. Throws on an unknown chain rather than
 * defaulting, because a silent fallback to mainnet addresses is how a testnet
 * rehearsal ends up pointing at real money.
 */
export function tokensForChain(chainId: number): TokenSet {
  if (chainId === ARC_CHAIN_ID) {
    return { USDC: USDC_ADDRESS, EURC: EURC_ADDRESS, cirBTC: CIRBTC_ADDRESS };
  }
  if (chainId === ARC_TESTNET_CHAIN_ID) {
    return {
      USDC: USDC_TESTNET_ADDRESS,
      EURC: EURC_TESTNET_ADDRESS,
      cirBTC: CIRBTC_TESTNET_ADDRESS,
    };
  }
  throw new Error(`unsupported chain ${chainId}; Ledgerline targets Arc 5042 and 5042002`);
}
