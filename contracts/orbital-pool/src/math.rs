//! Pure Orbital AMM math: a 1:1 integer port of `src/lib/orbital/{geometry,tick,swap}.ts`.
//!
//! No `Env`, no storage, no floats. Everything here is deterministic integer
//! arithmetic so it can be unit-tested natively (`cargo test`) and reused by
//! `lib.rs` without a host.
//!
//! Scales (see [`crate::fixed`]):
//! * normalized geometry constants (`kappa`, `xMinNorm`, `xEq`) are WAD = 1e18;
//! * absolute quantities (`radius`, `plane_sum`, `x_min`, `x[]`, amounts) are
//!   stroops = 1e7, matching every Stellar SAC.
//!
//! Every square of a stroop-scale value, and both quadratic discriminants, are
//! evaluated in [`crate::u256::U256`] so no intermediate can overflow.

use crate::fixed::{div_wad, isqrt_u256, mul_wad, sqrt_wad, WAD};
use crate::u256::U256;

/// Number of pool tokens. Fixed at 3 for this pool (see `docs/contract-interface.md` §3).
pub const N: usize = 3;

/// Upper bound on ticks a single pool may hold (stack buffers in [`quote`]).
pub const MAX_TICKS: usize = 16;

/// Matches `MAX_SEGMENTS` in `src/lib/orbital/swap.ts`.
pub const MAX_SEGMENTS: usize = 64;

/// `REL_EPS = 1e-12` from the TS reference, as an integer divisor.
const REL_EPS_DIV: i128 = 1_000_000_000_000;

/// Failure modes of the pure math layer. `lib.rs` maps these onto the
/// contract error codes in the plan (`NoConvergence` folds into
/// `InsufficientLiquidity`, which is what the TS client surfaces too).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MathError {
    InsufficientLiquidity,
    InvalidAmount,
    InvalidTick,
    SameToken,
    NoConvergence,
}

/// One Orbital tick: a sphere of radius `radius` cut by the plane
/// `sum(x) = plane_sum`.
///
/// `plane_sum` and `x_min` are absolute (stroop) quantities derived once at
/// creation from the WAD constants, so the hot path never recomputes `kappa`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Tick {
    pub depeg_bps: u32,
    pub radius: i128,
    /// `kappa * radius * sqrt(n)` — the tick's plane constant, in stroops.
    pub plane_sum: i128,
    /// `xMinNorm * radius` — the virtual reserve the LP never deposits.
    pub x_min: i128,
    pub x: [i128; N],
    pub boundary: bool,
}

/// `REL_EPS * radius` as an absolute stroop floor, never below one stroop.
pub fn rel_floor(radius: i128) -> i128 {
    let f = radius / REL_EPS_DIV;
    if f < 1 {
        1
    } else {
        f
    }
}

// ---------------------------------------------------------------------------
// geometry.ts
// ---------------------------------------------------------------------------

/// `sqrt(n)` in WAD.
pub fn sqrt_n_wad(n: usize) -> i128 {
    sqrt_wad(n as i128 * WAD)
}

/// `equalPointNorm(n) = 1 - 1/sqrt(n)`, in WAD.
pub fn x_eq_wad(n: usize) -> i128 {
    WAD - div_wad(WAD, sqrt_n_wad(n))
}

/// `kappaFromDepeg(depegBps, n)`, in WAD.
///
/// `p = 1 - depegBps/10000`, `kappa = (n - (p + n - 1)/sqrt(p^2 + n - 1)) / sqrt(n)`.
pub fn kappa_wad(depeg_bps: u32, n: usize) -> Result<i128, MathError> {
    if depeg_bps >= 10_000 || n < 2 {
        return Err(MathError::InvalidTick);
    }
    let p = WAD - (depeg_bps as i128) * WAD / 10_000;
    let m_wad = (n as i128 - 1) * WAD;
    let root = sqrt_wad(mul_wad(p, p) + m_wad); // sqrt(p^2 + n - 1)
    let term = div_wad(p + m_wad, root); // (p + n - 1) / sqrt(p^2 + n - 1)
    Ok(div_wad(n as i128 * WAD - term, sqrt_n_wad(n)))
}

