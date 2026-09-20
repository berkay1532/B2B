use soroban_sdk::{contracttype, Address};

use crate::math::FixedPoint;

#[contracttype]
pub struct PositionState {
    pub bump: u32,
    pub pool: Address,
    pub tick: Address,
    pub owner: Address,
    pub liquidity: FixedPoint,
    pub tick_lower: FixedPoint,
    pub tick_upper: FixedPoint,
    pub fees_earned: FixedPoint,
    pub created_at: i64,
    pub updated_at: i64,
}
