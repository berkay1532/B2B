import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import type { AssembledTransaction, SmartAccountKit } from "@sembol/passkey-react";
import { buildContractCallTransaction } from "@sembol/passkey-react";
import { TOKENS, tokenIndex } from "@/config/tokens";
import {
  capitalEfficiency,
  cloneTick,
  kappaFromDepeg,
  poolPrice,
  pricingTicks,
  quote as mathQuote,
  xMinNorm,
  type Tick,
} from "@/lib/orbital";
import { PoolError, type PoolClient, type PoolErrorCode, type PoolState, type Quote, type TokenId } from "./PoolClient";
import { fromUnits } from "./units";

const POLL_MS = 8000;

/** Raw shape of the contract's `TickData` struct once decoded by `scValToNative`. */
interface RawTickData {
  depeg_bps: number;
  radius: bigint;
  plane_sum: bigint;
  x_min: bigint;
  x: bigint[];
  boundary: boolean;
}

/** Raw shape of the contract's `PoolState` struct once decoded by `scValToNative`. */
interface RawPoolState {
  tokens: string[];
  reserves: bigint[];
  ticks: RawTickData[];
  tvl: bigint;
}

/** Raw shape of the contract's `Quote` struct once decoded by `scValToNative`. */
interface RawQuote {
  amount_out: bigint;
  ticks_crossed: number;
}

/** Sembol wallet handle wired in via {@link SorobanPoolClient.setSigner} once connected. */
export interface SignerHandle {
  /** May be `null` only when paired with a custom `buildCall` that doesn't need it (tests). */
  kit: SmartAccountKit | null;
  signAndSubmit: (tx: AssembledTransaction<unknown>) => Promise<{ hash: string }>;
}

type BuildCallFn = (
  kit: SmartAccountKit | null,
  params: { contractId: string; method: string; args: xdr.ScVal[] },
) => Promise<AssembledTransaction<unknown>>;

export interface SorobanOptions {
  rpcUrl: string;
  contractId: string;
  networkPassphrase: string;
  /** Test/DI seam: replaces `new rpc.Server(rpcUrl)` for read-only simulation calls. */
  server?: Pick<rpc.Server, "simulateTransaction">;
  /** Test/DI seam: replaces Sembol's `buildContractCallTransaction`. */
  buildCall?: BuildCallFn;
  /**
   * Optional default signer wired at construction time (tests, or a caller that already has a
   * `signAndSubmit` without a `kit` — pairs with a custom `buildCall` that ignores it).
   * Superseded by a later {@link SorobanPoolClient.setSigner} call.
   */
  signAndSubmit?: (tx: AssembledTransaction<unknown>) => Promise<{ hash: string }>;
}

const CONTRACT_ERROR_MAP: Partial<Record<number, PoolErrorCode>> = {
  1: "InsufficientLiquidity",
  2: "SlippageExceeded",
  3: "ProportionMismatch",
  // 4 InvalidAmount, 5 NotInitialized, 6 AlreadyInitialized, 7 UnknownToken have no
  // dedicated PoolErrorCode yet — they fall through to "Unknown" with the raw message kept.
};

