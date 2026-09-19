"use client";
import { capitalEfficiency, kappaFromDepeg, projectState, ringRadiusNorm, schematicRadius, tokenCorners, type Tick } from "@/lib/orbital";
import { TOKENS } from "@/config/tokens";

export function TickPlanes({ ticks, prev }: { ticks: Tick[]; prev?: Tick[] }) {
  const size = 420, c = size / 2, maxR = size * 0.42;
  const sorted = [...ticks].sort((a, b) => a.depegBps - b.depegBps);
  const rings = sorted.map((t) => ringRadiusNorm(kappaFromDepeg(t.depegBps, 3), 3));
  const spacing = maxR / (rings.length + 0.5);
  const cur = projectState(ticks);
  const rCur = schematicRadius(cur.rho, rings) * spacing;
  const ang = Math.atan2(cur.v, cur.u);
  const px = c + rCur * Math.cos(ang), py = c - rCur * Math.sin(ang);
  const corners = tokenCorners();
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label="tick planes">
      {corners.map((k, i) => (
        <g key={i}>
          <line x1={c} y1={c} x2={c + maxR * k.u} y2={c - maxR * k.v} className="stroke-line" strokeDasharray="2 4" />
          <text x={c + (maxR + 18) * k.u} y={c - (maxR + 18) * k.v} textAnchor="middle" dominantBaseline="middle" className="fill-muted font-mono text-[11px]">{TOKENS[i].code}</text>
        </g>
      ))}
      {sorted.map((t, i) => (
        <g key={t.id}>
          <circle cx={c} cy={c} r={(i + 1) * spacing} fill="none" strokeDasharray="3 5"
            className={t.state === "boundary" ? "stroke-boundary" : "stroke-muted"} />
          <text x={c + 6} y={c - (i + 1) * spacing - 4} className="fill-muted font-mono text-[10px]">
            {t.depegBps / 100}% · {capitalEfficiency(t.depegBps, 3).toFixed(1)}×
          </text>
        </g>
      ))}
      <circle cx={c} cy={c} r={3} className="fill-muted" />
      <text x={c} y={c + 14} textAnchor="middle" className="fill-muted font-mono text-[10px]">PEG</text>
      {prev && (() => { const p = projectState(prev); const r = schematicRadius(p.rho, rings) * spacing; const a = Math.atan2(p.v, p.u);
        return <circle cx={c + r * Math.cos(a)} cy={c - r * Math.sin(a)} r={4} className="fill-muted opacity-50" />; })()}
      <line x1={c} y1={c} x2={px} y2={py} className="stroke-accent" strokeWidth={1.5} />
      <circle cx={px} cy={py} r={5} className="fill-accent" />
    </svg>
  );
}
