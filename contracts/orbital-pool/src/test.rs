//! Integration tests: real SAC tokens, real auth, real transfers.
//!
//! The seed mirrors `MockPoolClient` exactly (4 ticks at 10/100/500/1000 bps,
//! $2.5M real per token per tick) so the calibration numbers in
//! `docs/contract-interface.md` §6 apply verbatim.

use soroban_sdk::testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Events};
use soroban_sdk::{symbol_short, token, vec, Address, Env, IntoVal, Vec};

use crate::fixed::STROOP;
use crate::types::Error;
use crate::{OrbitalPool, OrbitalPoolClient};

const SEED_BPS: [u32; 4] = [10, 100, 500, 1000];
/// $2.5M real reserve per token, per tick.
const SEED_PER_TOKEN: i128 = 2_500_000 * STROOP;

struct Fixture {
    env: Env,
    client: OrbitalPoolClient<'static>,
    pool: Address,
    tokens: Vec<Address>,
    admin: Address,
    lp: Address,
    trader: Address,
}

fn tokens_str(v: i128) -> std::string::String {
    std::format!("{}.{:07}", v / STROOP, (v % STROOP).abs())
}

/// Relative difference in parts per billion.
fn rel_ppb(actual: i128, expected: i128) -> i128 {
    (actual - expected).abs() * 1_000_000_000 / expected.abs()
}

/// Register the contract plus three SACs, and mint `mint_each` of every token
/// to the LP and the trader.
fn setup(mint_each: i128) -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let lp = Address::generate(&env);
    let trader = Address::generate(&env);

    let mut tokens = Vec::new(&env);
    for _ in 0..3 {
        let sac = env.register_stellar_asset_contract_v2(issuer.clone());
        let id = sac.address();
        let minter = token::StellarAssetClient::new(&env, &id);
        minter.mint(&lp, &mint_each);
        minter.mint(&trader, &mint_each);
        tokens.push_back(id);
    }

    let pool = env.register(OrbitalPool, ());
    let client = OrbitalPoolClient::new(&env, &pool);
    client.init(&issuer, &tokens);

    Fixture {
        env,
        client,
        pool,
        tokens,
        admin: issuer,
        lp,
        trader,
    }
}

impl Fixture {
    fn balance(&self, token: u32, who: &Address) -> i128 {
        token::Client::new(&self.env, &self.tokens.get(token).unwrap()).balance(who)
    }

    /// The four-tick, $30M seed from `docs/contract-interface.md` §3.
    fn seed(&self) {
        let amounts = vec![&self.env, SEED_PER_TOKEN, SEED_PER_TOKEN, SEED_PER_TOKEN];
        for bps in SEED_BPS {
            self.client.deposit(&self.lp, &amounts, &bps);
        }
    }

