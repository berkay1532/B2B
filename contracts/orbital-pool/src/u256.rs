//! Minimal unsigned 256-bit integer, just enough for the Orbital math.
//!
//! Why hand-rolled instead of `soroban_sdk::U256`: the math module is a pure,
//! `Env`-free port of `src/lib/orbital/*.ts` so it can be unit-tested natively
//! and reused without a host. `soroban_sdk::U256` needs an `&Env` for every
//! operation, which would force the whole geometry/swap layer to carry an env.
//! External crates (`ethnum`, `primitive-types`) were avoided to keep the
//! `wasm32v1-none` + `no_std` build free of extra dependencies.
//!
//! Only the operations the math needs are implemented: widening multiply of two
//! `u128`, add, checked sub, shifts, compare, and a digit-by-digit integer
//! square root (no 256-bit division is required anywhere).

/// 256-bit unsigned integer stored as two 128-bit limbs.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct U256 {
    pub hi: u128,
    pub lo: u128,
}

impl U256 {
    pub const ZERO: U256 = U256 { hi: 0, lo: 0 };

    pub const fn from_u128(v: u128) -> U256 {
        U256 { hi: 0, lo: v }
    }

    /// Widening multiply: `a * b` without truncation.
    pub fn mul_u128(a: u128, b: u128) -> U256 {
        let (a_hi, a_lo) = (a >> 64, a & u64::MAX as u128);
        let (b_hi, b_lo) = (b >> 64, b & u64::MAX as u128);

        let ll = a_lo * b_lo;
        let lh = a_lo * b_hi;
        let hl = a_hi * b_lo;
        let hh = a_hi * b_hi;

        // (lh + hl) << 64 added to ll, carrying into the high limb.
        let mid = lh.wrapping_add(hl);
        let mid_carry = u128::from(mid < lh); // overflow of lh + hl

        let lo = ll.wrapping_add(mid << 64);
        let lo_carry = u128::from(lo < ll);

        let hi = hh + (mid >> 64) + (mid_carry << 64) + lo_carry;
        U256 { hi, lo }
    }

    /// Square of an `i128` magnitude (sign is irrelevant for a square).
    pub fn sq_i128(v: i128) -> U256 {
        let m = v.unsigned_abs();
        U256::mul_u128(m, m)
    }

    pub fn is_zero(&self) -> bool {
        self.hi == 0 && self.lo == 0
    }

    /// `self - other`, or `None` when `other > self`.
    pub fn checked_sub(self, other: U256) -> Option<U256> {
        if self.lt(&other) {
            return None;
        }
        let borrow = u128::from(self.lo < other.lo);
        Some(U256 {
            hi: self.hi - other.hi - borrow,
            lo: self.lo.wrapping_sub(other.lo),
        })
    }

    pub fn lt(&self, other: &U256) -> bool {
        self.hi < other.hi || (self.hi == other.hi && self.lo < other.lo)
    }

    pub fn ge(&self, other: &U256) -> bool {
        !self.lt(other)
    }

    fn shift_left(self, n: u32) -> U256 {
        if n == 0 {
            self
        } else if n < 128 {
            U256 {
                hi: (self.hi << n) | (self.lo >> (128 - n)),
                lo: self.lo << n,
            }
        } else if n < 256 {
            U256 {
                hi: self.lo << (n - 128),
                lo: 0,
            }
        } else {
            U256::ZERO
        }
    }

    fn shift_right(self, n: u32) -> U256 {
        if n == 0 {
            self
        } else if n < 128 {
            U256 {
                hi: self.hi >> n,
                lo: (self.lo >> n) | (self.hi << (128 - n)),
            }
        } else if n < 256 {
            U256 {
                hi: 0,
                lo: self.hi >> (n - 128),
            }
        } else {
            U256::ZERO
        }
    }

    /// Bit index of the most significant set bit, or `None` for zero.
    fn bit_len(&self) -> Option<u32> {
        if self.hi != 0 {
            Some(255 - self.hi.leading_zeros())
        } else if self.lo != 0 {
            Some(127 - self.lo.leading_zeros())
        } else {
            None
        }
    }

    /// Floor of the integer square root. The result always fits in `u128`
    /// because `sqrt(2^256 - 1) < 2^128`.
    ///
    /// Digit-by-digit (binary "shift and subtract") method: it needs only add,
    /// sub, compare and shift, so no 256-bit division is required.
    pub fn isqrt(self) -> u128 {
        let msb = match self.bit_len() {
            None => return 0,
            Some(b) => b,
        };
        let mut x = self;
        let mut res = U256::ZERO;
        // Largest power of four <= self.
        let mut bit = U256::from_u128(1) << (msb & !1u32);
        while !bit.is_zero() {
            let t = res + bit;
            res >>= 1;
            if x.ge(&t) {
                x = x.checked_sub(t).unwrap_or(U256::ZERO);
                res = res + bit;
            }
            bit >>= 2;
        }
        res.lo
    }
}

impl core::ops::Add for U256 {
    type Output = U256;
    /// Wrapping 256-bit addition; every call site is bounded well below 2^256.
    fn add(self, other: U256) -> U256 {
        let lo = self.lo.wrapping_add(other.lo);
        let carry = u128::from(lo < self.lo);
        U256 {
            hi: self.hi.wrapping_add(other.hi).wrapping_add(carry),
            lo,
        }
    }
}

impl core::ops::Shl<u32> for U256 {
    type Output = U256;
    /// `self << n` for `n < 256`; bits shifted past the top are dropped.
    fn shl(self, n: u32) -> U256 {
        self.shift_left(n)
    }
}

impl core::ops::Shr<u32> for U256 {
    type Output = U256;
    /// `self >> n` for `n < 256`.
    fn shr(self, n: u32) -> U256 {
        self.shift_right(n)
    }
}

impl core::ops::ShrAssign<u32> for U256 {
    fn shr_assign(&mut self, n: u32) {
        *self = self.shift_right(n);
    }
}

#[cfg(test)]
mod tests {
    use super::U256;

    #[test]
    fn mul_and_sub_roundtrip() {
        let a = u128::MAX;
        let p = U256::mul_u128(a, a);
        // (2^128-1)^2 = 2^256 - 2^129 + 1
        assert_eq!(p.hi, u128::MAX - 1);
        assert_eq!(p.lo, 1);
        assert_eq!(p.checked_sub(p).unwrap(), U256::ZERO);
        assert!(U256::from_u128(1).checked_sub(U256::from_u128(2)).is_none());
    }

    #[test]
    fn isqrt_exact_and_floor() {
        for v in [0u128, 1, 2, 3, 4, 99, 100, 101, 1 << 64, u128::MAX] {
            let s = U256::from_u128(v).isqrt();
            assert!(
                U256::from_u128(v).ge(&U256::mul_u128(s, s)),
                "sqrt too big for {v}"
            );
            let s1 = s + 1;
            assert!(
                U256::from_u128(v).lt(&U256::mul_u128(s1, s1)),
                "sqrt too small for {v}"
            );
        }
        // Exact square of a large value.
        let big: u128 = 340_282_366_920_938_463_463_u128;
        assert_eq!(U256::mul_u128(big, big).isqrt(), big);
        // Perfect square of the largest representable root.
        assert_eq!(U256::mul_u128(u128::MAX, u128::MAX).isqrt(), u128::MAX);
    }

    #[test]
    fn shifts() {
        let v = U256::from_u128(1) << 200;
        assert_eq!(v >> 200, U256::from_u128(1));
        assert_eq!(v >> 300, U256::ZERO);
        assert_eq!(U256::from_u128(5) << 1, U256::from_u128(10));
    }
}
