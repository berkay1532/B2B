# Orbital on Stellar Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js demo of a 3-stablecoin Orbital AMM pool (tick planes, two-token curve, swap panel) plus an "attack" page contrasting a thin orderbook with the tick-bounded pool, running on an in-memory mock behind a `PoolClient` interface that a Soroban client will later implement.

**Architecture:** Three layers with one-way dependencies `ui -> lib/pool -> lib/orbital`. `lib/orbital` is pure float64 math (sphere invariant, ticks, closed-form swap with plane crossing). `lib/pool` exposes `PoolClient` with bigint 7-decimal amounts; `MockPoolClient` wraps the math. UI is React components reading state through the client and drawing SVG.

**Tech Stack:** Next.js 15 (App Router, TypeScript, Tailwind v4), vitest + @testing-library/react + jsdom, `@creit.tech/stellar-wallets-kit`.

**Spec:** `docs/superpowers/specs/2026-09-19-orbital-stellar-frontend-design.md`

## Global Constraints

- Math layer works in float64 token units (1.0 = one token). `lib/pool` converts to/from `bigint` at 7 decimals (`10_000_000n` = one token).
- `depegBps` is the allowed drop below peg in basis points: 100 means the coin may fall to 0.99.
- Tick classification: interior while `sum(x) < kappa * R * sqrt(n)`, boundary once it reaches the plane.
- A boundary tick is frozen (v1 simplification, documented in spec 4.1).
- Tokens: 3, from `src/config/tokens.ts`; placeholders `USDC`, `EURC`, `USDX`.
- Mock seed: $10M real per token spread evenly over ticks at 10, 100, 500, 1000 bps ($2.5M per token per tick), TVL $30M.
- Colors and fonts go through Tailwind theme tokens in `src/app/globals.css` only. No hard-coded hex in components (visual pass comes later).
- All commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Never use `--force`, never touch `docs/superpowers/specs`.

---

## File map

| Path | Responsibility |
|---|---|
| `src/lib/orbital/types.ts` | `Tick`, `TickState`, `QuoteResult`, `OrbitalError` |
| `src/lib/orbital/geometry.ts` | `equalPointNorm`, `kappaFromDepeg`, `xMinNorm`, `capitalEfficiency`, `ringRadiusNorm` |
| `src/lib/orbital/tick.ts` | `createTick`, `cloneTick`, `sumX`, `planeSum`, `realReserves`, `invariantResidual`, `marginalPrice`, `poolPrice`, `poolRealReserves` |
| `src/lib/orbital/swap.ts` | `applySwap`, `deltaToPlane`, `quote`, `maxFillable` |
| `src/lib/orbital/projection.ts` | `projectState`, `tokenCorners`, `schematicRadius` |
| `src/lib/orbital/index.ts` | re-exports |
| `src/lib/pool/PoolClient.ts` | interface + `PoolState`, `Quote`, `PoolError` |
| `src/lib/pool/units.ts` | `toUnits`, `fromUnits`, `formatUsd` |
| `src/lib/pool/MockPoolClient.ts` | in-memory implementation |
| `src/lib/pool/SorobanPoolClient.ts` | stub |
| `src/lib/pool/index.ts` | `getPoolClient()` singleton chosen by env |
| `src/config/tokens.ts` | token list |
| `src/lib/attack/orderbook.ts` | `THIN_BOOK`, `sweep` |
| `src/hooks/usePool.ts` | React hook: state + quote + swap |
| `src/components/pool/*` | `TickPlanes`, `TwoTokenCurve`, `SwapForm`, `ReservesTable`, `TicksTable` |
| `src/components/attack/*` | `OrderbookPanel`, `OrbitalPanel`, `AttackSlider` |
| `src/components/wallet/ConnectButton.tsx` | wallet connect |
| `src/components/layout/Header.tsx` | nav + connect |
| `src/app/page.tsx`, `src/app/attack/page.tsx` | pages |

---

### Task 1: Scaffold the app with vitest

