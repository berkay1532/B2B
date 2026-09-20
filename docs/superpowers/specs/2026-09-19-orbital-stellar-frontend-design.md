# Orbital on Stellar: Frontend + Math Library Design

Date: 2026-09-19
Status: approved in chat; visual direction decided 2026-09-20 (§5.4)

## 1. Goal

A hackathon proof of concept of Paradigm's Orbital AMM (multi-stablecoin
concentrated liquidity) on Stellar. This spec covers the frontend and the
TypeScript math library. The Soroban contract is written in parallel by a
teammate; the frontend runs against an in-memory mock until the contract is
ready, then switches to the contract behind the same interface.

The demo must show a jury two things:

1. A 3-stablecoin Orbital pool in motion: swap, watch reserves move, watch
   ticks flip from INTERIOR to BOUNDARY, see capital efficiency per tick.
2. Why tick bounds matter: the February 2026 Blend/YieldBlox exploit pushed a
   $1 asset to $107 through a thin orderbook. In an Orbital pool the readable
   price cannot leave the tick bound, no matter how much is spent.

## 2. Non-goals (v1)

- LP withdrawal, multi-LP consolidation within one tick
- More than 3 tokens (the math is written for n, the UI assumes 3)
- Mobile layout polish
- Real oracle integration
- Mainnet anything

## 3. Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Charts: hand-written 2D SVG components (no three.js)
- Wallet: `@creit.tech/stellar-wallets-kit` (Freighter and others), testnet
- Chain access (later): `@stellar/stellar-sdk` + generated contract bindings
- Tests: vitest
- Numbers: the math layer works in float64 `number` token units (1.0 = one
  token). The adapter boundary (`lib/pool`) exchanges `bigint` at 7 decimals
  (Stellar stroop scale) with callers, so the UI and the future Soroban
  client speak the contract's unit. Float64 carries 15 significant digits;
  the tightest tick in the demo needs 6. The contract's i128 results will
  match within rounding, not bit for bit; a differential test with a
  tolerance is planned once the contract exists.

## 4. Architecture

Three layers with one-directional dependencies: `ui -> pool -> orbital`.

```
src/
  lib/orbital/        pure math, no React, no chain
    types.ts          Tick, TickState, QuoteResult, OrbitalError
    geometry.ts       kappaFromDepeg, xMinNorm, equalPointNorm, capitalEfficiency
    tick.ts           createTick, sumX, planeSum, realReserves, invariantResidual,
                      marginalPrice, poolPrice
    swap.ts           quote (closed-form sphere step + plane crossing), maxFillable
    projection.ts     2D projection of the reserve state for the tick-planes SVG
    index.ts
  lib/pool/           adapter boundary
    PoolClient.ts     interface (below)
    MockPoolClient.ts in-memory, uses lib/orbital
    SorobanPoolClient.ts  stub now, real later, same interface
    index.ts          picks implementation from NEXT_PUBLIC_POOL_BACKEND
  config/tokens.ts    the 3 testnet stablecoins (code, issuer/contract, decimals)
  app/
    page.tsx          Pool page
    attack/page.tsx   Attack demo page
  components/
    pool/             TickPlanes.svg.tsx, TwoTokenCurve.tsx, SwapForm.tsx,
                      ReservesTable.tsx, TicksTable.tsx
    attack/           OrderbookPanel.tsx, OrbitalPanel.tsx
    wallet/           ConnectButton.tsx
```

### 4.1 Math layer (`lib/orbital`)

All functions are pure and deterministic. Inputs and outputs are float64
token units (see section 3).

- **Invariant.** Sphere centered at `(R, ..., R)`:
  `sum_i (R - x_i)^2 = R^2` over effective reserves `x_i <= R`. Equal-price
  point: `x_i = R (1 - 1/sqrt(n))`. Marginal price of i in j:
  `(R - x_i) / (R - x_j)`. Real reserves are `x_i - xMin(kappa) * R`, where
  `xMin` is the smallest normalized reserve reachable inside the tick (the
  virtual part the LP never deposits). Capital efficiency is
  `xEq / (xEq - xMin)`; for n = 3 this gives 1098x, 110x, 21.8x, 10.8x at
  10, 100, 500, 1000 bps, matching the reference simulation and the
  paper's 5-asset figures (15x at 1000 bps, ~150x at 100 bps).
- **Ticks.** A tick is `{ depegBps, radius }` where `depegBps` is the
  allowed drop below peg in basis points (100 = the coin may fall to 0.99).
  From `p = 1 - depegBps/10000` the normalized plane constant is
  `kappa(p) = (n - (p + n - 1) / sqrt(p^2 + n - 1)) / sqrt(n)` (derived from
  the state where one coin sits at price `p` and the others are equal). Classification: interior while
  `sum_i x_i < kappa * R * sqrt(n)`, boundary once the sum reaches that
  plane.
