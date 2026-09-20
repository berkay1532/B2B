/**
 * Orbital v2 — torus consolidation (Paradigm's Orbital paper, our coordinates).
 *
 * v1 stores a tick's *effective* reserves `x` on the sphere `Σ(R − xᵢ)² = R²`,
 * centred at `(R,…,R)`. The paper works in reserves centred at the origin. The
 * mapping is exactly
 *
 *     rᵢ = R − xᵢ        ⟹   Σ rᵢ² = R²
 *
 * so `r` is the tick's position on a sphere of radius `R` about the origin and
 * `x = R·1 − r` recovers the stored representation. `Tick.x` stays the stored
 * form, so `PoolView`, `TickPlanes`, `pricingTicks` and `realReserves` are
 * unchanged.
 *
 * Equal-price direction `v = 1/√n`. For a tick `k`:
 *
 *     b_k = h_k / R_k = √n − κ_k       normalized plane height (r·v = h_k)
 *     σ_k = ρ_k / R_k = √(1 − b_k²)    normalized ring radius  (‖r⊥‖ = ρ_k)
 *
 * `b_k = 1` at peg and decreases as the tick widens; the tick is *interior*
 * while `r·v > h_k`, i.e. while its normalized perpendicular extent `s` is
 * below `σ_k`.
 *
 * Consolidation. Interior ticks are scaled copies of one another, so they add
 * up to a single sphere of radius `R_int = Σ_I R_k`. Boundary ticks are pinned
 * to their planes and ride their own `(n−1)`-spheres, so they add up to a
 * single circle at height `H = Σ_B h_k` with radius `R_bound = Σ_B ρ_k`.
 * Writing the pool total as `r = r_int + r_bnd` and splitting into the
 * component along `v` (`p`) and the perpendicular norm (`q`) gives the torus
 *
 *     (p − H)² + (q − R_bound)² = R_int²
 *
 * with `p = (n·R_tot − Σᵢ Xᵢ)/√n` and `q = ‖X⊥‖` where `X = Σ_k x_k` is the
 * pool's total effective reserve vector. With no boundary tick (`H = 0`,
 * `R_bound = 0`, `R_int = R_tot`) this collapses to `Σᵢ(R_tot − Xᵢ)² = R_tot²`
 * — v1's sphere on the consolidated pool — so v2 reduces to v1 exactly.
 *
 * See `docs/contract-interface.md` §10 for the full derivation.
 */
import { ringRadiusNorm } from "./geometry";
import { cloneTick, planeSum, poolPrice, pricingTicks, sumX } from "./tick";
import { OrbitalError, type QuoteResult, type Tick } from "./types";

const REL_EPS = 1e-12;
const MAX_SEGMENTS = 64;
const NEWTON_MAX = 32;
/** relative tolerance on the Newton root */
const NEWTON_TOL = 1e-9;
const BISECT_ROUNDS = 60;

/** `b_k = h_k/R_k = √n − κ_k` — the tick's plane height, normalized by its radius. */
export const planeHeightNorm = (t: Tick): number => Math.sqrt(t.x.length) - t.kappa;

/** `σ_k = ρ_k/R_k = √(1 − b_k²)` — the tick's ring radius, normalized by its radius. */
export const ringFraction = (t: Tick): number => ringRadiusNorm(t.kappa, t.x.length);

/** A tick is at its boundary once its own perpendicular extent reaches `σ_k`. */
export function isBoundaryState(t: Tick): boolean {
  const K = planeSum(t);
  return sumX(t) >= K - REL_EPS * Math.abs(K);
}

