"use client";
import { useMemo } from "react";
import { TOKENS } from "@/config/tokens";
import { formatUsd } from "@/lib/pool";

const W = 400, H = 400;
const X0 = 40, X1 = 380;   // plot box, left -> right
const Y0 = 20, Y1 = 340;   // plot box, top -> bottom
const N = 96;

interface Props {
  i: number;
  j: number;
  /** committed classic reserves — fixes the hyperbola and the ghost */
  classic: number[];
  /** classic reserves under the live preview; equal to `classic` when nothing is previewed */
  classicCurrent: number[];
}

/** short number, `formatUsd` shape without the currency mark */
const short = (n: number) => formatUsd(n).slice(1);

/** The classic x·y=k pool for the selected pair on real-reserve axes. The curve is a
 *  property of k alone, so it never moves — only the dot slides along it. */
export function ClassicCurve({ i, j, classic, classicCurrent }: Props) {
  const k = classic[i] * classic[j];

  // sampled over the interesting stretch around the committed point; the asymptote is
  // clipped off rather than squashing the visible curve
  const hyper = useMemo<[number, number][]>(() => {
    const lo = 0.55 * classic[i], hi = 2.2 * classic[i];
    return Array.from({ length: N + 1 }, (_, s) => {
      const x = lo + ((hi - lo) * s) / N;
      return [x, k / x] as [number, number];
    });
  }, [classic, i, k]);

  const dot: [number, number] = [classicCurrent[i], classicCurrent[j]];
  const ghost: [number, number] = [classic[i], classic[j]];
  const moved = dot[0] !== ghost[0] || dot[1] !== ghost[1];

  const span = (vals: number[]) => {
    const min = Math.min(...vals), max = Math.max(...vals);
    const m = (max - min || max || 1) * 0.08;
    return [min - m, max + m] as const;
  };
  const [xMin, xMax] = span([...hyper.map((p) => p[0]), dot[0], ghost[0]]);
  const [yMin, yMax] = span([...hyper.map((p) => p[1]), dot[1], ghost[1]]);

  const sx = (v: number) => X0 + ((v - xMin) / (xMax - xMin || 1)) * (X1 - X0);
  const sy = (v: number) => Y1 - ((v - yMin) / (yMax - yMin || 1)) * (Y1 - Y0);
  const d = hyper.map(([a, b], s) => `${s ? "L" : "M"}${sx(a)},${sy(b)}`).join(" ");

  const dx = sx(dot[0]), dy = sy(dot[1]);
  const labelLeft = dx > X1 - 110;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[400px] w-full max-w-[420px] lg:h-auto lg:max-h-[400px] lg:min-h-0 lg:flex-1" role="img" aria-label="classic curve">
      <defs>
        <filter id="classiccurve-dot-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <g className="stroke-line">
        {[1, 2, 3, 4].map((r) => <line key={`h${r}`} x1={X0} y1={Y0 + ((Y1 - Y0) * r) / 5} x2={X1} y2={Y0 + ((Y1 - Y0) * r) / 5} />)}
        {[1, 2, 3].map((c) => <line key={`v${c}`} x1={X0 + ((X1 - X0) * c) / 4} y1={Y0} x2={X0 + ((X1 - X0) * c) / 4} y2={Y1} />)}
      </g>
      <line x1={X0} y1={Y1} x2={X1} y2={Y1} className="stroke-ghost" />
      <line x1={X0} y1={Y0} x2={X0} y2={Y1} className="stroke-ghost" />

      <path d={d} fill="none" className="stroke-fg opacity-90" strokeWidth={1.8} strokeLinecap="round" />

      <g className="stroke-accent opacity-35" strokeDasharray="3 5">
        <line x1={X0} y1={dy} x2={dx} y2={dy} />
        <line x1={dx} y1={dy} x2={dx} y2={Y1} />
      </g>

      {moved && <circle cx={sx(ghost[0])} cy={sy(ghost[1])} r={4.5} className="fill-ghost" />}
      <circle data-testid="classic-dot" cx={dx} cy={dy} r={7} className="fill-accent" filter="url(#classiccurve-dot-glow)" />

      <g className="fill-muted font-mono text-[10px]">
        <text x={X0 + 4} y={14}>↑ {TOKENS[j].code}</text>
        <text x={X1} y={H - 34} textAnchor="end">{TOKENS[i].code} real reserve →</text>
      </g>
      <text
        x={labelLeft ? dx - 10 : dx + 8}
        y={dy - 8}
        textAnchor={labelLeft ? "end" : "start"}
        className="fill-accent font-mono text-[10px]"
      >
        ({short(dot[0])}, {short(dot[1])})
      </text>
    </svg>
  );
}
