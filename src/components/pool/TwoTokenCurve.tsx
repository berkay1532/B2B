"use client";
import { useMemo } from "react";
import { maxFillable, poolRealReserves, quote, type Tick } from "@/lib/orbital";
import { TOKENS } from "@/config/tokens";

interface Props {
  committed: Tick[];
  current: Tick[];
  i: number;
  j: number;
  prev?: Tick[];
  classic: number[];
  classicCurrent: number[];
}

/** Both curves on real-reserve axes: Orbital sampled through quote(), classic as y = k/x.
 *  Curves are sampled ONCE from the committed state and held fixed during a preview —
 *  only the dots move. */
export function TwoTokenCurve({ committed, current, i, j, prev, classic, classicCurrent }: Props) {
  const w = 460, h = 380, pad = 40, N = 40;

  const { orbital, hyper } = useMemo(() => {
    const real = poolRealReserves(committed);

    // Orbital: sample forward (sell i) and backward (sell j) up to what the ticks can absorb
    const fwdMax = maxFillable(committed, i, j);
    const bwdMax = maxFillable(committed, j, i);
    const orbital: [number, number][] = [];
    for (let k = N; k >= 1; k--) { try { const r = poolRealReserves(quote(committed, j, i, (bwdMax * k) / N).ticks); orbital.push([r[i], r[j]]); } catch { /* skip */ } }
    orbital.push([real[i], real[j]]);
    for (let k = 1; k <= N; k++) { try { const r = poolRealReserves(quote(committed, i, j, (fwdMax * k) / N).ticks); orbital.push([r[i], r[j]]); } catch { /* skip */ } }

    // Classic: hyperbola through the committed classic reserves, sampled only over the
    // x-range spanned by the Orbital samples — keeps the interesting region from being
    // squashed by the asymptote.
    const kc = classic[i] * classic[j];
    const xs0 = orbital.map((p) => p[0]);
    const xMin0 = Math.min(...xs0), xMax0 = Math.max(...xs0);
    const hyper: [number, number][] = Array.from({ length: 2 * N + 1 }, (_, k) => {
      const x = xMin0 + ((xMax0 - xMin0) * k) / (2 * N);
      return [x, kc / x] as [number, number];
    });

    return { orbital, hyper };
  }, [committed, i, j, classic]);

  const cur = poolRealReserves(current);
  const prevReal = prev ? poolRealReserves(prev) : null;

  // Ranges must cover both curves plus all four dot positions (current, ghost, classic
  // current, classic ghost) — dots never leave the chart because the Orbital polyline is
  // sampled up to maxFillable in both directions and the slider max is maxFillable.
  const xs = [...orbital.map((p) => p[0]), ...hyper.map((p) => p[0]), cur[i], classicCurrent[i], classic[i]];
  if (prevReal) xs.push(prevReal[i]);
  const xMin0 = Math.min(...xs), xMax0 = Math.max(...xs);
  const xMargin = (xMax0 - xMin0 || xMax0 || 1) * 0.08;
  const rangeXMin = xMin0 - xMargin, rangeXMax = xMax0 + xMargin;

  const ys = [...orbital.map((p) => p[1]), ...hyper.map((p) => p[1]), cur[j], classicCurrent[j], classic[j]];
  if (prevReal) ys.push(prevReal[j]);
  const yMin0 = Math.min(...ys), yMax0 = Math.max(...ys);
  const yMargin = (yMax0 - yMin0 || yMax0 || 1) * 0.08;
  const rangeYMin = yMin0 - yMargin, rangeYMax = yMax0 + yMargin;

  const sx = (v: number) => pad + ((v - rangeXMin) / (rangeXMax - rangeXMin || 1)) * (w - 2 * pad);
  const sy = (v: number) => h - pad - ((v - rangeYMin) / (rangeYMax - rangeYMin || 1)) * (h - 2 * pad);
  const path = (pts: [number, number][]) => pts.map(([a, b], k) => `${k ? "L" : "M"}${sx(a)},${sy(b)}`).join(" ");

  const classicGhost = classicCurrent[i] !== classic[i] || classicCurrent[j] !== classic[j];

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
      {classicGhost && <circle cx={sx(classic[i])} cy={sy(classic[j])} r={4} className="fill-muted opacity-30" />}
      <circle data-testid="classic-dot" cx={sx(classicCurrent[i])} cy={sy(classicCurrent[j])} r={5} fill="none" className="stroke-muted" strokeWidth={1.5} />
      <circle data-testid="orbital-dot" cx={sx(cur[i])} cy={sy(cur[j])} r={5} className="fill-accent" />
    </svg>
  );
}
