//! Fixed-point helpers.
//!
//! Two scales are in play and they are never mixed:
//! * **WAD** (`1e18`) for normalized, dimensionless geometry constants
//!   (`kappa`, `xMinNorm`, `xEq`, `sqrt(n)`). These are all `O(1)` so 18
//!   fractional digits is plenty.
//! * **stroops** (`1e7`) for token amounts and every absolute quantity derived
//!   from them (`radius`, `plane_sum`, `x_min`, `x[]`).
//!
//! No floats anywhere. Squares of stroop-scale values go through [`crate::u256`].

use crate::u256::U256;

/// Fixed-point scale for normalized constants: 1.0 == 1e18.
pub const WAD: i128 = 1_000_000_000_000_000_000;

/// Token amount scale (Stellar stroops): 1.0 token == 1e7.
pub const STROOP: i128 = 10_000_000;

/// `a * b / WAD` (truncating).
pub fn mul_wad(a: i128, b: i128) -> i128 {
    a * b / WAD
}

/// `a * WAD / b` (truncating).
pub fn div_wad(a: i128, b: i128) -> i128 {
    a * WAD / b
}

/// Floor of the integer square root of a non-negative `i128`.
pub fn isqrt_i128(x: i128) -> i128 {
    debug_assert!(x >= 0);
    U256::from_u128(x as u128).isqrt() as i128
}

/// Floor of the integer square root of a `U256`, as `i128`.
///
/// Every call site squares values that fit in `i128`, so the root does too.
pub fn isqrt_u256(x: U256) -> i128 {
    x.isqrt() as i128
}

/// Square root of a WAD fixed-point value, result in WAD: `isqrt(x * WAD)`.
pub fn sqrt_wad(x: i128) -> i128 {
    debug_assert!(x >= 0);
    isqrt_u256(U256::mul_u128(x as u128, WAD as u128))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqrt_wad_matches_known_roots() {
        // sqrt(4) == 2
        assert_eq!(sqrt_wad(4 * WAD), 2 * WAD);
        // sqrt(3) = 1.7320508075688772935...
        let s3 = sqrt_wad(3 * WAD);
        assert_eq!(s3, 1_732_050_807_568_877_293);
        // round trip within a ulp
        assert!((mul_wad(s3, s3) - 3 * WAD).abs() <= 2);
    }

    #[test]
    fn mul_div_wad() {
        assert_eq!(mul_wad(2 * WAD, 3 * WAD), 6 * WAD);
        assert_eq!(div_wad(6 * WAD, 3 * WAD), 2 * WAD);
        assert_eq!(isqrt_i128(0), 0);
        assert_eq!(isqrt_i128(STROOP * STROOP), STROOP);
    }
}
