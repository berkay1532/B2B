# Contract interface handoff

This is what the Soroban contract needs to implement so `SorobanPoolClient`
(`src/lib/pool/SorobanPoolClient.ts`) is a drop-in replacement for
`MockPoolClient` behind the `NEXT_PUBLIC_POOL_BACKEND` switch. The frontend
and math library are done; this doc is the contract team's spec.

`src/lib/orbital` (pure TypeScript, float64) is the **reference
implementation** for a tolerance-based differential test: run the same
inputs through the contract and through `src/lib/orbital`, and assert the
outputs agree within rounding (not bit-for-bit — see units below).

## 1. Interface (spec §4.3, verbatim)

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

The frontend's `PoolClient` (`src/lib/pool/PoolClient.ts`) is the same
shape with richer return types (`PoolState`, `Quote`, `{ shares, txHash }`);
`get_state` additionally needs to expose enough per-tick data for the UI to
render tick rings and capital efficiency — see `TickInfo` below.

```ts
// src/lib/pool/PoolClient.ts
interface TickInfo {
  depegBps: number;
  radius: bigint;
  state: "interior" | "boundary";
  capEff: number;
}

interface PoolState {
  tokens: TokenId[];
  reserves: bigint[];   // real reserves, 7 decimals
  ticks: TickInfo[];
  tvl: bigint;
}

interface Quote {
  amountOut: bigint;
  ticksCrossed: number;
  priceBefore: number;  // tokenOut priced in tokenIn
  priceAfter: number;
}
```

## 2. Unit conventions

- All contract amounts are `i128` at **7 decimals** (Stellar stroop scale:
  `1.0 token = 10_000_000`). This matches every SAC token on Stellar.
- The math library (`src/lib/orbital`) works in **float64** token units
  (`1.0 = one token`), n = 3. `src/lib/pool/units.ts` is the only place that
  converts: `toUnits(n) = BigInt(Math.round(n * 1e7))`,
  `fromUnits(b) = Number(b) / 1e7`.
- Float64 carries ~15-16 significant digits; the tightest tick in the demo
  (10 bps) needs about 6. The contract's i128 arithmetic will not be
  bit-identical to the float64 reference — expect agreement to roughly
  1e-6..1e-9 relative on amounts, not exact equality. Use a relative
  tolerance in differential tests (the TS test suite uses `1e-9` for
  invariant residuals and `1%` for capital-efficiency figures; a looser
  tolerance, e.g. `1e-6` relative, is reasonable for i128-vs-float64 output
  comparisons given rounding at the 7th decimal).
- `depeg_bps` is **the allowed drop below peg**, in basis points, not an
  absolute price. `depeg_bps = 100` means the tick's coins may fall to
  `0.99` before the tick exits to boundary. `p = 1 - depeg_bps / 10000`.
- `toUnits`'s `n * 1e7` loses low-order digits once it exceeds
  `Number.MAX_SAFE_INTEGER` (2^53, ~9.0e15 stroops); this is safe for every
  amount and reserve in the demo, but the 10 bps tick's `TickInfo.radius`
  (~6.5e9 tokens -> ~6.5e16 stroops) is imprecise in its last digits.

## 3. The mock's seed

`MockPoolClient` (`src/lib/pool/MockPoolClient.ts:22-25`) seeds:

- 3 tokens (n = 3): `USDC`, `EURC`, `USDX` (placeholder contract ids in
  `src/config/tokens.ts`, real testnet ids to be filled in once deployed).
- 4 ticks at **10, 100, 500, 1000 bps**.
- **$2.5M real reserve per token, per tick** (`realPerTokenPerTick`), i.e.
  each tick is seeded with equal real amounts of all 3 tokens.
- Total: **$30M TVL** (4 ticks × 3 tokens × $2.5M).
- Capital efficiency at those four depegs (n = 3): **1098x, 110x, 21.8x,
  10.8x** respectively — see `capitalEfficiency` below; these numbers are
  asserted in `src/lib/orbital/geometry.test.ts` and should be asserted by
  a contract unit test against the same tick set.

