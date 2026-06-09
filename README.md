# TokenLaunchHook — Coding Spec

[![tests](https://img.shields.io/badge/tests-147%20passing-2ea44f)](https://github.com/maxsiz/uhi9-token-launch-hook/actions/workflows/test.yml)
[![live studio](https://img.shields.io/badge/live%20studio-online-3b82f6)](https://uhi9-token-launch-hook.vercel.app/)
[![presentation](https://img.shields.io/badge/presentation-deck-ff007a)](https://iber.dev/uhi9-token-launch-hook)
![demo video](https://img.shields.io/badge/demo%20video-coming%20soon-9ca3af)

V4 hook attached to a newly launched token's pool. Enforces fair-launch rules (anti-snipe, dynamic LP fee tax, conditional liquidity lock, whitelist phase) without modifying the ERC-20 token contract. Single hook deployment per chain serves all launches.

## Hackathon submission

- 🌐 **Live studio** — <https://uhi9-token-launch-hook.vercel.app/>
- 🖥️ **Presentation** — <https://iber.dev/uhi9-token-launch-hook>
- 🎬 **Demo video** — _coming soon_

**147 tests green** — unit · fuzz · mainnet-fork. Live on **Ethereum**, **Unichain** & **Unichain Sepolia**. See [`web/`](web/) for the Studio dApp and [`presentation/`](presentation/) for the deck.

## Deployed contracts

One shared, non-upgradeable stack per chain. `Permit2` is canonical everywhere
(`0x000000000022D473030F116dDEE9F6B43aC78BA3`).

### Ethereum mainnet

| Contract | Address |
|---|---|
| TokenLaunchHook | [`0x0b93309f6b6e404769de885dac66cb357ad30ac0`](https://etherscan.io/address/0x0b93309f6b6e404769de885dac66cb357ad30ac0) |
| CampaignWrapper | [`0x205549bcb010d429354aabc2cae057b090bcf5b8`](https://etherscan.io/address/0x205549bcb010d429354aabc2cae057b090bcf5b8) |
| TokenFactory | [`0xa373fbacd0964fcb7bc01cb447a2f25f11e8995b`](https://etherscan.io/address/0xa373fbacd0964fcb7bc01cb447a2f25f11e8995b) |
| CampaignLens | [`0xf8da8dc6d8cdcadcc96b51d5fc0cb59ef3672005`](https://etherscan.io/address/0xf8da8dc6d8cdcadcc96b51d5fc0cb59ef3672005) |

### Unichain

| Contract | Address |
|---|---|
| TokenLaunchHook | [`0xd5ca99907f2db792dcd4865e7d12df5f71874ac0`](https://uniscan.xyz/address/0xd5ca99907f2db792dcd4865e7d12df5f71874ac0) |
| CampaignWrapper | [`0xcc20f7c7763ef77703a552e75e27ceaea99dc8cb`](https://uniscan.xyz/address/0xcc20f7c7763ef77703a552e75e27ceaea99dc8cb) |
| TokenFactory | [`0x653bce4d7a6cf5c4fdbbd5fc6b2bb41c8eafc56a`](https://uniscan.xyz/address/0x653bce4d7a6cf5c4fdbbd5fc6b2bb41c8eafc56a) |
| CampaignLens | [`0x22bbbe241464ab67c9b4f0881fa45f7f2d26870f`](https://uniscan.xyz/address/0x22bbbe241464ab67c9b4f0881fa45f7f2d26870f) |

### Unichain Sepolia (testnet)

| Contract | Address |
|---|---|
| TokenLaunchHook | [`0x79880abb0c03233e40b87452e7a45abd96ab0ac0`](https://sepolia.uniscan.xyz/address/0x79880abb0c03233e40b87452e7a45abd96ab0ac0) |
| CampaignWrapper | [`0x0ae47666b31fe6e684c381cbea7a80748682d575`](https://sepolia.uniscan.xyz/address/0x0ae47666b31fe6e684c381cbea7a80748682d575) |
| TokenFactory | [`0x41cb3079a635bc11183c188281b8db14e4c57f9a`](https://sepolia.uniscan.xyz/address/0x41cb3079a635bc11183c188281b8db14e4c57f9a) |
| CampaignLens | [`0x5a94af1fad259528c8825f254c3d1f85e7896e9e`](https://sepolia.uniscan.xyz/address/0x5a94af1fad259528c8825f254c3d1f85e7896e9e) |

<sub>Source of truth: [`web/lib/config/contracts.generated.ts`](web/lib/config/contracts.generated.ts) (generated from Foundry broadcasts). Not yet deployed on Base / Arbitrum.</sub>

## Build & test

Foundry project (solc 0.8.26, EVM `cancun`, `ffi = true`). Dependencies are git submodules and are
**not** vendored — fetch them once after a fresh clone:

```bash
forge install                  # or: git submodule update --init --recursive
forge build                    # compile
forge build --sizes            # compile + contract sizes (matches CI)
forge fmt --check              # formatting gate (CI fails on diff)
forge test -vvv                # full suite (CI command)
```

The default `forge test` run is fully offline: the mainnet-fork suite (`test/TokenLaunchHook.fork.t.sol`)
**skips itself** when no RPC is configured, so the unit/integration tests stay green without network
access.

## Running the fork tests

`test/TokenLaunchHook.fork.t.sol` exercises the whole stack against the **live, canonical Uniswap v4
contracts** on a mainnet fork (real `PoolManager`, `PositionManager`, and `Permit2`). It deploys only
the project's own contracts (the hook at a mined CREATE2 flag-address, `TokenFactory`,
`CampaignWrapper`, plus a `PoolSwapTest` router) and wires them to the forked deployments. The four
tests cover:

| Test | What it verifies on the live fork |
|------|-----------------------------------|
| `test_fork_deployStack_hookAddressHasValidFlags` | Mined hook address carries the exact permission-flag bits; bound `PoolManager`/`PositionManager` match the canonical registry and have code. |
| `test_fork_launchCampaign_endToEnd` | A full atomic launch through `CampaignWrapper.launchCampaign` against the real `PositionManager.multicall`; governance NFT captured and delivered to the recipient. |
| `test_fork_swap_appliesTaxAndAntiSnipe` | Dynamic buy tax applied via the LP-fee override, and an oversized buy rejected by anti-snipe — enforced on a real-`PoolManager` swap. |
| `test_fork_removeLiquidity_blockedThenUnlocked` | Governance-NFT liquidity is locked during the launch window and releasable after it, via the real `PositionManager`. |

### How the RPC is resolved

The suite reads the `mainnet` endpoint from `foundry.toml` (`[rpc_endpoints] mainnet = "${ENVELOP_MAINNET}"`).
If that endpoint is empty/unset, every fork test is **skipped** (reported as `skipped`, not failed). So
the only thing you need to actually run them is to point `ENVELOP_MAINNET` at any mainnet RPC.

### Commands

```bash
# 1) Provide a mainnet RPC via the env var the `mainnet` endpoint expands to.
export ENVELOP_MAINNET="https://your-mainnet-rpc"      # Alchemy/Infura/QuickNode/public node, etc.

# Run just the fork suite (the test forks internally via vm.createSelectFork):
forge test --match-path test/TokenLaunchHook.fork.t.sol -vvv

# A single fork test:
forge test --match-test test_fork_launchCampaign_endToEnd -vvv

# 2) Equivalent one-liner without exporting:
ENVELOP_MAINNET="https://your-mainnet-rpc" \
  forge test --match-path test/TokenLaunchHook.fork.t.sol -vvv
```

Notes:
- The test calls `vm.createSelectFork("mainnet")` itself, so the `--fork-url` flag is optional; what
  matters is that `ENVELOP_MAINNET` resolves to a working endpoint.
- A public node works for a quick check (e.g. `https://ethereum-rpc.publicnode.com`); a keyed RPC is
  more reliable under load.
- Without `ENVELOP_MAINNET` set you'll see `4 skipped` — that is expected, not a failure.

## Deployment

One-time, once-per-chain deploy of the stack (`TokenLaunchHook` + `CampaignWrapper` + `TokenFactory`).
The hook must live at an address whose low bits encode its permission flags, so it is deployed via a
**mined CREATE2 salt**. Canonical v4 addresses for Mainnet / Base / Arbitrum / Unichain are baked into
`HookDeployLib` (in `script/MineSalt.s.sol`) and selected by `block.chainid`; any of
`POOL_MANAGER` / `POSITION_MANAGER` / `PERMIT2` env vars override the registry.

```bash
# Preview the mined salt + predicted hook address for a chain (no broadcast):
forge script script/MineSalt.s.sol --sig "run()" --chain 1

# Dry-run the full deploy (simulation only):
forge script script/DeployStack.s.sol --sig "run()" --rpc-url mainnet

# Broadcast for real:
forge script script/DeployStack.s.sol --sig "run()" --rpc-url mainnet --broadcast --verify

# On an unsupported chain, or to override, supply addresses via env:
POOL_MANAGER=0x... POSITION_MANAGER=0x... \
  forge script script/DeployStack.s.sol --sig "run()" --rpc-url <chain> --broadcast
```

`DeployStack` asserts post-deploy that the hook landed at the predicted address with the correct flag
bits. Both core contracts are non-upgradeable — a new version is a fresh deploy at a new address.