# Orbital on Stellar: Frontend + Math Library Design

Date: 2026-09-19
Status: approved in chat, visual direction pending user examples

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
- Numbers: `bigint` fixed-point with 7 decimals (Stellar stroop scale) in the
  math layer. UI converts to display strings at the edge only.

## 4. Architecture

Three layers with one-directional dependencies: `ui -> pool -> orbital`.

```
src/
  lib/orbital/        pure math, no React, no chain
    types.ts          Token, Reserves, Tick, PoolState
    fixed.ts          bigint fixed-point helpers (mul, div, sqrt, SCALE)
    sphere.ts         invariant, equal-price point, price at a state
    ticks.ts          depeg limit -> plane constant c, classify interior/boundary,
                      capital efficiency R/c
    swap.ts           quote(state, tokenIn, tokenOut, amountIn) with Newton solve
                      and tick-crossing segmentation
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

All functions are pure and deterministic. Inputs and outputs are `bigint`
at 7 decimals unless stated.

- **Invariant.** Sphere: `sum_i (r_i)^2 = R^2`. Equal-price point:
  `r_i = R / sqrt(n)` for all i. With virtual reserves, the effective
  reserve is `r_i + v` where `v = c / sqrt(n)` is the per-token virtual
  amount for a tick with plane constant `c`.
- **Ticks.** A tick is `{ depegBps, radius }`. From a depeg price `p`
  (e.g. 0.95 = 9500 bps) the plane constant `c` is derived per the paper's
  depeg formula. Classification: interior if the projection of reserves on
  the equal-price direction is below `c`, otherwise boundary. Capital
  efficiency reported as `R / c` (display only).
- **Consolidation.** All interior ticks sum into one sphere (radius
  `R_int`), all boundary ticks into one lower-dimensional sphere
  (`R_bound`). The global invariant is the torus form from the paper. v1
  may implement the single-tick and the all-interior cases first, then
  add boundary consolidation; the public `quote` signature does not change.
- **Swap.** `quote(state, tokenIn, tokenOut, amountIn)` returns
  `{ amountOut, ticksCrossed, finalState, priceAfter }`. Algorithm:
  1. assume no crossing, solve `r_out` via Newton on the invariant
  2. check whether any tick changed class along the path
  3. if so, solve for the exact crossing point, reclassify, continue with
     the remainder (loop)
  Newton iteration count is capped (e.g. 32) and convergence tolerance is
  1 stroop. Root selection keeps every reserve below its tick center.
- **Prices.** Marginal price of token i in units of token j is the ratio of
  partial derivatives of the invariant, i.e. `(r_i + v) / (r_j + v)` on the
  sphere. Exposed for the reserves table and the attack demo.

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
placeholders `USDC`, `EURC`, `USDX`. Real testnet contract ids are dropped
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

Quotes recompute on every input change (debounced), state updates after
commit. In mock mode Commit is instant; in soroban mode it opens the
wallet signer and shows the tx hash.

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

### 5.4 Visual direction

Pending. The user will bring reference examples; the visual language
(typography, color, motion) is decided together after that. Until then
components are built functional and unstyled beyond layout, with all
colors and fonts routed through Tailwind theme tokens so restyling is a
config change, not a rewrite.

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
  - a swap of 1 unit in a $30M pool moves price by less than 1 bps
  - invariant holds before and after every quote (within 1 stroop)
  - a large swap flips ticks to boundary in order from tightest to widest
  - price never exceeds the bound implied by the outermost tick
  - round trip A->B->A loses only rounding, never gains
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
