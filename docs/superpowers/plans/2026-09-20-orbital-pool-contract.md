# Orbital Pool Soroban Contract Implementation Plan (local branch `contract/local`, not pushed)

**Goal:** A Soroban contract implementing the interface in `docs/contract-interface.md` for a fixed 3-token, 4-tick Orbital pool, numerically matching `src/lib/orbital` within tolerance, deployable to testnet with the SACs in `docs/contract-interface.md` §8.

**Architecture:** One crate at `contracts/orbital-pool/` (soroban-sdk, `#![no_std]`). `math.rs` is a pure module (no storage, no env) ported 1:1 from `src/lib/orbital/{geometry,tick,swap}.ts`; `lib.rs` holds storage, auth and token transfers. Numbers: amounts `i128` at 7 decimals; intermediate squares and sums in `U256` (soroban_sdk::U256) or `i128` where provably safe; normalized constants (kappa, xMin, xEq) as fixed-point `i128` at 1e18 (`WAD`). Integer square roots by Newton iteration.

**Spec:** `docs/contract-interface.md` (§1 interface, §4 formulas, §5 errors, §6 calibration, §8 tokens). Decision: `quote` returns only `amount_out` + `ticks_crossed`; `get_state` exposes per-tick `x: Vec<i128>`, `radius`, `depeg_bps`, `state`, so the frontend computes prices with its own `pricingTicks` rule.

## Global Constraints
- Toolchain: Rust 1.96, target `wasm32v1-none`, Stellar CLI 28. `cargo test` runs the unit tests natively; `stellar contract build` must succeed.
- No floats anywhere in the contract. Fixed-point WAD = 1e18 for normalized values; U256 for products of two stroop-scale values (a 0.1% tick has radius ≈ 6.5e16 stroops; its square ≈ 4e33 fits i128 (1.7e38) but sums of three squares plus the plane quadratic's `C^2 + S` approach 1e35; use U256 for every square and for the discriminant).
- Root selection and tolerances mirror the TS: `REL_EPS = 1e-12` relative to radius becomes an absolute floor of `radius / 1e12` in stroops (minimum 1).
- Calibration (from §6, relative tolerance 1e-6 unless noted): seed 4 ticks × $2.5M real per token at 10/100/500/1000 bps; `swap(7,000,000 token0→token1)` → out ≈ 6,924,145.15 with ticks 10 & 100 bps boundary; `maxFillable(seed,0,1)` ≈ 8,824,999 (tolerance 1e-4); single 1000 bps / $1M tick: `maxFillable` ≈ 907,378.71, and after that swap the tick is boundary; `swap(6,000,000)` → ≈ 5,961,826.
- Commit trailers: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_017DxvTSvPnc5jtsChixebLg`. Never push this branch.

## Task A: crate scaffold + pure math module with calibration tests
Files: `contracts/orbital-pool/Cargo.toml`, `src/lib.rs` (minimal contract shell), `src/math.rs`, `src/fixed.rs`, tests in `src/math.rs` (`#[cfg(test)]`).
- `fixed.rs`: `WAD`, `mul_wad`, `div_wad`, `sqrt_wad` (sqrt of a WAD fixed-point value, i.e. `isqrt(x * WAD)`), `isqrt_u256`, `isqrt_i128`.
- `math.rs`: `Tick { depeg_bps: u32, radius: i128, plane_sum: i128, x_min: i128, x: [i128; 3], boundary: bool }` (x_min already scaled by radius, plane_sum = kappa·R·√n in stroops, computed once at creation from WAD constants); `kappa_wad(depeg_bps, n)`, `x_min_norm_wad(kappa_wad, n)`, `x_eq_wad(n)`, `create_tick(depeg_bps, real_per_token, n)`, `real_reserves`, `apply_swap(tick, i, j, d_in) -> Result<i128, Error>` (closed form with U256 squares), `delta_to_plane(tick, i, j) -> Option<i128>` (smallest root above current x_i, None if unreachable), `quote(ticks: &mut [Tick], i, j, amount_in) -> Result<(i128 out, u32 crossed), Error>` (reactivation rule `x[i] < x[j]`, split proportional to radius, scale to first landing, direction-aware landing check `cap - applied <= floor`, freeze, loop ≤ 64 segments, `InsufficientLiquidity` when no interior tick), `max_fillable(ticks, i, j) -> i128` (bisection, 60 rounds).
- Tests: each calibration number above; invariant residual `|Σ(R−x)² − R²| ≤ 2·R` (stroop² rounding) after every step; monotonicity of out in amount; round trip never gains.

## Task B: contract storage, auth and tokens
- Storage: instance storage `Pool { tokens: Vec<Address>, ticks: Vec<TickData>, admin: Address }`; TTL bump on every call.
- `init(admin, tokens: Vec<Address>, depeg_bps_list: Vec<u32>)` creates empty ticks (radius 0) or requires the first deposit to size them: choose: ticks are created with radius 0 and `deposit(from, amounts, depeg_bps)` at the equal point sizes/grows the tick exactly like `MockPoolClient.deposit` (equal amounts required for a fresh tick; proportional for an existing one); shares = ΔR.
- `deposit`: `from.require_auth()`, pull each token via SAC `transfer(from, contract, amount)`.
- `swap(from, token_in, token_out, amount_in, min_out)`: `from.require_auth()`, run `math::quote` on a copy, check `min_out`, `transfer(from → contract, amount_in)`, `transfer(contract → from, amount_out)`, persist ticks, emit event `swap`.
- `quote`, `get_state` (per-tick `x`, `radius`, `depeg_bps`, `state`, plus `reserves` = Σ real reserves).
- Errors: `InsufficientLiquidity=1, SlippageExceeded=2, ProportionMismatch=3, InvalidAmount=4, NotInitialized=5, AlreadyInitialized=6`.
- Tests with `soroban_sdk::testutils`: register 3 SAC test tokens, mint to a user, deposit seed ($2.5M × 4 ticks), swap 7M and assert balances and out within tolerance; slippage error; proportion error.

## Task C: deploy + frontend wiring (after B)
- `stellar contract build`, deploy to testnet with `orbital-issuer`, `init` with the §8 token ids, seed liquidity from the issuer (mint to issuer, deposit).
- Frontend: `SorobanPoolClient` using `@stellar/stellar-sdk` `contract.Client` + `rpc`; reads via simulate; `swap` builds the tx and signs through Sembol (`useSignTransaction().signAndSubmit` or `SignTransactionModal`); `getTicks()` from `get_state`; env `NEXT_PUBLIC_POOL_BACKEND=soroban`, `NEXT_PUBLIC_POOL_CONTRACT_ID`.