## 4. Formulas to reproduce

All formulas below are copied verbatim (as comments/logic, not code) from
the TS reference. `n` is the number of pool tokens (3 in this demo, but the
math is written for general `n`). `R` is a tick's radius.

### 4.1 `equalPointNorm(n)` — `src/lib/orbital/geometry.ts:4`

Normalized reserve of every token at the equal-price point, with `R = 1`:

```
equalPointNorm(n) = 1 - 1/sqrt(n)
```

### 4.2 `kappaFromDepeg(depegBps, n)` — `src/lib/orbital/geometry.ts:11-16`

Normalized plane constant for a tick whose coins may fall to price
`p = 1 - depegBps/10000` before the tick exits. Derived from the state
where one coin sits at price `p` and the remaining `n-1` coins are equal.

```
p = 1 - depegBps / 10000
u = 1 / sqrt(p^2 + n - 1)
kappa(p) = (n - u * (p + n - 1)) / sqrt(n)
```

Guard: `depegBps` must be in `[0, 10000)`.

### 4.3 `xMinNorm(kappa, n)` — `src/lib/orbital/geometry.ts:24-33`

Smallest normalized reserve one token can reach while the tick is interior:
the point on the plane `sum(x) = kappa*sqrt(n)` where that token is minimal
and the others are equal. Solves
`(1-a)^2 + (n-1)(1-b)^2 = 1` with `a + (n-1)*b = kappa*sqrt(n)`, reduced to
a quadratic in `a`:

```
m = n - 1
s = kappa * sqrt(n)
A = 1 + 1/m
B = -2 + 2*(m - s)/m
C = (m - s)^2 / m
discriminant d = B^2 - 4*A*C     // must be >= 0
xMinNorm = (-B - sqrt(d)) / (2*A)
```

(The `-` root is taken — the *smaller* root is the physically valid
minimum.)

### 4.4 `capitalEfficiency(depegBps, n)` — `src/lib/orbital/geometry.ts:36-40`

```
xeq  = equalPointNorm(n)
xmin = xMinNorm(kappaFromDepeg(depegBps, n), n)
capitalEfficiency = xeq / (xeq - xmin)
```

### 4.5 `createTick` sizing — `src/lib/orbital/tick.ts:4-15`

Given a target real deposit per token (`realPerToken`) and a depeg:

```
kappa = kappaFromDepeg(depegBps, n)
xmin  = xMinNorm(kappa, n)
xeq   = equalPointNorm(n)
radius = realPerToken / (xeq - xmin)
```

Every token's effective reserve starts at the equal-price point:
`x[i] = radius * xeq` for all `i`. State starts `"interior"`.

### 4.6 `planeSum(t)` — `src/lib/orbital/tick.ts:21`

The tick's plane constant in absolute (non-normalized) units, used for
interior/boundary classification:

```
planeSum(t) = t.kappa * t.radius * sqrt(n)
```

A tick is **interior** while `sum_i(x_i) < planeSum(t)` and **boundary**
once the sum reaches that plane.

### 4.7 `realReserves(t)` — `src/lib/orbital/tick.ts:23`

The real (LP-deposited) reserve per token, i.e. effective reserve minus the
virtual part the LP never deposits:

```
realReserves(t)[i] = t.x[i] - t.xMinNorm * t.radius
```

### 4.8 `marginalPrice` / `poolPrice` — `src/lib/orbital/tick.ts:31-39`

Per-tick marginal price of token `i` in units of token `j`:

```
marginalPrice(t, i, j) = (R - x[i]) / (R - x[j])
```

Pool-level price, summed over a set of ticks:

```
poolPrice(ticks, i, j) = sum_t(R_t - x_t[i]) / sum_t(R_t - x_t[j])
```