export interface Consolidated {
  n: number;
  /** Σ over every tick of its radius. */
  Rtot: number;
  /** `R_int` — Σ of the radii of the interior ticks. */
  Rint: number;
  /** `R_bound` — Σ of the ring radii `ρ_k` of the boundary ticks. */
  Rbound: number;
  /** `c_bound = H = Σ_B h_k` — the boundary block's pinned component along `v`. */
  H: number;
  /** pool total effective reserves `X = Σ_k x_k`. */
  X: number[];
  /** `x_int` — Σ of the interior ticks' effective reserves. */
  xInt: number[];
  /** `x_bound` — Σ of the boundary ticks' effective reserves. */
  xBound: number[];
  /** `q = ‖X⊥‖ = ‖r⊥‖` — the pool's perpendicular extent. */
  q: number;
  /** `p = r·v` — the pool's component along the equal-price direction. */
  p: number;
  /** `a = p − H` — the interior block's component along `v`. */
  a: number;
  /** `s = (q − R_bound)/R_int` — the interior block's normalized perpendicular extent. */
  s: number;
  /** `α = a/R_int = √(1 − s²)` — the interior block's normalized position along `v`. */
  alpha: number;
}

/** Sum of the ticks' effective reserves, componentwise. */
export function totalX(ticks: Tick[]): number[] {
  const n = ticks[0]?.x.length ?? 0;
  const out = Array.from({ length: n }, () => 0);
  for (const t of ticks) for (let m = 0; m < n; m++) out[m] += t.x[m];
  return out;
}

/**
 * Fold the tick set into the torus parameters. Interior/boundary membership is
 * read from `Tick.state`; the caller keeps it consistent with `s` vs `σ_k`.
 */
export function consolidate(ticks: Tick[], X?: number[]): Consolidated {
  if (ticks.length === 0) throw new OrbitalError("InsufficientLiquidity", "no ticks");
  const n = ticks[0].x.length;
  const sqrtN = Math.sqrt(n);
  const total = X ?? totalX(ticks);
  const xInt = Array.from({ length: n }, () => 0);
  const xBound = Array.from({ length: n }, () => 0);
  let Rtot = 0, Rint = 0, Rbound = 0, H = 0;
  for (const t of ticks) {
    Rtot += t.radius;
    if (t.state === "boundary") {
      Rbound += t.radius * ringFraction(t);
      H += t.radius * planeHeightNorm(t);
      for (let m = 0; m < n; m++) xBound[m] += t.x[m];
    } else {
      Rint += t.radius;
      for (let m = 0; m < n; m++) xInt[m] += t.x[m];
    }
  }
  const S = total.reduce((acc, v) => acc + v, 0);
  let q2 = -(S * S) / n;
  for (const v of total) q2 += v * v;
  const q = q2 <= 0 ? 0 : Math.sqrt(q2);
  const p = (n * Rtot - S) / sqrtN;
  const a = p - H;
  const s = Rint > 0 ? (q - Rbound) / Rint : NaN;
  const alpha = Rint > 0 ? a / Rint : NaN;
  return { n, Rtot, Rint, Rbound, H, X: total, xInt, xBound, q, p, a, s, alpha };
}

/**
 * Relative residual of the torus invariant
 * `(p − H)² + (q − R_bound)² − R_int²`, scaled by `R_int²`.
 * `X` defaults to the consolidation's own totals.
 */
export function torusResidual(c: Consolidated, X?: number[]): number {
  const total = X ?? c.X;
  const { n, Rtot, Rbound, H, Rint } = c;
  const S = total.reduce((acc, v) => acc + v, 0);
  let q2 = -(S * S) / n;
  for (const v of total) q2 += v * v;
  const q = q2 <= 0 ? 0 : Math.sqrt(q2);
  const a = (n * Rtot - S) / Math.sqrt(n) - H;
  const u = q - Rbound;
  const scale = Rint > 0 ? Rint * Rint : Math.max(Rtot * Rtot, 1);
  return Math.abs(a * a + u * u - Rint * Rint) / scale;
}

/** Working scalars for the 1-D solve at a fixed classification. */
export interface Segment {
  c: Consolidated;
  i: number;
  j: number;
  /** Σ of the untouched components. */
  T: number;
  /** Σ of the untouched components squared. */
  C: number;
  /** current `X[j]`, the upper end of the bracket. */
  xj0: number;
}

/** Pin a consolidated state to one `(i, j)` trade so `δ` becomes the only unknown. */
export function segment(c: Consolidated, X: number[], i: number, j: number): Segment {
  let T = 0, C = 0;
  for (let m = 0; m < c.n; m++) {
    if (m === i || m === j) continue;
    T += X[m];
    C += X[m] * X[m];
  }
  return { c, i, j, T, C, xj0: X[j] };
}