/// `xMinNorm(kappa, n)`, in WAD: the smaller root of `A a^2 + B a + C = 0` with
/// `m = n - 1`, `s = kappa*sqrt(n)`, `A = 1 + 1/m`, `B = -2 + 2(m-s)/m`,
/// `C = (m-s)^2/m`. `B` is negative, so it is carried signed.
///
/// The discriminant is evaluated entirely in `U256` and its square root is
/// taken there, avoiding a division of two nearly-equal WAD^2 quantities
/// (`B^2` and `4AC` agree to ~6 digits for a 10 bps tick).
pub fn x_min_norm_wad(kappa_w: i128, n: usize) -> Result<i128, MathError> {
    if n < 2 {
        return Err(MathError::InvalidTick);
    }
    let m = n as i128 - 1;
    let s = mul_wad(kappa_w, sqrt_n_wad(n));
    let ms = m * WAD - s; // (m - s) in WAD
    let a = WAD + WAD / m; // A
    let b = -2 * WAD + 2 * ms / m; // B (negative)
    let c = (ms * ms / WAD) / m; // C
    if c < 0 {
        return Err(MathError::InvalidTick);
    }
    let d = U256::sq_i128(b)
        .checked_sub(U256::mul_u128((4 * a) as u128, c as u128))
        .ok_or(MathError::InvalidTick)?;
    let sqrt_d = isqrt_u256(d); // WAD
    Ok((-b - sqrt_d) * WAD / (2 * a))
}

/// `capitalEfficiency(depegBps, n) = xeq / (xeq - xmin)`, in WAD.
pub fn capital_efficiency_wad(depeg_bps: u32, n: usize) -> Result<i128, MathError> {
    let kappa = kappa_wad(depeg_bps, n)?;
    let x_min = x_min_norm_wad(kappa, n)?;
    let x_eq = x_eq_wad(n);
    let den = x_eq - x_min;
    if den <= 0 {
        return Err(MathError::InvalidTick);
    }
    Ok(div_wad(x_eq, den))
}

// ---------------------------------------------------------------------------
// tick.ts
// ---------------------------------------------------------------------------

/// `createTick(depegBps, realPerToken, n)`.
///
/// `radius = realPerToken / (xEq - xMin)`, every token starts at the
/// equal-price point `x[i] = radius * xEq`.
pub fn create_tick(depeg_bps: u32, real_per_token: i128, n: usize) -> Result<Tick, MathError> {
    if real_per_token <= 0 {
        return Err(MathError::InvalidAmount);
    }
    if n != N {
        return Err(MathError::InvalidTick);
    }
    let kappa = kappa_wad(depeg_bps, n)?;
    let x_min_w = x_min_norm_wad(kappa, n)?;
    let x_eq_w = x_eq_wad(n);
    let den = x_eq_w - x_min_w;
    if den <= 0 {
        return Err(MathError::InvalidTick);
    }
    let radius = real_per_token * WAD / den;
    Ok(Tick {
        depeg_bps,
        radius,
        plane_sum: mul_wad(radius, mul_wad(kappa, sqrt_n_wad(n))),
        x_min: mul_wad(radius, x_min_w),
        x: [mul_wad(radius, x_eq_w); N],
        boundary: false,
    })
}

/// `realReserves(t)[i] = x[i] - xMinNorm*radius`.
pub fn real_reserves(t: &Tick) -> [i128; N] {
    let mut out = [0i128; N];
    for (o, x) in out.iter_mut().zip(t.x.iter()) {
        *o = x - t.x_min;
    }
    out
}

/// `sum_i x[i]`.
pub fn sum_x(t: &Tick) -> i128 {
    let mut s = 0i128;
    for x in t.x.iter() {
        s += x;
    }
    s
}

