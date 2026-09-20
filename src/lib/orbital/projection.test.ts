import { describe, it, expect } from "vitest";
import { createTick } from "./tick";
import { quote } from "./swap";
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
});
