#![no_std]
//! Orbital pool (3 tokens, fixed tick set) for Soroban.
//!
//! Task A scope: the pure math (`fixed`, `u256`, `math`) plus a contract shell.
//! Storage, auth and SAC transfers land in Task B.

#[cfg(test)]
extern crate std;

pub mod fixed;
pub mod math;
pub mod u256;

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct OrbitalPool;

#[contractimpl]
impl OrbitalPool {
    /// Interface version. Placeholder until Task B adds `init`/`deposit`/`swap`.
    pub fn version(_env: Env) -> u32 {
        1
    }
}
