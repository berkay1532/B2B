# Orbital on Stellar

A hackathon proof of concept of [Paradigm's Orbital AMM](https://www.paradigm.xyz/writing/orbital)
— multi-stablecoin concentrated liquidity on a sphere invariant — built for
Stellar/Soroban. This repo is the frontend and a pure TypeScript math
library; a Soroban contract is being written in parallel by a teammate and
will slot in behind the same adapter interface once it's deployed. This is
an independent Stellar implementation written from the paper, not a port of
any existing codebase; an unrelated EVM implementation of the same paper
exists as a Uniswap v4 hook at
[github.com/Oxkai/orbital-hook](https://github.com/Oxkai/orbital-hook) (no
license file), which we neither used nor derived from.

The demo runs against an in-memory mock pool (`NEXT_PUBLIC_POOL_BACKEND=mock`)
seeded with a 3-stablecoin, $30M pool, so it works fully offline. It shows a
jury two things: an Orbital pool in motion — swap, watch reserves move,
watch ticks flip from interior to boundary, see capital efficiency per tick
— and why tick bounds matter, using the February 2026 Blend/YieldBlox
exploit (a thin orderbook let a $1 asset print at $107) as the contrast case.

## Running it

```bash
npm i
npm run dev     # http://localhost:3000
npm test        # vitest, lib/orbital + adapter + smoke tests
npm run build   # production build
```

## Environment variables

Copy `.env.example` to `.env.local`:

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_POOL_BACKEND` | `mock` (default) or `soroban`. Picks the `PoolClient` implementation. |
| `NEXT_PUBLIC_RPC_URL` | Soroban RPC endpoint, only used when `soroban`. Defaults to `https://soroban-testnet.stellar.org`. |
| `NEXT_PUBLIC_POOL_CONTRACT_ID` | Deployed pool contract id, only used when `soroban`. |

Wallet connection uses `@creit.tech/stellar-wallets-kit` 2.x against testnet
(Freighter and others); it works in mock mode too (the address shows, swaps
just don't sign).

## Pages

- **`/` — pool.** Three columns: tick planes (SVG rings labeled
  `depeg% · capEff×`, a dot showing the current reserve state), a two-token
  reserve curve for the selected pair, and a swap panel. The amount slider
  drives a *live preview* — the dots, tick states, and reserves/prices table
  update before you commit, with a grey ghost dot marking the last committed
  state. The two-token panel also overlays a plain `x·y=k` pool seeded with
  the same real reserves on the same axes, so the jury can see the Orbital
  curve stay almost straight near peg while the classic hyperbola bends —
  that's the capital-efficiency claim, made visible.
- **`/attack` — attack demo.** One slider drives two panels: a thin
  simulated orderbook (a few thousand dollars of asks, unbounded price
  climb — this is the YieldBlox 22 Feb 2026 shape) next to the same spend
  against the Orbital pool, where the price stops moving once the outermost
  tick hits its boundary. Same attacker spend, very different readable
  price.

## Layers

```
ui (app/, components/)
  -> lib/pool        adapter: PoolClient interface, MockPoolClient,
                      SorobanPoolClient (stub), bigint/7-decimal boundary
       -> lib/orbital pure math, float64, no React, no chain
```

`lib/orbital` is pure and chain-agnostic (`geometry.ts`, `tick.ts`,
`swap.ts`, `types.ts`, `projection.ts`). `lib/pool` is the only place that
converts between float64 token units and `bigint` 7-decimal (stroop-scale)
units, and the only place that knows about `PoolError`. The UI never touches
`lib/orbital` types directly through the network boundary — only through
`MockPoolClient`'s escape hatch for the visualizations (`getTicks()`), which
is display-only and will be replaced once the Soroban client can return
per-tick reserves.

## v1 simplification

A boundary tick is **frozen**: once a tick's plane sum is reached it stops
trading the remaining n-1 coins on its circle (the paper's full torus
consolidation lets a boundary tick keep trading among its non-frozen coins).
v1 implements the single-sphere and all-interior cases; a frozen tick
rejoins the interior set for a given swap only when that swap moves it
inward (`x[tokenIn] < x[tokenOut]`). This under-quotes slightly relative to
the paper and is the one place the contract's output may diverge from the
TS reference — see `docs/contract-interface.md` for the exact formulas and
calibration numbers a contract test should assert against.

## Credits

Math from Paradigm's [Orbital paper](https://www.paradigm.xyz/writing/orbital).
Built for a hackathon; not audited, not production-ready, testnet only.
