# Security Audit — TokenLaunchHook stack

**Date:** 2026-06-03
**Scope:** `src/**` — `TokenLaunchHook`, `CampaignWrapper`, `TokenFactory`/`StandardToken`, mechanism
modules (`GovernanceModule`, `AntiSnipeMechanism`, `BuySellTaxMechanism`, `LiquidityLockMechanism`,
`WhitelistPhaseMechanism`), libs (`LaunchMath`, `MechanismConfig`), deploy scripts.
**Method:** Manual review against the Uniswap v4 hook security model (caller verification, delta
accounting, least-privilege permissions, `tx.origin` hazards) and Solidity best practice. Read-only —
code compiles and the existing test suite passes per repo.

## Severity summary

| ID  | Severity | Title |
|-----|----------|-------|
| H-1 | High     | Bootstrap hijack / DoS of existing-token pools (front-runnable first mint) |
| M-1 | Medium   | Anti-snipe cap is per-swap only; trivially bypassed |
| M-2 | Medium   | `beforeSwapReturnDelta`/`afterSwapReturnDelta` permissions enabled but unused |
| L-1 | Low      | Misconfigured M3 lock can permanently trap the deployer's own LP |
| L-2 | Low      | `cumulativeVolume` overflow reverts `_afterSwap` → swap DoS; tracking never stops |
| I-1 | Info     | `tx.origin`-based authorization (documented limitation) |
| I-2 | Info     | Code hygiene (leftover TODOs, unbounded whitelist loops) |

---

## Findings

### H-1 — Bootstrap hijack / DoS of existing-token pools (front-runnable first mint)

**Where:** `TokenLaunchHook._beforeAddLiquidity` / `_bootstrap` (src/TokenLaunchHook.sol:83-139),
`GovernanceModule._initGovernance`.

**Issue.** The first mint per `PoolId` bootstraps the campaign from caller-supplied `hookData`. The
two anti-abuse checks are:
- `sqrtPriceNow == cfg.expectedInitialSqrtPrice` (anti-griefing), and
- `tx.origin == cfg.deployer` (anti-sandwich).

Both fields come from the **same** `hookData` the bootstrapper provides. An attacker calling
PositionManager directly as an EOA sets `cfg.deployer = attacker` and `expectedInitialSqrtPrice` to the
price they themselves initialize at — so both checks pass. The attacker becomes the governance-NFT
owner of the pool and sets arbitrary module config (max sell tax, whitelist blocking everyone, etc.).

The legitimate deployer's `CampaignWrapper.launchCampaign` then reverts at the
`governanceTokenIdOf(...) != governanceTokenId` post-check (`CaptureFailed`), so **no deployer funds are
lost**, but:
- For an **existing token**, the `PoolKey` is fully predictable → the canonical pool is permanently
  captured/DoS'd; organic traders who find it pay attacker-set taxes into the attacker's LP.
- For a **fresh token via `TokenFactory`**, the token address (CREATE, factory-nonce dependent) is
  unpredictable, so the `PoolKey` cannot be pre-targeted → **not exploitable**.

The existing race test (`test/TokenLaunchHook.race.t.sol`) only covers a stranger minting under the
*deployer's* config; it does **not** cover the attacker-sets-own-`cfg.deployer` case.

**Severity: High** (breaks the core "deployer controls their launch" guarantee for existing-token
launches; griefing + governance capture; no direct theft).

**Remediation options (pick one):**
1. Bind the bootstrap to a trusted coordinator: have the hook record an authorized `CampaignWrapper`
   (or set of them) and require the bootstrap to originate from it — e.g. pass a wrapper-signed
   commitment in `hookData`, or require `sender == POSITION_MANAGER` **and** an out-of-band registered
   deployer commitment per `PoolId`.
2. Commit-reveal / pre-registration: deployer pre-registers `(PoolId → deployer)` in a prior tx; the
   bootstrap requires `cfg.deployer` to equal the registered address.
3. Document explicitly that existing-token launches must use a fresh fee/tickSpacing and accept the
   front-run/DoS risk (weakest; only if (1)/(2) are out of scope for v1).

### M-1 — Anti-snipe cap is per-swap only; trivially bypassed

**Where:** `AntiSnipeMechanism._checkAntiSnipe` (src/mechanisms/AntiSnipeMechanism.sol:40-58).

The cap limits a **single swap's** `amountIn` to `maxBuyAmountIn`. There is no per-tx, per-block, or
per-address accumulation (the spec notes the per-EOA cooldown was dropped). A sniper bundles N
max-sized buys in one transaction via a contract, or submits many txs in one block, acquiring an
unbounded share — defeating M1's stated purpose. `tx.origin` is used elsewhere but not to throttle here.

**Severity: Medium** (security control provides far weaker protection than implied).

**Remediation:** track cumulative buy volume per `(pid, tx.origin)` within the window (an SSTORE on
each in-window buy), or per-block-per-origin, and cap the cumulative amount. Document the residual
multi-EOA/sybil limitation.

### M-2 — `beforeSwapReturnDelta` / `afterSwapReturnDelta` permissions enabled but unused

