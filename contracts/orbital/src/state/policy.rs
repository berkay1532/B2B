use soroban_sdk::{contracttype, Address};

use crate::math::FixedPoint;

#[contracttype]
pub struct PolicyState {
    pub bump: u8,
    pub authority: Address,
    pub pool: Address,
    pub max_trade_amount: FixedPoint,
    pub max_daily_volume: FixedPoint,
    pub current_daily_volume: FixedPoint,
    pub last_reset_timestamp: i64,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}
