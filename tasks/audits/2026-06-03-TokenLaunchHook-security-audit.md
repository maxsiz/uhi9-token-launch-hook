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

**Follow-up (2026-06-04) — PoC confirmed; "require launched-token amount" hardening assessed.**
PoC: `test/TokenLaunchHook.bootstrapHijack.t.sol` (3 cases). The hijack needs **no balance of the
launched token at all** — only the *pair* asset: the attacker bootstraps the canonical pool by minting
**single-sided liquidity below the current price** (range entirely below the tick → the position needs
`currency1` only, launched-token amount = 0), and this works **through the stock `CampaignWrapper`**
(set the launched side's `amountMax = 0`), not just via a direct PositionManager call. A bare
`initialize` yields a priced-but-empty pool but captures no governance; a `liquidity == 0` mint is
rejected by PositionManager (`CannotUpdateEmptyPosition`).

Considered fix — *require the bootstrap position to contribute a non-zero launched-token amount* (reject
a range sitting entirely on the pair side of the price; computable in `_bootstrap` from `sqrtPriceNow` +
tick range + `liquidityDelta` + `tokenIsCurrency0`):
- Closes the **free** capture path and restores the invariant "you must post real launched-token
  liquidity to own the launch"; composes with the G3 gov-NFT lock so a hijack now costs the attacker
  launched-token capital locked until `launchEndTime` (and a max-tax pool traps the attacker too) →
  turns a free grief into a costly, usually irrational one. Compatible with common **token-only**
  single-sided launches; only forbids pair-only seeds.
- Does **not** fix the root cause: for an *obtainable* existing token the attacker buys dust to pass a
  `> 0` check and still front-runs; a "meaningful amount" threshold is not generically definable (the
  hook cannot know supply/decimals intent). For a non-obtainable token the launch was already safe
  (fresh-token case). **Verdict:** ship as cheap defense-in-depth, but a real fix still needs
  PoolKey-unpredictability or out-of-band deployer binding (options 1–3).

**Design decision required (2026-06-04).** There is **no permissionless fix** for H-1 on an arbitrary
*existing* token: the `PoolKey` (hence `PoolId`) is fully predictable and the unmodified ERC-20 confers
no on-chain "rightful launcher", so any first-come check (bootstrap or pre-registration alike) is
front-runnable, and the hook cannot even identify the `CampaignWrapper` (the bootstrap's `sender` is
always `PositionManager`; the wrapper is one frame above and invisible except via `hookData`). The fork:

- **A — stay permissionless (accept residual risk).** Apply the cheap `launched-token > 0` hardening
  (removes the *free* single-sided capture), and operationally rely on a fresh `fee`/`tickSpacing` per
  launch (option 3) and/or private-relay submission. H-1 is **mitigated, not closed**: a squatter who
  can obtain the existing token (or pre-target the `PoolId`) can still front-run. Keeps "one shared
  permissionless hook per chain"; no new trust, no off-chain infra, no admin role.
- **B — gate bootstrap behind a trusted signer (close H-1).** Hook stores a `LAUNCH_SIGNER`; bootstrap
  requires an off-chain signature over `(chainid, poolId, deployer, configHash, deadline)` (option 1 —
  the only realizable form, since the wrapper has no key). H-1 is **closed** for existing tokens, at the
  cost of: turning the shared hook into a **curated launchpad** (no longer permissionless), a new
  trusted key (leak ⇒ full bypass; signer downtime ⇒ liveness/censorship), an off-chain signing
  service, and key-rotation handling (immutable signer ⇒ redeploy to rotate; settable signer ⇒ adds an
  **owner** role the hook currently lacks).
- **(Option 2, pre-registration, is a strictly weaker middle ground:** permissionless and keyless, but
  the registration step is itself front-runnable for a predictable `PoolId` — it only protects tokens
  the deployer registers before any squatter, e.g. at token-deploy time.)

This is a **product/decentralization choice, not a purely technical one** — left to the project owners.
Recommended default: **A** for a permissionless v1 (cheap hardening + documented residual risk),
escalating to **B** only if a curated launch flow is acceptable.

**Decision (2026-06-04): option A — stay permissionless.** Implemented on branch
`task_012-h1-launched-token-hardening`: `_bootstrap` now reverts `ZeroLaunchedTokenLiquidity` unless the
governance mint contributes a non-zero launched-token amount (checked against the tick range vs the
init price), removing the free pair-only single-sided capture. The residual front-run risk for an
*obtainable* existing token is **accepted and documented** — deployers should launch on a fresh
`fee`/`tickSpacing` and/or via a private relay. Regression coverage:
`test/TokenLaunchHook.bootstrapHijack.t.sol`.

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

**Decision (2026-06-04): document-only — no code change.** M1 intentionally stays stateless per spec
`A6` (the per-EOA cooldown / cumulative accounting was dropped for zero-SSTORE cost). The control is
therefore re-scoped honestly: M1 is a **naive-bot speed bump** that bounds a *single* swap, not
cumulative acquisition. It does **not** stop a sniper who (1) bundles N max-buys in one tx via a
contract (constant `tx.origin`), (2) sends many txs across the window, or (3) splits across sybil EOAs.
The actual economic deterrent against early sniping in this stack is **M2's decaying buy-tax**; a
deployer wanting tighter limits should pair a small `maxBuyAmountIn` and short `antiSnipeDuration` with
M2. This residual is accepted and surfaced to integrators (spec M1 section updated to match). If a hard
cumulative cap is ever required, escalate to the per-`(pid, tx.origin)` accounting above (costs
statelessness; sybil still residual).

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

**Decision (2026-06-04): fixed.** Implemented on branch `task_015-m2-drop-returndelta-flags`. Both flags
set to `false` in `getHookPermissions()` and dropped from `HookDeployLib.hookFlags()`; the test base's
mining flags were updated in lockstep (all three must match or `BaseHook`'s constructor
`validateHookAddress` reverts). No salt artifact is stored — both `DeployStack` and the tests mine via
`HookMiner.find` at runtime, so the re-mine is automatic. `_beforeSwap`/`_afterSwap` already returned
zero, so no callback code changed. Full suite green (120 passed). v2 (M6/M7/M8) re-adds the flags in its
own fresh deployment, which non-upgradeability requires regardless.

### L-1 — Misconfigured M3 lock can permanently trap the deployer's own LP

**Where:** `LiquidityLockMechanism` + `onlyGovernance` time gate.

Governance relaxations (`relaxUnlockTime`, `disable*`, `switchToOr`) are gated by `onlyGovernance`,
which reverts once `block.timestamp >= launchEndTime`. An AND-logic lock with an unreachable volume
threshold and far-future `unlockTime` becomes **permanently** unsatisfiable after launch end, with no
path to relax it. Self-inflicted (deployer's own config and own funds), but a sharp foot-gun.

**Severity: Low.** **Remediation:** validate at init that an AND lock is satisfiable, or allow
post-launch relaxation, or clearly document the irreversibility.

**Decision (2026-06-04): document-only.** Implemented on branch `task_016-l1-doc-l2-volume-fix`. Rationale
for not changing code: (a) the only configs that trap *permanently* are those whose unlock **requires**
the volume condition (`volume-only`, or `AND` with `volumeEnabled`) with an unreachable threshold — time
always eventually passes; (b) "allow post-launch relaxation" is rejected — it would let a deployer who
promised a long lock pull liquidity right after `launchEndTime`, breaking the trader-facing post-launch
freeze (a rug vector); (c) "validate satisfiability at init" can bound `unlockTime` but **cannot** judge
volume reachability (depends on future trading), so it doesn't actually fix the `AND`+volume trap without
forbidding the feature; (d) the harm is purely self-inflicted (the deployer's own LP — locked liquidity
is, if anything, pro-trader), making a feature-restricting structural fix disproportionate for a Low.
A `@dev` warning was added to `_initLock` and a deployer-facing note to the spec (M3); recommend `OR`+time
with volume as an early-release bonus.

### L-2 — `cumulativeVolume` overflow reverts `_afterSwap` → swap DoS; and tracking never stops

**Where:** `LiquidityLockMechanism._trackVolume` (src/mechanisms/LiquidityLockMechanism.sol:90-94);
`TokenLaunchHook._afterSwap` (src/TokenLaunchHook.sol:170, see the `// Think about track after campaign
finished` TODO).

`cumulativeVolume += absVol` is checked `uint128` math; for very-high-volume / huge-supply tokens an
overflow would revert `afterSwap` and block all swaps. Separately, volume is SSTORE'd on **every** swap
for the pool's lifetime even after the lock is satisfied — perpetual avoidable gas.

**Severity: Low / Informational.** **Remediation:** saturate at `type(uint128).max` instead of
reverting; short-circuit tracking once `_isUnlocked(pid)` (or after launch end if volume condition met).

**Decision (2026-06-04): fixed.** Implemented on branch `task_016-l1-doc-l2-volume-fix`. `_trackVolume`
now: (1) returns early when `!volumeEnabled` (time-only locks never track — no perpetual SSTORE); (2)
returns early once `cumulativeVolume >= unlockVolumeThreshold` (bounds growth — the gas win and a natural
overflow guard); (3) computes the add in `uint256` and **saturates** at `type(uint128).max` instead of
the checked `+=`, so an overflow can never revert `_afterSwap` / DoS swaps. Chose the threshold
short-circuit over `_isUnlocked` (simpler, and the only case where volume keeps growing is an unmet
threshold). Regressions added to `test/mechanisms/LiquidityLockMechanism.t.sol`
(`test_volume_notTracked_whenVolumeDisabled`, `_stopsAccumulating_afterThresholdMet`,
`_saturates_insteadOfOverflowRevert`). Full suite green (123 passed).

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
