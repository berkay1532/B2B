import { describe, it, expect } from "vitest";
import { equalPointNorm, kappaFromDepeg, xMinNorm, capitalEfficiency, ringRadiusNorm } from "./geometry";

describe("geometry", () => {
  it("equal point for n=3", () => {
    expect(equalPointNorm(3)).toBeCloseTo(0.4226497, 6);
  });
  it("kappa at zero depeg equals sqrt(n)-1", () => {
    expect(kappaFromDepeg(0, 3)).toBeCloseTo(Math.sqrt(3) - 1, 9);
  });
  it("kappa grows with depeg", () => {
    expect(kappaFromDepeg(1000, 3)).toBeGreaterThan(kappaFromDepeg(100, 3));
  });
  it.each([
    [10, 1098, 3], [100, 110, 3], [500, 21.8, 3], [1000, 10.8, 3],
    [1000, 15.3, 5], [100, 154, 5],
  ])("capital efficiency %i bps n=%i -> ~%f", (bps, expected, n) => {
    const eff = capitalEfficiency(bps, n);
    expect(Math.abs(eff - expected) / expected).toBeLessThan(0.01);
  });
  it("xMin is below equal point", () => {
    const k = kappaFromDepeg(500, 3);
    expect(xMinNorm(k, 3)).toBeLessThan(equalPointNorm(3));
  });
  it("ring radius is ~0 at peg and grows with depeg", () => {
    expect(ringRadiusNorm(kappaFromDepeg(0, 3), 3)).toBeCloseTo(0, 6);
    expect(ringRadiusNorm(kappaFromDepeg(1000, 3), 3)).toBeGreaterThan(ringRadiusNorm(kappaFromDepeg(100, 3), 3));
  });
});