/** `(p − H)² + (q − R_bound)² − R_int²` as a function of the out-reserve `y`. */
function residualAt(g: Segment, xi: number, y: number): number {
  const { n, Rtot, H, Rbound, Rint } = g.c;
  const S = g.T + xi + y;
  const a = (n * Rtot - S) / Math.sqrt(n) - H;
  const q2 = g.C + xi * xi + y * y - (S * S) / n;
  const q = q2 <= 0 ? 0 : Math.sqrt(q2);
  const u = q - Rbound;
  return a * a + u * u - Rint * Rint;
}

function residualPrimeAt(g: Segment, xi: number, y: number): number {
  const { n, Rtot, H, Rbound } = g.c;
  const sqrtN = Math.sqrt(n);
  const S = g.T + xi + y;
  const a = (n * Rtot - S) / sqrtN - H;
  const q2 = g.C + xi * xi + y * y - (S * S) / n;
  const q = q2 <= 0 ? 0 : Math.sqrt(q2);
  if (q === 0) return (-2 * a) / sqrtN;
  return (-2 * a) / sqrtN + (2 * (q - Rbound) * (y - S / n)) / q;
}

/**
 * v1's closed form on the consolidated *interior* sphere — exact when there is
 * no boundary tick, and a good Newton seed when there is. Written so the small
 * quantity is never formed as a difference of two pool-sized numbers:
 *
 *     out = δ·(2·r_i − δ) / (√rad + r_j)
 *
 * which is algebraically `r_j − √rad` but keeps full relative precision
 * (`r_m = R_int − x_int,m` is the interior block in the paper's r-frame).
 */
function sphereOut(g: Segment, delta: number): number | null {
  const { n, Rint, xInt } = g.c;
  const { i, j } = g;
  const rI = Rint - xInt[i];
  const rJ = Rint - xInt[j];
  if (delta > rI) return null; // x_int,i would pass R_int
  let S = 0;
  for (let m = 0; m < n; m++) if (m !== i && m !== j) S += (Rint - xInt[m]) ** 2;
  const rad = Rint * Rint - (rI - delta) ** 2 - S;
  if (rad < 0) return null;
  const denom = Math.sqrt(rad) + rJ;
  if (!(denom > 0)) return null;
  const out = (delta * (2 * rI - delta)) / denom;
  if (!Number.isFinite(out) || out < 0) return null;
  return out;
}

function sphereSolve(g: Segment, delta: number): number | null {
  const out = sphereOut(g, delta);
  return out === null ? null : g.c.X[g.j] - out;
}

function v1Guess(g: Segment, delta: number): number {
  return sphereSolve(g, delta) ?? g.c.X[g.j] - delta;
}

/**
 * Solve the torus for the post-trade out-reserve `y = X[j] − amountOut` after
 * `delta` of token `i` goes in. Newton with a maintained bracket; a step that
 * leaves the bracket falls back to bisection. Throws when no root exists.
 */
export function solveOut(g: Segment, delta: number): number {
  return solveSegment(g, delta).y;
}

/**
 * Same solve, also returning the output amount. On the degenerate (all
 * interior) branch that amount comes from `sphereOut`, which is accurate to
 * full relative precision; `X[j] − y` would lose it to cancellation for a
 * trade that is small next to the pool.
 */
