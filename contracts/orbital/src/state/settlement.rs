use soroban_sdk::{contracttype, Address};

use crate::math::fixed_point::FixedPoint;

#[derive(Clone, Copy, PartialEq, Eq)]
#[contracttype]
pub enum SettlementStatus {
    Pending,
    Executed,
    Failed,
}

#[contracttype]
pub struct SettlementState {
    pub bump: u32,
    pub pool: Address,
    pub policy: Address,
    pub executor: Address,
    pub token_in_index: u32,
    pub token_out_index: u32,
    pub amount_in: FixedPoint,
    pub amount_out: FixedPoint,
    pub execution_price: FixedPoint,
    pub status: SettlementStatus,
    pub executed_at: i64,
    pub nonce: u64,
}
