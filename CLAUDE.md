# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Always check & use the Uniswap SKILL that you have.
Full build spec (the implementation target) lives in `./tasks/TokenLaunchHook.md`.

## Project

A single Uniswap **v4 hook** (`TokenLaunchHook`) that enforces fair-launch rules — anti-snipe, dynamic
LP-fee tax, conditional liquidity lock, whitelist phase — for newly launched token pools, without
modifying the ERC-20 itself. One hook deployment per chain serves every launch. Currently only a
permissions stub exists in `src/TokenLaunchHook.sol`; `tasks/TokenLaunchHook.md` is the finalized spec
to build against.

## Commands

Foundry project (solc 0.8.26, EVM `cancun`, `ffi = true`).

```bash
# One-time / after a fresh clone — dependencies are git submodules and are NOT vendored.
# A build fails until these are present.
forge install                      # or: git submodule update --init --recursive

forge build                        # compile
forge build --sizes                # compile + contract sizes (matches CI)
forge fmt                          # format (CI runs `forge fmt --check` and fails on diff)
forge test -vvv                    # run all tests (CI command)

forge test --match-test <name>     # run a single test by name
forge test --match-contract <C>    # run one test contract
forge test --match-path test/mechanisms/AntiSnipeMechanism.t.sol   # one file

# Fork tests need an RPC; endpoints/keys come from env (see foundry.toml [rpc_endpoints]/[etherscan]).
forge test --match-path test/*.fork.t.sol --fork-url mainnet
```

CI (`.github/workflows/test.yml`) runs, in order: `forge fmt --check`, `forge build --sizes`,
`forge test -vvv`. It sets `FOUNDRY_PROFILE=ci`, but there is no `[profile.ci]` in `foundry.toml`,
so it resolves to `[profile.default]`.

## Dependencies & remappings

- Two submodules: `lib/forge-std` and `lib/v4-hooks-public` (`Uniswap/v4-hooks-public`).
- **Everything else is nested inside `lib/v4-hooks-public`** — v4-core, v4-periphery, openzeppelin,
  permit2, solady, etc. `remappings.txt` is what wires the friendly names to those nested paths, e.g.
  `@uniswap/v4-core/` → `lib/v4-hooks-public/lib/v4-core/`,
  `@openzeppelin/contracts/` → `lib/v4-hooks-public/lib/openzeppelin-contracts/contracts/`,
  `v4-hooks-public/` → `lib/v4-hooks-public/`.
- When adding imports, prefer the remapped prefixes already used in `src/TokenLaunchHook.sol`
  (`v4-hooks-public/src/base/BaseHook.sol`, `@uniswap/v4-core/...`).
- Lint note: `foundry.toml [lint]` disables the screaming-snake-case lints — immutables and constants
  intentionally use `SCREAMING_SNAKE_CASE`.

## Task workflow (from AGENTS.md)

- Task specs live in `tasks/`, named `task_NNN.md` (first 3 chars are digits).
- Before starting, **ask the user which task file** to work on.
- Convert the leading 3 digits to an integer and tag commits `#<number>` (e.g. `task_001.md` → `#1`).
- Solve each task on a **new branch**.

## Architecture (target design — see tasks/TokenLaunchHook.md)

Three contracts deployed **once per chain**:

- **`TokenLaunchHook`** — the single shared hook attached as `key.hooks` for every launch. Inherits
  `BaseHook` (unchanged) plus the mechanism modules. All per-launch state lives in
  `mapping(PoolId => ...)`, so one allowlisted hook address serves all pools. Submitted to Uniswap's
  custom-accounting allowlist once (this is why it is shared, not cloned per launch).
- **`CampaignWrapper`** — stateless coordinator. `launchCampaign(params, permitData)` does the whole
  launch atomically via `PositionManager.multicall([initializePool, modifyLiquidities([MINT_POSITION])])`,
  passing module configs in `hookData`.
- **`TokenFactory` (+ `StandardToken`)** — optional EIP-1167 cloner for deployers without an existing
  ERC-20. Independent of the hook.

Key mechanics:
- **First mint per pool bootstraps the campaign.** `_beforeAddLiquidity` decodes `hookData` into the
  per-module config, captures the first LP NFT as the **governance NFT**, and stores campaign state.
- **`salt == bytes32(tokenId)` convention** (verified against PositionManager) — `uint256(params.salt)`
  in any liquidity callback yields the LP NFT's tokenId, which is how the gov NFT is identified.
- **Governance** is NFT-ownership based: `onlyGovernance(pid)` checks `IERC721(POSM).ownerOf(tokenId)`.
  Mutable params can only be relaxed (taxes ratchet down, locks shorten) and only before `launchEndTime`.

### Modular mechanisms

Each launch mechanic is a self-contained **abstract contract** that the hook inherits; per-pool
`EnabledMechanisms` flags (set once at bootstrap, immutable) decide which run. The hook orchestrates
dispatch in each callback. Planned layout: `src/mechanisms/<Name>Mechanism.sol`, one test per module in
`test/mechanisms/<Name>Mechanism.t.sol`.

| Module | Callback(s) used |
|--------|------------------|
| `GovernanceModule` | `beforeAddLiquidity` (bootstrap) + `beforeRemoveLiquidity` (gov-NFT burn protection) |
| M1 `AntiSnipeMechanism` | `beforeSwap` — caps buy size during launch window (stateless) |
| M2 `BuySellTaxMechanism` | `beforeSwap` — asymmetric tax via dynamic LP fee, linear decay |
| M3 `LiquidityLockMechanism` | `beforeRemoveLiquidity` (conditional unlock) + `afterSwap` (volume tracking) |
| M5 `WhitelistPhaseMechanism` | `beforeSwap` + `beforeAddLiquidity` — gated access until end time |

Each module keeps its own `mapping(PoolId => ...)` storage (distinct slots, no collision). Hook
permission flags (in `getHookPermissions()`) reserve `beforeSwapReturnDelta`/`afterSwapReturnDelta` for
future v2 modules even though v1 doesn't use them — they are part of the mined CREATE2 address.

### Deployment

The hook address must encode its permission flags in specific bits, so deploy via a **mined CREATE2
salt** (`script/MineSalt.s.sol` → `script/DeployStack.s.sol` per the spec). Both core contracts are
**non-upgradeable**: a new version means a new deployment, not a proxy upgrade.
