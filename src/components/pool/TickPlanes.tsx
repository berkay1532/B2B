"use client";
import {
  capitalEfficiency, kappaFromDepeg, pricingTicks, projectState, ringRadiusNorm, schematicRadius, tokenCorners,
  type Tick,
} from "@/lib/orbital";
import { TOKENS } from "@/config/tokens";

const SIZE = 560;
const C = SIZE / 2;
const RING_SPAN = 220; // outermost ring radius — 54/108/164/220 for the four seed ticks

interface Props {
  ticks: Tick[];
  prev?: Tick[];
  /** true while an uncommitted preview is on screen; gates the reserve-dot trail */
  previewing?: boolean;
}

/** Schematic of the tick planes: nested rings around PEG, the reserve point moving out
 *  along the depeg direction. Ring geometry stays on the existing
 *  `ringRadiusNorm`/`schematicRadius` mapping; only the drawing changed. */
export function TickPlanes({ ticks, prev, previewing = false }: Props) {
  const sorted = [...ticks].sort((a, b) => a.depegBps - b.depegBps);
  const rings = sorted.map((t) => ringRadiusNorm(kappaFromDepeg(t.depegBps, 3), 3));
  const spacing = rings.length ? RING_SPAN / rings.length : RING_SPAN;
  const axis = spacing * rings.length;

  // projectState averages Σx/ΣR across every tick, radius-weighted. The 0.1% tick's
  // radius (~6.5e9) dwarfs the other three combined (~8.5e8), so once it pins at its
  // plane the average barely moves even as the ticks that are still actually pricing
  // the trade (the interior ones, or the single widest boundary tick once all are
  // pinned — see `pricingTicks`) walk out to their own boundary. Project only those
  // ticks so the dot's radius reflects what's really trading, not the whole-pool mean.
  const at = (t: Tick[]) => {
    const p = projectState(pricingTicks(t));
    const r = schematicRadius(p.rho, rings) * spacing;
    const a = Math.atan2(p.v, p.u);
    return { x: C + r * Math.cos(a), y: C - r * Math.sin(a) };
  };
  const cur = at(ticks);
  const ghost = prev ? at(prev) : null;
  const from = ghost ?? { x: C, y: C };

  const corners = tokenCorners();

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-[560px] w-full max-w-[600px] lg:h-auto lg:max-h-[560px] lg:min-h-0 lg:flex-1"
      role="img"
      aria-label="tick planes"
    >
      <defs>
        <filter id="tickplanes-dot-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="tickplanes-ring-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {corners.map((k, idx) => (
        <g key={TOKENS[idx].code}>
          <line x1={C} y1={C} x2={C + axis * k.u} y2={C - axis * k.v} className="stroke-line" />
          <text
            x={C + (axis + 20) * k.u}
            y={C - (axis + 20) * k.v}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-2 font-mono text-[12px]"
          >
            {TOKENS[idx].code}
          </text>
        </g>
      ))}

      {/* `orbital-ring-pulse` only ever appears on the boundary branch, so the keyframes
          run exactly once — at the render where a ring flips interior -> boundary and the
          class first lands on the (otherwise stable) element. */}
      {sorted.map((t, idx) => {
        const r = (idx + 1) * spacing;
        const boundary = t.state === "boundary";
        return (
          <g key={t.id}>
            <circle
              cx={C}
              cy={C}
              r={r}
              fill="none"
              strokeWidth={1.3}
              {...(boundary
                ? { className: "stroke-boundary orbital-ring-pulse", filter: "url(#tickplanes-ring-glow)" }
                : { className: "stroke-muted-2 opacity-60", strokeDasharray: "2 7" })}
            />
            <text
              x={C + 10}
              y={C - r - 4}
              className={`font-mono text-[11px] ${boundary ? "fill-boundary" : "fill-muted-2"}`}
            >
              {t.depegBps / 100}% · {capitalEfficiency(t.depegBps, 3).toFixed(1)}×
            </text>
          </g>
        );
      })}

      <text x={C - 14} y={C + 24} className="fill-muted font-mono text-[11px]">PEG</text>

      <line x1={C} y1={C} x2={cur.x} y2={cur.y} className="stroke-accent opacity-90" strokeWidth={1.8} />

      {previewing &&
        [0.25, 0.5, 0.75].map((f, idx) => (
          <circle
            key={f}
            cx={from.x + (cur.x - from.x) * f}
            cy={from.y + (cur.y - from.y) * f}
            r={1.8 + idx * 0.4}
            className="fill-accent"
            fillOpacity={[0.25, 0.4, 0.6][idx]}
          />
        ))}

      <circle cx={C} cy={C} r={5.5} className="fill-ghost" />
      {ghost && <circle cx={ghost.x} cy={ghost.y} r={5.5} className="fill-ghost" />}
      <circle cx={cur.x} cy={cur.y} r={7} className="fill-accent" filter="url(#tickplanes-dot-glow)" />
    </svg>
  );
}