### 4.9 `pricingTicks(ticks)` — `src/lib/orbital/tick.ts:42-48`

Which ticks determine the readable pool price:

```
interior = ticks.filter(state == "interior")
if interior is non-empty: pricingTicks = interior
else: pricingTicks = [the single ticks with the largest depegBps]  // widest boundary tick
```

If `quote()` returns a price, the contract must use exactly this rule:
interior ticks if any exist, otherwise the single widest-depeg boundary
tick, never an empty set (unless there are no ticks at all). Tie-break: on
equal `depegBps`, the first such tick in list order wins (a strict `>`
comparison against the running max, so a later tie never replaces it).

### 4.10 The invariant

Sphere centered at `(R, ..., R)` over a tick's effective reserves:

```
sum_i (R - x_i)^2 = R^2,  x_i <= R
```

(`invariantResidual` in `tick.ts:25-29` checks
`|sum_i(R - x_i)^2 - R^2| / R^2` stays under `1e-9` after every quote — a
useful invariant check for the contract's own tests.)

### 4.11 Closed-form swap step: `applySwap` — `src/lib/orbital/swap.ts:8-22`

Moves token `i` in by `dIn` on **one** sphere tick, returns token `j` out
(all other tokens on that tick held fixed):

```
xi = t.x[i] + dIn                          // reject if xi > R
S = sum_{k != i, k != j} (R - t.x[k])^2    // fixed-coin contribution
rad = R^2 - (R - xi)^2 - S                 // reject if rad < 0 (InsufficientLiquidity)
xj = R - sqrt(rad)
out = t.x[j] - xj                          // reject if out < -eps*R
t.x[i] = xi; t.x[j] = xj
return max(out, 0)
```

No Newton iteration needed — this is exact.

### 4.12 Plane-crossing quadratic: `deltaToPlane` — `src/lib/orbital/swap.ts:29-44`

Input of token `i` (with `j` out) that carries the tick exactly onto its
plane `sum(x) = K` (where `K = planeSum(t)`):

```
O = sum_{k != i, k != j} t.x[k]
S = sum_{k != i, k != j} (R - t.x[k])^2
C = R - K + O

// solve 2*t^2 + 2*(C - R)*t + (C^2 + S) = 0  for t = x_i' (the new x[i])
a = 2
b = 2 * (C - R)
c = C^2 + S
discriminant d = b^2 - 4*a*c        // if d < 0: never reaches the plane -> Infinity
r1 = (-b - sqrt(d)) / (2*a)
r2 = (-b + sqrt(d)) / (2*a)

// take the smallest root strictly above the current x[i] (plus an epsilon floor)
floor = t.x[i] + REL_EPS * R        // REL_EPS = 1e-12
candidates = { r in {r1, r2} : r > floor }
deltaToPlane = min(candidates) - t.x[i]     // Infinity if no candidate
```

### 4.13 `quote` loop — `src/lib/orbital/swap.ts:46-113`

```
quote(ticks, tokenIn, tokenOut, amountIn):
  reject if tokenIn == tokenOut, amountIn <= 0, or token index out of range
  work = deep copy of ticks

  // reactivation rule: a frozen boundary tick rejoins the interior set for
  // THIS swap if the trade moves it inward
  for t in work:
    if t.state == "boundary" and t.x[tokenIn] < t.x[tokenOut]:
      t.state = "interior"

  priceBefore = poolPrice(pricingTicks(work), tokenOut, tokenIn)
  remaining = amountIn; out = 0; crossed = 0

  loop (up to 64 segments, while remaining > amountIn * 1e-12):
    active = work.filter(state == "interior")
    if active is empty: throw InsufficientLiquidity  // every tick at boundary

    Rsum = sum of active ticks' radii
    f = 1; landing = null
    for t in active:
      share = remaining * t.radius / Rsum       // proportional split by radius
      cap   = deltaToPlane(t, tokenIn, tokenOut) // pre-swap room to plane
      if cap < share and cap/share < f:
        f = cap/share; landing = t              // scale to first landing

    for t in active:
      out += applySwap(t, tokenIn, tokenOut, share(t) * f)   // apply scaled step to every interior tick

    if landing: landing.state = "boundary"; crossed += 1     // freeze the tick that landed exactly

    // also freeze any tick whose remaining room at this iteration's fraction
    // is within tolerance of zero (near-ties with the landing tick) — see
    // "landing tolerance" note below
    for t in active still "interior":
      if cap(t) - share(t)*f <= 1e-12 * t.radius:
        t.state = "boundary"; crossed += 1

    remaining = (f >= 1) ? 0 : remaining * (1 - f)   // repeat with the remainder

  if remaining did not converge to ~0 within 64 segments: throw NoConvergence

  return { amountOut: out, ticksCrossed: crossed, ticks: work,
           priceBefore, priceAfter: poolPrice(pricingTicks(work), tokenOut, tokenIn) }
```

**Landing tolerance — read this carefully.** The freeze check is
**direction-aware**, not a proximity test on `sum(x)`. It compares each
tick's *pre-swap* `deltaToPlane` room (`cap`) against the share actually
applied this iteration (`appliedShare = share * f`), and freezes only when
`cap - appliedShare <= 1e-12 * t.radius`. Do **not** implement this as "is
`sum(x)` close to `planeSum(t)`" (a `planeSum`-relative proximity check).
That version has a real failure mode: after a large forward swap, a tick
can freeze exactly on its plane; when a later, tiny reverse trade
reactivates it (per the rule in 4.13's first step), it *starts* that new
trade already sitting exactly on `sum(x) == planeSum`. A `sum(x)`-proximity
check would immediately re-freeze that tick even though it has enormous
room to move in the new direction (`deltaToPlane` on the order of
millions, against a trade of $1) — because the relative movement of
`sum(x)` from a $1 trade is too small to clear a `sum`-relative threshold,
even though the tick is nowhere near its boundary in the new direction. The
direction-aware `deltaToPlane`-based check avoids this: it measures room to
the plane in the actual trade direction, not distance already traveled.

### 4.14 `maxFillable` — `src/lib/orbital/swap.ts:116-124`

Largest `amountIn` for which `quote()` does not throw, found by bisection
(60 rounds is enough for float64/i128 precision):

```
maxFillable(ticks, tokenIn, tokenOut):
  lo = 0
  hi = sum of all ticks' radii
  repeat 60 times:
    mid = (lo + hi) / 2
    if quote(ticks, tokenIn, tokenOut, mid) succeeds: lo = mid
    else: hi = mid
  return lo
```

## 5. `PoolError` codes the client expects

`src/lib/pool/PoolClient.ts:3-5`:

```ts
type PoolErrorCode =
  | "InsufficientLiquidity" | "SlippageExceeded" | "ProportionMismatch"
  | "NotImplemented" | "Rejected" | "Unknown";
```

- `InsufficientLiquidity` — every tick is at boundary for the requested
  direction (mirrors `OrbitalError("InsufficientLiquidity")` from the math
  layer). Raise this from `quote`/`swap` when the pool cannot fill any more
  of the trade.
- `SlippageExceeded` — `swap`'s computed `amount_out < min_out`.
- `ProportionMismatch` — `deposit` amounts don't match the pool's existing
  real-reserve proportions for an existing tick, or aren't equal for a new
  tick (within the 1% tolerance `MockPoolClient` uses).
- `NotImplemented` — not expected from a real contract; this is what the
  unfinished `SorobanPoolClient` stub throws today.
- `Rejected` / `Unknown` — wallet rejection / simulation or network failure,
  handled client-side, not contract-side.

## 6. Calibration numbers for contract tests

Computed against the reference TS implementation on the seed described in
§3 (4 ticks at 10/100/500/1000 bps, $2.5M real per token per tick, n = 3).
A contract differential test should reproduce these within a relative
tolerance appropriate for i128-vs-float64 comparison (see §2).

| Scenario | Result |
| --- | --- |
| Seed pool, swap $7,000,000 token0 -> token1 | `amountOut ≈ 6,924,145.15`, crosses 2 ticks (10 bps and 100 bps go to boundary) |
| `maxFillable(seed, token0, token1)` | `≈ 8,824,999` |
| Single tick, 1000 bps, $1,000,000 real per token: `maxFillable(tick, 0, 1)` | `≈ 907,378.71` |
| Same single tick, price at that cap (`priceAfter` just below the cap) | `≈ 1.12710` (token1 in token0) |
| Seed pool, swap $6,000,000 USDC -> EURC (token0 -> token1) | `amountOut ≈ 5,961,826` |

These were produced by running `quote`/`maxFillable` from
`src/lib/orbital/swap.ts` directly against ticks built with `createTick`
from `src/lib/orbital/tick.ts`, using the seed parameters in §3.

## 7. Funding the smart account (C… address) with test tokens

The frontend's wallet is now a [Sembol](https://www.npmjs.com/package/@sembol/passkey-react)
passkey smart account (`src/hooks/useWallet.ts`, `src/components/wallet/WalletProvider.tsx`):
`useWallet().address` is a Soroban contract address (`C…`), not a classic Stellar account
(`G…`). This matters for anyone funding the demo wallet or the pool's token balances by hand.

**Classic payment operations (`Operation.payment`, Horizon `/payments`) cannot target a `C…`
address** — those only move classic-ledger balances between `G…` accounts. To move a SEP-41 /
classic-backed asset to a smart account, go through that asset's **Stellar Asset Contract
(SAC)**, which exposes classic balances as a Soroban token contract that can `transfer` to any
address, including `C…` ones:

```bash
# Find (or deploy) the SAC for an existing classic asset:
stellar contract id asset --network testnet --asset USDC:<ISSUER_G_ADDRESS>
# -> prints the SAC's C… contract id; if this errors because the SAC hasn't been
#    deployed yet on testnet:
stellar contract asset deploy --network testnet --source <G_SECRET> --asset USDC:<ISSUER_G_ADDRESS>

# Move funds from a classic G… holder to the smart account's C… address:
stellar contract invoke --network testnet --source <G_SECRET> --id <SAC_ID> -- \
  transfer --from <G_ADDRESS> --to <SMART_ACCOUNT_C_ADDRESS> --amount <STROOPS>
```

For the team's own test tokens (i.e. assets we issue ourselves), the issuer can skip the
transfer step entirely and **mint straight to the `C…` address** via the SAC's `mint`
function — no trustline is needed on the contract side (trustlines are a classic-ledger
concept; a Soroban token contract just tracks its own balance map):

```bash
stellar contract invoke --network testnet --source <ISSUER_G_SECRET> --id <SAC_ID> -- \
  mint --to <SMART_ACCOUNT_C_ADDRESS> --amount <STROOPS>
```

Reading a smart account's balance is the same SAC call any Soroban token supports:

```bash
stellar contract invoke --network testnet --source <ANY_G_SECRET> --id <SAC_ID> -- \
  balance --id <SMART_ACCOUNT_C_ADDRESS>
```

**Spending from the smart account** (e.g. the pool's `token.transfer(from = C…, …)` inside
`swap`/`deposit`) is authorized differently than a classic account: instead of an Ed25519
signature over the transaction, the Soroban runtime invokes the smart account contract's
`__check_auth`, which the account's WASM (deployed by Sembol/`smart-account-kit`) satisfies
with a WebAuthn passkey signature. The frontend never constructs this by hand — Sembol's
`useSignTransaction().signAndSubmit` (or the `<SignTransactionModal />` component) builds the
transaction, prompts Face ID / Touch ID / Windows Hello for the passkey ceremony, attaches the
resulting auth entry, re-simulates, and submits.