    /// Every token balance the contract actually holds must cover the real
    /// reserves it believes it has.
    fn assert_solvent(&self) {
        let state = self.client.get_state();
        for k in 0..3u32 {
            let held = self.balance(k, &self.pool);
            let owed = state.reserves.get(k).unwrap();
            assert!(
                held >= owed,
                "token {k}: contract holds {held} but claims reserves {owed}"
            );
        }
    }
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

#[test]
fn init_records_tokens_and_admin() {
    let f = setup(10 * SEED_PER_TOKEN);
    assert_eq!(f.client.get_state().tokens, f.tokens);
    assert_eq!(f.client.admin(), f.admin);
    assert_eq!(f.client.version(), 1);
    assert_eq!(f.client.get_state().ticks.len(), 0);
    assert_eq!(f.client.get_state().tvl, 0);
}

#[test]
fn double_init_is_rejected() {
    let f = setup(SEED_PER_TOKEN);
    let admin = Address::generate(&f.env);
    assert_eq!(
        f.client.try_init(&admin, &f.tokens),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn calls_before_init_report_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let pool = env.register(OrbitalPool, ());
    let client = OrbitalPoolClient::new(&env, &pool);
    let who = Address::generate(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    assert_eq!(client.try_get_state(), Err(Ok(Error::NotInitialized)));
    assert_eq!(
        client.try_quote(&a, &b, &STROOP),
        Err(Ok(Error::NotInitialized))
    );
    assert_eq!(
        client.try_deposit(&who, &vec![&env, STROOP, STROOP, STROOP], &10u32),
        Err(Ok(Error::NotInitialized))
    );
    assert_eq!(
        client.try_swap(&who, &a, &b, &STROOP, &0i128),
        Err(Ok(Error::NotInitialized))
    );
    assert_eq!(client.try_admin(), Err(Ok(Error::NotInitialized)));
}

#[test]
fn init_requires_three_distinct_tokens() {
    let env = Env::default();
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let pool = env.register(OrbitalPool, ());
    let client = OrbitalPoolClient::new(&env, &pool);

    let a = env
        .register_stellar_asset_contract_v2(issuer.clone())
        .address();
    let b = env
        .register_stellar_asset_contract_v2(issuer.clone())
        .address();
    assert_eq!(
        client.try_init(&issuer, &vec![&env, a.clone(), b.clone()]),
        Err(Ok(Error::InvalidAmount)),
        "two tokens must be rejected"
    );
    assert_eq!(
        client.try_init(&issuer, &vec![&env, a.clone(), b, a]),
        Err(Ok(Error::InvalidAmount)),
        "a duplicated token must be rejected"
    );
}

// ---------------------------------------------------------------------------
// deposits / seed
// ---------------------------------------------------------------------------

#[test]
fn seed_matches_the_mock() {
    let f = setup(10 * SEED_PER_TOKEN);

    let mut total_shares = 0i128;
    for bps in SEED_BPS {
        let minted = f.client.deposit(
            &f.lp,
            &vec![&f.env, SEED_PER_TOKEN, SEED_PER_TOKEN, SEED_PER_TOKEN],
            &bps,
        );
        assert_eq!(minted, f.client.shares(&f.lp, &bps));
        total_shares += minted;
        std::println!(
            "  tick {bps:>4} bps: shares (radius) = {}",
            tokens_str(minted)
        );
    }
    assert!(total_shares > 0);

    let state = f.client.get_state();
    std::println!(
        "  reserves = [{}, {}, {}] tvl = {}",
        tokens_str(state.reserves.get(0).unwrap()),
        tokens_str(state.reserves.get(1).unwrap()),
        tokens_str(state.reserves.get(2).unwrap()),
        tokens_str(state.tvl)
    );

    // 4 ticks x 3 tokens x $2.5M = $30M, within a stroop per (tick, token).
    let expected_tvl = 30_000_000 * STROOP;
    assert!(
        (state.tvl - expected_tvl).abs() <= 12,
        "tvl {} vs {}",
        state.tvl,
        expected_tvl
    );
    for k in 0..3u32 {
        assert!((state.reserves.get(k).unwrap() - 10_000_000 * STROOP).abs() <= 4);
    }

    // Sorted by depeg, all interior, and the LP actually paid.
    assert_eq!(state.ticks.len(), 4);
    for (k, t) in state.ticks.iter().enumerate() {
        assert_eq!(t.depeg_bps, SEED_BPS[k]);
        assert!(!t.boundary, "tick {} should start interior", t.depeg_bps);
        assert_eq!(t.x.len(), 3);
    }
    for k in 0..3u32 {
        assert_eq!(
            f.balance(k, &f.lp),
            10 * SEED_PER_TOKEN - 4 * SEED_PER_TOKEN
        );
        assert_eq!(f.balance(k, &f.pool), 4 * SEED_PER_TOKEN);
    }
    f.assert_solvent();
}

#[test]
fn deposit_into_an_existing_tick_grows_it_proportionally() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();

    let before = f.client.get_state();
    let r_before = before.ticks.get(0).unwrap().radius;
    let add = SEED_PER_TOKEN / 2; // half the tick's real reserve
    let minted = f
        .client
        .deposit(&f.lp, &vec![&f.env, add, add, add], &10u32);

    let after = f.client.get_state();
    let r_after = after.ticks.get(0).unwrap().radius;
    assert_eq!(minted, r_after - r_before);
    // ratio = 0.5 -> radius grows by 50%
    assert!(
        rel_ppb(r_after, r_before * 3 / 2) <= 1_000,
        "radius {r_after}"
    );
    assert!(
        rel_ppb(
            after.reserves.get(0).unwrap(),
            before.reserves.get(0).unwrap() + add
        ) <= 1_000
    );
    assert_eq!(f.client.shares(&f.lp, &10u32), r_after);
    f.assert_solvent();
}

#[test]
fn wrong_proportion_deposits_are_rejected() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();

    // Existing tick, lopsided amounts.
    assert_eq!(
        f.client.try_deposit(
            &f.lp,
            &vec![&f.env, 1_000 * STROOP, 1_000 * STROOP, 2_000 * STROOP],
            &10u32
        ),
        Err(Ok(Error::ProportionMismatch))
    );
    // Fresh tick, unequal amounts.
    assert_eq!(
        f.client.try_deposit(
            &f.lp,
            &vec![&f.env, 1_000 * STROOP, 1_000 * STROOP, 2_000 * STROOP],
            &250u32
        ),
        Err(Ok(Error::ProportionMismatch))
    );
    // Inside the 1% tolerance: accepted.
    let ok = f.client.deposit(
        &f.lp,
        &vec![&f.env, 1_000 * STROOP, 1_005 * STROOP, 995 * STROOP],
        &250u32,
    );
    assert!(ok > 0);
    assert_eq!(f.client.get_state().ticks.len(), 5);
    // Still sorted by depeg_bps.
    let bps: std::vec::Vec<u32> = f
        .client
        .get_state()
        .ticks
        .iter()
        .map(|t| t.depeg_bps)
        .collect();
    assert_eq!(bps, std::vec![10, 100, 250, 500, 1000]);
}

#[test]
fn deposit_rejects_bad_amounts() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();
    assert_eq!(
        f.client
            .try_deposit(&f.lp, &vec![&f.env, 0i128, STROOP, STROOP], &10u32),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        f.client
            .try_deposit(&f.lp, &vec![&f.env, STROOP, STROOP], &10u32),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        f.client
            .try_deposit(&f.lp, &vec![&f.env, STROOP, STROOP, STROOP], &10_000u32),
        Err(Ok(Error::InvalidAmount))
    );
}

