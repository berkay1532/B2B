//! Storage access + TTL bumps. Every entry point calls [`bump_instance`] first.

use soroban_sdk::{Address, Env, Vec};

use crate::types::{DataKey, Error, TickData};

/// ~17280 ledgers per day at 5s close times.
const DAY: u32 = 17_280;
/// Bump the instance (and the ticks it holds) when it drops under ~7 days left.
pub const INSTANCE_THRESHOLD: u32 = 7 * DAY;
/// …back up to ~30 days.
pub const INSTANCE_EXTEND: u32 = 30 * DAY;

/// Extend the instance TTL. Called at the top of every public entry point.
pub fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_EXTEND);
}

pub fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Tokens)
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn tokens(env: &Env) -> Result<Vec<Address>, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Tokens)
        .ok_or(Error::NotInitialized)
}

pub fn set_tokens(env: &Env, tokens: &Vec<Address>) {
    env.storage().instance().set(&DataKey::Tokens, tokens);
}

pub fn ticks(env: &Env) -> Vec<TickData> {
    env.storage()
        .instance()
        .get(&DataKey::Ticks)
        .unwrap_or_else(|| Vec::new(env))
}

pub fn set_ticks(env: &Env, ticks: &Vec<TickData>) {
    env.storage().instance().set(&DataKey::Ticks, ticks);
}

/// Index of `token` in the pool's token list, or [`Error::UnknownToken`].
pub fn token_index(tokens: &Vec<Address>, token: &Address) -> Result<usize, Error> {
    for (k, t) in tokens.iter().enumerate() {
        if &t == token {
            return Ok(k);
        }
    }
    Err(Error::UnknownToken)
}

pub fn shares(env: &Env, owner: &Address, depeg_bps: u32) -> i128 {
    let key = DataKey::Shares(owner.clone(), depeg_bps);
    env.storage().persistent().get(&key).unwrap_or(0)
}

/// Credit `delta` shares to `owner` in the tick at `depeg_bps` and bump the entry.
pub fn add_shares(env: &Env, owner: &Address, depeg_bps: u32, delta: i128) {
    let key = DataKey::Shares(owner.clone(), depeg_bps);
    let next = shares(env, owner, depeg_bps) + delta;
    env.storage().persistent().set(&key, &next);
    env.storage()
        .persistent()
        .extend_ttl(&key, INSTANCE_THRESHOLD, INSTANCE_EXTEND);
}
