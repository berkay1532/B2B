import { TOKENS, tokenIndex } from "@/config/tokens";
import { capitalEfficiency, createTick, cloneTick, ORBITAL_MODE, OrbitalError, poolRealReserves, quoteAuto as mathQuote, realReserves, type OrbitalMode, type Tick } from "@/lib/orbital";
import { PoolError, type PoolClient, type PoolState, type Quote, type SwapArgs, type TokenId } from "./PoolClient";
import { fromUnits, toUnits } from "./units";

export interface MockOptions {
  realPerTokenPerTick?: number;
  depegBpsList?: number[];
  /** Defaults to `ORBITAL_MODE` (i.e. `NEXT_PUBLIC_ORBITAL_MODE`). */
  mode?: OrbitalMode;
}

function mapError(e: unknown): PoolError {
  if (e instanceof OrbitalError) {
    if (e.code === "InsufficientLiquidity") return new PoolError("InsufficientLiquidity", e.message);
    return new PoolError("Unknown", e.message);
  }
  return new PoolError("Unknown", String(e));
}

export class MockPoolClient implements PoolClient {
  private ticks: Tick[] = [];
  private listeners = new Set<(s: PoolState) => void>();
  private readonly n = TOKENS.length;
  private readonly opts: Required<MockOptions>;
  readonly mode: OrbitalMode;

  constructor(opts: MockOptions = {}) {
    this.opts = {
      realPerTokenPerTick: opts.realPerTokenPerTick ?? 2_500_000,
      depegBpsList: opts.depegBpsList ?? [10, 100, 500, 1000],
      mode: opts.mode ?? ORBITAL_MODE,
    };
    this.mode = this.opts.mode;
    this.seed();
  }

  private seed() {
    this.ticks = this.opts.depegBpsList.map((bps) => createTick(`t${bps}`, bps, this.opts.realPerTokenPerTick, this.n));
  }

  private snapshot(): PoolState {
    const reserves = poolRealReserves(this.ticks);
    return {
      tokens: TOKENS.map((t) => t.code),
      reserves: reserves.map(toUnits),
      ticks: this.ticks.map((t) => ({ depegBps: t.depegBps, radius: toUnits(t.radius), state: t.state, capEff: capitalEfficiency(t.depegBps, this.n) })),
      tvl: toUnits(reserves.reduce((a, b) => a + b, 0)),
    };
  }

  private notify() { const s = this.snapshot(); for (const cb of this.listeners) cb(s); }

  async getState(): Promise<PoolState> { return this.snapshot(); }

  async quote(tokenIn: TokenId, tokenOut: TokenId, amountIn: bigint): Promise<Quote> {
    try {
      const q = mathQuote(this.mode, this.ticks, tokenIndex(tokenIn), tokenIndex(tokenOut), fromUnits(amountIn));
      return { amountOut: toUnits(q.amountOut), ticksCrossed: q.ticksCrossed, priceBefore: q.priceBefore, priceAfter: q.priceAfter };
    } catch (e) { throw mapError(e); }
  }

  async swap(args: SwapArgs) {
    // In-process backend: there is no wallet ceremony and no network hop, so both phases
    // are reported synchronously and the UI's spinner is effectively instantaneous.
    args.onStatus?.("signing");
    args.onStatus?.("submitting");
    let q;
    try { q = mathQuote(this.mode, this.ticks, tokenIndex(args.tokenIn), tokenIndex(args.tokenOut), fromUnits(args.amountIn)); }
    catch (e) { throw mapError(e); }
    const amountOut = toUnits(q.amountOut);
    if (amountOut < args.minOut) throw new PoolError("SlippageExceeded", `out ${amountOut} < minOut ${args.minOut}`);
    this.ticks = q.ticks;
    this.notify();
    return { amountOut };
  }

  async deposit(args: { from: string; amounts: bigint[]; depegBps: number }) {
    const amounts = args.amounts.map(fromUnits);
    if (amounts.length !== this.n || amounts.some((a) => !(a > 0))) throw new PoolError("ProportionMismatch", "need a positive amount per token");
    let tick = this.ticks.find((t) => t.depegBps === args.depegBps);
    if (!tick) {
      // new tick starts at the equal point; requires equal amounts
      const a0 = amounts[0];
      if (amounts.some((a) => Math.abs(a - a0) / a0 > 0.01)) throw new PoolError("ProportionMismatch", "new tick needs equal amounts");
      tick = createTick(`t${args.depegBps}`, args.depegBps, a0, this.n);
      this.ticks = [...this.ticks, tick].sort((a, b) => a.depegBps - b.depegBps);
      this.notify();
      return { shares: toUnits(tick.radius) };
    }
    // existing tick: amounts must match its current real-reserve proportions
    const t = cloneTick(tick);
    const real = realReserves(t);
    if (real.some((r) => !(r > 0) || !Number.isFinite(r))) {
      throw new PoolError("ProportionMismatch", "tick has a drained reserve; deposit into a fresh tick instead");
    }
    const ratio = amounts[0] / real[0];
    if (!(ratio > 0) || !Number.isFinite(ratio)) throw new PoolError("ProportionMismatch", "amounts must match pool proportions");
    for (let k = 1; k < this.n; k++) {
      if (Math.abs(amounts[k] / real[k] - ratio) / ratio > 0.01) throw new PoolError("ProportionMismatch", "amounts must match pool proportions");
    }
    const dR = t.radius * ratio;
    t.x = t.x.map((v) => v * (1 + ratio));
    t.radius += dR;
    this.ticks = this.ticks.map((o) => (o.id === t.id ? t : o));
    this.notify();
    return { shares: toUnits(dR) };
  }

  async reset() { this.seed(); this.notify(); }

  /** Mock only: math-level ticks for the visualizations. */
  getTicks(): Tick[] { return this.ticks.map(cloneTick); }

  subscribe(cb: (s: PoolState) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
}
