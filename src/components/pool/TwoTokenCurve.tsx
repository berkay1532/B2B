"use client";
import { useMemo } from "react";
import { maxFillable, poolRealReserves, quote, type Tick } from "@/lib/orbital";
import { TOKENS } from "@/config/tokens";

interface Props { ticks: Tick[]; i: number; j: number; prev?: Tick[]; classic: number[]; classicPreview?: number[] }

/** Both curves on real-reserve axes: Orbital sampled through quote(), classic as y = k/x. */
export function TwoTokenCurve({ ticks, i, j, prev, classic, classicPreview }: Props) {
  const w = 460, h = 380, pad = 40, N = 40;

  const { orbital, cur } = useMemo(() => {
    const real = poolRealReserves(ticks);
    const cur: [number, number] = [real[i], real[j]];

    // Orbital: sample forward (sell i) and backward (sell j) up to what the ticks can absorb, capped for readability
    const fwdMax = Math.min(maxFillable(ticks, i, j), real[i] * 1.5);
    const bwdMax = Math.min(maxFillable(ticks, j, i), real[j] * 1.5);
    const orbital: [number, number][] = [];
    for (let k = N; k >= 1; k--) { try { const r = poolRealReserves(quote(ticks, j, i, (bwdMax * k) / N).ticks); orbital.push([r[i], r[j]]); } catch { /* skip */ } }
    orbital.push(cur);
    for (let k = 1; k <= N; k++) { try { const r = poolRealReserves(quote(ticks, i, j, (fwdMax * k) / N).ticks); orbital.push([r[i], r[j]]); } catch { /* skip */ } }

    return { orbital, cur };
  }, [ticks, i, j]);

  // Classic: hyperbola through the committed classic reserves
  const cp = classicPreview ?? classic;
  const kc = classic[i] * classic[j];

  // Ranges must cover the Orbital samples, the baseline classic curve, AND the
  // (possibly preview) classic dot — a large slider amount can push cp[i]/cp[j]
  // well past classic[i]*2 / the Orbital sample span, which would otherwise
  // render the hollow dot off-chart. A small margin keeps dots off the border.
  const xs = [...orbital.map((p) => p[0]), classic[i] * 0.5, classic[i] * 2, cp[i]];
  const xMin0 = Math.min(...xs), xMax0 = Math.max(...xs);
  const xMargin = (xMax0 - xMin0 || xMax0 || 1) * 0.08;
  const xMin = xMin0 - xMargin, xMax = xMax0 + xMargin;
  const hyper: [number, number][] = Array.from({ length: 2 * N + 1 }, (_, k) => { const x = xMin + ((xMax - xMin) * k) / (2 * N); return [x, kc / x]; });

  const ys = [...orbital.map((p) => p[1]), ...hyper.map((p) => p[1]), cp[j], classic[j]];
  const yMin0 = Math.min(...ys), yMax0 = Math.max(...ys);
  const yMargin = (yMax0 - yMin0 || yMax0 || 1) * 0.08;
  const yMin = yMin0 - yMargin, yMax = yMax0 + yMargin;
  const sx = (v: number) => pad + ((v - xMin) / (xMax - xMin || 1)) * (w - 2 * pad);
  const sy = (v: number) => h - pad - ((v - yMin) / (yMax - yMin || 1)) * (h - 2 * pad);
  const path = (pts: [number, number][]) => pts.map(([a, b], k) => `${k ? "L" : "M"}${sx(a)},${sy(b)}`).join(" ");
  const prevReal = prev ? poolRealReserves(prev) : null;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="two token curve">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} className="stroke-line" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} className="stroke-line" />
      <path d={path(hyper)} fill="none" className="stroke-muted" strokeWidth={1} strokeDasharray="4 4" />
      <path d={path(orbital)} fill="none" className="stroke-fg" strokeWidth={1.5} />
      <text x={w - pad} y={h - 12} textAnchor="end" className="fill-muted font-mono text-[10px]">{TOKENS[i].code} real reserve →</text>
      <text x={pad} y={pad - 10} className="fill-muted font-mono text-[10px]">↑ {TOKENS[j].code}</text>
      <text x={w - pad} y={pad} textAnchor="end" className="fill-muted font-mono text-[10px]">dashed = x·y=k · solid = orbital</text>
      {prevReal && <circle cx={sx(prevReal[i])} cy={sy(prevReal[j])} r={4} className="fill-muted opacity-50" />}
      {classicPreview && <circle cx={sx(classic[i])} cy={sy(classic[j])} r={4} className="fill-muted opacity-30" />}
      <circle data-testid="classic-dot" cx={sx(cp[i])} cy={sy(cp[j])} r={5} fill="none" className="stroke-muted" strokeWidth={1.5} />
      <circle data-testid="orbital-dot" cx={sx(cur[0])} cy={sy(cur[1])} r={5} className="fill-accent" />
    </svg>
  );
}
