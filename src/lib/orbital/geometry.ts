import { OrbitalError } from "./types";

/** Normalized reserve of every token at the equal-price point (R = 1). */
export const equalPointNorm = (n: number): number => 1 - 1 / Math.sqrt(n);

/**
 * Normalized plane constant for a tick whose coins may fall to price
 * p = 1 - depegBps/10000 before the tick exits. Derived from the state where
 * one coin sits at price p and the remaining n-1 coins are equal.
 */
export function kappaFromDepeg(depegBps: number, n: number): number {
  if (depegBps < 0 || depegBps >= 10000) throw new OrbitalError("InvalidTick", "depegBps out of range");
  const p = 1 - depegBps / 10000;
  const u = 1 / Math.sqrt(p * p + n - 1);
  return (n - u * (p + n - 1)) / Math.sqrt(n);
}

/**
 * Smallest normalized reserve one token can reach while the tick is interior:
 * the point on the plane sum(x) = kappa*sqrt(n) where that token is minimal
 * and the others are equal. Solves (1-a)^2 + (n-1)(1-b)^2 = 1 with
 * a + (n-1) b = kappa*sqrt(n).
 */
export function xMinNorm(kappa: number, n: number): number {
  const m = n - 1;
  const s = kappa * Math.sqrt(n);
  const A = 1 + 1 / m;
  const B = -2 + (2 * (m - s)) / m;
  const C = (m - s) ** 2 / m;
  const d = B * B - 4 * A * C;
  if (d < 0) throw new OrbitalError("InvalidTick", "plane does not intersect sphere");
  return (-B - Math.sqrt(d)) / (2 * A);
}

/** How many times larger the tick's effective reserve is than the LP's real deposit. */
export function capitalEfficiency(depegBps: number, n: number): number {
  const xeq = equalPointNorm(n);
  const xmin = xMinNorm(kappaFromDepeg(depegBps, n), n);
  return xeq / (xeq - xmin);
}

/**
 * Radius (R = 1) of the circle where the tick plane cuts the sphere, measured
 * in the plane orthogonal to the equal-price direction. Zero at peg.
 */
export function ringRadiusNorm(kappa: number, n: number): number {
  const d = Math.sqrt(n) - kappa; // distance from sphere center to the plane
  const r2 = 1 - d * d;
  return r2 <= 0 ? 0 : Math.sqrt(r2);
}
