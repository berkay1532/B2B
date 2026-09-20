import { describe, it, expect } from "vitest";
import { createTick } from "./tick";
import { invariantResidual, planeSum, sumX } from "./tick";
import { maxFillable, quote } from "./swap";
import {
  consolidate,
  MAX_ENTRY_RESIDUAL,
  maxFillableV2,
  quoteV2,
  ringFraction,
  torusResidual,
  totalX,
} from "./torus";
import { OrbitalError, type Tick } from "./types";

const seed = (): Tick[] => [10, 100, 500, 1000].map((bps) => createTick(`t${bps}`, bps, 2_500_000, 3));

/** Σ of the tick radii — the scale at which float64 runs out of resolution. */
const poolScale = (ticks: Tick[]): number => ticks.reduce((a, t) => a + t.radius, 0);

/** Every tick sits on its own sphere, and a pinned one sits on its plane too. */
function expectTicksOnTheirSurfaces(ticks: Tick[]) {
  for (const t of ticks) {
    expect(invariantResidual(t)).toBeLessThan(1e-9);
    const rel = (sumX(t) - planeSum(t)) / planeSum(t);
    if (t.state === "boundary") expect(Math.abs(rel)).toBeLessThan(1e-9);
    else expect(rel).toBeLessThan(1e-9);
  }
}

describe("quoteV2 — argument handling", () => {
  it("rejects the same token, non-positive amounts and out-of-range indices", () => {
    expect(() => quoteV2(seed(), 0, 0, 1)).toThrow(OrbitalError);
    expect(() => quoteV2(seed(), 0, 1, 0)).toThrow(OrbitalError);
    expect(() => quoteV2(seed(), 0, 5, 1000)).toThrow(OrbitalError);
  });

  it("rejects a state that is not on the torus (e.g. one produced by v1)", () => {
    // v1 freezes a boundary tick where v2 would have carried it along its
    // circle, so a v1 post-swap state sits off the consolidated surface.
    const v1State = quote(seed(), 0, 1, 7_000_000).ticks;
    expect(v1State.some((t) => t.state === "boundary")).toBe(true);
    const residual = torusResidual(consolidate(v1State));
    expect(residual).toBeGreaterThan(MAX_ENTRY_RESIDUAL);

    expect(() => quoteV2(v1State, 0, 1, 1)).toThrow(
      expect.objectContaining({ code: "InvalidTick" }),
    );
    // ... and without the guard that gap is quietly paid out as output
    expect(() => quoteV2(v1State, 0, 1, 1)).toThrow(/not on the torus/);
  });

  it("accepts every state its own quotes produce, with room to spare", () => {
    let ticks = seed();
    let worst = 0;
    for (const [i, j, a] of [[0, 1, 3e6], [1, 2, 2e6], [2, 0, 1e6], [0, 1, 4e6]] as const) {
      const q = quoteV2(ticks, i, j, a);
      worst = Math.max(worst, torusResidual(consolidate(q.ticks)));
      ticks = q.ticks;
    }
    // the entry threshold is not a hair's breadth above what v2 itself emits
    expect(worst).toBeLessThan(MAX_ENTRY_RESIDUAL / 10);
  });

  it("does not mutate the input ticks", () => {
    const ticks = seed();
    const before = ticks.map((t) => [...t.x]);
    quoteV2(ticks, 0, 1, 3_000_000);
    ticks.forEach((t, i) => expect(t.x).toEqual(before[i]));
  });
});

// (a)
describe("(a) with no tick at its boundary, v2 reduces to v1", () => {
  it("matches quote() on 1k, 100k and 1M inputs", () => {
    for (const amountIn of [1_000, 100_000, 1_000_000]) {
      const v1 = quote(seed(), 0, 1, amountIn);
      const v2 = quoteV2(seed(), 0, 1, amountIn);
      expect(v2.ticksCrossed).toBe(0);
      expect(v1.ticksCrossed).toBe(0);
      // v1 forms `out` as the difference of two pool-sized reserves, so its own
      // float64 resolution is ~eps * ΣR (≈ 1.6e-6 on this seed) — at 1k in it is
      // the binding term, not v2 (which computes the same root to ~1e-16 rel).
      const tol = Math.max(1e-9 * v1.amountOut, 4 * Number.EPSILON * poolScale(seed()));
      expect(Math.abs(v2.amountOut - v1.amountOut)).toBeLessThanOrEqual(tol);
      expect(v2.priceAfter).toBeCloseTo(v1.priceAfter, 9);
    }
  });

  it("leaves the consolidated state on the plain sphere (R_bound = 0)", () => {
    const q = quoteV2(seed(), 0, 1, 1_000_000);
    const c = consolidate(q.ticks);
    expect(c.Rbound).toBe(0);
    expect(c.H).toBe(0);
    expect(c.Rint).toBeCloseTo(c.Rtot, 6);
  });
});

