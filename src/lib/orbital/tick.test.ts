import { describe, it, expect } from "vitest";
import { createTick, sumX, planeSum, realReserves, invariantResidual, marginalPrice, poolPrice, poolRealReserves, pricingTicks } from "./tick";

describe("tick", () => {
  it("starts at the equal point with real reserves equal to the deposit", () => {
    const t = createTick("a", 500, 2_500_000, 3);
    expect(t.state).toBe("interior");
    expect(t.x[0]).toBeCloseTo(t.x[1], 9);
    for (const r of realReserves(t)) expect(r).toBeCloseTo(2_500_000, 3);
    expect(invariantResidual(t)).toBeLessThan(1e-12);
    expect(sumX(t)).toBeLessThan(planeSum(t));
  });
  it("prices are 1.0 at the equal point", () => {
    const t = createTick("a", 100, 1000, 3);
    expect(marginalPrice(t, 0, 1)).toBeCloseTo(1, 12);
    expect(poolPrice([t, createTick("b", 1000, 1000, 3)], 2, 0)).toBeCloseTo(1, 12);
  });
  it("effective reserve is capEff times the real deposit", () => {
    const t = createTick("a", 100, 1000, 3);
    expect(t.x[0] / 1000).toBeGreaterThan(100);
  });
  it("pool real reserves sum over ticks", () => {
    const ticks = [createTick("a", 100, 1000, 3), createTick("b", 1000, 500, 3)];
    expect(poolRealReserves(ticks)[1]).toBeCloseTo(1500, 6);
  });
  it("pricingTicks prefers interior ticks, else the widest boundary tick", () => {
    const a = createTick("a", 100, 1000, 3), b = createTick("b", 1000, 1000, 3);
    expect(pricingTicks([a, b]).map((t) => t.id)).toEqual(["a", "b"]);
    a.state = "boundary";
    expect(pricingTicks([a, b]).map((t) => t.id)).toEqual(["b"]);
    b.state = "boundary";
    expect(pricingTicks([a, b]).map((t) => t.id)).toEqual(["b"]);
  });
});