export function solveSegment(g: Segment, delta: number): { y: number; amountOut: number } {
  const { n, Rtot, Rint, H, Rbound } = g.c;
  const sqrtN = Math.sqrt(n);
  // No boundary tick: the torus degenerates to the sphere of radius R_int and
  // the closed form is exact — this is the branch where v2 *is* v1.
  if (Rbound === 0 && H === 0) {
    const amountOut = sphereOut(g, delta);
    if (amountOut === null) throw new OrbitalError("InsufficientLiquidity", "no point on the sphere");
    return { y: g.c.X[g.j] - amountOut, amountOut };
  }
  const xi = g.c.X[g.i] + delta;
  // `a` is maximal (= R_int, i.e. α = 1) at this y; the residual there is
  // (q − R_bound)² ≥ 0, so it always brackets the root from below.
  let lo = n * Rtot - sqrtN * (Rint + H) - g.T - xi;
  let hi = g.xj0;
  let flo = residualAt(g, xi, lo);
  const fhi = residualAt(g, xi, hi);
  if (!(flo >= 0)) {
    // numerical slack at α = 1: nudge outward until the sign is right
    for (let k = 0; k < 40 && flo < 0; k++) {
      lo -= Math.max(Math.abs(lo), delta, 1) * 0.5;
      flo = residualAt(g, xi, lo);
    }
  }
  if (fhi > 0) hi = g.xj0 + Math.max(Math.abs(g.xj0), 1) * REL_EPS;
  if (!(flo >= 0) || !(residualAt(g, xi, hi) <= 0)) {
    throw new OrbitalError("InsufficientLiquidity", "no point on the torus");
  }
  let y = v1Guess(g, delta);
  if (!(y > lo && y < hi)) y = 0.5 * (lo + hi);
  const scale = Rint * Rint;
  for (let k = 0; k < NEWTON_MAX; k++) {
    const f = residualAt(g, xi, y);
    if (f > 0) lo = y; else hi = y;
    if (Math.abs(f) <= 1e-16 * scale) return { y, amountOut: g.xj0 - y };
    const d = residualPrimeAt(g, xi, y);
    let next = d !== 0 ? y - f / d : NaN;
    if (!Number.isFinite(next) || next <= lo || next >= hi) next = 0.5 * (lo + hi);
    const step = Math.abs(next - y);
    y = next;
    if (step <= NEWTON_TOL * 1e-6 * Math.max(Math.abs(y), 1)) return { y, amountOut: g.xj0 - y };
  }
  if (hi - lo <= NEWTON_TOL * Math.max(Math.abs(y), 1)) return { y, amountOut: g.xj0 - y };
  throw new OrbitalError("NoConvergence", "torus solve did not converge");
}

/** `s` after `delta` goes in, at the segment's fixed classification. */
function sAt(g: Segment, delta: number): number {
  const y = solveOut(g, delta);
  return sFromY(g, delta, y);
}

function sFromY(g: Segment, delta: number, y: number): number {
  const { n, Rbound, Rint } = g.c;
  const xi = g.c.X[g.i] + delta;
  const S = g.T + xi + y;
  const q2 = g.C + xi * xi + y * y - (S * S) / n;
  const q = q2 <= 0 ? 0 : Math.sqrt(q2);
  return (q - Rbound) / Rint;
}

/**
 * The input `δ ∈ (0, cap]` that lands the pool exactly on `σ_target`
 * (a tick's ring fraction), by bisection on the monotone `s(δ)`.
 */
export function crossingDelta(g: Segment, cap: number, sigmaTarget: number, rising: boolean): number {
  let lo = 0, hi = cap;
  for (let k = 0; k < BISECT_ROUNDS; k++) {
    const mid = 0.5 * (lo + hi);
    let sm: number;
    try { sm = sAt(g, mid); } catch { hi = mid; continue; }
    const past = rising ? sm >= sigmaTarget : sm <= sigmaTarget;
    if (past) hi = mid; else lo = mid;
  }
  return hi;
}

/** The `δ` at which the trade reverses the sign of `ds/dδ` (where `X[i] = X[j]`). */
function turningDelta(g: Segment, cap: number): number | null {
  const h = (d: number): number => g.c.X[g.i] + d - solveOut(g, d);
  let hCap: number;
  try { hCap = h(cap); } catch { return null; }
  if (!(hCap > 0)) return null;
  if (h(0) >= 0) return null;
  let lo = 0, hi = cap;
  for (let k = 0; k < BISECT_ROUNDS; k++) {
    const mid = 0.5 * (lo + hi);
    let hm: number;
    try { hm = h(mid); } catch { hi = mid; continue; }
    if (hm >= 0) hi = mid; else lo = mid;
  }
  return hi;
}