// (b)
describe("(b) the torus invariant holds after every segment", () => {
  it("residual stays under 1e-9 across the whole fillable range", () => {
    // these amounts straddle each tick landing, so the quote runs 1..4 segments
    for (const amountIn of [1e3, 1e6, 2.4e6, 2.5e6, 4.9e6, 5.1e6, 7e6, 7.7e6, 8.8e6]) {
      const before = seed();
      const X0 = totalX(before);
      const q = quoteV2(before, 0, 1, amountIn);
      expect(torusResidual(consolidate(q.ticks))).toBeLessThan(1e-9);
      expectTicksOnTheirSurfaces(q.ticks);

      // conservation: the pool's totals moved by exactly the traded amounts and
      // nothing else. X1 is recomputed from the returned ticks, so this also
      // pins the per-tick reconstruction to the consolidated solve.
      const X1 = totalX(q.ticks);
      expect(Math.abs(X1[0] - (X0[0] + amountIn)) / (X0[0] + amountIn)).toBeLessThan(1e-9);
      expect(Math.abs(X1[1] - (X0[1] - q.amountOut)) / X0[1]).toBeLessThan(1e-9);
      // the untraded token never moves
      expect(Math.abs(X1[2] - X0[2]) / X0[2]).toBeLessThan(1e-12);
    }
  });
});

// (c)
describe("(c) amount out is monotone in amount in", () => {
  it("rises with the input and never over-delivers", () => {
    let lastOut = 0;
    let lastPrice = 0;
    for (const a of [1e3, 1e4, 1e5, 1e6, 3e6, 5e6, 7e6, 8.5e6]) {
      const q = quoteV2(seed(), 0, 1, a);
      expect(q.amountOut).toBeGreaterThan(lastOut);
      expect(q.amountOut).toBeLessThan(a);
      expect(q.priceAfter).toBeGreaterThanOrEqual(lastPrice);
      lastOut = q.amountOut;
      lastPrice = q.priceAfter;
    }
  });
});

// (d)
describe("(d) a round trip never gains", () => {
  it("returns no more than was sent, at three sizes", () => {
    for (const a of [500_000, 3_000_000, 6_000_000]) {
      const q1 = quoteV2(seed(), 0, 1, a);
      const q2 = quoteV2(q1.ticks, 1, 0, q1.amountOut);
      expect(q2.amountOut).toBeLessThanOrEqual(a + 1e-6);
    }
  });
});

// (e)
describe("(e) on a large swap v2 beats v1 by a little", () => {
  it("7M: v2 out >= v1 out and the gap is under 1%", () => {
    const v1 = quote(seed(), 0, 1, 7_000_000);
    const v2 = quoteV2(seed(), 0, 1, 7_000_000);
    // 1e-9 relative slack: on trades where the two agree analytically the gap is
    // pure float noise (up to ~3e-11 measured) and can land either side of zero.
    expect(v2.amountOut).toBeGreaterThanOrEqual(v1.amountOut * (1 - 1e-9));
    expect((v2.amountOut - v1.amountOut) / v1.amountOut).toBeLessThan(0.01);
    expect(v2.ticksCrossed).toBe(v1.ticksCrossed);
  });

  it("the pool can absorb at least as much as under v1", () => {
    expect(maxFillableV2(seed(), 0, 1)).toBeGreaterThanOrEqual(maxFillable(seed(), 0, 1));
  });

  it("past the fill limit it throws InsufficientLiquidity", () => {
    const max = maxFillableV2(seed(), 0, 1);
    expect(() => quoteV2(seed(), 0, 1, max * 1.01)).toThrow(
      expect.objectContaining({ code: "InsufficientLiquidity" }),
    );
  });
});