- **Consolidation.** All interior ticks sum into one sphere (radius
  `R_int`), all boundary ticks into one lower-dimensional sphere
  (`R_bound`). The global invariant is the torus form from the paper. v1
  may implement the single-tick and the all-interior cases first, then
  add boundary consolidation; the public `quote` signature does not change.
- **Swap.** `quote(ticks, tokenIn, tokenOut, amountIn)` returns
  `{ amountOut, ticksCrossed, ticks, priceBefore, priceAfter }`. On a single
  sphere the out reserve is closed form
  (`x_out' = R - sqrt(R^2 - (R - x_in')^2 - S_others)`), and the exact
  input that carries a tick onto its plane is the root of a quadratic, so
  v1 needs no Newton iteration. Algorithm:
  1. a boundary tick rejoins the interior set for this swap if the trade
     moves it inward (its reserve of `tokenIn` is below its reserve of
     `tokenOut`)
  2. split the remaining input across interior ticks proportionally to
     their radii
  3. for each tick compute the input that reaches its plane; scale the
     step so the first such tick lands exactly on it, apply the step to
     every interior tick, mark that tick boundary, loop with the remainder
  4. when no interior tick remains, throw `InsufficientLiquidity`
  v1 simplification: a boundary tick is frozen (it does not trade the
  remaining n-1 coins on its circle as in the paper's torus model). This
  under-quotes slightly relative to the paper and is the one place the
  contract may diverge; the torus consolidation is a follow-up.
- **Prices.** Pool-level marginal price of token i in units of token j is
  `sum_t (R_t - x_t,i) / sum_t (R_t - x_t,j)` over all ticks. The reserves
  table shows each token priced in the token not involved in the current
  swap (the numeraire), which stays at 1.0.

### 4.2 Pool adapter (`lib/pool`)

```ts
interface PoolClient {
  getState(): Promise<PoolState>;
  quote(tokenIn: TokenId, tokenOut: TokenId, amountIn: bigint): Promise<Quote>;
  swap(args: { from: string; tokenIn: TokenId; tokenOut: TokenId;
               amountIn: bigint; minOut: bigint }): Promise<{ amountOut: bigint; txHash?: string }>;
  deposit(args: { from: string; amounts: bigint[]; depegBps: number }): Promise<{ shares: bigint; txHash?: string }>;
  reset?(): Promise<void>;            // mock only
  subscribe(cb: (s: PoolState) => void): () => void;
}

type PoolState = {
  tokens: TokenId[];
  reserves: bigint[];                 // real reserves, 7 decimals
  ticks: { depegBps: number; radius: bigint; state: "interior" | "boundary"; capEff: number }[];
  tvl: bigint;
};
```

`MockPoolClient` seeds a $30M pool ($10M each) with ticks at 10, 100, 500
and 1000 bps. `swap` mutates in memory and notifies subscribers.
`SorobanPoolClient` is a stub that throws `NotImplemented` until the
contract lands; its constructor takes `{ rpcUrl, contractId, network }`.

Selection: `NEXT_PUBLIC_POOL_BACKEND=mock | soroban` (default mock).

### 4.3 Contract interface handed to the contract team

The mock mirrors these names and shapes so the swap to Soroban is
mechanical.

```
get_state()  -> PoolState (reserves: Vec<i128>, ticks: Vec<Tick>)
quote(token_in: Address, token_out: Address, amount_in: i128)
             -> Quote { amount_out: i128, ticks_crossed: u32 }
swap(from: Address, token_in: Address, token_out: Address,
     amount_in: i128, min_out: i128) -> i128
deposit(from: Address, amounts: Vec<i128>, depeg_bps: u32) -> i128
```

All amounts i128 at 7 decimals. `from.require_auth()` on swap and deposit.

### 4.4 Tokens (`config/tokens.ts`)

Three entries `{ code, contractId, decimals: 7, color }`. Mock uses
placeholders `USDC`, `USDT`, `USDX`. Real testnet contract ids are dropped
in when the contract team deploys.

## 5. UI

### 5.1 Pool page (`/`)

Three-column layout, mirroring the reference simulation's information
architecture (not its visual style):

- **Tick planes (left).** SVG: three token labels at triangle corners, PEG
  dot in the center, one dashed ring per tick labeled `depeg% · capEff×`.
  The current reserve point is drawn as a dot with a line from PEG; rings
  it has crossed switch to the boundary style.
- **Two-token curve (middle).** SVG: reserve curve for the selected pair
  with the current point and the pre-swap ghost point.
- **Swap panel (right).** Pay token select, amount input, slider bound to
  wallet balance (mock: bound to reserve), receive token select, quote
  with effective price, Commit and Reset buttons. Below: reserves table
  (reserve, price) and TVL; ticks table (depeg, cap eff, state).

**Live preview.** The amount slider (and the input) drive a preview of the
post-swap state before Commit: the dots in the tick-planes and two-token
panels move, the reserves/prices table and tick states update, and a grey
ghost dot marks the committed state. Commit makes the preview the new
committed state (the previous committed state becomes the ghost); Reset
returns to the seed. The preview is computed locally with the pure math
library; the numeric quote in the swap panel comes from the `PoolClient`.

**Classic comparison.** The two-token panel also draws a plain `x*y=k`
pool seeded with the same real reserves, on real-reserve axes, with its own
dot driven by the same slider and updated on Commit. The swap panel shows
the classic output next to the Orbital output. This makes the capital
efficiency claim visible: the Orbital curve stays almost straight while
the hyperbola bends.

Quotes recompute on every input change (debounced). In mock mode Commit is
instant; in soroban mode it opens the wallet signer and shows the tx hash.

### 5.2 Attack demo page (`/attack`)

Two panels side by side, one shared "attack size" slider:

- **Thin orderbook (left).** A tiny simulated orderbook (a handful of asks
  totalling a few thousand dollars). The slider buys through it; the
  displayed "oracle price" is the last trade price and climbs without
  bound. A callout cites the YieldBlox incident (22 Feb 2026, $1 to $107).
- **Orbital pool (right).** The same buy against the mock pool. The price
  rises until the outermost tick hits boundary, then the panel shows
  "liquidity exhausted, price capped at X" and the number stops moving.

One sentence of copy above both: the attacker's spend is the same, the
readable price is not.

### 5.3 Wallet

`ConnectButton` in the header. In mock mode it still connects (so the
address shows) but swaps do not sign. In soroban mode it signs.

### 5.4 Visual direction (decided 2026-09-20: "Observatory", Layout A)

Approved mockup: `docs/design/observatory-stage-mockup.html` (also on the
design canvas). Rules:

- Palette: deep navy-black ground (`#05070d`) with a soft radial vignette
  toward `#0d1630`, faint orbit ellipses and a few star points in the
  background; text `#e6ebf7`, muted `#6e7a94` / `#8a96b3`, hairlines
  `rgba(120,150,255,0.14)`. One accent, electric teal `#37f0d0`, used for
  the reserve dot, slider, prices, CONNECT and COMMIT. Boundary state is
  amber `#ffb454` with a glow. No purple.
- Type: Instrument Sans (600/700) for the wordmark, big numbers and
  inputs; JetBrains Mono for labels, tables and nav. Section labels read
  `TICK PLANES`, `USDC / USDT CURVE`, not `// SECTION A`.
- Layout A ("stage + control bar"): no three equal cards. Top: one wide
  stage with the tick planes large on the left (about 600px), the curve in
  the middle, and a small HUD (reserves/prices, ticks) bottom-right.
  Bottom: a full-width control bar with PAY/RECEIVE token pills, the big
  amount, a full-width slider (with amber markers where each tick lands
  on its plane and the right stop labelled "liquidity edge"), the quote box
  (with the "x·y=k would give …" line) and COMMIT / RESET.
- Section 2 shows a single curve: the classic `x·y=k` pool for the
  selected pair, with its dot sliding along it and a grey ghost at the
  committed position. The Orbital pool is not drawn here; its comparison
  lives in the quote box and the tick planes.
- Motion: the reserve dot leaves a short fading trail while it moves;
  rings pulse once when they flip to boundary; nothing else animates.
- Attack page uses the same language (two panels on the stage, one
  full-width budget slider below).

## 6. Error handling

- Math: `quote` throws `InsufficientLiquidity` when every tick is at
  boundary for the out token, and `NoConvergence` if Newton exceeds the
  cap. UI shows a plain message and disables Commit.
- Adapter: soroban errors (simulation failure, user rejected, timeout)
  map to a small `PoolError` union; UI shows the message.
- Wallet: missing wallet shows an install hint.

## 7. Testing

- `lib/orbital` unit tests (vitest):
  - at the equal-price point all marginal prices are 1.0
  - capital efficiency matches the reference figures above within 1%
  - a swap of 1 unit in a $30M pool moves price by less than 1 bps
  - every tick's invariant holds after every quote (relative 1e-9)
  - a large swap flips ticks to boundary in order from tightest to widest
  - once every tick is boundary, quoting more throws
    `InsufficientLiquidity`, and the price at that point is within 5% of
    `1/p` of the widest tick
  - round trip A->B->A returns no more than was sent
- `MockPoolClient` tests: state after swap matches `quote.finalState`.
- UI: smoke render tests for the two pages. No E2E in v1.

## 8. Build order

1. `lib/orbital` with tests (independent of visual direction)
2. `lib/pool` mock + interface, `config/tokens.ts`
3. Pool page, functional
4. Attack page, functional
5. Wallet connect
6. Visual pass once the user's examples arrive
7. `SorobanPoolClient` when the contract is deployed

## 9. Open items

- Which three testnet stablecoins (contract ids) the contract team deploys
- Whether depeg limits are fixed at pool creation or chosen per deposit
  in the contract v1 (the UI supports both, the mock uses fixed)
- Visual references from the user