/**
 * Write the consolidated state back onto the individual ticks.
 * Every tick sits at `x_{k,m} = R_k (1 − β_k/√n − σ'_k ŵ_m)` with
 * `σ'_k = s` and `β_k = α` while interior, and `σ'_k = σ_k`, `β_k = b_k`
 * once at the boundary. Summing over `k` reproduces `X` exactly.
 */
export function reconstruct(ticks: Tick[], c: Consolidated): void {
  const { n, q, X } = c;
  const sqrtN = Math.sqrt(n);
  const S = X.reduce((acc, v) => acc + v, 0);
  const w = X.map((v) => (q > 0 ? -(v - S / n) / q : 0));
  for (const t of ticks) {
    const boundary = t.state === "boundary";
    const sg = boundary ? ringFraction(t) : c.s;
    const be = boundary ? planeHeightNorm(t) : c.alpha;
    for (let m = 0; m < n; m++) t.x[m] = t.radius * (1 - be / sqrtN - sg * w[m]);
  }
}

function validate(ticks: Tick[], tokenIn: number, tokenOut: number, amountIn: number): number {
  if (tokenIn === tokenOut) throw new OrbitalError("SameToken");
  if (!(amountIn > 0) || !Number.isFinite(amountIn)) throw new OrbitalError("InvalidAmount");
  if (ticks.length === 0) throw new OrbitalError("InsufficientLiquidity", "no ticks");
  const n = ticks[0].x.length;
  if (
    !Number.isInteger(tokenIn) || !Number.isInteger(tokenOut) ||
    tokenIn < 0 || tokenIn >= n || tokenOut < 0 || tokenOut >= n
  ) {
    throw new OrbitalError("InvalidAmount", "token index out of range");
  }
  return n;
}

/**
 * Bring the classification in line with `s`: a tick is interior exactly while
 * `s < σ_k`. Promotions (un-freezing) only happen when the trade is moving the
 * pool back toward the equal point; demotions only when it is moving away.
 * Re-deriving `s` from the new membership keeps `Σ_k R_k σ'_k = q` exact, so a
 * tick can never land an epsilon short of its plane.
 */
function reclassify(work: Tick[], X: number[], inward: boolean, counter?: { pinned: number }): Consolidated {
  let c = consolidate(work, X);
  for (let k = 0; k < work.length + 1; k++) {
    let changed = false;
    if (inward) {
      // s is about to fall: the boundary tick with the largest σ_k rejoins first.
      // With no interior tick left `s` is undefined; promoting the widest ring
      // is still the right move — it lands `s` exactly on that tick's own σ_k.
      const noInterior = !(c.Rint > 0);
      let best: Tick | null = null;
      for (const t of work) {
        if (t.state !== "boundary") continue;
        const sg = ringFraction(t);
        const eligible = noInterior || sg >= c.s - REL_EPS * Math.max(sg, 1);
        if (eligible && (best === null || sg > ringFraction(best))) best = t;
      }
      if (best) { best.state = "interior"; changed = true; }
    } else {
      // s is about to rise: any interior tick already at or past its ring is pinned
      let best: Tick | null = null;
      for (const t of work) {
        if (t.state !== "interior") continue;
        const sg = ringFraction(t);
        if (sg <= c.s + REL_EPS * Math.max(sg, 1) && (best === null || sg < ringFraction(best))) best = t;
      }
      if (best) { best.state = "boundary"; changed = true; if (counter) counter.pinned++; }
    }
    if (!changed) break;
    c = consolidate(work, X);
  }
  return c;
}

/**
 * v2 quote. Same shape as v1's `quote`; boundary ticks keep trading on their
 * own circles instead of freezing, and un-freeze exactly when a reverse trade
 * pulls the pool back inside their plane.
 */
