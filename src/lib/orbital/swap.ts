import { cloneTick, planeSum, poolPrice, pricingTicks, sumX } from "./tick";
import { OrbitalError, type QuoteResult, type Tick } from "./types";

const REL_EPS = 1e-12;
const MAX_SEGMENTS = 64;

/** Move token i in by dIn on one sphere tick; returns token j out. Mutates t. */
export function applySwap(t: Tick, i: number, j: number, dIn: number): number {
  const R = t.radius;
  const xi = t.x[i] + dIn;
  if (xi > R) throw new OrbitalError("InsufficientLiquidity", "reserve of tokenIn would exceed R");
  let S = 0;
  for (let k = 0; k < t.x.length; k++) if (k !== i && k !== j) S += (R - t.x[k]) ** 2;
  const rad = R * R - (R - xi) ** 2 - S;
  if (rad < 0) throw new OrbitalError("InsufficientLiquidity", "no point on sphere");
  const xj = R - Math.sqrt(rad);
  const out = t.x[j] - xj;
  if (out < -REL_EPS * R) throw new OrbitalError("InsufficientLiquidity", "negative output");
  t.x[i] = xi;
  t.x[j] = xj;
  return Math.max(out, 0);
}

/**
 * Input of token i (with j out) that carries the tick exactly onto its plane
 * sum(x) = K. Solves 2t^2 + 2(C-R)t + C^2 + S = 0 with C = R - K + O.
 * Returns Infinity if the trade never reaches the plane.
 */
export function deltaToPlane(t: Tick, i: number, j: number): number {
  const R = t.radius;
  const K = planeSum(t);
  let O = 0, S = 0;
  for (let k = 0; k < t.x.length; k++) if (k !== i && k !== j) { O += t.x[k]; S += (R - t.x[k]) ** 2; }
  const C = R - K + O;
  const a = 2, b = 2 * (C - R), c = C * C + S;
  const d = b * b - 4 * a * c;
  if (d < 0) return Infinity;
  const r1 = (-b - Math.sqrt(d)) / (2 * a);
  const r2 = (-b + Math.sqrt(d)) / (2 * a);
  const floor = t.x[i] + REL_EPS * R;
  const cands = [r1, r2].filter((v) => v > floor);
  if (cands.length === 0) return Infinity;
  return Math.min(...cands) - t.x[i];
}

export function quote(ticks: Tick[], tokenIn: number, tokenOut: number, amountIn: number): QuoteResult {
  if (tokenIn === tokenOut) throw new OrbitalError("SameToken");
  if (!(amountIn > 0) || !Number.isFinite(amountIn)) throw new OrbitalError("InvalidAmount");
  if (ticks.length === 0) throw new OrbitalError("InsufficientLiquidity", "no ticks");

  const work = ticks.map(cloneTick);
  const priceBefore = poolPrice(pricingTicks(work), tokenOut, tokenIn);

  // A frozen boundary tick can trade again if this direction moves it inward.
  for (const t of work) {
    if (t.state === "boundary" && t.x[tokenIn] < t.x[tokenOut]) t.state = "interior";
  }

  let remaining = amountIn;
  let out = 0;
  let crossed = 0;

  for (let seg = 0; seg < MAX_SEGMENTS && remaining > amountIn * REL_EPS; seg++) {
    const active = work.filter((t) => t.state === "interior");
    if (active.length === 0) throw new OrbitalError("InsufficientLiquidity", "InsufficientLiquidity: every tick is at its boundary");
    const Rsum = active.reduce((a, t) => a + t.radius, 0);

    // largest fraction of `remaining` we can apply before some tick reaches its plane
    let f = 1;
    let landing: Tick | null = null;
    for (const t of active) {
      const share = (remaining * t.radius) / Rsum;
      const cap = deltaToPlane(t, tokenIn, tokenOut);
      if (cap < share && cap / share < f) { f = cap / share; landing = t; }
    }

    for (const t of active) {
      const share = ((remaining * t.radius) / Rsum) * f;
      out += applySwap(t, tokenIn, tokenOut, share);
    }
    if (landing) { landing.state = "boundary"; crossed++; }
    // also catch ticks that landed within tolerance without being the minimum
    for (const t of active) {
      if (t.state === "interior" && sumX(t) >= planeSum(t) * (1 - 1e-12)) { t.state = "boundary"; crossed++; }
    }

    remaining = f >= 1 ? 0 : remaining * (1 - f);
  }
  if (remaining > amountIn * REL_EPS) throw new OrbitalError("NoConvergence");

  return { amountOut: out, ticksCrossed: crossed, ticks: work, priceBefore, priceAfter: poolPrice(pricingTicks(work), tokenOut, tokenIn) };
}

/** Largest amountIn for which quote() does not throw (bisection, 60 rounds). */
export function maxFillable(ticks: Tick[], tokenIn: number, tokenOut: number): number {
  let lo = 0;
  let hi = ticks.reduce((a, t) => a + t.radius, 0);
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    try { quote(ticks, tokenIn, tokenOut, mid); lo = mid; } catch { hi = mid; }
  }
  return lo;
}