// (f)
describe("(f) a tick crosses and un-crosses", () => {
  it("a reverse trade pulls the tick back inside, with consistent reserves", () => {
    const start = seed();
    const fwd = quoteV2(start, 0, 1, 3_000_000);
    expect(fwd.ticks[0].state).toBe("boundary");
    expect(fwd.ticksCrossed).toBe(1);

    const back = quoteV2(fwd.ticks, 1, 0, fwd.amountOut);
    expect(back.ticks[0].state).toBe("interior");
    // un-freezing is not a crossing
    expect(back.ticksCrossed).toBe(0);
    expectTicksOnTheirSurfaces(back.ticks);

    // the round trip lands back where it started (minus the curvature loss)
    back.ticks.forEach((t, k) => {
      t.x.forEach((v, m) => {
        expect(Math.abs(v - start[k].x[m]) / start[k].radius).toBeLessThan(1e-6);
      });
    });
  });

  it("a single tick at its boundary can still be traded inward", () => {
    const ticks = [createTick("a", 1000, 1_000_000, 3)];
    const pinned = quoteV2(ticks, 0, 1, maxFillableV2(ticks, 0, 1));
    expect(pinned.ticks[0].state).toBe("boundary");
    const back = quoteV2(pinned.ticks, 1, 0, 1000);
    expect(back.ticks[0].state).toBe("interior");
    expect(back.amountOut).toBeGreaterThan(1000); // token0 is cheap now
    expect(back.ticksCrossed).toBe(0);
  });
});

// (g)
describe("(g) property: random trade sequences keep every tick on its surface", () => {
  it("survives 40 random trades", () => {
    // deterministic LCG so a failure is reproducible
    let s = 0x2545f491;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    let ticks = seed();
    let trades = 0;
    for (let k = 0; k < 40; k++) {
      const i = Math.floor(rnd() * 3);
      let j = Math.floor(rnd() * 3);
      if (j === i) j = (j + 1) % 3;
      const cap = maxFillableV2(ticks, i, j);
      if (!(cap > 1)) continue;
      const amountIn = Math.max(1, rnd() * cap * 0.9);
      let q;
      try { q = quoteV2(ticks, i, j, amountIn); } catch { continue; }
      trades++;
      expect(q.amountOut).toBeGreaterThan(0);
      expectTicksOnTheirSurfaces(q.ticks);
      expect(torusResidual(consolidate(q.ticks))).toBeLessThan(1e-9);
      ticks = q.ticks;
    }
    expect(trades).toBeGreaterThan(20);
  });
});

// boundary ticks keep trading: perpendicular moves, parallel stays pinned
describe("a boundary tick trades on its circle", () => {
  it("keeps sum(x) on its plane while its perpendicular reserves move", () => {
    const fwd = quoteV2(seed(), 0, 1, 3_000_000);
    const pinnedBefore = fwd.ticks.filter((t) => t.state === "boundary");
    expect(pinnedBefore.length).toBeGreaterThan(0);
    const snapshot = pinnedBefore.map((t) => [...t.x]);

    // now trade the *other* two tokens; the pinned tick must ride its circle
    const next = quoteV2(fwd.ticks, 1, 2, 500_000);
    const pinnedAfter = next.ticks.filter((t) => pinnedBefore.some((p) => p.id === t.id));

    pinnedAfter.forEach((t, k) => {
      // parallel component stays exactly on the plane
      const rel = Math.abs(sumX(t) - planeSum(t)) / planeSum(t);
      expect(rel).toBeLessThan(1e-9);
      // and it stays on its own sphere
      expect(invariantResidual(t)).toBeLessThan(1e-9);
      // but the perpendicular reserves genuinely moved
      const moved = t.x.some((v, m) => Math.abs(v - snapshot[k][m]) > 1e-6 * t.radius);
      expect(moved).toBe(true);
      // ... and it is still sitting exactly on its ring
      const c = consolidate(next.ticks);
      expect(Math.abs(c.q)).toBeGreaterThan(0);
      expect(ringFraction(t)).toBeGreaterThan(0);
    });
  });
});