**Files:**
- Create: Next.js app in repo root (`package.json`, `src/app/*`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/globals.css`)
- Create: `vitest.config.ts`, `src/test/setup.ts`, `src/lib/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` (vitest run), `npm run dev`, path alias `@/` -> `src/`

- [ ] **Step 1: Scaffold Next.js**

Run from repo root (it already contains `docs/` and `.gitignore`; create-next-app accepts a non-empty dir only if the files are on its allowlist, so scaffold into a temp dir and move):

```bash
cd /Users/beko/Documents/beko/ProHackhaton
npx --yes create-next-app@latest orbital-tmp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
rsync -a orbital-tmp/ ./ --exclude .git
rm -rf orbital-tmp
cat .gitignore | grep -q node_modules || printf 'node_modules/\n.next/\n.env*.local\n.DS_Store\n' >> .gitignore
```

- [ ] **Step 2: Add test deps**

```bash
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Write vitest config and setup**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

`src/test/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Write a smoke test**

`src/lib/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("toolchain", () => {
  it("runs", () => expect(1 + 1).toBe(2));
});
```

- [ ] **Step 5: Run tests and build**

Run: `npm test`
Expected: 1 passed.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with vitest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Tick geometry (kappa, xMin, capital efficiency)

**Files:**
- Create: `src/lib/orbital/types.ts`, `src/lib/orbital/geometry.ts`
- Test: `src/lib/orbital/geometry.test.ts`

**Interfaces:**
- Produces:
  - `equalPointNorm(n: number): number` = `1 - 1/sqrt(n)`
  - `kappaFromDepeg(depegBps: number, n: number): number`
  - `xMinNorm(kappa: number, n: number): number`
  - `capitalEfficiency(depegBps: number, n: number): number`
  - `ringRadiusNorm(kappa: number, n: number): number` (projected ring radius for R = 1)
  - `OrbitalError` with `code: "SameToken" | "InvalidAmount" | "InsufficientLiquidity" | "NoConvergence" | "InvalidTick"`

- [ ] **Step 1: Write the failing test**

`src/lib/orbital/geometry.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { equalPointNorm, kappaFromDepeg, xMinNorm, capitalEfficiency, ringRadiusNorm } from "./geometry";

describe("geometry", () => {
  it("equal point for n=3", () => {
    expect(equalPointNorm(3)).toBeCloseTo(0.4226497, 6);
  });
  it("kappa at zero depeg equals sqrt(n)-1", () => {
    expect(kappaFromDepeg(0, 3)).toBeCloseTo(Math.sqrt(3) - 1, 9);
  });
  it("kappa grows with depeg", () => {
    expect(kappaFromDepeg(1000, 3)).toBeGreaterThan(kappaFromDepeg(100, 3));
  });
  it.each([
    [10, 1098, 3], [100, 110, 3], [500, 21.8, 3], [1000, 10.8, 3],
    [1000, 15.3, 5], [100, 154, 5],
  ])("capital efficiency %i bps n=%i -> ~%f", (bps, expected, n) => {
    const eff = capitalEfficiency(bps, n);
    expect(Math.abs(eff - expected) / expected).toBeLessThan(0.01);
  });
  it("xMin is below equal point", () => {
    const k = kappaFromDepeg(500, 3);
    expect(xMinNorm(k, 3)).toBeLessThan(equalPointNorm(3));
  });
  it("ring radius is ~0 at peg and grows with depeg", () => {
    expect(ringRadiusNorm(kappaFromDepeg(0, 3), 3)).toBeCloseTo(0, 6);
    expect(ringRadiusNorm(kappaFromDepeg(1000, 3), 3)).toBeGreaterThan(ringRadiusNorm(kappaFromDepeg(100, 3), 3));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/orbital/geometry.test.ts`
Expected: FAIL, cannot resolve `./geometry`.

- [ ] **Step 3: Implement**

`src/lib/orbital/types.ts`:
```ts
export type TickState = "interior" | "boundary";

export interface Tick {
  id: string;
  depegBps: number;
  radius: number;      // R
  kappa: number;       // normalized plane constant; boundary when sum(x) >= kappa*R*sqrt(n)
  xMinNorm: number;    // normalized minimum effective reserve per token
  x: number[];         // effective reserves, absolute token units
  state: TickState;
}

export interface QuoteResult {
  amountOut: number;
  ticksCrossed: number;
  ticks: Tick[];       // post-swap copies
  priceBefore: number; // price of tokenOut in tokenIn
  priceAfter: number;
}

export type OrbitalErrorCode =
  | "SameToken" | "InvalidAmount" | "InsufficientLiquidity" | "NoConvergence" | "InvalidTick";

export class OrbitalError extends Error {
  constructor(public code: OrbitalErrorCode, message?: string) {
    super(message ?? code);
    this.name = "OrbitalError";
  }
}
```

`src/lib/orbital/geometry.ts`:
```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/orbital/geometry.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbital
git commit -m "feat(orbital): tick geometry, kappa and capital efficiency

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Tick model, invariant and prices

**Files:**
- Create: `src/lib/orbital/tick.ts`
- Test: `src/lib/orbital/tick.test.ts`

**Interfaces:**
- Consumes: Task 2 functions and `Tick` type.
- Produces:
  - `createTick(id: string, depegBps: number, realPerToken: number, n: number): Tick` (starts at the equal point)
  - `cloneTick(t: Tick): Tick`
  - `sumX(t: Tick): number`
  - `planeSum(t: Tick): number` = `kappa * R * sqrt(n)`
  - `realReserves(t: Tick): number[]` = `x_i - xMinNorm * R`
  - `invariantResidual(t: Tick): number` relative residual `(sum (R-x_i)^2 - R^2) / R^2`
  - `marginalPrice(t: Tick, i: number, j: number): number` price of i in units of j = `(R-x_i)/(R-x_j)`
  - `poolPrice(ticks: Tick[], i: number, j: number): number` = `sum_t (R_t - x_t,i) / sum_t (R_t - x_t,j)`
  - `poolRealReserves(ticks: Tick[]): number[]`

- [ ] **Step 1: Write the failing test**

`src/lib/orbital/tick.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createTick, sumX, planeSum, realReserves, invariantResidual, marginalPrice, poolPrice, poolRealReserves } from "./tick";

describe("tick", () => {
  it("starts at the equal point with real reserves equal to the deposit", () => {
    const t = createTick("a", 500, 2_500_000, 3);
    expect(t.state).toBe("interior");
    expect(t.x[0]).toBeCloseTo(t.x[1], 9);
    for (const r of realReserves(t)) expect(r).toBeCloseTo(2_500_000, 3);
    expect(invariantResidual(t)).toBeLessThan(1e-12);
    expect(sumX(t)).toBeLessThan(planeSum(t));
  });
  it("prices are 1.0 at the equal point", () => {
    const t = createTick("a", 100, 1000, 3);
    expect(marginalPrice(t, 0, 1)).toBeCloseTo(1, 12);
    expect(poolPrice([t, createTick("b", 1000, 1000, 3)], 2, 0)).toBeCloseTo(1, 12);
  });
  it("effective reserve is capEff times the real deposit", () => {
    const t = createTick("a", 100, 1000, 3);
    expect(t.x[0] / 1000).toBeGreaterThan(100);
  });
  it("pool real reserves sum over ticks", () => {
    const ticks = [createTick("a", 100, 1000, 3), createTick("b", 1000, 500, 3)];
    expect(poolRealReserves(ticks)[1]).toBeCloseTo(1500, 6);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/orbital/tick.test.ts`
Expected: FAIL, cannot resolve `./tick`.

- [ ] **Step 3: Implement**

`src/lib/orbital/tick.ts`:
```ts
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

export function poolRealReserves(ticks: Tick[]): number[] {
  const n = ticks[0]?.x.length ?? 0;
  const out = Array.from({ length: n }, () => 0);
  for (const t of ticks) realReserves(t).forEach((v, k) => { out[k] += v; });
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/orbital/tick.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbital
git commit -m "feat(orbital): tick model, invariant and prices

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Swap with plane crossing

**Files:**
- Create: `src/lib/orbital/swap.ts`, `src/lib/orbital/index.ts`
- Test: `src/lib/orbital/swap.test.ts`

**Interfaces:**
- Consumes: Task 2 and 3.
- Produces:
  - `applySwap(t: Tick, i: number, j: number, dIn: number): number` mutates `t`, returns amount out
  - `deltaToPlane(t: Tick, i: number, j: number): number` input of token i that puts the tick exactly on its plane, `Infinity` if unreachable
  - `quote(ticks: Tick[], tokenIn: number, tokenOut: number, amountIn: number): QuoteResult` pure (returns copies)
  - `maxFillable(ticks: Tick[], tokenIn: number, tokenOut: number): number` largest input that does not throw

- [ ] **Step 1: Write the failing test**

`src/lib/orbital/swap.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createTick, invariantResidual, poolPrice, sumX, planeSum } from "./tick";
import { quote, maxFillable, deltaToPlane } from "./swap";
import { OrbitalError } from "./types";

const seed = () => [10, 100, 500, 1000].map((bps) => createTick(`t${bps}`, bps, 2_500_000, 3));

describe("quote", () => {
  it("rejects same token and non-positive amounts", () => {
    expect(() => quote(seed(), 0, 0, 1)).toThrow(OrbitalError);
    expect(() => quote(seed(), 0, 1, 0)).toThrow(OrbitalError);
  });
  it("a $1 swap in a $30M pool moves price by less than 1 bps and returns ~1", () => {
    const q = quote(seed(), 0, 1, 1);
    expect(q.amountOut).toBeGreaterThan(0.999);
    expect(q.amountOut).toBeLessThanOrEqual(1);
    expect(Math.abs(q.priceAfter - 1)).toBeLessThan(1e-4);
    expect(q.ticksCrossed).toBe(0);
  });
  it("keeps every tick on its sphere", () => {
    const q = quote(seed(), 0, 1, 3_000_000);
    for (const t of q.ticks) expect(invariantResidual(t)).toBeLessThan(1e-9);
  });
  it("does not mutate the input ticks", () => {
    const ticks = seed();
    const before = ticks.map((t) => [...t.x]);
    quote(ticks, 0, 1, 1_000_000);
    ticks.forEach((t, i) => expect(t.x).toEqual(before[i]));
  });
  it("flips ticks to boundary from tightest to widest", () => {
    const q = quote(seed(), 0, 1, 2_000_000);
    const states = q.ticks.map((t) => t.state);
    expect(states[0]).toBe("boundary");
    // boundary ticks form a prefix of the list ordered by depegBps
    const firstInterior = states.indexOf("interior");
    if (firstInterior >= 0) expect(states.slice(firstInterior).every((s) => s === "interior")).toBe(true);
    expect(q.ticksCrossed).toBeGreaterThan(0);
  });
  it("a tick landed on its plane satisfies sum(x) = planeSum", () => {
    const t = createTick("a", 1000, 1000, 3);
    const d = deltaToPlane(t, 0, 1);
    const q = quote([t], 0, 1, d);
    expect(q.ticks[0].state).toBe("boundary");
    expect(Math.abs(sumX(q.ticks[0]) - planeSum(q.ticks[0])) / planeSum(q.ticks[0])).toBeLessThan(1e-9);
  });
  it("throws InsufficientLiquidity once every tick is boundary, price capped near 1/p", () => {
    const ticks = [createTick("a", 1000, 1_000_000, 3)];
    const max = maxFillable(ticks, 0, 1);
    const q = quote(ticks, 0, 1, max);
    expect(q.ticks[0].state).toBe("boundary");
    const p = 0.9;
    expect(q.priceAfter).toBeGreaterThan((1 / p) * 0.95);
    expect(q.priceAfter).toBeLessThan((1 / p) * 1.05);
    expect(() => quote(ticks, 0, 1, max * 1.01)).toThrow(/InsufficientLiquidity/);
  });
  it("amount out and price are monotone in amount in", () => {
    let lastOut = 0, lastPrice = 0;
    for (const a of [1e3, 1e4, 1e5, 1e6]) {
      const q = quote(seed(), 0, 1, a);
      expect(q.amountOut).toBeGreaterThan(lastOut);
      expect(q.priceAfter).toBeGreaterThanOrEqual(lastPrice);
      lastOut = q.amountOut; lastPrice = q.priceAfter;
    }
  });
  it("round trip never returns more than sent", () => {
    const q1 = quote(seed(), 0, 1, 500_000);
    const q2 = quote(q1.ticks, 1, 0, q1.amountOut);
    expect(q2.amountOut).toBeLessThanOrEqual(500_000 + 1e-6);
  });
  it("a boundary tick rejoins when the trade moves it inward", () => {
    const ticks = [createTick("a", 1000, 1_000_000, 3)];
    const out = quote(ticks, 0, 1, maxFillable(ticks, 0, 1));
    const back = quote(out.ticks, 1, 0, 1000);
    expect(back.ticks[0].state).toBe("interior");
    expect(back.amountOut).toBeGreaterThan(1000); // token0 is cheap now
  });
  it("pool price at the equal point is 1", () => {
    expect(poolPrice(seed(), 0, 2)).toBeCloseTo(1, 12);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/orbital/swap.test.ts`
Expected: FAIL, cannot resolve `./swap`.

- [ ] **Step 3: Implement**

`src/lib/orbital/swap.ts`:
```ts
import { cloneTick, planeSum, poolPrice, sumX } from "./tick";
import { OrbitalError, type QuoteResult, type Tick } from "./types";

const REL_EPS = 1e-12;
const MAX_SEGMENTS = 64;

/** Move token i in by dIn on one sphere tick; returns token j out. Mutates t. */
export function applySwap(t: Tick, i: number, j: number, dIn: number): number {
  const R = t.radius;
  const xi = t.x[i] + dIn;
  if (xi > R) throw new OrbitalError("InsufficientLiquidity", "reserve of tokenIn would exceed R");
  let S = 0;
  for (let k = 0; k < t.x.length; k++) if (k !== i && k !== j) S += (R - t.x[k]) ** 2;
  const rad = R * R - (R - xi) ** 2 - S;
  if (rad < 0) throw new OrbitalError("InsufficientLiquidity", "no point on sphere");
  const xj = R - Math.sqrt(rad);
  const out = t.x[j] - xj;
  if (out < -REL_EPS * R) throw new OrbitalError("InsufficientLiquidity", "negative output");
  t.x[i] = xi;
  t.x[j] = xj;
  return Math.max(out, 0);
}

/**
 * Input of token i (with j out) that carries the tick exactly onto its plane
 * sum(x) = K. Solves 2t^2 + 2(C-R)t + C^2 + S = 0 with C = R - K + O.
 * Returns Infinity if the trade never reaches the plane.
 */
export function deltaToPlane(t: Tick, i: number, j: number): number {
  const R = t.radius;
  const K = planeSum(t);
  let O = 0, S = 0;
  for (let k = 0; k < t.x.length; k++) if (k !== i && k !== j) { O += t.x[k]; S += (R - t.x[k]) ** 2; }
  const C = R - K + O;
  const a = 2, b = 2 * (C - R), c = C * C + S;
  const d = b * b - 4 * a * c;
  if (d < 0) return Infinity;
  const r1 = (-b - Math.sqrt(d)) / (2 * a);
  const r2 = (-b + Math.sqrt(d)) / (2 * a);
  const floor = t.x[i] + REL_EPS * R;
  const cands = [r1, r2].filter((v) => v > floor);
  if (cands.length === 0) return Infinity;
  return Math.min(...cands) - t.x[i];
}

export function quote(ticks: Tick[], tokenIn: number, tokenOut: number, amountIn: number): QuoteResult {
  if (tokenIn === tokenOut) throw new OrbitalError("SameToken");
  if (!(amountIn > 0) || !Number.isFinite(amountIn)) throw new OrbitalError("InvalidAmount");
  if (ticks.length === 0) throw new OrbitalError("InsufficientLiquidity", "no ticks");

  const work = ticks.map(cloneTick);
  const priceBefore = poolPrice(work, tokenOut, tokenIn);

  // A frozen boundary tick can trade again if this direction moves it inward.
  for (const t of work) {
    if (t.state === "boundary" && t.x[tokenIn] < t.x[tokenOut]) t.state = "interior";
  }

  let remaining = amountIn;
  let out = 0;
  let crossed = 0;

  for (let seg = 0; seg < MAX_SEGMENTS && remaining > amountIn * REL_EPS; seg++) {
    const active = work.filter((t) => t.state === "interior");
    if (active.length === 0) throw new OrbitalError("InsufficientLiquidity", "every tick is at its boundary");
    const Rsum = active.reduce((a, t) => a + t.radius, 0);

    // largest fraction of `remaining` we can apply before some tick reaches its plane
    let f = 1;
    let landing: Tick | null = null;
    for (const t of active) {
      const share = (remaining * t.radius) / Rsum;
      const cap = deltaToPlane(t, tokenIn, tokenOut);
      if (cap < share && cap / share < f) { f = cap / share; landing = t; }
    }

    for (const t of active) {
      const share = ((remaining * t.radius) / Rsum) * f;
      out += applySwap(t, tokenIn, tokenOut, share);
    }
    if (landing) { landing.state = "boundary"; crossed++; }
    // also catch ticks that landed within tolerance without being the minimum
    for (const t of active) {
      if (t.state === "interior" && sumX(t) >= planeSum(t) * (1 - 1e-12)) { t.state = "boundary"; crossed++; }
    }

    remaining = f >= 1 ? 0 : remaining * (1 - f);
  }
  if (remaining > amountIn * REL_EPS) throw new OrbitalError("NoConvergence");

  return { amountOut: out, ticksCrossed: crossed, ticks: work, priceBefore, priceAfter: poolPrice(work, tokenOut, tokenIn) };
}

/** Largest amountIn for which quote() does not throw (bisection, 60 rounds). */
export function maxFillable(ticks: Tick[], tokenIn: number, tokenOut: number): number {
  let lo = 0;
  let hi = ticks.reduce((a, t) => a + t.radius, 0);
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    try { quote(ticks, tokenIn, tokenOut, mid); lo = mid; } catch { hi = mid; }
  }
  return lo;
}
```

`src/lib/orbital/index.ts`:
```ts
export * from "./types";
export * from "./geometry";
export * from "./tick";
export * from "./swap";
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/orbital`
Expected: all pass. If the "rejoins when inward" test fails on `amountOut > 1000`, check `poolPrice` direction: after pushing token0 in, token0 is abundant so 1000 of token1 buys more than 1000 of token0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbital
git commit -m "feat(orbital): closed-form swap with tick plane crossing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Projection helpers for the tick-planes SVG

**Files:**
- Create: `src/lib/orbital/projection.ts`; append export to `src/lib/orbital/index.ts`
- Test: `src/lib/orbital/projection.test.ts`

**Interfaces:**
- Consumes: `Tick`, `ringRadiusNorm`.
- Produces:
  - `projectState(ticks: Tick[]): { u: number; v: number; rho: number }` (n = 3 only) using the consolidated normalized vector `sum x_t / sum R_t` minus the equal point
  - `tokenCorners(): { u: number; v: number }[]` unit directions of the three tokens
  - `schematicRadius(rho: number, rings: number[]): number` maps a physical rho onto ring-index units: between ring k and k+1 linearly; below ring 0 linearly from 0; beyond the last ring, clamps to `rings.length` + 0.5

- [ ] **Step 1: Write the failing test**

`src/lib/orbital/projection.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/orbital/projection.test.ts`
Expected: FAIL, cannot resolve `./projection`.

- [ ] **Step 3: Implement**

`src/lib/orbital/projection.ts`:
```ts
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
```

Append to `src/lib/orbital/index.ts`: `export * from "./projection";`

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/orbital`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbital
git commit -m "feat(orbital): 2D projection helpers for tick planes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: PoolClient interface, units, tokens config, MockPoolClient

**Files:**
- Create: `src/config/tokens.ts`, `src/lib/pool/PoolClient.ts`, `src/lib/pool/units.ts`, `src/lib/pool/MockPoolClient.ts`, `src/lib/pool/SorobanPoolClient.ts`, `src/lib/pool/index.ts`
- Test: `src/lib/pool/units.test.ts`, `src/lib/pool/MockPoolClient.test.ts`

**Interfaces:**
- Consumes: `lib/orbital`.
- Produces:
  - `TOKENS: TokenConfig[]` with `{ code: string; contractId: string; decimals: 7; colorVar: string }`
  - `toUnits(n: number): bigint`, `fromUnits(b: bigint): number`, `formatUsd(n: number): string` (`$10.00M`, `$4.07M`, `$950.00K`, `$12.34`)
  - `PoolClient` interface exactly as in the spec 4.2, plus `PoolState`, `Quote = { amountOut: bigint; ticksCrossed: number; priceAfter: number; priceBefore: number }`, `PoolError extends Error { code: "InsufficientLiquidity" | "SlippageExceeded" | "ProportionMismatch" | "NotImplemented" | "Rejected" | "Unknown" }`
  - `MockPoolClient` with `constructor(opts?: { realPerTokenPerTick?: number; depegBpsList?: number[] })`, defaults 2_500_000 and `[10,100,500,1000]`
  - `getPoolClient(): PoolClient` singleton, mock unless `NEXT_PUBLIC_POOL_BACKEND === "soroban"`

- [ ] **Step 1: Write the failing tests**

`src/lib/pool/units.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toUnits, fromUnits, formatUsd } from "./units";

describe("units", () => {
  it("round trips 7 decimals", () => {
    expect(toUnits(1)).toBe(10_000_000n);
    expect(fromUnits(12_345_678n)).toBeCloseTo(1.2345678, 7);
    expect(fromUnits(toUnits(10_000_000))).toBe(10_000_000);
  });
  it("formats usd", () => {
    expect(formatUsd(10_000_000)).toBe("$10.00M");
    expect(formatUsd(4_070_000)).toBe("$4.07M");
    expect(formatUsd(950_000)).toBe("$950.00K");
    expect(formatUsd(12.34)).toBe("$12.34");
  });
});
```

`src/lib/pool/MockPoolClient.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { MockPoolClient } from "./MockPoolClient";
import { toUnits, fromUnits } from "./units";
import { PoolError } from "./PoolClient";

describe("MockPoolClient", () => {
  it("seeds a $30M pool with 4 interior ticks", async () => {
    const c = new MockPoolClient();
    const s = await c.getState();
    expect(s.tokens).toHaveLength(3);
    expect(fromUnits(s.tvl)).toBeCloseTo(30_000_000, 0);
    expect(s.reserves.map(fromUnits).every((r) => Math.abs(r - 10_000_000) < 1e-3)).toBe(true);
    expect(s.ticks.map((t) => t.depegBps)).toEqual([10, 100, 500, 1000]);
    expect(s.ticks.every((t) => t.state === "interior")).toBe(true);
    expect(s.ticks[1].capEff).toBeGreaterThan(100);
  });
  it("quote does not change state, swap does and notifies", async () => {
    const c = new MockPoolClient();
    const q = await c.quote("USDC", "EURC", toUnits(1_000_000));
    expect(fromUnits(q.amountOut)).toBeGreaterThan(900_000);
    const s1 = await c.getState();
    expect(fromUnits(s1.reserves[0])).toBeCloseTo(10_000_000, 3);
    let notified = 0;
    const unsub = c.subscribe(() => { notified++; });
    const r = await c.swap({ from: "G...", tokenIn: "USDC", tokenOut: "EURC", amountIn: toUnits(1_000_000), minOut: 0n });
    expect(r.amountOut).toBe(q.amountOut);
    const s2 = await c.getState();
    expect(fromUnits(s2.reserves[0])).toBeCloseTo(11_000_000, 3);
    expect(notified).toBe(1);
    unsub();
  });
  it("enforces minOut", async () => {
    const c = new MockPoolClient();
    await expect(c.swap({ from: "G", tokenIn: "USDC", tokenOut: "EURC", amountIn: toUnits(1000), minOut: toUnits(1001) }))
      .rejects.toMatchObject({ code: "SlippageExceeded" });
  });
  it("maps InsufficientLiquidity", async () => {
    const c = new MockPoolClient({ realPerTokenPerTick: 1000, depegBpsList: [100] });
    await expect(c.quote("USDC", "EURC", toUnits(1_000_000))).rejects.toBeInstanceOf(PoolError);
  });
  it("deposit into an existing tick grows tvl proportionally", async () => {
    const c = new MockPoolClient();
    const r = await c.deposit({ from: "G", amounts: [toUnits(100), toUnits(100), toUnits(100)], depegBps: 500 });
    expect(r.shares).toBeGreaterThan(0n);
    const s = await c.getState();
    expect(fromUnits(s.tvl)).toBeCloseTo(30_000_300, 0);
  });
  it("deposit rejects wrong proportions", async () => {
    const c = new MockPoolClient();
    await expect(c.deposit({ from: "G", amounts: [toUnits(100), toUnits(50), toUnits(100)], depegBps: 500 }))
      .rejects.toMatchObject({ code: "ProportionMismatch" });
  });
  it("reset restores the seed", async () => {
    const c = new MockPoolClient();
    await c.swap({ from: "G", tokenIn: "USDC", tokenOut: "EURC", amountIn: toUnits(2_000_000), minOut: 0n });
    await c.reset();
    const s = await c.getState();
    expect(s.ticks.every((t) => t.state === "interior")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/pool`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/config/tokens.ts`:
```ts
export interface TokenConfig {
  code: string;
  contractId: string; // Soroban contract id of the SAC; placeholder until deployed
  decimals: 7;
  colorVar: string;   // CSS variable name defined in globals.css
}

export const TOKENS: TokenConfig[] = [
  { code: "USDC", contractId: "C_PLACEHOLDER_USDC", decimals: 7, colorVar: "--token-0" },
  { code: "EURC", contractId: "C_PLACEHOLDER_EURC", decimals: 7, colorVar: "--token-1" },
  { code: "USDX", contractId: "C_PLACEHOLDER_USDX", decimals: 7, colorVar: "--token-2" },
];

export const tokenIndex = (code: string): number => {
  const i = TOKENS.findIndex((t) => t.code === code);
  if (i < 0) throw new Error(`unknown token ${code}`);
  return i;
};
```

`src/lib/pool/units.ts`:
```ts
export const SCALE = 10_000_000n;

export const toUnits = (n: number): bigint => BigInt(Math.round(n * 1e7));
export const fromUnits = (b: bigint): number => Number(b) / 1e7;

export function formatUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
```

`src/lib/pool/PoolClient.ts`:
```ts
export type TokenId = string; // token code from config

export type PoolErrorCode =
  | "InsufficientLiquidity" | "SlippageExceeded" | "ProportionMismatch"
  | "NotImplemented" | "Rejected" | "Unknown";

export class PoolError extends Error {
  constructor(public code: PoolErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PoolError";
  }
}

export interface TickInfo {
  depegBps: number;
  radius: bigint;
  state: "interior" | "boundary";
  capEff: number;
}

export interface PoolState {
  tokens: TokenId[];
  reserves: bigint[];   // real reserves, 7 decimals
  ticks: TickInfo[];
  tvl: bigint;
}

export interface Quote {
  amountOut: bigint;
  ticksCrossed: number;
  priceBefore: number;  // tokenOut priced in tokenIn
  priceAfter: number;
}

export interface PoolClient {
  getState(): Promise<PoolState>;
  quote(tokenIn: TokenId, tokenOut: TokenId, amountIn: bigint): Promise<Quote>;
  swap(args: { from: string; tokenIn: TokenId; tokenOut: TokenId; amountIn: bigint; minOut: bigint }): Promise<{ amountOut: bigint; txHash?: string }>;
  deposit(args: { from: string; amounts: bigint[]; depegBps: number }): Promise<{ shares: bigint; txHash?: string }>;
  reset?(): Promise<void>;
  subscribe(cb: (s: PoolState) => void): () => void;
}
```

`src/lib/pool/MockPoolClient.ts`:
```ts
import { TOKENS, tokenIndex } from "@/config/tokens";
import { capitalEfficiency, createTick, cloneTick, OrbitalError, poolRealReserves, quote as mathQuote, realReserves, type Tick } from "@/lib/orbital";
import { PoolError, type PoolClient, type PoolState, type Quote, type TokenId } from "./PoolClient";
import { fromUnits, toUnits } from "./units";

export interface MockOptions { realPerTokenPerTick?: number; depegBpsList?: number[] }

function mapError(e: unknown): PoolError {
  if (e instanceof OrbitalError) {
    if (e.code === "InsufficientLiquidity") return new PoolError("InsufficientLiquidity", e.message);
    return new PoolError("Unknown", e.message);
  }
  return new PoolError("Unknown", String(e));
}

export class MockPoolClient implements PoolClient {
  private ticks: Tick[] = [];
  private listeners = new Set<(s: PoolState) => void>();
  private readonly n = TOKENS.length;
  private readonly opts: Required<MockOptions>;

  constructor(opts: MockOptions = {}) {
    this.opts = { realPerTokenPerTick: opts.realPerTokenPerTick ?? 2_500_000, depegBpsList: opts.depegBpsList ?? [10, 100, 500, 1000] };
    this.seed();
  }

  private seed() {
    this.ticks = this.opts.depegBpsList.map((bps) => createTick(`t${bps}`, bps, this.opts.realPerTokenPerTick, this.n));
  }

  private snapshot(): PoolState {
    const reserves = poolRealReserves(this.ticks);
    return {
      tokens: TOKENS.map((t) => t.code),
      reserves: reserves.map(toUnits),
      ticks: this.ticks.map((t) => ({ depegBps: t.depegBps, radius: toUnits(t.radius), state: t.state, capEff: capitalEfficiency(t.depegBps, this.n) })),
      tvl: toUnits(reserves.reduce((a, b) => a + b, 0)),
    };
  }

  private notify() { const s = this.snapshot(); for (const cb of this.listeners) cb(s); }

  async getState(): Promise<PoolState> { return this.snapshot(); }

  async quote(tokenIn: TokenId, tokenOut: TokenId, amountIn: bigint): Promise<Quote> {
    try {
      const q = mathQuote(this.ticks, tokenIndex(tokenIn), tokenIndex(tokenOut), fromUnits(amountIn));
      return { amountOut: toUnits(q.amountOut), ticksCrossed: q.ticksCrossed, priceBefore: q.priceBefore, priceAfter: q.priceAfter };
    } catch (e) { throw mapError(e); }
  }

  async swap(args: { from: string; tokenIn: TokenId; tokenOut: TokenId; amountIn: bigint; minOut: bigint }) {
    let q;
    try { q = mathQuote(this.ticks, tokenIndex(args.tokenIn), tokenIndex(args.tokenOut), fromUnits(args.amountIn)); }
    catch (e) { throw mapError(e); }
    const amountOut = toUnits(q.amountOut);
    if (amountOut < args.minOut) throw new PoolError("SlippageExceeded", `out ${amountOut} < minOut ${args.minOut}`);
    this.ticks = q.ticks;
    this.notify();
    return { amountOut };
  }

  async deposit(args: { from: string; amounts: bigint[]; depegBps: number }) {
    const amounts = args.amounts.map(fromUnits);
    if (amounts.length !== this.n || amounts.some((a) => !(a > 0))) throw new PoolError("ProportionMismatch", "need a positive amount per token");
    let tick = this.ticks.find((t) => t.depegBps === args.depegBps);
    if (!tick) {
      // new tick starts at the equal point; requires equal amounts
      const a0 = amounts[0];
      if (amounts.some((a) => Math.abs(a - a0) / a0 > 0.01)) throw new PoolError("ProportionMismatch", "new tick needs equal amounts");
      tick = createTick(`t${args.depegBps}`, args.depegBps, a0, this.n);
      this.ticks = [...this.ticks, tick].sort((a, b) => a.depegBps - b.depegBps);
      this.notify();
      return { shares: toUnits(tick.radius) };
    }
    // existing tick: amounts must match its current real-reserve proportions
    const t = cloneTick(tick);
    const real = realReserves(t);
    const ratio = amounts[0] / real[0];
    for (let k = 1; k < this.n; k++) {
      if (Math.abs(amounts[k] / real[k] - ratio) / ratio > 0.01) throw new PoolError("ProportionMismatch", "amounts must match pool proportions");
    }
    const dR = t.radius * ratio;
    t.x = t.x.map((v) => v * (1 + ratio));
    t.radius += dR;
    this.ticks = this.ticks.map((o) => (o.id === t.id ? t : o));
    this.notify();
    return { shares: toUnits(dR) };
  }

  async reset() { this.seed(); this.notify(); }

  subscribe(cb: (s: PoolState) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
}
```

Note on deposit into an existing tick: scaling `x` and `R` by the same factor keeps the tick on its sphere (the sphere equation is homogeneous) and scales real reserves by `ratio`, so `amounts_k = ratio * real_k` is the exact requirement.

`src/lib/pool/SorobanPoolClient.ts`:
```ts
import { PoolError, type PoolClient, type PoolState, type Quote, type TokenId } from "./PoolClient";

export interface SorobanOptions { rpcUrl: string; contractId: string; networkPassphrase: string }

/** Placeholder until the contract is deployed. Every call throws NotImplemented. */
export class SorobanPoolClient implements PoolClient {
  constructor(public readonly opts: SorobanOptions) {}
  async getState(): Promise<PoolState> { throw new PoolError("NotImplemented"); }
  async quote(_i: TokenId, _o: TokenId, _a: bigint): Promise<Quote> { throw new PoolError("NotImplemented"); }
  async swap(): Promise<{ amountOut: bigint; txHash?: string }> { throw new PoolError("NotImplemented"); }
  async deposit(): Promise<{ shares: bigint; txHash?: string }> { throw new PoolError("NotImplemented"); }
  subscribe(): () => void { return () => {}; }
}
```

`src/lib/pool/index.ts`:
```ts
import { MockPoolClient } from "./MockPoolClient";
import { SorobanPoolClient } from "./SorobanPoolClient";
import type { PoolClient } from "./PoolClient";

let instance: PoolClient | null = null;

export function getPoolClient(): PoolClient {
  if (instance) return instance;
  if (process.env.NEXT_PUBLIC_POOL_BACKEND === "soroban") {
    instance = new SorobanPoolClient({
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org",
      contractId: process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ?? "",
      networkPassphrase: "Test SDF Network ; September 2015",
    });
  } else {
    instance = new MockPoolClient();
  }
  return instance;
}

export * from "./PoolClient";
export * from "./units";
export { MockPoolClient } from "./MockPoolClient";
```

Create `.env.example`:
```
NEXT_PUBLIC_POOL_BACKEND=mock
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_POOL_CONTRACT_ID=
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pool src/config .env.example
git commit -m "feat(pool): PoolClient interface, units and in-memory mock

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Theme tokens, layout and usePool hook

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/components/layout/Header.tsx`, `src/hooks/usePool.ts`
- Test: `src/hooks/usePool.test.tsx`

**Interfaces:**
- Produces:
  - CSS variables on `:root`: `--bg`, `--fg`, `--muted`, `--line`, `--accent`, `--token-0`, `--token-1`, `--token-2`, `--boundary`; Tailwind `@theme` maps them to `bg-bg`, `text-fg`, `text-muted`, `border-line`, `bg-accent`, `text-boundary`
  - `usePool(): { state: PoolState | null; client: PoolClient; refresh(): Promise<void> }`

- [ ] **Step 1: Write the failing hook test**

`src/hooks/usePool.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePool } from "./usePool";
import { toUnits } from "@/lib/pool";

describe("usePool", () => {
  it("loads state and updates after a swap", async () => {
    const { result } = renderHook(() => usePool());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    const before = result.current.state!.reserves[0];
    await act(async () => {
      await result.current.client.swap({ from: "G", tokenIn: "USDC", tokenOut: "EURC", amountIn: toUnits(1000), minOut: 0n });
    });
    await waitFor(() => expect(result.current.state!.reserves[0]).toBeGreaterThan(before));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks`
Expected: FAIL, cannot resolve `./usePool`.

- [ ] **Step 3: Implement hook, theme, layout**

`src/hooks/usePool.ts`:
```ts
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getPoolClient, type PoolState } from "@/lib/pool";

export function usePool() {
  const client = useMemo(() => getPoolClient(), []);
  const [state, setState] = useState<PoolState | null>(null);
  const refresh = useCallback(async () => { setState(await client.getState()); }, [client]);
  useEffect(() => {
    void refresh();
    return client.subscribe(setState);
  }, [client, refresh]);
  return { state, client, refresh };
}
```

Replace `src/app/globals.css` with:
```css
@import "tailwindcss";

:root {
  --bg: #0b0b0d;
  --fg: #f2f2f2;
  --muted: #8a8a93;
  --line: #24242a;
  --accent: #8b5cf6;
  --boundary: #f59e0b;
  --token-0: #60a5fa;
  --token-1: #34d399;
  --token-2: #f472b6;
}

@theme inline {
  --color-bg: var(--bg);
  --color-fg: var(--fg);
  --color-muted: var(--muted);
  --color-line: var(--line);
  --color-accent: var(--accent);
  --color-boundary: var(--boundary);
  --color-token-0: var(--token-0);
  --color-token-1: var(--token-1);
  --color-token-2: var(--token-2);
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}

body { background: var(--bg); color: var(--fg); }
```

`src/components/layout/Header.tsx`:
```tsx
import Link from "next/link";

export function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b border-line px-6 py-3">
      <nav className="flex gap-6 font-mono text-sm">
        <Link href="/" className="text-fg">POOL</Link>
        <Link href="/attack" className="text-muted hover:text-fg">ATTACK</Link>
      </nav>
      <div>{right}</div>
    </header>
  );
}
```

`src/app/layout.tsx`: keep the scaffold's structure, set `<title>` metadata to `Orbital on Stellar`, remove the scaffold's Google font imports if they need network at build time, wrap children in `<main className="min-h-screen bg-bg text-fg">`.

Delete the scaffold's demo content from `src/app/page.tsx` and replace with a placeholder `<Header />` plus `<div className="p-6 font-mono">pool</div>` (Task 8 fills it).

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run` then `npm run build`
Expected: all pass, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app src/components src/hooks
git commit -m "feat(ui): theme tokens, header and usePool hook

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Pool page components

**Files:**
- Create: `src/components/pool/TickPlanes.tsx`, `src/components/pool/TwoTokenCurve.tsx`, `src/components/pool/SwapForm.tsx`, `src/components/pool/ReservesTable.tsx`, `src/components/pool/TicksTable.tsx`, `src/components/pool/PoolView.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/components/pool/PoolView.test.tsx`

**Interfaces:**
- Consumes: `usePool`, `lib/orbital` (`projectState`, `tokenCorners`, `schematicRadius`, `ringRadiusNorm`, `kappaFromDepeg`, `poolPrice`), `lib/pool` (`formatUsd`, `fromUnits`, `toUnits`).
- Produces: `PoolView` client component that owns swap form state (`tokenIn`, `tokenOut`, `amount`) and passes derived props down. Components are presentational.

Because `PoolState` carries only real reserves and tick summaries (bigint), the SVGs need the math-level ticks. To keep the adapter boundary intact, `MockPoolClient` also exposes `getTicks(): Tick[]` (mock only) and `PoolView` uses it when available; when unavailable (soroban) the tick-planes dot is placed from `PoolState.reserves` via a reconstructed consolidated tick. Implement `ticksFromState(state: PoolState): Tick[]` in `src/lib/pool/reconstruct.ts` for that fallback: one tick per `TickInfo` with `radius = fromUnits(radius)`, `x` unknown, so set `x` at the equal point scaled by `reserves / seedReserves`. This is display-only.

- [ ] **Step 1: Write the failing smoke test**

`src/components/pool/PoolView.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PoolView } from "./PoolView";

describe("PoolView", () => {
  it("renders reserves and quotes a swap", async () => {
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30.00M")).toBeInTheDocument());
    const input = screen.getByLabelText("amount in");
    fireEvent.change(input, { target: { value: "1000000" } });
    await waitFor(() => expect(screen.getByTestId("quote-out").textContent).toMatch(/\$/));
    fireEvent.click(screen.getByText("COMMIT SWAP"));
    await waitFor(() => expect(screen.getAllByText("BOUNDARY").length).toBeGreaterThan(0));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/pool`
Expected: FAIL, cannot resolve `./PoolView`.

- [ ] **Step 3: Implement**

Add to `MockPoolClient`:
```ts
  /** Mock only: math-level ticks for the visualizations. */
  getTicks(): Tick[] { return this.ticks.map(cloneTick); }
```

`src/lib/pool/reconstruct.ts`:
```ts
import { createTick, type Tick } from "@/lib/orbital";
import type { PoolState } from "./PoolClient";
import { fromUnits } from "./units";

/** Display-only fallback when the client cannot expose math ticks. */
export function ticksFromState(state: PoolState): Tick[] {
  const n = state.tokens.length;
  const total = fromUnits(state.tvl) / n; // real per token if balanced
  return state.ticks.map((ti) => {
    const t = createTick(`t${ti.depegBps}`, ti.depegBps, Math.max(total / state.ticks.length, 1e-9), n);
    t.state = ti.state;
    return t;
  });
}
```

`src/components/pool/TickPlanes.tsx`:
```tsx
"use client";
import { kappaFromDepeg, projectState, ringRadiusNorm, schematicRadius, type Tick } from "@/lib/orbital";
import { TOKENS } from "@/config/tokens";
import { tokenCorners } from "@/lib/orbital";

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
            {t.depegBps / 100}% · {Math.round(t.radius / (t.radius * (1 - t.xMinNorm / (1 - 1 / Math.sqrt(3)))) * 10) / 10}×
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
```

Replace the inline cap-eff expression with `capitalEfficiency(t.depegBps, 3).toFixed(1)` imported from `@/lib/orbital` (the inline form above is wrong; use the library function).

`src/components/pool/TwoTokenCurve.tsx`:
```tsx
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
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
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
```

`src/components/pool/SwapForm.tsx`:
```tsx
"use client";
import { TOKENS } from "@/config/tokens";
import { formatUsd } from "@/lib/pool";

export interface SwapFormProps {
  tokenIn: string; tokenOut: string; amount: string;
  maxAmount: number;
  quoteOut: number | null; price: number | null; error: string | null; busy: boolean;
  onTokenIn(code: string): void; onTokenOut(code: string): void; onAmount(v: string): void;
  onFlip(): void; onCommit(): void; onReset(): void;
}

export function SwapForm(p: SwapFormProps) {
  const Sel = ({ value, onChange }: { value: string; onChange(v: string): void }) => (
    <div className="flex gap-1">
      {TOKENS.map((t) => (
        <button key={t.code} type="button" onClick={() => onChange(t.code)}
          className={`rounded px-2 py-1 font-mono text-xs ${value === t.code ? "bg-accent text-bg" : "border border-line text-muted"}`}>{t.code}</button>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-3 font-mono text-sm">
      <div className="flex items-center justify-between"><span className="text-muted">PAY</span><Sel value={p.tokenIn} onChange={p.onTokenIn} /></div>
      <input aria-label="amount in" inputMode="decimal" value={p.amount} onChange={(e) => p.onAmount(e.target.value)}
        placeholder="0.00" className="w-full rounded border border-line bg-transparent px-3 py-2 text-lg" />
      <input aria-label="amount slider" type="range" min={0} max={p.maxAmount} step={p.maxAmount / 1000} value={Number(p.amount) || 0}
        onChange={(e) => p.onAmount(e.target.value)} className="w-full" />
      <button type="button" onClick={p.onFlip} className="self-center text-muted">⇅</button>
      <div className="flex items-center justify-between"><span className="text-muted">RECEIVE</span><Sel value={p.tokenOut} onChange={p.onTokenOut} /></div>
      <div className="rounded border border-line px-3 py-2">
        <div data-testid="quote-out" className="text-lg">{p.quoteOut === null ? "—" : formatUsd(p.quoteOut)}</div>
        <div className="text-xs text-muted">{p.price === null ? "" : `1 ${p.tokenIn} ≈ ${(1 / p.price).toFixed(5)} ${p.tokenOut}`}</div>
      </div>
      {p.error && <div className="text-xs text-boundary">{p.error}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={p.busy || p.quoteOut === null} onClick={p.onCommit}
          className="flex-1 rounded bg-accent px-3 py-2 text-bg disabled:opacity-40">COMMIT SWAP</button>
        <button type="button" onClick={p.onReset} className="rounded border border-line px-3 py-2 text-muted">RESET</button>
      </div>
    </div>
  );
}
```

`src/components/pool/ReservesTable.tsx`:
```tsx
import { TOKENS } from "@/config/tokens";
import { formatUsd } from "@/lib/pool";

export function ReservesTable({ reserves, prices, tvl }: { reserves: number[]; prices: number[]; tvl: number }) {
  return (
    <table className="w-full font-mono text-sm">
      <thead><tr className="text-muted"><th className="text-left">RESERVE</th><th className="text-right">AMOUNT</th><th className="text-right">PRICE</th></tr></thead>
      <tbody>
        {TOKENS.map((t, i) => (
          <tr key={t.code}><td>{t.code}</td><td className="text-right">{formatUsd(reserves[i])}</td>
            <td className={`text-right ${Math.abs(prices[i] - 1) > 1e-4 ? "text-accent" : "text-muted"}`}>{prices[i].toFixed(4)}</td></tr>
        ))}
        <tr className="border-t border-line"><td>TVL</td><td className="text-right">{formatUsd(tvl)}</td><td /></tr>
      </tbody>
    </table>
  );
}
```

`src/components/pool/TicksTable.tsx`:
```tsx
import type { TickInfo } from "@/lib/pool";

export function TicksTable({ ticks }: { ticks: TickInfo[] }) {
  return (
    <table className="w-full font-mono text-sm">
      <thead><tr className="text-muted"><th className="text-left">DEPEG</th><th className="text-left">CAP. EFF.</th><th className="text-right">STATE</th></tr></thead>
      <tbody>
        {ticks.map((t) => (
          <tr key={t.depegBps}><td>{t.depegBps / 100}%</td><td>{t.capEff.toFixed(1)}×</td>
            <td className={`text-right ${t.state === "boundary" ? "text-boundary" : "text-muted"}`}>{t.state.toUpperCase()}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
```

`src/components/pool/PoolView.tsx`:
```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { usePool } from "@/hooks/usePool";
import { TOKENS, tokenIndex } from "@/config/tokens";
import { fromUnits, toUnits, PoolError, type Quote } from "@/lib/pool";
import { ticksFromState } from "@/lib/pool/reconstruct";
import { poolPrice, type Tick } from "@/lib/orbital";
import { TickPlanes } from "./TickPlanes";
import { TwoTokenCurve } from "./TwoTokenCurve";
import { SwapForm } from "./SwapForm";
import { ReservesTable } from "./ReservesTable";
import { TicksTable } from "./TicksTable";

type WithTicks = { getTicks?: () => Tick[] };

export function PoolView() {
  const { state, client } = usePool();
  const [tokenIn, setTokenIn] = useState(TOKENS[0].code);
  const [tokenOut, setTokenOut] = useState(TOKENS[1].code);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prevTicks, setPrevTicks] = useState<Tick[] | undefined>();

  const ticks = useMemo<Tick[]>(() => {
    if (!state) return [];
    const g = (client as unknown as WithTicks).getTicks;
    return g ? g.call(client) : ticksFromState(state);
  }, [state, client]);

  useEffect(() => {
    const a = Number(amount);
    if (!(a > 0)) { setQuote(null); setError(null); return; }
    const h = setTimeout(async () => {
      try { setQuote(await client.quote(tokenIn, tokenOut, toUnits(a))); setError(null); }
      catch (e) { setQuote(null); setError(e instanceof PoolError ? e.message : String(e)); }
    }, 80);
    return () => clearTimeout(h);
  }, [amount, tokenIn, tokenOut, client]);

  if (!state) return <div className="p-6 font-mono text-muted">loading…</div>;

  const i = tokenIndex(tokenIn), j = tokenIndex(tokenOut);
  const numeraire = [0, 1, 2].find((k) => k !== i && k !== j) ?? 0;
  const prices = ticks.length ? [0, 1, 2].map((k) => poolPrice(ticks, k, numeraire)) : [1, 1, 1];
  const reserves = state.reserves.map(fromUnits);

  const commit = async () => {
    if (!quote) return;
    setBusy(true);
    try {
      setPrevTicks(ticks);
      await client.swap({ from: "", tokenIn, tokenOut, amountIn: toUnits(Number(amount)), minOut: (quote.amountOut * 995n) / 1000n });
      setAmount("");
    } catch (e) { setError(e instanceof PoolError ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const reset = async () => { await client.reset?.(); setPrevTicks(undefined); setAmount(""); };
  const flip = () => { setTokenIn(tokenOut); setTokenOut(tokenIn); };
  const pickIn = (c: string) => { if (c === tokenOut) setTokenOut(tokenIn); setTokenIn(c); };
  const pickOut = (c: string) => { if (c === tokenIn) setTokenIn(tokenOut); setTokenOut(c); };

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
      <section className="border border-line p-4"><h2 className="mb-2 font-mono text-xs text-muted">// SECTION A · TICK PLANES</h2><TickPlanes ticks={ticks} prev={prevTicks} /></section>
      <section className="border border-line p-4"><h2 className="mb-2 font-mono text-xs text-muted">// SECTION B · {tokenIn}/{tokenOut} PLANE</h2><TwoTokenCurve ticks={ticks} i={i} j={j} prev={prevTicks} /></section>
      <section className="flex flex-col gap-6 border border-line p-4">
        <h2 className="font-mono text-xs text-muted">// SECTION C · SWAP</h2>
        <SwapForm tokenIn={tokenIn} tokenOut={tokenOut} amount={amount} maxAmount={reserves[i] * 2}
          quoteOut={quote ? fromUnits(quote.amountOut) : null} price={quote?.priceAfter ?? null} error={error} busy={busy}
          onTokenIn={pickIn} onTokenOut={pickOut} onAmount={setAmount} onFlip={flip} onCommit={commit} onReset={reset} />
        <ReservesTable reserves={reserves} prices={prices} tvl={fromUnits(state.tvl)} />
        <TicksTable ticks={state.ticks} />
      </section>
    </div>
  );
}
```

`src/app/page.tsx`:
```tsx
import { Header } from "@/components/layout/Header";
import { PoolView } from "@/components/pool/PoolView";

export default function Page() {
  return (<><Header /><PoolView /></>);
}
```

- [ ] **Step 4: Run tests, build, and eyeball**

Run: `npx vitest run` then `npm run build`.
Expected: all pass, build succeeds.
Run `npm run dev`, open `http://localhost:3000`, type 6000000 into the amount, confirm the quote shows about $4.0M, commit, and confirm ticks show BOUNDARY and the dot leaves PEG. Note any visual defects in the commit message body; do not fix styling now.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(ui): pool page with tick planes, curve and swap panel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Attack demo page

**Files:**
- Create: `src/lib/attack/orderbook.ts`, `src/components/attack/OrderbookPanel.tsx`, `src/components/attack/OrbitalPanel.tsx`, `src/components/attack/AttackView.tsx`, `src/app/attack/page.tsx`
- Test: `src/lib/attack/orderbook.test.ts`, `src/components/attack/AttackView.test.tsx`

**Interfaces:**
- Consumes: `createTick`, `quote`, `maxFillable`, `poolPrice`, `OrbitalError`, `formatUsd`.
- Produces:
  - `THIN_BOOK: Ask[]`, `sweep(book: Ask[], budgetUsd: number): SweepResult` where `Ask = { price: number; size: number }`, `SweepResult = { filled: number; spent: number; lastPrice: number; exhausted: boolean; levelsHit: number }`
  - `attackPool(): Tick[]` three ticks (100, 500, 1000 bps) with $500K real per token per tick
  - `orbitalOutcome(budget: number): { price: number; capped: boolean; spent: number; received: number; maxSpend: number }`

- [ ] **Step 1: Write the failing tests**

`src/lib/attack/orderbook.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { THIN_BOOK, sweep, orbitalOutcome } from "./orderbook";

describe("thin orderbook", () => {
  it("a small budget stays near $1", () => {
    const r = sweep(THIN_BOOK, 100);
    expect(r.lastPrice).toBeCloseTo(1, 2);
    expect(r.exhausted).toBe(false);
  });
  it("a few thousand dollars sends the last price to 107", () => {
    const r = sweep(THIN_BOOK, 10_000);
    expect(r.lastPrice).toBe(107);
    expect(r.exhausted).toBe(true);
    expect(r.spent).toBeLessThan(10_000);
  });
  it("price is monotone in budget", () => {
    let last = 0;
    for (const b of [10, 100, 1000, 5000, 100000]) { const r = sweep(THIN_BOOK, b); expect(r.lastPrice).toBeGreaterThanOrEqual(last); last = r.lastPrice; }
  });
});

describe("orbital outcome", () => {
  it("small budget barely moves price", () => {
    const o = orbitalOutcome(10_000);
    expect(o.price).toBeLessThan(1.01);
    expect(o.capped).toBe(false);
  });
  it("huge budget is capped near 1/0.9", () => {
    const o = orbitalOutcome(100_000_000);
    expect(o.capped).toBe(true);
    expect(o.price).toBeLessThan(1.2);
    expect(o.price).toBeGreaterThan(1.05);
    expect(o.spent).toBeCloseTo(o.maxSpend, 0);
  });
});
```

`src/components/attack/AttackView.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttackView } from "./AttackView";

describe("AttackView", () => {
  it("shows both panels and reacts to the slider", () => {
    render(<AttackView />);
    const slider = screen.getByLabelText("attack budget");
    fireEvent.change(slider, { target: { value: "8" } }); // 10^8
    expect(screen.getByTestId("ob-price").textContent).toContain("107");
    expect(screen.getByTestId("orb-capped")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/attack src/components/attack`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/lib/attack/orderbook.ts`:
```ts
import { createTick, maxFillable, quote, OrbitalError, type Tick } from "@/lib/orbital";

export interface Ask { price: number; size: number }
export interface SweepResult { filled: number; spent: number; lastPrice: number; exhausted: boolean; levelsHit: number }

/** A near-dead market: under $10K of asks, then nothing. Last level mirrors USTRY's $107 print. */
export const THIN_BOOK: Ask[] = [
  { price: 1.0, size: 800 }, { price: 1.02, size: 400 }, { price: 1.1, size: 250 }, { price: 1.5, size: 120 },
  { price: 3, size: 60 }, { price: 10, size: 30 }, { price: 40, size: 15 }, { price: 107, size: 10 },
];

export function sweep(book: Ask[], budgetUsd: number): SweepResult {
  let budget = budgetUsd, filled = 0, spent = 0, lastPrice = book[0]?.price ?? 0, levelsHit = 0;
  for (const ask of book) {
    if (budget <= 0) break;
    const cost = ask.price * ask.size;
    levelsHit++;
    lastPrice = ask.price;
    if (budget >= cost) { budget -= cost; spent += cost; filled += ask.size; }
    else { const qty = budget / ask.price; filled += qty; spent += budget; budget = 0; }
  }
  return { filled, spent, lastPrice, exhausted: budget > 0, levelsHit };
}

export function attackPool(): Tick[] {
  return [100, 500, 1000].map((bps) => createTick(`a${bps}`, bps, 500_000, 3));
}

const IN = 0, OUT = 1;

export function orbitalOutcome(budget: number): { price: number; capped: boolean; spent: number; received: number; maxSpend: number } {
  const pool = attackPool();
  const maxSpend = maxFillable(pool, IN, OUT);
  if (!(budget > 0)) return { price: 1, capped: false, spent: 0, received: 0, maxSpend };
  try {
    const q = quote(pool, IN, OUT, budget);
    return { price: q.priceAfter, capped: false, spent: budget, received: q.amountOut, maxSpend };
  } catch (e) {
    if (!(e instanceof OrbitalError) || e.code !== "InsufficientLiquidity") throw e;
    const q = quote(pool, IN, OUT, maxSpend);
    return { price: q.priceAfter, capped: true, spent: maxSpend, received: q.amountOut, maxSpend };
  }
}
```

`src/components/attack/OrderbookPanel.tsx`:
```tsx
import { formatUsd } from "@/lib/pool";
import type { SweepResult } from "@/lib/attack/orderbook";

export function OrderbookPanel({ r }: { r: SweepResult }) {
  return (
    <section className="border border-line p-4 font-mono text-sm">
      <h2 className="mb-2 text-xs text-muted">// THIN ORDERBOOK · VWAP ORACLE</h2>
      <div className="text-4xl" data-testid="ob-price">${r.lastPrice.toFixed(2)}</div>
      <div className="mt-1 text-xs text-muted">last trade price · {r.levelsHit} levels hit · spent {formatUsd(r.spent)}</div>
      {r.exhausted && <div className="mt-3 text-xs text-boundary">book exhausted, oracle keeps reporting the last print</div>}
      <p className="mt-4 text-xs text-muted">22 Feb 2026: one trade on a market with under $1 of hourly volume moved USTRY from ~$1 to ~$107. YieldBlox accepted that print as collateral value.</p>
    </section>
  );
}
```

`src/components/attack/OrbitalPanel.tsx`:
```tsx
import { formatUsd } from "@/lib/pool";

export function OrbitalPanel({ o }: { o: { price: number; capped: boolean; spent: number; received: number; maxSpend: number } }) {
  return (
    <section className="border border-line p-4 font-mono text-sm">
      <h2 className="mb-2 text-xs text-muted">// ORBITAL POOL · 10% OUTER TICK</h2>
      <div className="text-4xl" data-testid="orb-price">${o.price.toFixed(4)}</div>
      <div className="mt-1 text-xs text-muted">marginal price · spent {formatUsd(o.spent)} · received {formatUsd(o.received)}</div>
      {o.capped && <div className="mt-3 text-xs text-boundary" data-testid="orb-capped">liquidity exhausted at {formatUsd(o.maxSpend)} · price cannot leave the tick bound</div>}
      <p className="mt-4 text-xs text-muted">Every tick exits to its plane before any coin leaves its declared band. Past that point there is nothing left to buy, so the readable price stops.</p>
    </section>
  );
}
```

`src/components/attack/AttackView.tsx`:
```tsx
"use client";
import { useMemo, useState } from "react";
import { THIN_BOOK, sweep, orbitalOutcome } from "@/lib/attack/orderbook";
import { formatUsd } from "@/lib/pool";
import { OrderbookPanel } from "./OrderbookPanel";
import { OrbitalPanel } from "./OrbitalPanel";

export function AttackView() {
  const [exp, setExp] = useState(2); // budget = 10^exp, 0..8
  const budget = Math.pow(10, exp);
  const ob = useMemo(() => sweep(THIN_BOOK, budget), [budget]);
  const orb = useMemo(() => orbitalOutcome(budget), [budget]);
  return (
    <div className="p-6 font-mono">
      <p className="mb-4 text-sm text-muted">Same attacker, same budget, two price sources. Only one of them has a ceiling.</p>
      <label className="mb-6 block text-xs text-muted">
        attack budget: <span className="text-fg">{formatUsd(budget)}</span>
        <input aria-label="attack budget" type="range" min={0} max={8} step={0.1} value={exp} onChange={(e) => setExp(Number(e.target.value))} className="mt-2 w-full" />
      </label>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OrderbookPanel r={ob} />
        <OrbitalPanel o={orb} />
      </div>
    </div>
  );
}
```

`src/app/attack/page.tsx`:
```tsx
import { Header } from "@/components/layout/Header";
import { AttackView } from "@/components/attack/AttackView";

export default function Page() {
  return (<><Header /><AttackView /></>);
}
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run` then `npm run build`
Expected: all pass, build succeeds. Open `/attack`, drag the slider, confirm the left price climbs to 107 and the right one stops with the capped notice.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(ui): attack demo comparing thin orderbook with tick-bounded pool

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Wallet connect

**Files:**
- Create: `src/components/wallet/ConnectButton.tsx`, `src/hooks/useWallet.ts`
- Modify: `src/app/page.tsx`, `src/app/attack/page.tsx` (pass `<ConnectButton />` as `Header right`), `src/components/pool/PoolView.tsx` (use the address for `from`)

**Interfaces:**
- Produces: `useWallet(): { address: string | null; connect(): Promise<void>; disconnect(): void }`

- [ ] **Step 1: Install**

```bash
npm i @creit.tech/stellar-wallets-kit
```

Check the installed version's README in `node_modules/@creit.tech/stellar-wallets-kit/README.md` for the exact constructor and `openModal` signature before writing the hook; the code below follows the v1 API and must be adjusted if the README differs.

- [ ] **Step 2: Implement hook**

`src/hooks/useWallet.ts`:
```ts
"use client";
import { useCallback, useEffect, useState } from "react";

type Kit = {
  openModal(opts: { onWalletSelected(w: { id: string }): Promise<void> | void }): Promise<void>;
  setWallet(id: string): void;
  getAddress(): Promise<{ address: string }>;
};

let kitPromise: Promise<Kit> | null = null;
async function getKit(): Promise<Kit> {
  if (!kitPromise) {
    kitPromise = import("@creit.tech/stellar-wallets-kit").then((m) => {
      const kit = new m.StellarWalletsKit({ network: m.WalletNetwork.TESTNET, selectedWalletId: m.FREIGHTER_ID, modules: m.allowAllModules() });
      return kit as unknown as Kit;
    });
  }
  return kitPromise;
}

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    try { const a = localStorage.getItem("orbital.address"); if (a) setAddress(a); } catch {}
  }, []);
  const connect = useCallback(async () => {
    const kit = await getKit();
    await kit.openModal({
      onWalletSelected: async (w) => {
        kit.setWallet(w.id);
        const { address } = await kit.getAddress();
        setAddress(address);
        try { localStorage.setItem("orbital.address", address); } catch {}
      },
    });
  }, []);
  const disconnect = useCallback(() => { setAddress(null); try { localStorage.removeItem("orbital.address"); } catch {} }, []);
  return { address, connect, disconnect };
}
```

`src/components/wallet/ConnectButton.tsx`:
```tsx
"use client";
import { useWallet } from "@/hooks/useWallet";

export function ConnectButton() {
  const { address, connect, disconnect } = useWallet();
  if (address) {
    return <button type="button" onClick={disconnect} className="rounded border border-line px-3 py-1 font-mono text-xs text-muted">{address.slice(0, 4)}…{address.slice(-4)}</button>;
  }
  return <button type="button" onClick={connect} className="rounded bg-accent px-3 py-1 font-mono text-xs text-bg">CONNECT</button>;
}
```

Wire `<Header right={<ConnectButton />} />` into both pages. In `PoolView`, read `useWallet().address` and pass `from: address ?? ""`.

- [ ] **Step 3: Test manually and build**

Run: `npx vitest run` then `npm run build`. Run dev, click CONNECT, pick Freighter (testnet), confirm the short address appears. Existing tests must still pass (the hook is lazy-loaded so jsdom never imports the kit).

- [ ] **Step 4: Commit**

```bash
git add src package.json package-lock.json
git commit -m "feat(wallet): connect button via Stellar Wallets Kit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: README and contract handoff doc

**Files:**
- Create: `README.md`, `docs/contract-interface.md`

- [ ] **Step 1: Write README**

`README.md` covers: what this is (one paragraph, credit Paradigm's Orbital paper and note the EVM reference implementation exists at github.com/Oxkai/orbital-hook while this is an independent Stellar implementation), how to run (`npm i`, `npm run dev`, `npm test`), env vars from `.env.example`, the two pages, the v1 simplification (frozen boundary ticks), and the layer diagram from the spec.

- [ ] **Step 2: Write the contract handoff**

`docs/contract-interface.md` copies spec section 4.3 verbatim, adds the unit convention (i128, 7 decimals, `depeg_bps` = allowed drop), the seed used by the mock (4 ticks, $2.5M per token per tick), and the formulas the contract must reproduce: `kappa(p)`, `xMinNorm`, the closed-form sphere step, and the plane-crossing quadratic (copy them from `src/lib/orbital/geometry.ts` and `swap.ts` as comments). State that the TS library is the reference for differential tests.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/contract-interface.md
git commit -m "docs: README and contract interface handoff

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: 4.1 math (Tasks 2-5), 4.2 adapter (Task 6), 4.3 handoff (Task 11), 4.4 tokens (Task 6), 5.1 pool page (Task 8), 5.2 attack page (Task 9), 5.3 wallet (Task 10), 5.4 visual direction deliberately deferred (theme tokens only, Task 7), 6 error handling (OrbitalError/PoolError mapping in Tasks 4 and 6, UI messages in Task 8), 7 tests (each task), 8 build order followed.
- Known approximation: `ticksFromState` fallback for a non-mock client is display-only and will be replaced when the Soroban client can return per-tick reserves.
- The `TickPlanes` label expression in Task 8 Step 3 is explicitly replaced by `capitalEfficiency(...)`; implementers must apply that replacement.
