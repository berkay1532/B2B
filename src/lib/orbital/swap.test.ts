import { describe, it, expect } from "vitest";
import { createTick, invariantResidual, poolPrice, sumX, planeSum } from "./tick";
import { quote, maxFillable, deltaToPlane } from "./swap";
import { OrbitalError } from "./types";

const seed = () => [10, 100, 500, 1000].map((bps) => createTick(`t${bps}`, bps, 2_500_000, 3));

describe("quote", () => {
  it("rejects same token and non-positive amounts", () => {
    expect(() => quote(seed(), 0, 0, 1)).toThrow(OrbitalError);
    expect(() => quote(seed(), 0, 1, 0)).toThrow(OrbitalError);
  });
  it("a $1 swap in a $30M pool moves price by less than 1 bps and returns ~1", () => {
    const q = quote(seed(), 0, 1, 1);
    expect(q.amountOut).toBeGreaterThan(0.999);
    expect(q.amountOut).toBeLessThanOrEqual(1);
    expect(Math.abs(q.priceAfter - 1)).toBeLessThan(1e-4);
    expect(q.ticksCrossed).toBe(0);
  });
  it("keeps every tick on its sphere", () => {
    const q = quote(seed(), 0, 1, 7_000_000);
    for (const t of q.ticks) expect(invariantResidual(t)).toBeLessThan(1e-9);
  });
  it("does not mutate the input ticks", () => {
    const ticks = seed();
    const before = ticks.map((t) => [...t.x]);
    quote(ticks, 0, 1, 1_000_000);
    ticks.forEach((t, i) => expect(t.x).toEqual(before[i]));
  });
  it("flips ticks to boundary from tightest to widest", () => {
    // in the seed pool the 10 bps tick lands on its plane near $2.2M of input,
    // the 100 bps tick near $5M; $7M leaves two or three ticks at boundary
    const q = quote(seed(), 0, 1, 7_000_000);
    const states = q.ticks.map((t) => t.state);
    expect(states[0]).toBe("boundary");
    // boundary ticks form a prefix of the list ordered by depegBps
    const firstInterior = states.indexOf("interior");
    if (firstInterior >= 0) expect(states.slice(firstInterior).every((s) => s === "interior")).toBe(true);
    expect(q.ticksCrossed).toBeGreaterThan(0);
  });
  it("a tick landed on its plane satisfies sum(x) = planeSum", () => {
    const t = createTick("a", 1000, 1000, 3);
    const d = deltaToPlane(t, 0, 1);
    const q = quote([t], 0, 1, d);
    expect(q.ticks[0].state).toBe("boundary");
    expect(Math.abs(sumX(q.ticks[0]) - planeSum(q.ticks[0])) / planeSum(q.ticks[0])).toBeLessThan(1e-9);
  });
  it("throws InsufficientLiquidity once every tick is boundary, price capped near 1/p", () => {
    const ticks = [createTick("a", 1000, 1_000_000, 3)];
    const max = maxFillable(ticks, 0, 1);
    const q = quote(ticks, 0, 1, max);
    expect(q.ticks[0].state).toBe("boundary");
    const p = 0.9;
    expect(q.priceAfter).toBeGreaterThan((1 / p) * 0.95);
    expect(q.priceAfter).toBeLessThan((1 / p) * 1.05);
    expect(() => quote(ticks, 0, 1, max * 1.01)).toThrow(
      expect.objectContaining({ code: "InsufficientLiquidity" })
    );
  });
  it("amount out and price are monotone in amount in", () => {
    let lastOut = 0, lastPrice = 0;
    for (const a of [1e3, 1e4, 1e5, 1e6]) {
      const q = quote(seed(), 0, 1, a);
      expect(q.amountOut).toBeGreaterThan(lastOut);
      expect(q.priceAfter).toBeGreaterThanOrEqual(lastPrice);
      lastOut = q.amountOut; lastPrice = q.priceAfter;
    }
  });
  it("round trip never returns more than sent", () => {
    const q1 = quote(seed(), 0, 1, 500_000);
    const q2 = quote(q1.ticks, 1, 0, q1.amountOut);
    expect(q2.amountOut).toBeLessThanOrEqual(500_000 + 1e-6);
  });
  it("a boundary tick rejoins when the trade moves it inward", () => {
    const ticks = [createTick("a", 1000, 1_000_000, 3)];
    const out = quote(ticks, 0, 1, maxFillable(ticks, 0, 1));
    const back = quote(out.ticks, 1, 0, 1000);
    expect(back.ticks[0].state).toBe("interior");
    expect(back.amountOut).toBeGreaterThan(1000); // token0 is cheap now
    // reactivating the tick on this reverse trade must not itself count as a crossing
    expect(back.ticksCrossed).toBe(0);
  });
  it("pool price at the equal point is 1", () => {
    expect(poolPrice(seed(), 0, 2)).toBeCloseTo(1, 12);
  });
  it("priceBefore reflects the same (post-reactivation) tick set as priceAfter", () => {
    const forward = quote(seed(), 0, 1, 7_000_000);
    const reverse = quote(forward.ticks, 1, 0, 1);
    expect(Math.abs(reverse.priceAfter - reverse.priceBefore)).toBeLessThan(1e-6);
  });
  it("rejects an out-of-range token index", () => {
    expect(() => quote(seed(), 0, 5, 1000)).toThrow(OrbitalError);
  });
});