**Where:** `getHookPermissions` (src/TokenLaunchHook.sol:70-71); flags also baked into the mined salt
(`script/MineSalt.s.sol:31-33`).

`_beforeSwap` returns `ZERO_DELTA` and `_afterSwap` returns `int128(0)`; neither return-delta path is
used in v1. These are the **highest-risk** v4 permissions (NoOp value-extraction surface). They are
declared "reserved for v2", but both core contracts are **non-upgradeable** — v2 is a new mined
address anyway, so reserving the bits buys nothing and only enlarges the trust surface integrators must
audit and the attack surface if any future inherited code returns a non-zero delta.

**Severity: Medium** (least-privilege / defense-in-depth).

**Remediation:** set both `beforeSwapReturnDelta` and `afterSwapReturnDelta` to `false`, drop the
matching `BEFORE/AFTER_SWAP_RETURNS_DELTA_FLAG` from `HookDeployLib.hookFlags()`, re-mine the salt.
Re-enable only in the v2 deployment that actually uses them.

### L-1 — Misconfigured M3 lock can permanently trap the deployer's own LP

**Where:** `LiquidityLockMechanism` + `onlyGovernance` time gate.

Governance relaxations (`relaxUnlockTime`, `disable*`, `switchToOr`) are gated by `onlyGovernance`,
which reverts once `block.timestamp >= launchEndTime`. An AND-logic lock with an unreachable volume
threshold and far-future `unlockTime` becomes **permanently** unsatisfiable after launch end, with no
path to relax it. Self-inflicted (deployer's own config and own funds), but a sharp foot-gun.

**Severity: Low.** **Remediation:** validate at init that an AND lock is satisfiable, or allow
post-launch relaxation, or clearly document the irreversibility.

### L-2 — `cumulativeVolume` overflow reverts `_afterSwap` → swap DoS; and tracking never stops

**Where:** `LiquidityLockMechanism._trackVolume` (src/mechanisms/LiquidityLockMechanism.sol:90-94);
`TokenLaunchHook._afterSwap` (src/TokenLaunchHook.sol:170, see the `// Think about track after campaign
finished` TODO).

`cumulativeVolume += absVol` is checked `uint128` math; for very-high-volume / huge-supply tokens an
overflow would revert `afterSwap` and block all swaps. Separately, volume is SSTORE'd on **every** swap
for the pool's lifetime even after the lock is satisfied — perpetual avoidable gas.

**Severity: Low / Informational.** **Remediation:** saturate at `type(uint128).max` instead of
reverting; short-circuit tracking once `_isUnlocked(pid)` (or after launch end if volume condition met).

### I-1 — `tx.origin`-based authorization (documented limitation)

`_beforeAddLiquidity`/`_beforeSwap` use `tx.origin` for the anti-sandwich, whitelist and anti-snipe
subjects (src/TokenLaunchHook.sol:95,115,150,156). This is documented (smart-account/4337 wallets
cannot launch or trade gated pools; standard `tx.origin` phishing caveats). No change required for v1;
reconfirm the limitation is acceptable and surfaced to integrators.

### I-2 — Code hygiene

Leftover TODO comments (`// TODO think about staking`, `// Think about track after campaign finished`);
`addManyToWhitelist`/`removeManyFromWhitelist` unbounded loops (caller-paid gas, governance only —
acceptable but worth a documented length cap). Clean up before deployment.

---

## Items verified clean (no action)

- All hook callbacks are `onlyPoolManager`-guarded via BaseHook; no direct-call exposure.
- Delta accounting: hook returns zero deltas only; LP-fee override path is correct and gated on
  `isDynamicFee` at bootstrap. `decayedTax` cannot underflow (`base <= initial` enforced; `reduction <=
  initial-base`).
- `CampaignWrapper` is `nonReentrant`; uses `SafeERC20`/`forceApprove`; refunds residuals; `salt ==
  bytes32(tokenId)` convention holds (PositionManager sets it for mint/increase/decrease/burn).
- `StandardToken` clone init is one-shot and the implementation is locked in its constructor.
- Governance NFT burn protection (G3) acts as a floor under any M3 relaxation; whitelist never blocks
  removals (funds cannot be trapped by the whitelist).
- No storage-slot collisions across the diamond inheritance of `GovernanceModule`.
- BuySell tax override is one-way (`min(decayed, manual)`); taxes can only ratchet down. `MAX_TAX`
  (10%) is well under v4 `MAX_LP_FEE` (100%).

---

## Suggested remediation order (if pursued)

1. **M-2** — drop unused return-delta flags + re-mine salt (smallest, highest signal).
2. **H-1** — bootstrap authorization (design decision required; see options).
3. **M-1** — cumulative anti-snipe accounting.
4. **L-1 / L-2 / I-2** — config validation, saturating volume, tracking short-circuit, comment cleanup.

Add regression tests, notably an attacker-sets-own-`cfg.deployer` hijack test (H-1) and a multi-buy
bypass test (M-1).

**Verification:** `forge fmt --check && forge build --sizes && forge test -vvv`; for H-1/M-2 also run
`forge test --match-path test/*.fork.t.sol --fork-url mainnet`; re-confirm the mined hook address flags
match `getHookPermissions()` after any permission change.