export function quoteV2(ticks: Tick[], tokenIn: number, tokenOut: number, amountIn: number): QuoteResult {
  validate(ticks, tokenIn, tokenOut, amountIn);
  const i = tokenIn, j = tokenOut;
  const work = ticks.map(cloneTick);
  for (const t of work) t.state = isBoundaryState(t) ? "boundary" : "interior";

  const X = totalX(work);
  // v1 parity: settle the classification for this direction before pricing.
  reclassify(work, X, X[i] < X[j]);
  const priceBefore = poolPrice(pricingTicks(work), j, i);

  let remaining = amountIn;
  let out = 0;
  let crossed = 0;
  let lastRising = true;

  for (let seg = 0; seg < MAX_SEGMENTS && remaining > amountIn * REL_EPS; seg++) {
    const inward = X[i] < X[j];
    const c = reclassify(work, X, inward);
    if (!(c.Rint > 0)) throw new OrbitalError("InsufficientLiquidity", "every tick is at its boundary");
    const g = segment(c, X, i, j);

    // `s` is monotone in δ up to the point where X[i] meets X[j]; split there.
    let cap = remaining;
    if (inward) {
      const turn = turningDelta(g, cap);
      if (turn !== null && turn > 0 && turn < cap) cap = turn;
    }

    const sCap = sAt(g, cap);
    const rising = sCap > c.s;
    lastRising = rising;

    // nearest tick whose ring fraction the segment would cross
    let target: Tick | null = null;
    for (const t of work) {
      const sg = ringFraction(t);
      if (rising) {
        if (t.state !== "interior" || !(sg > c.s) || !(sg <= sCap)) continue;
        if (target === null || sg < ringFraction(target)) target = t;
      } else {
        if (t.state !== "boundary" || !(sg < c.s) || !(sg >= sCap)) continue;
        if (target === null || sg > ringFraction(target)) target = t;
      }
    }

    const d = target ? crossingDelta(g, cap, ringFraction(target), rising) : cap;
    const { y, amountOut: got } = solveSegment(g, d);
    if (got < -REL_EPS * c.Rtot) throw new OrbitalError("InsufficientLiquidity", "negative output");
    out += Math.max(got, 0);
    X[i] += d;
    X[j] = y;
    remaining = Math.max(remaining - d, 0);

    if (target) {
      target.state = rising ? "boundary" : "interior";
      if (rising) crossed++;
    }
    reconstruct(work, consolidate(work, X));
  }
  if (remaining > amountIn * REL_EPS) throw new OrbitalError("NoConvergence", "swap did not segment");

  // A tick can finish the last segment sitting exactly on its plane without the
  // segment having been cut there (v1 catches the same near-tie explicitly).
  const pinned = { pinned: 0 };
  reconstruct(work, reclassify(work, X, !lastRising, pinned));
  crossed += pinned.pinned;

  return {
    amountOut: out,
    ticksCrossed: crossed,
    ticks: work,
    priceBefore,
    priceAfter: poolPrice(pricingTicks(work), j, i),
  };
}

/** Largest amountIn for which `quoteV2` does not throw (bisection, 60 rounds). */
export function maxFillableV2(ticks: Tick[], tokenIn: number, tokenOut: number): number {
  let lo = 0;
  let hi = ticks.reduce((a, t) => a + t.radius, 0);
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    try { quoteV2(ticks, tokenIn, tokenOut, mid); lo = mid; } catch { hi = mid; }
  }
  return lo;
}

/** v2 counterpart of `tickLandingAmounts` — same contract, same ordering. */
export function tickLandingAmountsV2(
  ticks: Tick[],
  tokenIn: number,
  tokenOut: number,
): { depegBps: number; amountIn: number }[] {
  if (ticks.length === 0 || tokenIn === tokenOut) return [];
  let top: number;
  try { top = maxFillableV2(ticks, tokenIn, tokenOut); } catch { return []; }
  if (!(top > 0)) return [];

  const isBoundary = (k: number, amountIn: number): boolean => {
    try { return quoteV2(ticks, tokenIn, tokenOut, amountIn).ticks[k].state === "boundary"; }
    catch { return true; }
  };

  const out: { depegBps: number; amountIn: number }[] = [];
  ticks.forEach((t, k) => {
    if (t.state !== "interior") return;
    if (!isBoundary(k, top)) return;
    let lo = 0, hi = top;
    for (let r = 0; r < 40; r++) {
      const mid = (lo + hi) / 2;
      if (isBoundary(k, mid)) hi = mid; else lo = mid;
    }
    out.push({ depegBps: t.depegBps, amountIn: hi });
  });
  return out.sort((a, b) => a.amountIn - b.amountIn);
}
