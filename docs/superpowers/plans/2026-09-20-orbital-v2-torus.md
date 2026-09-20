# Orbital v2: torus consolidation (boundary ticks keep trading)

**Goal:** Replace the v1 "freeze a tick at its boundary" simplification with the paper's behaviour: a boundary tick keeps trading the remaining n−1 assets on its circle, all ticks consolidate into one torus invariant, and swaps are solved on that invariant. Same public interface (`docs/contract-interface.md` §1); only the math changes, first in TypeScript (`src/lib/orbital`), then in Rust (`contracts/orbital-pool/src/math.rs`).

**Ship rule:** v2 lands only if the differential tests pass and the demo flow (slider, preview, commit, attack page) is unchanged. Otherwise the demo ships on v1. v1 stays selectable via a flag until v2 is proven.

## Math (from Paradigm's Orbital paper, our notation)

- Reserves live in the reserve space `x ∈ R^n`, sphere `Σ(R − xᵢ)² = R²`. Equal-price direction `v = (1,…,1)/√n`. Decompose any state into `x∥ = (x·v) v` and `x⊥ = x − x∥`.
- **Interior ticks** (`x·v < c_k`): consolidate into one sphere of radius `R_int = Σ R_k` (all interior ticks share the same normalized position, as v1 already assumes).
- **Boundary ticks** (`x·v = c_k`): pinned to their plane; each trades on the (n−1)-sphere `‖x⊥‖ = ρ_k` with `ρ_k = √(R_k² − (R_k√n − c_k)²)` (the ring radius). Consolidate into one (n−1)-sphere with `R_bound = Σ ρ_k` and total parallel component `Σ c_k`.
- **Torus invariant** for the whole pool with total reserves `r = x_int + x_bound`:
  `(‖r∥‖ − (R_int√n − R_int) − Σ_boundary c_k ... )` — derive carefully in Task 1; the paper's form is
  `( √(Σ rᵢ²) − R_int )² + ( ‖r⊥‖ − R_bound )² = ...` expressed in the paper's coordinates (centered at the origin, reserves = `R − x`). Task 1 must write the derivation in `docs/contract-interface.md` §10 with a numeric check against the v1 all-interior case (must coincide when no tick is at boundary).
- **Swap on the torus:** given `r_in += δ`, solve for `r_out` on the invariant: a quartic in `r_out`; Newton from the v1 closed-form guess, ≤ 32 iterations, tolerance 1 stroop, bisection fallback when the Newton step leaves the bracket.
- **Tick crossing:** the normalized parallel position `α = (Σ xᵢ)/(R√n)` of the consolidated interior sphere moves with the trade. Before applying a segment, compute for each tick the α at which it would cross (`b_k = c_k / (R_k√n)`, interior → boundary when α reaches `b_k`; boundary → interior when α drops back below `b_k`). Segment the trade at the nearest crossing (solve the torus for the exact δ that lands α on `b_k`; that is itself a 1-D root find), reclassify, re-consolidate, continue. Both directions (freeze and un-freeze) are exact now, so v1's "reactivation rule" disappears.

## Tasks

### Task 1 — TS reference (`src/lib/orbital/torus.ts`, flag `ORBITAL_MODE = "v1" | "v2"`)
- Derivation note (§10 of the handoff doc) with the exact invariant and the crossing condition.
- `consolidate(ticks) → { R_int, x_int, R_bound, c_bound, x_bound }`, `torusResidual(state, r)`, `solveOut(state, i, j, δ)` (Newton + bisection), `crossingDelta(state, tick, i, j)`, `quoteV2(ticks, i, j, amountIn)` returning the same `QuoteResult` shape and per-tick post-trade `x` (boundary ticks' `x⊥` updated by their share of the perpendicular move).
- Tests: (a) all-interior: `quoteV2 === quote` to 1e-9 for 1k, 100k, 1M inputs on the seed; (b) invariant residual ≤ 1e-9 after every segment; (c) monotone out; (d) round trip never gains; (e) large swap: v2 out ≥ v1 out (never less) and the difference is small (< 1%) on the 7M case; (f) crossing then un-crossing on a reverse trade returns the tick to interior with reserves consistent to 1e-6; (g) property test: random trade sequences keep every tick on its own sphere/circle.
- Frontend: `PoolView` preview uses `quoteV2` when the flag is on; nothing else changes.

### Task 2 — Rust port (`contracts/orbital-pool/src/torus.rs`)
- Same functions in integer math (U256 squares, WAD normalized constants, Newton in stroops with an explicit iteration cap and bracket check; `NoConvergence` → `InsufficientLiquidity` at the boundary as today).
- Differential tests: run the TS suite's fixtures (dump 50 random cases from TS to JSON, check them in) and assert Rust matches within 1e-6 relative.
- Contract switch: `init` gets a `mode: u32` (1 or 2) stored in instance storage; `swap`/`quote` dispatch. Redeploy as a new contract id; the v1 deployment stays as fallback and `NEXT_PUBLIC_POOL_CONTRACT_ID` picks.

### Task 3 — Verify and decide
- Testnet: deploy v2, seed identically, compare `quote(7M)` v1 vs v2, run the passkey swap once.
- Gate for shipping v2: all tests green, no demo-flow regression at 1440×900, CPU budget per swap under 5M instructions.