// ---------------------------------------------------------------------------
// the calibration swap
// ---------------------------------------------------------------------------

#[test]
fn seven_million_swap_matches_the_reference() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();

    let amount_in = 7_000_000 * STROOP;
    let token_in = f.tokens.get(0).unwrap();
    let token_out = f.tokens.get(1).unwrap();

    let q = f.client.quote(&token_in, &token_out, &amount_in);
    let trader_in_before = f.balance(0, &f.trader);
    let trader_out_before = f.balance(1, &f.trader);

    let out = f
        .client
        .swap(&f.trader, &token_in, &token_out, &amount_in, &0i128);

    // 6,924,145.1534 tokens, relative tolerance 1e-6 (= 1000 ppb).
    let expected = 69_241_451_534_000i128;
    std::println!(
        "  7M swap: out = {} ({} stroops), expected {} -> {}e-9 relative, ticks_crossed = {}",
        tokens_str(out),
        out,
        tokens_str(expected),
        rel_ppb(out, expected),
        q.ticks_crossed
    );
    assert_eq!(out, q.amount_out, "swap must honour its own quote");
    assert!(
        rel_ppb(out, expected) <= 1_000,
        "out {out} vs expected {expected}"
    );
    assert_eq!(q.ticks_crossed, 2);

    // Ticks 10 and 100 bps went to boundary; 500 and 1000 stayed interior.
    let state = f.client.get_state();
    let boundary: std::vec::Vec<(u32, bool)> = state
        .ticks
        .iter()
        .map(|t| (t.depeg_bps, t.boundary))
        .collect();
    assert_eq!(
        boundary,
        std::vec![(10, true), (100, true), (500, false), (1000, false)]
    );

    // Balances moved by exactly the traded amounts.
    assert_eq!(f.balance(0, &f.trader), trader_in_before - amount_in);
    assert_eq!(f.balance(1, &f.trader), trader_out_before + out);
    f.assert_solvent();
}

