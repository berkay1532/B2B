use crate::math::{fixed_point::FixedPoint, sphere::MAX_ASSETS};
use soroban_sdk::{contracttype, Address, Vec};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[contracttype]
pub enum TickStatus {
    Interior,
    Boundary,
}

#[derive(Clone)]
#[contracttype]
pub struct TickState {
    pub bump: u32,
    pub pool: Address,
    pub k: FixedPoint,
    pub status: TickStatus,
    pub liquidity: FixedPoint,
    pub sphere_radius: FixedPoint,
    pub depeg_price: FixedPoint,
    pub x_min: FixedPoint,
    pub x_max: FixedPoint,
    pub capital_efficiency: FixedPoint,
    pub owner: Address,
    pub created_at: i64,
    /// Per-tick reserves: tracks each asset's share of liquidity within this tick.
    /// Only first `pool.n_assets` entries are used (rest are zero).
    ///
    /// When status == Interior, these reserves are *included* in pool.reserves
    /// but may become stale as interior swaps update pool.reserves without
    /// updating per-tick reserves. Withdrawal uses min(return, tick_reserve)
    /// to handle staleness safely.
    ///
    /// When status == Boundary, these reserves are *excluded* from pool.reserves
    /// (subtracted at crossing time) and represent the tick's frozen snapshot.
    /// Boundary withdrawal computes returns from tick.reserves directly.
    pub reserves: Vec<FixedPoint>,
}