/// Signed sphere residual `sum_i (R - x_i)^2 - R^2`, in stroops^2.
///
/// `apply_swap` re-solves the sphere on every step, so this never accumulates:
/// it is bounded by the floor-rounding of one integer square root, `|res| <= 2R`.
pub fn invariant_residual(t: &Tick) -> i128 {
    let mut s = U256::ZERO;
    for x in t.x.iter() {
        s = s + U256::sq_i128(t.radius - x);
    }
    let r2 = U256::sq_i128(t.radius);
    match s.checked_sub(r2) {
        Some(d) => d.lo as i128,
        None => -(r2.checked_sub(s).map(|d| d.lo as i128).unwrap_or(0)),
    }
}

/// `pricingTicks`: interior ticks if any exist, otherwise the single
/// widest-depeg tick (first one wins on a tie, a strict `>` comparison).
pub fn pricing_mask(ticks: &[Tick]) -> [bool; MAX_TICKS] {
    let mut mask = [false; MAX_TICKS];
    let mut any = false;
    for (k, t) in ticks.iter().enumerate().take(MAX_TICKS) {
        if !t.boundary {
            mask[k] = true;
            any = true;
        }
    }
    if any || ticks.is_empty() {
        return mask;
    }
    let mut widest = 0usize;
    for (k, t) in ticks.iter().enumerate().take(MAX_TICKS) {
        if t.depeg_bps > ticks[widest].depeg_bps {
            widest = k;
        }
    }
    mask[widest] = true;
    mask
}

/// `poolPrice(pricingTicks(ticks), i, j)` in WAD: token `i` priced in token `j`.
pub fn pool_price_wad(ticks: &[Tick], i: usize, j: usize) -> i128 {
    let mask = pricing_mask(ticks);
    let mut num = 0i128;
    let mut den = 0i128;
    for (k, t) in ticks.iter().enumerate().take(MAX_TICKS) {
        if mask[k] {
            num += t.radius - t.x[i];
            den += t.radius - t.x[j];
        }
    }
    if den == 0 {
        return 0;
    }
    div_wad(num, den)
}

// ---------------------------------------------------------------------------
// swap.ts
// ---------------------------------------------------------------------------

/// `applySwap`: move `d_in` of token `i` into one tick, return token `j` out.
///
/// `x_j' = R - sqrt(R^2 - (R - x_i')^2 - S_others)`, closed form, no iteration.
/// The integer square root floors, so `x_j'` is rounded *up* and the pool never
/// pays out more than the exact real-valued answer.
pub fn apply_swap(t: &mut Tick, i: usize, j: usize, d_in: i128) -> Result<i128, MathError> {
    if i == j || i >= N || j >= N {
        return Err(MathError::InvalidAmount);
    }
    let r = t.radius;
    let xi = t.x[i] + d_in;
    if xi > r {
        return Err(MathError::InsufficientLiquidity);
    }
    let mut s = U256::ZERO;
    for (k, xk) in t.x.iter().enumerate() {
        if k != i && k != j {
            s = s + U256::sq_i128(r - xk);
        }
    }
    let rad = U256::sq_i128(r)
        .checked_sub(U256::sq_i128(r - xi))
        .and_then(|v| v.checked_sub(s))
        .ok_or(MathError::InsufficientLiquidity)?;
    let xj = r - isqrt_u256(rad);
    let out = t.x[j] - xj;
    if out < -rel_floor(r) {
        return Err(MathError::InsufficientLiquidity);
    }
    t.x[i] = xi;
    t.x[j] = xj;
    Ok(if out > 0 { out } else { 0 })
}

