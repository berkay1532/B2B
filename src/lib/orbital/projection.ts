import { equalPointNorm } from "./geometry";
import type { Tick } from "./types";

const S2 = Math.SQRT2;
const S6 = Math.sqrt(6);

/** Orthonormal basis of the plane orthogonal to (1,1,1). */
function basis(dev: number[]): { u: number; v: number } {
  return { u: (dev[0] - dev[1]) / S2, v: (dev[0] + dev[1] - 2 * dev[2]) / S6 };
}

export function projectState(ticks: Tick[]): { u: number; v: number; rho: number } {
  const Rsum = ticks.reduce((a, t) => a + t.radius, 0);
  const xeq = equalPointNorm(3);
  const dev = [0, 1, 2].map((k) => ticks.reduce((a, t) => a + t.x[k], 0) / Rsum - xeq);
  const { u, v } = basis(dev);
  return { u, v, rho: Math.hypot(u, v) };
}

export function tokenCorners(): { u: number; v: number }[] {
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => {
    const { u, v } = basis(e);
    const len = Math.hypot(u, v);
    return { u: u / len, v: v / len };
  });
}

export function schematicRadius(rho: number, rings: number[]): number {
  if (rings.length === 0) return 0;
  if (rho <= 0) return 0;
  let prev = 0;
  for (let k = 0; k < rings.length; k++) {
    const r = rings[k];
    if (rho <= r) return k + (rho - prev) / (r - prev);
    prev = r;
  }
  return rings.length + 0.5;
}