#[test]
fn swap_publishes_an_event() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();
    let token_in = f.tokens.get(0).unwrap();
    let token_out = f.tokens.get(1).unwrap();
    let amount_in = 1_000 * STROOP;
    let out = f
        .client
        .swap(&f.trader, &token_in, &token_out, &amount_in, &0i128);

    let events = f.env.events().all().filter_by_contract(&f.pool);
    assert_eq!(
        events,
        vec![
            &f.env,
            (
                f.pool.clone(),
                (symbol_short!("swap"), token_in, token_out).into_val(&f.env),
                (f.trader.clone(), amount_in, out, 0u32).into_val(&f.env),
            )
        ]
    );
}

#[test]
fn reverse_trade_reactivates_frozen_ticks() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();
    let t0 = f.tokens.get(0).unwrap();
    let t1 = f.tokens.get(1).unwrap();

    f.client
        .swap(&f.trader, &t0, &t1, &(7_000_000 * STROOP), &0i128);
    let frozen = f
        .client
        .get_state()
        .ticks
        .iter()
        .filter(|t| t.boundary)
        .count();
    assert_eq!(frozen, 2);

    // A small trade the other way pulls the frozen ticks back inside.
    let back = f
        .client
        .swap(&f.trader, &t1, &t0, &(100_000 * STROOP), &0i128);
    assert!(back > 0);
    let state = f.client.get_state();
    for t in state.ticks.iter() {
        assert!(
            !t.boundary,
            "tick {} should be interior again after the reverse trade",
            t.depeg_bps
        );
    }
    f.assert_solvent();
}

#[test]
fn max_fillable_is_close_to_the_reference() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();
    let t0 = f.tokens.get(0).unwrap();
    let t1 = f.tokens.get(1).unwrap();
    let cap = f.client.max_fillable(&t0, &t1);
    std::println!("  max_fillable = {}", tokens_str(cap));
    // ~8,824,999 tokens, tolerance 1e-4 relative (docs §6).
    let expected = 8_824_999 * STROOP;
    assert!(
        rel_ppb(cap, expected) <= 100_000,
        "max_fillable {cap} vs {expected}"
    );
    // The cap itself must fill, and a touch more must not.
    assert!(f.client.try_quote(&t0, &t1, &cap).is_ok());
    assert!(f.client.try_quote(&t0, &t1, &(cap * 2)).is_err());
}

// ---------------------------------------------------------------------------
// error paths
// ---------------------------------------------------------------------------

#[test]
fn slippage_is_enforced_and_leaves_no_trace() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();
    let t0 = f.tokens.get(0).unwrap();
    let t1 = f.tokens.get(1).unwrap();
    let amount_in = 7_000_000 * STROOP;
    let q = f.client.quote(&t0, &t1, &amount_in);

    let before = f.balance(0, &f.trader);
    assert_eq!(
        f.client
            .try_swap(&f.trader, &t0, &t1, &amount_in, &(q.amount_out + 1)),
        Err(Ok(Error::SlippageExceeded))
    );
    assert_eq!(
        f.balance(0, &f.trader),
        before,
        "a failed swap must not move funds"
    );
    for t in f.client.get_state().ticks.iter() {
        assert!(!t.boundary, "a failed swap must not persist ticks");
    }
    // Exactly the quote is fine.
    assert!(f
        .client
        .try_swap(&f.trader, &t0, &t1, &amount_in, &q.amount_out)
        .is_ok());
}

