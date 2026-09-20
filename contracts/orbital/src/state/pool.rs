use soroban_sdk::{contracttype, symbol_short, xdr::VecM, Address, Env, Symbol, Vec};

use crate::math::{fixed_point::FixedPoint, sphere::Sphere, sphere::MAX_ASSETS};

pub const POOL: Symbol = symbol_short!("POOL");

#[contracttype]
pub struct PoolState {
    pub bump: u32,
    pub authority: Address,
    pub sphere: Sphere,
    pub reserves: Vec<FixedPoint>,
    pub n_assets: u32,
    pub token_mints: Vec<Address>,
    pub token_vaults: Vec<Address>,
    /// Bump seeds for vault PDAs (needed for CPI signing)
    // pub vault_bumps: Vec<u8, MAX_ASSETS>,
    pub fee_rate_bps: u32,
    pub total_interior_liquidity: FixedPoint,
    pub total_boundary_liquidity: FixedPoint,
    pub alpha_cache: FixedPoint,
    pub w_norm_sq_cache: FixedPoint,
    pub tick_count: u32,
    pub is_active: bool,
    pub total_volume: FixedPoint,
    pub total_fees: FixedPoint,
    pub created_at: i64,
    /// Monotonically incrementing counter for position PDA derivation
    pub position_count: u64,
    /// Decimal places for each token mint (e.g., 6 for USDC).
    /// Used for boundary normalization: raw SPL amounts ÷ 10^decimals → FixedPoint.
    /// Placed at end of struct (append-only) to preserve layout compatibility
    /// with accounts created before decimal normalization was added.
    pub token_decimals: Vec<u32>,
    /// Seed liquidity deposited at initialize_pool (no Position PDA, no burn path).
    /// Used by close_pool to distinguish seed deposit from LP positions.
    pub seed_liquidity: FixedPoint,
}

impl PoolState {
    pub fn active_reserves(&self) -> Vec<FixedPoint> {
        self.reserves.slice(..self.n_assets)
    }
}

pub fn read_pool(env: &Env) -> PoolState {
    env.storage()
        .persistent()
        .get::<_, PoolState>(&POOL)
        .unwrap()
}
