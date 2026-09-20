#![no_std]
//! Orbital pool (3 tokens, fixed tick set) for Soroban.
//!
//! `math.rs` is the pure, host-free port of `src/lib/orbital`; this module adds
//! storage, auth, SAC transfers and the public interface from
//! `docs/contract-interface.md` §1.

#[cfg(test)]
extern crate std;

pub mod fixed;
pub mod math;
pub mod storage;
pub mod types;
pub mod u256;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, token, Address, Env, Vec};

use crate::fixed::{mul_wad, WAD};
use crate::math::{MathError, Tick, MAX_TICKS, N};
use crate::types::{DataKey, Error, PoolState, Quote, SwapEvent, TickData};

/// The all-zero tick used to pad the fixed-size working array.
const EMPTY_TICK: Tick = Tick {
    depeg_bps: 0,
    radius: 0,
    plane_sum: 0,
    x_min: 0,
    x: [0; N],
    boundary: false,
};

/// Deposit proportion tolerance, as a percent (mirrors `MockPoolClient`'s 1%).
const PROPORTION_TOL_PCT: i128 = 100;

#[contract]
pub struct OrbitalPool;

#[contractimpl]
impl OrbitalPool {
    /// Interface version.
    pub fn version(env: Env) -> u32 {
        storage::bump_instance(&env);
        1
    }

    /// One-shot setup: record the admin and the three SAC token ids (index order).
    pub fn init(env: Env, admin: Address, tokens: Vec<Address>) -> Result<(), Error> {
        if storage::is_initialized(&env) {
            return Err(Error::AlreadyInitialized);
        }
        if tokens.len() != N as u32 {
            return Err(Error::InvalidAmount);
        }
        // Distinct token ids: a repeated SAC would let a swap trade a token
        // against itself and drain the pool.
        for a in 0..tokens.len() {
            for b in (a + 1)..tokens.len() {
                if tokens.get(a) == tokens.get(b) {
                    return Err(Error::InvalidAmount);
                }
            }
        }
        storage::set_admin(&env, &admin);
        storage::set_tokens(&env, &tokens);
        storage::set_ticks(&env, &Vec::new(&env));
        storage::bump_instance(&env);
        Ok(())
    }

    /// Add liquidity to the tick at `depeg_bps`, creating it if it does not exist.
    ///
    /// A fresh tick is born at the equal-price point, so it needs equal amounts
    /// (within 1%); an existing tick needs amounts proportional to its current
    /// real reserves (within 1%) and is scaled by `1 + ratio`. Returns the
    /// shares minted, which are the tick's radius increase (`ΔR`).
    pub fn deposit(
        env: Env,
        from: Address,
        amounts: Vec<i128>,
        depeg_bps: u32,
    ) -> Result<i128, Error> {
        storage::bump_instance(&env);
        let tokens = storage::tokens(&env)?;
        from.require_auth();

        if amounts.len() != N as u32 {
            return Err(Error::InvalidAmount);
        }
        for a in amounts.iter() {
            if a <= 0 {
                return Err(Error::InvalidAmount);
            }
        }
        if depeg_bps >= 10_000 {
            return Err(Error::InvalidAmount);
        }

        let mut ticks = storage::ticks(&env);
        let mut found: Option<u32> = None;
        for (k, t) in ticks.iter().enumerate() {
            if t.depeg_bps == depeg_bps {
                found = Some(k as u32);
                break;
            }
        }

        let minted = match found {
            None => {
                let a0 = amounts.get(0).ok_or(Error::InvalidAmount)?;
                for a in amounts.iter() {
                    if (a - a0).abs() * PROPORTION_TOL_PCT > a0 {
                        return Err(Error::ProportionMismatch);
                    }
                }
                let t = math::create_tick(depeg_bps, a0, N).map_err(Error::from)?;
                let data = TickData::from_math(&env, &t);
                // Keep the tick list sorted by depeg_bps, like the mock.
                let mut pos = ticks.len();
                for (k, o) in ticks.iter().enumerate() {
                    if o.depeg_bps > depeg_bps {
                        pos = k as u32;
                        break;
                    }
                }
                ticks.insert(pos, data);
                t.radius
            }
            Some(k) => {
                let t = ticks.get(k).ok_or(Error::InvalidAmount)?;
                let r0 = t.real_reserve(0);
                if r0 <= 0 {
                    return Err(Error::ProportionMismatch);
                }
                let ratio_w = amounts.get(0).ok_or(Error::InvalidAmount)? * WAD / r0;
                if ratio_w <= 0 {
                    return Err(Error::ProportionMismatch);
                }
                for idx in 1..N as u32 {
                    let rk = t.real_reserve(idx);
                    if rk <= 0 {
                        return Err(Error::ProportionMismatch);
                    }
                    let rw = amounts.get(idx).ok_or(Error::InvalidAmount)? * WAD / rk;
                    if (rw - ratio_w).abs() * PROPORTION_TOL_PCT > ratio_w {
                        return Err(Error::ProportionMismatch);
                    }
                }
                // Grow the whole tick by `1 + ratio`: radius, the plane, the
                // virtual floor and every effective reserve stay consistent.
                let factor = WAD + ratio_w;
                let radius = mul_wad(t.radius, factor);
                let mut x = Vec::new(&env);
                for v in t.x.iter() {
                    x.push_back(mul_wad(v, factor));
                }
                ticks.set(
                    k,
                    TickData {
                        depeg_bps,
                        radius,
                        plane_sum: mul_wad(t.plane_sum, factor),
                        x_min: mul_wad(t.x_min, factor),
                        x,
                        boundary: t.boundary,
                    },
                );
                radius - t.radius
            }
        };

        let contract = env.current_contract_address();
        for k in 0..N as u32 {
            let token_id = tokens.get(k).ok_or(Error::UnknownToken)?;
            let amount = amounts.get(k).ok_or(Error::InvalidAmount)?;
            token::Client::new(&env, &token_id).transfer(&from, &contract, &amount);
        }

        storage::set_ticks(&env, &ticks);
        storage::add_shares(&env, &from, depeg_bps, minted);
        Ok(minted)
    }

