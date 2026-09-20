//! Contract-facing types: the storage keys, the SDK mirrors of [`crate::math::Tick`],
//! and the error codes `SorobanPoolClient` maps onto `PoolError`
//! (`docs/contract-interface.md` §5).

use soroban_sdk::{contracterror, contractevent, contracttype, Address, Env, Vec};

use crate::math::{MathError, Tick, N};

/// Instance-storage keys plus the persistent LP-share key.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// `Address` — the deployer/administrator recorded at `init`.
    Admin,
    /// `Vec<Address>` — the three SAC token contract ids, in index order.
    Tokens,
    /// `Vec<TickData>` — the pool's ticks, kept sorted by `depeg_bps`.
    Ticks,
    /// Persistent: `i128` — LP shares held by an address in one tick.
    Shares(Address, u32),
}

/// SDK mirror of [`crate::math::Tick`] (`x` must be a `Vec` to be a `contracttype`).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct TickData {
    pub depeg_bps: u32,
    pub radius: i128,
    pub plane_sum: i128,
    pub x_min: i128,
    pub x: Vec<i128>,
    pub boundary: bool,
}

impl TickData {
    /// Lower a pure-math tick into storage form.
    pub fn from_math(env: &Env, t: &Tick) -> Self {
        let mut x = Vec::new(env);
        for v in t.x.iter() {
            x.push_back(*v);
        }
        Self {
            depeg_bps: t.depeg_bps,
            radius: t.radius,
            plane_sum: t.plane_sum,
            x_min: t.x_min,
            x,
            boundary: t.boundary,
        }
    }

    /// Raise a stored tick back into the pure-math form the hot path uses.
    pub fn to_math(&self) -> Tick {
        let mut x = [0i128; N];
        for (k, slot) in x.iter_mut().enumerate() {
            *slot = self.x.get(k as u32).unwrap_or(0);
        }
        Tick {
            depeg_bps: self.depeg_bps,
            radius: self.radius,
            plane_sum: self.plane_sum,
            x_min: self.x_min,
            x,
            boundary: self.boundary,
        }
    }

    /// `realReserves(t)[k] = x[k] - x_min`.
    pub fn real_reserve(&self, k: u32) -> i128 {
        self.x.get(k).unwrap_or(0) - self.x_min
    }
}

/// `get_state()` return value (`docs/contract-interface.md` §1).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PoolState {
    pub tokens: Vec<Address>,
    /// Real reserves per token, summed over every tick, 7 decimals.
    pub reserves: Vec<i128>,
    pub ticks: Vec<TickData>,
    pub tvl: i128,
}

/// `quote()` return value.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Quote {
    pub amount_out: i128,
    pub ticks_crossed: u32,
}

/// Emitted by `swap`. Topics: `("swap", token_in, token_out)`;
/// data: `(from, amount_in, amount_out, ticks_crossed)`.
#[contractevent(topics = ["swap"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SwapEvent {
    #[topic]
    pub token_in: Address,
    #[topic]
    pub token_out: Address,
    pub from: Address,
    pub amount_in: i128,
    pub amount_out: i128,
    pub ticks_crossed: u32,
}

/// Contract error codes (`docs/contract-interface.md` §5 plus the lifecycle codes).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InsufficientLiquidity = 1,
    SlippageExceeded = 2,
    ProportionMismatch = 3,
    InvalidAmount = 4,
    NotInitialized = 5,
    AlreadyInitialized = 6,
    UnknownToken = 7,
}

impl From<MathError> for Error {
    /// `NoConvergence` folds into `InsufficientLiquidity`: the client only ever
    /// sees the codes in §5, and an unconverged split means the pool cannot
    /// fill the trade.
    fn from(e: MathError) -> Self {
        match e {
            MathError::InsufficientLiquidity | MathError::NoConvergence => {
                Error::InsufficientLiquidity
            }
            MathError::InvalidAmount | MathError::SameToken | MathError::InvalidTick => {
                Error::InvalidAmount
            }
        }
    }
}