#[test]
fn unknown_token_and_bad_amounts_are_rejected() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();
    let t0 = f.tokens.get(0).unwrap();
    let t1 = f.tokens.get(1).unwrap();
    let stranger = f
        .env
        .register_stellar_asset_contract_v2(Address::generate(&f.env))
        .address();

    assert_eq!(
        f.client.try_quote(&stranger, &t1, &STROOP),
        Err(Ok(Error::UnknownToken))
    );
    assert_eq!(
        f.client
            .try_swap(&f.trader, &t0, &stranger, &STROOP, &0i128),
        Err(Ok(Error::UnknownToken))
    );
    assert_eq!(
        f.client.try_max_fillable(&stranger, &t1),
        Err(Ok(Error::UnknownToken))
    );
    assert_eq!(
        f.client.try_quote(&t0, &t1, &0i128),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        f.client.try_swap(&f.trader, &t0, &t1, &0i128, &0i128),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        f.client.try_swap(&f.trader, &t0, &t1, &(-5i128), &0i128),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        f.client.try_quote(&t0, &t0, &STROOP),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn an_empty_pool_has_no_liquidity() {
    let f = setup(SEED_PER_TOKEN);
    let t0 = f.tokens.get(0).unwrap();
    let t1 = f.tokens.get(1).unwrap();
    assert_eq!(
        f.client.try_quote(&t0, &t1, &STROOP),
        Err(Ok(Error::InsufficientLiquidity))
    );
    assert_eq!(f.client.get_state().tvl, 0);
    assert_eq!(f.client.max_fillable(&t0, &t1), 0);
}

#[test]
fn oversized_trades_report_insufficient_liquidity() {
    let f = setup(100 * SEED_PER_TOKEN);
    f.seed();
    let t0 = f.tokens.get(0).unwrap();
    let t1 = f.tokens.get(1).unwrap();
    assert_eq!(
        f.client.try_quote(&t0, &t1, &(50_000_000 * STROOP)),
        Err(Ok(Error::InsufficientLiquidity))
    );
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

#[test]
fn swap_records_the_traders_authorization() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();
    let t0 = f.tokens.get(0).unwrap();
    let t1 = f.tokens.get(1).unwrap();
    let amount_in = 1_000 * STROOP;
    f.client.swap(&f.trader, &t0, &t1, &amount_in, &0i128);

    let auths = f.env.auths();
    let (addr, invocation) = auths.first().unwrap().clone();
    assert_eq!(addr, f.trader);
    assert_eq!(
        invocation.function,
        AuthorizedFunction::Contract((
            f.pool.clone(),
            symbol_short!("swap"),
            (f.trader.clone(), t0.clone(), t1.clone(), amount_in, 0i128).into_val(&f.env),
        ))
    );
    // The SAC transfer is a sub-invocation of that same authorization.
    let AuthorizedInvocation {
        sub_invocations, ..
    } = invocation;
    assert!(!sub_invocations.is_empty());
}

#[test]
fn swap_fails_without_authorization() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();
    let t0 = f.tokens.get(0).unwrap();
    let t1 = f.tokens.get(1).unwrap();

    // Stop mocking: no auth entry is supplied for the trader any more.
    f.env.set_auths(&[]);
    let before = f.balance(0, &f.trader);
    assert!(
        f.client
            .try_swap(&f.trader, &t0, &t1, &(1_000 * STROOP), &0i128)
            .is_err(),
        "swap must fail when the trader did not authorize it"
    );
    assert_eq!(f.balance(0, &f.trader), before);
}

#[test]
fn deposit_fails_without_authorization() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.env.set_auths(&[]);
    assert!(f
        .client
        .try_deposit(
            &f.lp,
            &vec![&f.env, SEED_PER_TOKEN, SEED_PER_TOKEN, SEED_PER_TOKEN],
            &10u32
        )
        .is_err());
}

// ---------------------------------------------------------------------------
// budget
// ---------------------------------------------------------------------------

#[test]
fn budget_for_the_seven_million_swap() {
    let f = setup(10 * SEED_PER_TOKEN);
    f.seed();
    let t0 = f.tokens.get(0).unwrap();
    let t1 = f.tokens.get(1).unwrap();

    let out = f
        .client
        .swap(&f.trader, &t0, &t1, &(7_000_000 * STROOP), &0i128);
    assert!(out > 0);

    let budget = f.env.cost_estimate().budget();
    std::println!(
        "  7M swap budget: cpu_instructions = {}, memory_bytes = {}",
        budget.cpu_instruction_cost(),
        budget.memory_bytes_cost()
    );
    budget.print();
}
