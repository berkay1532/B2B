#[derive(Debug, thiserror::Error)]
pub enum OrbitalError {
    // ── Math Errors ──
    #[error("Math overflow in fixed-point operation")]
    MathOverflow,

    #[error("Division by zero")]
    DivisionByZero,

    #[error("Square root of negative number")]
    SqrtNegative,

    // ── Invariant Errors ──
    #[error("Sphere invariant violated: ||r - x||^2 != r^2")]
    InvariantViolation,

    #[error("Torus invariant computation failed")]
    TorusInvariantError,

    // ── Pool Errors ──
    #[error("Pool already initialized")]
    PoolAlreadyInitialized,

    #[error("Invalid number of assets (must be 2..=8)")]
    InvalidAssetCount,

    #[error("Invalid fee rate")]
    InvalidFeeRate,

    #[error("Insufficient liquidity for swap")]
    InsufficientLiquidity,

    #[error("Pool is not active")]
    PoolNotActive,

    #[error("Slippage tolerance exceeded")]
    SlippageExceeded,

    #[error("Same token swap not allowed")]
    SameTokenSwap,

    #[error("Invalid token index")]
    InvalidTokenIndex,

    // ── Tick Errors ──
    #[error("Invalid tick bound k")]
    InvalidTickBound,

    #[error("Tick crossing detected but not handled")]
    UnhandledTickCrossing,

    // ── Newton Solver Errors ──
    #[error("Newton solver diverged")]
    NewtonDivergence,

    #[error("Solver did not converge within max iterations")]
    SolverDidNotConverge,

    // ── Liquidity Errors ──
    #[error("Invalid liquidity amount")]
    InvalidLiquidityAmount,

    #[error("Trade amount must be non-negative")]
    NegativeTradeAmount,

    #[error("Position not found")]
    PositionNotFound,

    #[error("Insufficient position balance")]
    InsufficientPositionBalance,

    // ── Policy Errors ──
    #[error("Unauthorized: caller not in allowlist")]
    Unauthorized,

    #[error("Policy not found")]
    PolicyNotFound,

    #[error("Trade exceeds policy limit")]
    PolicyLimitExceeded,

    #[error("Allowlist is full")]
    AllowlistFull,

    #[error("Address already in allowlist")]
    AlreadyInAllowlist,

    #[error("Address not in allowlist")]
    NotInAllowlist,

    // ── Settlement Errors ──
    #[error("Settlement policy check failed")]
    SettlementPolicyViolation,

    #[error("Invalid settlement amount")]
    InvalidSettlementAmount,

    #[error("Settlement audit trail creation failed")]
    AuditTrailError,

    // ── Pool Validation (new variants appended to preserve existing error discriminants) ──
    #[error("Duplicate token mint in pool")]
    DuplicateTokenMint,

    #[error("Reserve exceeds sphere radius — swap would cross branch boundary")]
    ReserveExceedsRadius,

    #[error("Wrong number of remaining accounts (expected 3 × n_assets)")]
    InvalidRemainingAccounts,

    #[error("Vault PDA address does not match expected derivation")]
    InvalidVaultAddress,

    #[error("Withdrawal too small: all token returns round to zero")]
    WithdrawalTooSmall,

    #[error("Swap output rounds to zero after truncation")]
    SwapOutputTooSmall,

    #[error("No fields to update")]
    NoFieldsToUpdate,

    #[error("Daily volume limit exceeded")]
    DailyVolumeLimitExceeded,

    #[error("All pool tokens must have the same number of decimals")]
    DecimalsMismatch,

    #[error("Cannot close pool: outstanding LP liquidity exists")]
    PoolNotEmpty,

    #[error("Tick account has invalid owner or discriminator")]
    InvalidTickAccount,

    #[error("No tick matched the crossing k value")]
    TickCrossingFailed,

    #[error("Failed to serialize tick state back to account")]
    TickSerializationFailed,

    #[error("Tick account does not belong to this pool")]
    TickPoolMismatch,

    #[error("Duplicate tick account in remaining_accounts")]
    DuplicateTickAccount,

    #[error("Maximum tick count reached (16)")]
    MaxTicksReached,

    #[error("Cannot close tick: liquidity is non-zero")]
    TickHasLiquidity,

    // ── KYC/KYT/AML Compliance Errors ──
    #[error("KYC status is not Verified")]
    KycNotVerified,

    #[error("KYC verification has expired")]
    KycExpired,

    #[error("Risk score exceeds policy threshold")]
    RiskScoreExceeded,

    #[error("AML clearance required")]
    AmlNotCleared,

    #[error("Jurisdiction not in allowed list")]
    JurisdictionNotAllowed,

    #[error("Travel Rule data required for this settlement amount")]
    TravelRuleRequired,

    #[error("Invalid risk score (must be 0-100)")]
    InvalidRiskScore,
}