    /// Read-only price quote: how much `token_out` `amount_in` of `token_in` buys.
    pub fn quote(
        env: Env,
        token_in: Address,
        token_out: Address,
        amount_in: i128,
    ) -> Result<Quote, Error> {
        storage::bump_instance(&env);
        let (_, amount_out, ticks_crossed) =
            Self::run_quote(&env, &token_in, &token_out, amount_in)?;
        Ok(Quote {
            amount_out,
            ticks_crossed,
        })
    }

    /// Swap `amount_in` of `token_in` for at least `min_out` of `token_out`.
    pub fn swap(
        env: Env,
        from: Address,
        token_in: Address,
        token_out: Address,
        amount_in: i128,
        min_out: i128,
    ) -> Result<i128, Error> {
        storage::bump_instance(&env);
        let tokens = storage::tokens(&env)?;
        from.require_auth();

        let (ticks, amount_out, ticks_crossed) =
            Self::run_quote(&env, &token_in, &token_out, amount_in)?;
        if amount_out < min_out {
            return Err(Error::SlippageExceeded);
        }

        let i = storage::token_index(&tokens, &token_in)?;
        let j = storage::token_index(&tokens, &token_out)?;
        let contract = env.current_contract_address();
        token::Client::new(&env, &tokens.get(i as u32).ok_or(Error::UnknownToken)?)
            .transfer(&from, &contract, &amount_in);
        if amount_out > 0 {
            token::Client::new(&env, &tokens.get(j as u32).ok_or(Error::UnknownToken)?).transfer(
                &contract,
                &from,
                &amount_out,
            );
        }

        storage::set_ticks(&env, &ticks);
        SwapEvent {
            token_in,
            token_out,
            from,
            amount_in,
            amount_out,
            ticks_crossed,
        }
        .publish(&env);
        Ok(amount_out)
    }

    /// Pool snapshot: real reserves per token, every tick, and the TVL.
    pub fn get_state(env: Env) -> Result<PoolState, Error> {
        storage::bump_instance(&env);
        let tokens = storage::tokens(&env)?;
        let ticks = storage::ticks(&env);
        let mut reserves = Vec::new(&env);
        let mut tvl = 0i128;
        for k in 0..N as u32 {
            let mut sum = 0i128;
            for t in ticks.iter() {
                sum += t.real_reserve(k);
            }
            reserves.push_back(sum);
            tvl += sum;
        }
        Ok(PoolState {
            tokens,
            reserves,
            ticks,
            tvl,
        })
    }

    /// Largest `amount_in` of `token_in` the pool can currently fill for
    /// `token_out` (the frontend's slider maximum). Zero when nothing fits.
    pub fn max_fillable(env: Env, token_in: Address, token_out: Address) -> Result<i128, Error> {
        storage::bump_instance(&env);
        let tokens = storage::tokens(&env)?;
        let i = storage::token_index(&tokens, &token_in)?;
        let j = storage::token_index(&tokens, &token_out)?;
        if i == j {
            return Err(Error::InvalidAmount);
        }
        let stored = storage::ticks(&env);
        if stored.is_empty() {
            // A pool with no ticks can fill nothing; this is a UI helper, so it
            // answers 0 rather than erroring.
            return Ok(0);
        }
        let (work, n) = load_math(&stored)?;
        Ok(math::max_fillable(&work[..n], i, j))
    }

    /// LP shares held by `owner` in the tick at `depeg_bps`.
    pub fn shares(env: Env, owner: Address, depeg_bps: u32) -> i128 {
        storage::bump_instance(&env);
        storage::shares(&env, &owner, depeg_bps)
    }

    /// The admin recorded at `init`.
    pub fn admin(env: Env) -> Result<Address, Error> {
        storage::bump_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }
}

impl OrbitalPool {
    /// Shared body of `quote`/`swap`: resolve tokens, run [`math::quote`] on a
    /// working copy, and hand back the post-swap ticks ready to persist.
    fn run_quote(
        env: &Env,
        token_in: &Address,
        token_out: &Address,
        amount_in: i128,
    ) -> Result<(Vec<TickData>, i128, u32), Error> {
        let tokens = storage::tokens(env)?;
        let i = storage::token_index(&tokens, token_in)?;
        let j = storage::token_index(&tokens, token_out)?;
        if i == j {
            return Err(Error::InvalidAmount);
        }
        if amount_in <= 0 {
            return Err(Error::InvalidAmount);
        }
        let stored = storage::ticks(env);
        let (mut work, n) = load_math(&stored)?;
        let (amount_out, crossed) =
            math::quote(&mut work[..n], i, j, amount_in).map_err(Error::from)?;
        let mut next = Vec::new(env);
        for t in work.iter().take(n) {
            next.push_back(TickData::from_math(env, t));
        }
        Ok((next, amount_out, crossed))
    }
}

/// Lift the stored ticks into the fixed-size array [`math::quote`] works on.
fn load_math(stored: &Vec<TickData>) -> Result<([Tick; MAX_TICKS], usize), Error> {
    let n = stored.len() as usize;
    if n == 0 {
        return Err(Error::InsufficientLiquidity);
    }
    if n > MAX_TICKS {
        return Err(Error::from(MathError::InvalidTick));
    }
    let mut work = [EMPTY_TICK; MAX_TICKS];
    for (k, t) in stored.iter().enumerate() {
        work[k] = t.to_math();
    }
    Ok((work, n))
}
