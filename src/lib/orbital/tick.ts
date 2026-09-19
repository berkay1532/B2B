import { equalPointNorm, kappaFromDepeg, xMinNorm } from "./geometry";
import { OrbitalError, type Tick } from "./types";

export function createTick(id: string, depegBps: number, realPerToken: number, n: number): Tick {
  if (!(realPerToken > 0)) throw new OrbitalError("InvalidAmount", "deposit must be positive");
  const kappa = kappaFromDepeg(depegBps, n);
  const xmin = xMinNorm(kappa, n);
  const xeq = equalPointNorm(n);
  const radius = realPerToken / (xeq - xmin);
  return {
    id, depegBps, radius, kappa, xMinNorm: xmin,
    x: Array.from({ length: n }, () => radius * xeq),
    state: "interior",
  };
}

export const cloneTick = (t: Tick): Tick => ({ ...t, x: [...t.x] });

export const sumX = (t: Tick): number => t.x.reduce((a, b) => a + b, 0);

export const planeSum = (t: Tick): number => t.kappa * t.radius * Math.sqrt(t.x.length);

export const realReserves = (t: Tick): number[] => t.x.map((v) => v - t.xMinNorm * t.radius);

export function invariantResidual(t: Tick): number {
  const R = t.radius;
  const s = t.x.reduce((acc, v) => acc + (R - v) ** 2, 0);
  return Math.abs(s - R * R) / (R * R);
}

export function marginalPrice(t: Tick, i: number, j: number): number {
  return (t.radius - t.x[i]) / (t.radius - t.x[j]);
}

export function poolPrice(ticks: Tick[], i: number, j: number): number {
  let num = 0, den = 0;
  for (const t of ticks) { num += t.radius - t.x[i]; den += t.radius - t.x[j]; }
  return num / den;
}

/** Ticks whose marginal price is the pool's readable price. */
export function pricingTicks(ticks: Tick[]): Tick[] {
  const interior = ticks.filter((t) => t.state === "interior");
  if (interior.length > 0) return interior;
  if (ticks.length === 0) return [];
  const widest = ticks.reduce((a, t) => (t.depegBps > a.depegBps ? t : a), ticks[0]);
  return [widest];
}

export function poolRealReserves(ticks: Tick[]): number[] {
  const n = ticks[0]?.x.length ?? 0;
  const out = Array.from({ length: n }, () => 0);
  for (const t of ticks) realReserves(t).forEach((v, k) => { out[k] += v; });
  return out;
}
