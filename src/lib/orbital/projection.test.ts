import { describe, it, expect } from "vitest";
import { createTick, pricingTicks } from "./tick";
import { quote, maxFillable } from "./swap";
import { kappaFromDepeg, ringRadiusNorm } from "./geometry";
import { projectState, tokenCorners, schematicRadius } from "./projection";

describe("projection", () => {
  it("equal point projects to the origin", () => {
    const p = projectState([createTick("a", 100, 1000, 3)]);
    expect(p.rho).toBeLessThan(1e-12);
  });
  it("selling token0 moves the point toward the token0 corner", () => {
    const q = quote([createTick("a", 1000, 1000, 3)], 0, 1, 50);
    const p = projectState(q.ticks);
    const c = tokenCorners()[0];
    const dot = p.u * c.u + p.v * c.v;
    expect(dot).toBeGreaterThan(0);
  });
  it("corners are 120 degrees apart and unit length", () => {
    const c = tokenCorners();
    for (const k of c) expect(Math.hypot(k.u, k.v)).toBeCloseTo(1, 9);
    expect(c[0].u * c[1].u + c[0].v * c[1].v).toBeCloseTo(-0.5, 9);
  });
  it("schematic radius interpolates between rings", () => {
    const rings = [0.1, 0.2, 0.4];
    expect(schematicRadius(0, rings)).toBe(0);
    expect(schematicRadius(0.1, rings)).toBeCloseTo(1, 9);
    expect(schematicRadius(0.3, rings)).toBeCloseTo(2.5, 9);
    expect(schematicRadius(9, rings)).toBeCloseTo(3.5, 9);
  });

  // Regression: projectState's radius-weighted average (Σx/ΣR) over *every* tick is
  // dominated by the 0.1% tick, whose radius (~6.5e9) dwarfs the other three combined
  // (~8.5e8). Once the 0.1% tick pins at its plane, that average barely moves even as
  // the ticks that are still actually pricing the trade walk out to their own boundary
  // — so the dot used to stall just past ring 1. Projecting `pricingTicks(ticks)`
  // instead (the interior ticks, or the single widest boundary tick once all are
  // pinned) tracks what is really trading.
  describe("dot radius uses the pricing ticks, not the radius-weighted average", () => {
    const seed = () => [10, 100, 500, 1000].map((bps) => createTick(`t${bps}`, bps, 2_500_000, 3));
    const rings = seed()
      .sort((a, b) => a.depegBps - b.depegBps)
      .map((t) => ringRadiusNorm(kappaFromDepeg(t.depegBps, 3), 3));

    it("sits outside ring 2 after the 10 & 100 bps ticks hit boundary", () => {
      const { ticks } = quote(seed(), 0, 1, 7_000_000);
      expect(ticks.filter((t) => t.state === "boundary").map((t) => t.depegBps).sort()).toEqual([10, 100]);
      const r = schematicRadius(projectState(pricingTicks(ticks)).rho, rings);
      expect(r).toBeGreaterThanOrEqual(2);
    });

    it("sits outside ring 3 at the liquidity edge", () => {
      const cap = maxFillable(seed(), 0, 1);
      const { ticks } = quote(seed(), 0, 1, cap * 0.999999);
      const r = schematicRadius(projectState(pricingTicks(ticks)).rho, rings);
      expect(r).toBeGreaterThanOrEqual(3);
    });
  });
});
