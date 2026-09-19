"use client";
import type { Tick } from "@/lib/orbital";
import { TOKENS } from "@/config/tokens";

/** Consolidated sphere for display: R = sum R_t, x = sum x_t. */
export function TwoTokenCurve({ ticks, i, j, prev }: { ticks: Tick[]; i: number; j: number; prev?: Tick[] }) {
  const w = 460, h = 380, pad = 40;
  const R = ticks.reduce((a, t) => a + t.radius, 0);
  const x = [0, 1, 2].map((k) => ticks.reduce((a, t) => a + t.x[k], 0));
  const S = [0, 1, 2].filter((k) => k !== i && k !== j).reduce((a, k) => a + (R - x[k]) ** 2, 0);
  const f = (xi: number) => { const rad = R * R - (R - xi) ** 2 - S; return rad < 0 ? NaN : R - Math.sqrt(rad); };
  const xMin = x[i] * 0.4, xMax = Math.min(R, x[i] * 2.4);
  const ys = [] as number[]; const pts = [] as [number, number][];
  for (let k = 0; k <= 120; k++) { const xi = xMin + ((xMax - xMin) * k) / 120; const yj = f(xi); if (Number.isFinite(yj)) { pts.push([xi, yj]); ys.push(yj); } }
  // ys can be empty if every sample lands off the sphere (NaN); fall back to
  // the current point so the axis scale never divides by an Infinity/-Infinity spread.
  const yMin = ys.length ? Math.min(...ys) : x[j];
  const yMax = ys.length ? Math.max(...ys) : x[j];
  const sx = (v: number) => pad + ((v - xMin) / (xMax - xMin)) * (w - 2 * pad);
  const sy = (v: number) => h - pad - ((v - yMin) / (yMax - yMin || 1)) * (h - 2 * pad);
  const d = pts.map(([a, b], k) => `${k ? "L" : "M"}${sx(a)},${sy(b)}`).join(" ");
  const px = prev ? [0, 1, 2].map((k) => prev.reduce((a, t) => a + t.x[k], 0)) : null;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="two token curve">
      <path d={d} fill="none" className="stroke-fg" strokeWidth={1.5} />
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} className="stroke-line" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} className="stroke-line" />
      <text x={w - pad} y={h - 12} textAnchor="end" className="fill-muted font-mono text-[10px]">{TOKENS[i].code} reserve →</text>
      <text x={pad} y={pad - 10} className="fill-muted font-mono text-[10px]">↑ {TOKENS[j].code}</text>
      {px && <circle cx={sx(px[i])} cy={sy(px[j])} r={4} className="fill-muted opacity-50" />}
      <circle cx={sx(x[i])} cy={sy(x[j])} r={5} className="fill-accent" />
    </svg>
  );
}