/// `deltaToPlane`: input of token `i` that lands the tick exactly on
/// `sum(x) = plane_sum`.
///
/// With `K = plane_sum`, `O = sum_{k != i,j} x_k`, `S = sum_{k != i,j} (R - x_k)^2`
/// and `C = R - K + O`, solves `2t^2 + 2(C - R)t + (C^2 + S) = 0` for the new
/// `x_i`, and returns the smallest root strictly above `x_i + rel_floor(R)`.
/// `None` is the integer stand-in for the TS `Infinity` (plane unreachable).
pub fn delta_to_plane(t: &Tick, i: usize, j: usize) -> Option<i128> {
    let r = t.radius;
    let mut o = 0i128;
    let mut s = U256::ZERO;
    for (k, xk) in t.x.iter().enumerate() {
        if k != i && k != j {
            o += xk;
            s = s + U256::sq_i128(r - xk);
        }
    }
    let c = r - t.plane_sum + o;
    // d = b^2 - 4ac with a = 2, b = 2(C-R), c = C^2 + S
    //   = 4(C-R)^2 - 8(C^2 + S)
    let d = U256::sq_i128(2 * (c - r)).checked_sub((U256::sq_i128(c) + s) << 3)?;
    let sq = isqrt_u256(d);
    let base = 2 * (r - c);
    let floor = t.x[i] + rel_floor(r);
    let mut best: Option<i128> = None;
    for root in [(base - sq) / 4, (base + sq) / 4] {
        if root > floor && best.is_none_or(|b| root < b) {
            best = Some(root);
        }
    }
    best.map(|v| v - t.x[i])
}

/// `quote`: split `amount_in` across the interior ticks, segment by segment.
///
/// Returns `(amount_out, ticks_crossed)`. `ticks` is the caller's working copy
/// and is mutated in place (the TS version deep-copies internally).
pub fn quote(
    ticks: &mut [Tick],
    token_in: usize,
    token_out: usize,
    amount_in: i128,
) -> Result<(i128, u32), MathError> {
    if token_in == token_out {
        return Err(MathError::SameToken);
    }
    if amount_in <= 0 {
        return Err(MathError::InvalidAmount);
    }
    if token_in >= N || token_out >= N {
        return Err(MathError::InvalidAmount);
    }
    if ticks.is_empty() {
        return Err(MathError::InsufficientLiquidity);
    }
    if ticks.len() > MAX_TICKS {
        return Err(MathError::InvalidTick);
    }

    // A frozen boundary tick can trade again if this direction moves it inward.
    for t in ticks.iter_mut() {
        if t.boundary && t.x[token_in] < t.x[token_out] {
            t.boundary = false;
        }
    }

    let eps_in = amount_in / REL_EPS_DIV;
    let mut remaining = amount_in;
    let mut out = 0i128;
    let mut crossed = 0u32;

    let mut idx = [0usize; MAX_TICKS];
    let mut caps = [0i128; MAX_TICKS];
    let mut has_cap = [false; MAX_TICKS];
    let mut shares = [0i128; MAX_TICKS];
    let mut applied = [0i128; MAX_TICKS];

    for _seg in 0..MAX_SEGMENTS {
        if remaining <= eps_in {
            break;
        }

        let mut m = 0usize;
        let mut r_sum = 0i128;
        for (k, t) in ticks.iter().enumerate() {
            if !t.boundary {
                idx[m] = k;
                r_sum += t.radius;
                m += 1;
            }
        }
        if m == 0 || r_sum <= 0 {
            return Err(MathError::InsufficientLiquidity);
        }

        // Proportional split by radius, then scale everything by the smallest
        // `cap/share` ratio so the first tick to reach its plane lands exactly.
        let mut landing: Option<usize> = None;
        for a in 0..m {
            let t = &ticks[idx[a]];
            shares[a] = remaining * t.radius / r_sum;
            match delta_to_plane(t, token_in, token_out) {
                Some(cap) => {
                    caps[a] = cap;
                    has_cap[a] = true;
                }
                None => {
                    caps[a] = 0;
                    has_cap[a] = false;
                }
            }
            if has_cap[a] && caps[a] < shares[a] {
                // cap[a]/share[a] < cap[b]/share[b], cross-multiplied.
                let better = match landing {
                    None => true,
                    Some(b) => caps[a] * shares[b] < caps[b] * shares[a],
                };
                if better {
                    landing = Some(a);
                }
            }
        }

        match landing {
            // f = cap_L / share_L < 1: applied[a] = share[a] * cap_L / share_L,
            // computed as one integer product/quotient so the ratio never drifts.
            Some(l) => {
                let (cap_l, share_l) = (caps[l], shares[l]);
                for a in 0..m {
                    applied[a] = shares[a] * cap_l / share_l;
                }
            }
            // f = 1: the last active tick absorbs the exact remainder.
            None => {
                let mut sum = 0i128;
                for a in 0..m - 1 {
                    applied[a] = shares[a];
                    sum += shares[a];
                }
                applied[m - 1] = remaining - sum;
            }
        }

        let mut total_applied = 0i128;
        for a in 0..m {
            if applied[a] > 0 {
                out += apply_swap(&mut ticks[idx[a]], token_in, token_out, applied[a])?;
                total_applied += applied[a];
            }
        }

        if let Some(l) = landing {
            ticks[idx[l]].boundary = true;
            crossed += 1;
        }
        // Direction-aware sweep: freeze any other tick whose pre-swap room to
        // the plane was consumed to within the floor by this segment. Never a
        // proximity test on sum(x) — see docs/contract-interface.md §4.13.
        for a in 0..m {
            let k = idx[a];
            if ticks[k].boundary || !has_cap[a] {
                continue;
            }
            if caps[a] - applied[a] <= rel_floor(ticks[k].radius) {
                ticks[k].boundary = true;
                crossed += 1;
            }
        }

        if landing.is_none() {
            remaining = 0;
        } else {
            remaining -= total_applied;
        }
    }

    if remaining > eps_in {
        return Err(MathError::NoConvergence);
    }
    Ok((out, crossed))
}

