# task_020 — CampaignWrapper: on-chain auto-priced launch for fresh-ERC20 + ERC-20 pair

## Problem

`CampaignWrapper.launchCampaign(CampaignParams, bytes)` takes fully pre-computed, orientation-dependent
params (`sqrtPriceInit`, `tickLower/tickUpper`, `liquidity`, `amount0Max/amount1Max`). For a **fresh
token paired with an ERC-20**, the frontend can't compute those before the launch tx — the token's
address (hence the currency0/currency1 ordering the price depends on) isn't known until the factory
deploys it. So the UI pre-deploys the token in a *separate* transaction, defeating the "launch in one
transaction" design (the wrapper already deploys the token internally for `existingToken == 0`).

Native-ETH pairs don't have this problem (ETH = currency0 always), and existing tokens already know
their address — both are already single-tx.

## Goal (backward-compatible, contract-only)

Add a **second `launchCampaign` overload** for the fresh-ERC20 + ERC-20-pair case that computes the
orientation-dependent params **on-chain** after deploying the token and sorting currencies, so the
launch is a single transaction. Do **not** change the existing `launchCampaign(CampaignParams, bytes)`
(same selector/ABI — the live frontend and deployed wrappers keep working). No redeploy in this task;
frontend integration is a later task.

## Implementation

- **`src/lib/PoolMath.sol`** (new internal lib):
  - `sqrtPriceX96From(amount1, amount0)` = `sqrt(amount1 * 2^192 / amount0)` via v4-core `FullMath.mulDiv`
    + OZ `Math.sqrt` — identical to the v3-sdk `encodeSqrtRatioX96(amount1, amount0)` the frontend uses.
  - `alignRange(currentTick, rangeTicks, spacing)` — spacing-aligned range bracketing the price; `0`
    ⇒ full range. (solady's remapping is broken, hence OZ `Math.sqrt`.)
- **`src/CampaignWrapper.sol`**:
  - Refactor the launch body into `internal _launch(ResolvedLaunch, LaunchConfig, permitData)`; the
    existing public method becomes a thin wrapper that fills `ResolvedLaunch` from `CampaignParams`.
  - New `struct AutoLaunchParams { tokenConfig, pairToken, fee, tickSpacing, rangeTicks, seedTokenAmount,
    seedPairAmount, lpRecipient, launchConfig }` and overload
    `launchCampaign(AutoLaunchParams, bytes)` (non-payable; `pairToken != 0` required). It deploys the
    token to the wrapper, sorts, maps the seed amounts by orientation, computes
    `sqrtPriceInit`/`ticks`/`liquidity` (caps = the seed amounts), and calls `_launch`. The launched
    token is minted to the wrapper → only the **pair** is pulled via Permit2 (1 signature detail).

## Acceptance

- `forge build --sizes` (wrapper < 24 KB), `forge fmt --check`, `forge test` all green.
- New tests: `test/lib/PoolMath.t.sol` (sqrt/align, both amount orderings, fuzz) and the auto overload in
  `test/CampaignWrapper.t.sol` covering **both orientations** (token < pair and token > pair, forced via
  a predicted clone address), the Permit2-signature pair pull, and the native-pair rejection. The
  existing `CampaignParams` path stays green (regression).

## Out of scope

Contract redeploy and frontend wiring (the UI may adopt this overload for fresh-ERC20 launches later).
