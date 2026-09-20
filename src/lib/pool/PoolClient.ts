export type TokenId = string; // token code from config

export type PoolErrorCode =
  | "InsufficientLiquidity" | "SlippageExceeded" | "ProportionMismatch"
  | "NotImplemented" | "Rejected" | "Unknown";

export class PoolError extends Error {
  constructor(public code: PoolErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PoolError";
  }
}

export interface TickInfo {
  depegBps: number;
  radius: bigint;
  state: "interior" | "boundary";
  capEff: number;
}

export interface PoolState {
  tokens: TokenId[];
  reserves: bigint[];   // real reserves, 7 decimals
  ticks: TickInfo[];
  tvl: bigint;
}

export interface Quote {
  amountOut: bigint;
  ticksCrossed: number;
  priceBefore: number;  // tokenOut priced in tokenIn
  priceAfter: number;
}

/**
 * Progress phases a `swap` reports back while it is in flight.
 *
 * `"signing"` covers the wallet ceremony, `"submitting"` the network round trip. A backend
 * that cannot separate the two (see `SorobanPoolClient.invoke`) still reports both, in order.
 */
export type SwapPhase = "signing" | "submitting";

/** What the UI shows about the swap it last started. */
export type SwapStatus = "idle" | SwapPhase | "confirmed" | "failed";

/** Display-only record of the most recent committed swap. `hash` is absent on the mock. */
export interface SwapReceipt {
  hash?: string;
  amountIn: number;
  amountOut: number;
  tokenIn: TokenId;
  tokenOut: TokenId;
  at: number;
}

export interface SwapArgs {
  from: string;
  tokenIn: TokenId;
  tokenOut: TokenId;
  amountIn: bigint;
  minOut: bigint;
  /** Optional progress callback; always called at least once with `"signing"` before any await. */
  onStatus?: (phase: SwapPhase) => void;
}

export interface PoolClient {
  getState(): Promise<PoolState>;
  quote(tokenIn: TokenId, tokenOut: TokenId, amountIn: bigint): Promise<Quote>;
  swap(args: SwapArgs): Promise<{ amountOut: bigint; txHash?: string }>;
  deposit(args: { from: string; amounts: bigint[]; depegBps: number }): Promise<{ shares: bigint; txHash?: string }>;
  reset?(): Promise<void>;
  subscribe(cb: (s: PoolState) => void): () => void;
}