/// `maxFillable`: largest `amount_in` for which [`quote`] succeeds, by
/// bisection over `[0, sum of radii]`, 60 rounds.
pub fn max_fillable(ticks: &[Tick], token_in: usize, token_out: usize) -> i128 {
    if ticks.is_empty() || ticks.len() > MAX_TICKS {
        return 0;
    }
    let mut lo = 0i128;
    let mut hi = 0i128;
    for t in ticks.iter() {
        hi += t.radius;
    }
    let n = ticks.len();
    let mut work = [ticks[0]; MAX_TICKS];
    for _ in 0..60 {
        let mid = lo + (hi - lo) / 2;
        if mid <= lo {
            break;
        }
        work[..n].copy_from_slice(ticks);
        if quote(&mut work[..n], token_in, token_out, mid).is_ok() {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    lo
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixed::STROOP;
    use std::{format, println, vec, vec::Vec};

    /// $2.5M real reserve per token per tick, the seed in §3.
    const SEED_PER_TOKEN: i128 = 2_500_000 * STROOP;
    const SEED_BPS: [u32; 4] = [10, 100, 500, 1000];

    fn seed() -> Vec<Tick> {
        SEED_BPS
            .iter()
            .map(|b| create_tick(*b, SEED_PER_TOKEN, N).unwrap())
            .collect()
    }

    /// Pretty-print a stroop amount as tokens with 7 decimals.
    fn tokens(v: i128) -> std::string::String {
        format!("{}.{:07}", v / STROOP, (v % STROOP).abs())
    }

    /// WAD value as a decimal string with 6 fractional digits.
    fn wad(v: i128) -> std::string::String {
        format!("{}.{:06}", v / WAD, (v % WAD).abs() / 1_000_000_000_000)
    }

    /// Assert `actual` is within `tol_ppb` parts-per-billion of `expected`.
    #[track_caller]
    fn assert_rel(actual: i128, expected: i128, tol_ppb: i128, what: &str) {
        let diff = (actual - expected).abs();
        let rel_ppb = diff * 1_000_000_000 / expected.abs();
        println!(
            "  {what}: actual={} expected={} rel={}e-9 (tol {}e-9)",
            actual, expected, rel_ppb, tol_ppb
        );
        assert!(
            rel_ppb <= tol_ppb,
            "{what}: actual {} vs expected {} -> {}e-9 relative, tolerance {}e-9",
            actual,
            expected,
            rel_ppb,
            tol_ppb
        );
    }

    // -- geometry ---------------------------------------------------------

    #[test]
    fn x_eq_matches_closed_form() {
        // 1 - 1/sqrt(3) = 0.42264973081037423...
        let x = x_eq_wad(3);
        println!("xEq(3) = {} ({})", x, wad(x));
        assert_rel(x, 422_649_730_810_374_227, 1, "xEq(3)");
    }

    #[test]
    fn kappa_and_x_min_spot_checks() {
        // Reference values from src/lib/orbital/geometry.ts (float64).
        // kappa(0) = sqrt(3) - 1 exactly.
        let k0 = kappa_wad(0, 3).unwrap();
        println!("kappa(0 bps)    = {} ({})", k0, wad(k0));
        assert_rel(k0, 732_050_807_568_877_293, 10, "kappa(0)");

        for bps in SEED_BPS {
            let k = kappa_wad(bps, 3).unwrap();
            let xmin = x_min_norm_wad(k, 3).unwrap();
            let xeq = x_eq_wad(3);
            println!(
                "kappa({bps:>4} bps) = {} ({})   xMinNorm = {} ({})   xEq-xMin = {}",
                k,
                wad(k),
                xmin,
                wad(xmin),
                xeq - xmin
            );
            // kappa grows with the allowed depeg and stays just above sqrt(3)-1.
            assert!(k > k0, "kappa must increase with depeg");
            assert!(xmin > 0 && xmin < xeq, "xMin must sit strictly inside xEq");
        }
    }

    #[test]
    fn capital_efficiency_matches_spec_table() {
        // docs/contract-interface.md §3: 1098x, 110x, 21.8x, 10.8x (1% tolerance).
        let expected: [i128; 4] = [10_980, 1_100, 218, 108]; // tenths of an x
        for (bps, exp_tenths) in SEED_BPS.iter().zip(expected) {
            let ce = capital_efficiency_wad(*bps, 3).unwrap();
            println!("capitalEfficiency({bps:>4} bps) = {}x", wad(ce));
            assert_rel(ce, exp_tenths * WAD / 10, 10_000_000, "capEff");
        }
    }

    // -- tick construction -------------------------------------------------

    #[test]
    fn create_tick_starts_on_the_sphere_inside_its_plane() {
        for t in seed() {
            let real = real_reserves(&t);
            println!(
                "tick {:>4} bps: radius={} ({} tokens) planeSum={} sumX={} real/token={}",
                t.depeg_bps,
                t.radius,
                tokens(t.radius),
                t.plane_sum,
                sum_x(&t),
                tokens(real[0])
            );
            // Real deposit per token is what the LP asked for.
            for r in real {
                assert_rel(r, SEED_PER_TOKEN, 1_000, "real reserve per token");
            }
            // Starts on the sphere. Each of the n coordinates is floored to a
            // whole stroop, so the residual can reach sum_k 2(R - x_k) = 2*sqrt(n)*R
            // at creation (after a swap it is re-solved and bounded by 2R).
            let res = invariant_residual(&t);
            println!(
                "  sphere residual at creation = {res} (bound {})",
                4 * t.radius
            );
            assert!(
                res.abs() <= 4 * t.radius,
                "sphere residual out of bound at creation"
            );
            // ...strictly inside its plane, and interior.
            assert!(sum_x(&t) < t.plane_sum, "fresh tick must be interior");
            assert!(!t.boundary);
        }
    }

    #[test]
    fn rejects_bad_ticks() {
        assert_eq!(kappa_wad(10_000, 3), Err(MathError::InvalidTick));
        assert_eq!(create_tick(100, 0, 3), Err(MathError::InvalidAmount));
        assert_eq!(create_tick(0, STROOP, 3), Err(MathError::InvalidTick)); // capEff -> infinity
    }

    // -- calibration (docs/contract-interface.md §6) ------------------------

    #[test]
    fn calibration_seed_swap_7m() {
        let mut t = seed();
        let amount_in = 7_000_000 * STROOP;
        let (out, crossed) = quote(&mut t, 0, 1, amount_in).unwrap();
        println!(
            "swap 7,000,000 token0->token1: out = {} tokens, ticksCrossed = {}",
            tokens(out),
            crossed
        );
        // Expected: amountOut ~ 6,924,145.15, crosses 2 ticks (10 bps, 100 bps).
        assert_rel(out, 69_241_451_500_000, 1_000, "swap(7,000,000) amountOut");
        assert_eq!(crossed, 2, "expected the 10 bps and 100 bps ticks to land");
        assert!(
            t[0].boundary && t[1].boundary,
            "10 and 100 bps must be boundary"
        );
        assert!(
            !t[2].boundary && !t[3].boundary,
            "500/1000 bps stay interior"
        );
    }

    #[test]
    fn calibration_seed_swap_6m() {
        let mut t = seed();
        let (out, crossed) = quote(&mut t, 0, 1, 6_000_000 * STROOP).unwrap();
        println!(
            "swap 6,000,000 token0->token1: out = {} tokens, ticksCrossed = {}",
            tokens(out),
            crossed
        );
        // Expected: amountOut ~ 5,961,826.
        assert_rel(out, 59_618_260_000_000, 1_000, "swap(6,000,000) amountOut");
    }

    #[test]
    fn calibration_seed_max_fillable() {
        let t = seed();
        let mf = max_fillable(&t, 0, 1);
        println!("maxFillable(seed, token0, token1) = {} tokens", tokens(mf));
        // Expected ~ 8,824,999 (tolerance 1e-4).
        assert_rel(mf, 88_249_990_000_000, 100_000, "maxFillable(seed)");
        // One stroop past the cap must fail, the cap itself must succeed.
        let mut ok = t.clone();
        assert!(quote(&mut ok, 0, 1, mf).is_ok());
        let mut bad = t.clone();
        assert!(quote(&mut bad, 0, 1, mf + (mf / 1_000_000)).is_err());
    }

    #[test]
    fn calibration_single_1000bps_tick() {
        let t = vec![create_tick(1000, 1_000_000 * STROOP, N).unwrap()];
        let mf = max_fillable(&t, 0, 1);
        println!(
            "single 1000 bps / $1M tick: maxFillable = {} tokens (radius {} tokens)",
            tokens(mf),
            tokens(t[0].radius)
        );
        // Expected ~ 907,378.71 (tolerance 1e-4).
        assert_rel(mf, 9_073_787_100_000, 100_000, "maxFillable(1000 bps tick)");

        let mut work = t.clone();
        let (out, crossed) = quote(&mut work, 0, 1, mf).unwrap();
        // price of token1 in token0 after the trade
        let price = pool_price_wad(&work, 1, 0);
        println!(
            "  at the cap: out = {} tokens, crossed = {}, priceAfter = {}",
            tokens(out),
            crossed,
            wad(price)
        );
        assert!(
            work[0].boundary,
            "the tick must be at its boundary at the cap"
        );
        // Expected priceAfter ~ 1.12710 (token1 in token0).
        assert_rel(
            price,
            1_127_100_000_000_000_000,
            10_000_000,
            "priceAfter at cap",
        );
    }

    // -- invariants and properties ----------------------------------------

    #[test]
    fn invariant_holds_after_every_step() {
        let mut t = seed();
        let mut total = 0i128;
        for step in 1..=40 {
            let (out, _) = match quote(&mut t, 0, 1, 200_000 * STROOP) {
                Ok(v) => v,
                Err(e) => {
                    println!("step {step}: quote stopped with {e:?} (total in so far)");
                    break;
                }
            };
            total += 200_000 * STROOP;
            for tick in t.iter() {
                let res = invariant_residual(tick);
                assert!(
                    res.abs() <= 2 * tick.radius,
                    "step {step}, tick {} bps: |residual| = {} > 2R = {}",
                    tick.depeg_bps,
                    res,
                    2 * tick.radius
                );
            }
            assert!(out > 0);
        }
        println!(
            "invariant held over repeated 200,000-token swaps, total in = {} tokens",
            tokens(total)
        );
    }

    #[test]
    fn out_is_monotone_in_amount_in() {
        let base = seed();
        let mut prev = 0i128;
        let mut amount = 100_000 * STROOP;
        while amount <= 8_000_000 * STROOP {
            let mut t = base.clone();
            let (out, _) = quote(&mut t, 0, 1, amount).unwrap();
            assert!(
                out >= prev,
                "out went down: {} -> {} at amountIn {}",
                prev,
                out,
                amount
            );
            prev = out;
            amount += 100_000 * STROOP;
        }
        println!(
            "out monotone up to 8,000,000 tokens in; last out = {}",
            tokens(prev)
        );
    }

    #[test]
    fn round_trip_never_gains() {
        for amount in [
            10_000 * STROOP,
            500_000 * STROOP,
            3_000_000 * STROOP,
            7_000_000 * STROOP,
        ] {
            let mut t = seed();
            let (out, _) = quote(&mut t, 0, 1, amount).unwrap();
            let (back, _) = quote(&mut t, 1, 0, out).unwrap();
            println!(
                "round trip {} -> {} -> {} tokens",
                tokens(amount),
                tokens(out),
                tokens(back)
            );
            assert!(back <= amount, "round trip gained: {} -> {}", amount, back);
        }
    }

    #[test]
    fn reactivation_makes_a_boundary_tick_interior_again() {
        let mut t = seed();
        let (out, crossed) = quote(&mut t, 0, 1, 7_000_000 * STROOP).unwrap();
        assert_eq!(crossed, 2);
        assert!(
            t[0].boundary,
            "10 bps tick should be frozen after the forward swap"
        );
        // The 10 bps tick now sits exactly on its plane. A tiny reverse trade
        // must reactivate it (x[1] < x[0] in the reverse direction) rather than
        // immediately re-freezing it on a sum(x) proximity test.
        let before = t[0].x;
        let (rev_out, _) = quote(&mut t, 1, 0, STROOP).unwrap();
        println!(
            "forward out = {}, reverse $1 out = {}, 10bps tick boundary after reverse = {}",
            tokens(out),
            tokens(rev_out),
            t[0].boundary
        );
        assert!(
            !t[0].boundary,
            "the 10 bps tick must be interior for the reverse trade"
        );
        assert!(t[0].x[1] > before[1], "reverse trade must move token1 in");
        assert!(rev_out > 0);
    }

    #[test]
    fn empty_and_all_boundary_pools_report_insufficient_liquidity() {
        let mut none: [Tick; 0] = [];
        assert_eq!(
            quote(&mut none, 0, 1, STROOP),
            Err(MathError::InsufficientLiquidity)
        );
        let mut t = seed();
        for tick in t.iter_mut() {
            tick.boundary = true;
            // pin x so the reactivation rule cannot fire for 0 -> 1
            tick.x[0] = tick.x[1];
        }
        assert_eq!(
            quote(&mut t, 0, 1, STROOP),
            Err(MathError::InsufficientLiquidity)
        );
    }

    #[test]
    fn argument_validation() {
        let mut t = seed();
        assert_eq!(quote(&mut t, 1, 1, STROOP), Err(MathError::SameToken));
        assert_eq!(quote(&mut t, 0, 1, 0), Err(MathError::InvalidAmount));
        assert_eq!(quote(&mut t, 0, 9, STROOP), Err(MathError::InvalidAmount));
    }

    #[test]
    fn delta_to_plane_lands_exactly_on_the_plane() {
        let t = create_tick(1000, 1_000_000 * STROOP, N).unwrap();
        let cap = delta_to_plane(&t, 0, 1).expect("plane must be reachable");
        let mut w = t;
        apply_swap(&mut w, 0, 1, cap).unwrap();
        let gap = w.plane_sum - sum_x(&w);
        println!(
            "deltaToPlane = {} tokens, sum(x) - planeSum after = {}",
            tokens(cap),
            -gap
        );
        assert!(
            gap.abs() <= rel_floor(t.radius).max(4),
            "landing missed the plane by {gap} stroops"
        );
    }
}