function parseContractErrorCode(message: string): number | null {
  const m = /Error\(Contract,\s*#(\d+)\)/.exec(message);
  return m ? Number(m[1]) : null;
}

function mapContractError(message: string): PoolError {
  const code = parseContractErrorCode(message);
  const mapped = code != null ? CONTRACT_ERROR_MAP[code] : undefined;
  return new PoolError(mapped ?? "Unknown", message);
}

function tokenCodeFromAddress(address: string): TokenId {
  return TOKENS.find((t) => t.contractId === address)?.code ?? address;
}

function tickToMath(raw: RawTickData, n: number): Tick {
  const depegBps = Number(raw.depeg_bps);
  const kappa = kappaFromDepeg(depegBps, n);
  return {
    id: `t${depegBps}`,
    depegBps,
    radius: fromUnits(BigInt(raw.radius)),
    kappa,
    xMinNorm: xMinNorm(kappa, n),
    x: raw.x.map((v) => fromUnits(BigInt(v))),
    state: raw.boundary ? "boundary" : "interior",
  };
}

/**
 * Real `PoolClient` backed by the deployed Orbital AMM Soroban contract.
 *
 * Reads (`getState`, `quote`, `maxFillable`) are plain simulations against a public account
 * (no signature, no fee) — same DI pattern as `readTokenBalance`. Writes (`swap`, `deposit`)
 * need a connected wallet: call {@link setSigner} (done by `usePoolSigner`) before invoking them.
 */
export class SorobanPoolClient implements PoolClient {
  private signer: SignerHandle | null = null;
  /** Math-level ticks from the last `getState()`, backing `getTicks()` and quote pricing. */
  private cachedTicks: Tick[] = [];
  private readonly listeners = new Set<(s: PoolState) => void>();
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly opts: SorobanOptions) {
    if (opts.signAndSubmit) this.signer = { kit: null, signAndSubmit: opts.signAndSubmit };
  }

  /** Wire (or clear, with `null`) the connected wallet's signer. */
  setSigner(signer: SignerHandle | null): void {
    this.signer = signer;
  }

  /** Mirrors `MockPoolClient.getTicks()`: math-level ticks for the visualizations. */
  getTicks(): Tick[] {
    return this.cachedTicks.map(cloneTick);
  }

  private server(): Pick<rpc.Server, "simulateTransaction"> {
    return this.opts.server ?? new rpc.Server(this.opts.rpcUrl);
  }

  private async simulateCall<T>(method: string, args: xdr.ScVal[]): Promise<T> {
    // Any account that exists on the network works as the simulation source — every read
    // here is a pure view call, no auth or signature required. The pool token issuer is
    // guaranteed to exist on testnet.
    const sourceAccount = new Account(TOKENS[0].issuer, "0");
    const contract = new Contract(this.opts.contractId);
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.opts.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await this.server().simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      const message = "error" in sim ? sim.error : `${method} simulation failed`;
      throw mapContractError(message);
    }
    return scValToNative(sim.result.retval) as T;
  }

  async getState(): Promise<PoolState> {
    const raw = await this.simulateCall<RawPoolState>("get_state", []);
    const n = TOKENS.length;
    this.cachedTicks = raw.ticks.map((t) => tickToMath(t, n));

    return {
      tokens: raw.tokens.map(tokenCodeFromAddress),
      reserves: raw.reserves.map((r) => BigInt(r)),
      ticks: raw.ticks.map((t) => ({
        depegBps: Number(t.depeg_bps),
        radius: BigInt(t.radius),
        state: t.boundary ? "boundary" : "interior",
        capEff: capitalEfficiency(Number(t.depeg_bps), n),
      })),
      tvl: BigInt(raw.tvl),
    };
  }

  async quote(tokenIn: TokenId, tokenOut: TokenId, amountIn: bigint): Promise<Quote> {
    const i = tokenIndex(tokenIn);
    const j = tokenIndex(tokenOut);
    const raw = await this.simulateCall<RawQuote>("quote", [
      new Address(TOKENS[i].contractId).toScVal(),
      new Address(TOKENS[j].contractId).toScVal(),
      nativeToScVal(amountIn, { type: "i128" }),
    ]);
    const amountOut = BigInt(raw.amount_out);
    const ticksCrossed = Number(raw.ticks_crossed);

    // The contract only returns the fill; price-before/after for the HUD comes from the
    // same pure math the mock and the live preview already use, run against the ticks
    // cached from the last `getState()`.
    let priceBefore = 1;
    let priceAfter = 1;
    if (this.cachedTicks.length > 0) {
      try {
        const q = mathQuote(this.cachedTicks, i, j, fromUnits(amountIn));
        priceBefore = q.priceBefore;
        priceAfter = q.priceAfter;
      } catch {
        priceBefore = poolPrice(pricingTicks(this.cachedTicks), j, i);
        const amountInNum = fromUnits(amountIn);
        priceAfter = amountInNum > 0 ? fromUnits(amountOut) / amountInNum : priceBefore;
      }
    }
    return { amountOut, ticksCrossed, priceBefore, priceAfter };
  }

  /** Not part of `PoolClient` — extra read the UI may use to cap its slider (see `PoolView`). */
  async maxFillable(tokenIn: TokenId, tokenOut: TokenId): Promise<bigint> {
    const i = tokenIndex(tokenIn);
    const j = tokenIndex(tokenOut);
    const raw = await this.simulateCall<bigint>("max_fillable", [
      new Address(TOKENS[i].contractId).toScVal(),
      new Address(TOKENS[j].contractId).toScVal(),
    ]);
    return BigInt(raw);
  }

  private mapThrown(e: unknown): PoolError {
    if (e instanceof PoolError) return e;
    return mapContractError(e instanceof Error ? e.message : String(e));
  }

  private decodeSimulatedResult(tx: AssembledTransaction<unknown>): unknown | null {
    const sim = tx.simulation;
    if (!sim || !rpc.Api.isSimulationSuccess(sim) || !sim.result) return null;
    try {
      return scValToNative(sim.result.retval);
    } catch {
      return null;
    }
  }

  private async invoke(
    method: string,
    args: xdr.ScVal[],
  ): Promise<{ tx: AssembledTransaction<unknown>; hash: string }> {
    if (!this.signer) throw new PoolError("Rejected", "connect a wallet first");
    // `buildContractCallTransaction`'s real signature requires a non-null kit; callers that
    // rely on it (as opposed to injecting their own `buildCall`) are guaranteed one by
    // `setSigner`, which is the only way `this.signer` gets set outside of tests.
    const buildCall = this.opts.buildCall ?? (buildContractCallTransaction as BuildCallFn);
    let tx: AssembledTransaction<unknown>;
    try {
      tx = await buildCall(this.signer.kit, { contractId: this.opts.contractId, method, args });
    } catch (e) {
      throw this.mapThrown(e);
    }
    try {
      const result = await this.signer.signAndSubmit(tx);
      return { tx, hash: result.hash };
    } catch (e) {
      throw this.mapThrown(e);
    }
  }

  async swap(args: {
    from: string;
    tokenIn: TokenId;
    tokenOut: TokenId;
    amountIn: bigint;
    minOut: bigint;
  }): Promise<{ amountOut: bigint; txHash?: string }> {
    if (!this.signer) throw new PoolError("Rejected", "connect a wallet first");
    const i = tokenIndex(args.tokenIn);
    const j = tokenIndex(args.tokenOut);
    const { tx, hash } = await this.invoke("swap", [
      new Address(args.from).toScVal(),
      new Address(TOKENS[i].contractId).toScVal(),
      new Address(TOKENS[j].contractId).toScVal(),
      nativeToScVal(args.amountIn, { type: "i128" }),
      nativeToScVal(args.minOut, { type: "i128" }),
    ]);

    const simulated = this.decodeSimulatedResult(tx);
    const amountOut = simulated != null ? BigInt(simulated as bigint) : (await this.quote(args.tokenIn, args.tokenOut, args.amountIn)).amountOut;
    void this.pokeSubscribers();
    return { amountOut, txHash: hash };
  }

  async deposit(args: { from: string; amounts: bigint[]; depegBps: number }): Promise<{ shares: bigint; txHash?: string }> {
    if (!this.signer) throw new PoolError("Rejected", "connect a wallet first");
    const { tx, hash } = await this.invoke("deposit", [
      new Address(args.from).toScVal(),
      xdr.ScVal.scvVec(args.amounts.map((a) => nativeToScVal(a, { type: "i128" }))),
      nativeToScVal(args.depegBps, { type: "u32" }),
    ]);

    const simulated = this.decodeSimulatedResult(tx);
    const shares = simulated != null ? BigInt(simulated as bigint) : 0n;
    void this.pokeSubscribers();
    return { shares, txHash: hash };
  }

  private async pokeSubscribers(): Promise<void> {
    if (this.listeners.size === 0) return;
    try {
      const state = await this.getState();
      for (const cb of this.listeners) cb(state);
    } catch {
      // A missed poll just means stale-but-still-displayed state; the next tick retries.
    }
  }

  private ensurePolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.pokeSubscribers(), POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  subscribe(cb: (s: PoolState) => void): () => void {
    this.listeners.add(cb);
    this.ensurePolling();
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) this.stopPolling();
    };
  }
}
