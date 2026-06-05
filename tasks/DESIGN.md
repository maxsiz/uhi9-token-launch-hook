# DESIGN.md — Web3 Frontend for the TokenLaunchHook System

> **Status:** Specification. Implementation target for a `web/` frontend.
> **Scope:** Launch Wizard + Governance Dashboard. Wallets: MetaMask + Rabby. Deploy: Vercel.
> **Companion spec:** on-chain design lives in [`TokenLaunchHook.md`](./TokenLaunchHook.md).

---

## 1. Context & Goals

The on-chain system (built, tasks 001–009) is three contracts deployed once per chain:

- **`TokenLaunchHook`** — the shared Uniswap v4 hook; per-pool state in `mapping(PoolId => ...)`.
- **`CampaignWrapper`** — stateless coordinator; the **single entry point** for a launch.
- **`TokenFactory` (+ `StandardToken`)** — optional ERC-20 cloner.

The frontend is the missing off-chain piece called for in `TokenLaunchHook.md`
("Off-chain components"). It must let a deployer:

1. **Launch a campaign in one atomic transaction** via `CampaignWrapper.launchCampaign(...)`
   — choose/deploy a token, set the pool price + seed liquidity, pick fair-launch
   mechanisms via a preset, review, and sign **one** transaction.
2. **Manage a launch post-deployment** via the governance NFT — relax taxes, shorten/disable
   the liquidity lock, manage the whitelist — all gated to the NFT owner during the active phase.

Design priority: **simple, correct, gas-safe.** The UI mirrors every contract invariant
client-side so users never sign a transaction that will revert.

### This is a demo for the hook

A second, equally important goal: the frontend is a **live demonstration of `TokenLaunchHook`**.
Every feature must visibly state **which hook functionality it exercises** — the specific hook
callback (`_beforeAddLiquidity`, `_beforeSwap`, `_afterSwap`, `_beforeRemoveLiquidity`) and the
mechanism module behind it. A user (or an evaluator) should be able to look at any control and
understand *what the hook does at that moment on-chain*. This is realized as a cross-cutting
**Hook Transparency Layer** (§5) wired into the wizard, the dashboard, and every transaction
trace. The UI is never a black box over the contract — it is a guided tour of it.

### Critical constraint: EOA-only launch

`launchCampaign` requires `tx.origin == msg.sender == cfg.deployer` (anti-sandwich check in the
hook bootstrap). **Smart-contract wallets (Safe, ERC-4337) cannot launch.** The wizard must
detect contract-code at the connected address and block the launch flow with a clear message.
(Governance actions are *not* EOA-gated — only the launch is.)

---

## 2. Tech Stack

### Framework: Next.js (App Router) — recommended

| Factor | Next.js App Router | Vite SPA |
|---|---|---|
| Vercel integration | First-class, zero-config | Static target, works fine |
| Per-route metadata (title/favicon/OG) | Native `metadata` export | Manual (`react-helmet`) |
| Route code-splitting | Automatic | Manual |
| Server-side RPC proxy (hide paid RPC keys) | Trivial Route Handler `/app/api/rpc` | Needs a separate function |
| Build-time codegen from broadcast JSON | Native (prebuild step) | Same |

All wallet/contract components are `"use client"`. SSR is used only for the static shell +
metadata. Next gives the smoothest Vercel deploy and an optional server RPC proxy.

### Libraries (pin in `package.json`)

| Package | Version | Role |
|---|---|---|
| `next` | `^14` | App framework (App Router) |
| `wagmi` | `^2` | React hooks for accounts/chains/contracts |
| `viem` | `^2` | Encoding, `simulateContract`, reads, EIP-712 typed-data |
| `@rainbow-me/rainbowkit` | `^2` | Connect button + modal; **auto-detects MetaMask & Rabby via EIP-6963** |
| `@uniswap/v4-sdk` | `^1` | `Pool`, `Position`, `TickMath`, `encodeSqrtRatioX96`, `nearestUsableTick` |
| `@uniswap/sdk-core` | `^5` | `Token`, `Ether`, `CurrencyAmount`, `Price` |
| `@tanstack/react-query` | `^5` | Read caching (wagmi peer dep) |
| `react-hook-form` + `@hookform/resolvers` | latest | Multi-step wizard form state |
| `zod` | latest | Validation schema mirroring contract reverts |
| `tailwindcss` | `^3` | Styling |

**Wallets:** MetaMask and Rabby are both injected EIP-1193 providers discovered through
**EIP-6963**. wagmi's multi-injected discovery + RainbowKit surface both automatically with **no
per-wallet configuration**. WalletConnect (mobile) is optional but requires a project id.

**Permit2:** hand-rolled EIP-712 via `viem.signTypedData` (the `PermitBatch` typed-data is small
and stable) — avoids a heavier SDK dependency. See §4.4.

---

## 3. App Structure / Routes

```
web/
  app/
    layout.tsx                 # html shell, <Providers>, global metadata (title/favicon/OG)
    page.tsx                   # landing: explain, pick chain, CTA → /launch | /governance
    providers.tsx              # "use client": WagmiProvider, QueryClientProvider, RainbowKitProvider
    launch/page.tsx            # Launch Wizard host (step machine)
    governance/page.tsx        # Governance Dashboard (pool lookup + actions)
    api/rpc/route.ts           # OPTIONAL server-side RPC proxy (keeps paid RPC keys off client)
  components/
    ConnectGate.tsx            # Connect / wrong-chain / SCW-warning gating around onchain actions
    ChainSwitchGuard.tsx       # ensure active chain ∈ supported; offer switchChain
    wizard/
      WizardShell.tsx          # step indicator, next/back, persists form state (sessionStorage)
      Step1Token.tsx           # deploy-new (name/symbol/totalSupply) vs existing token address
      Step2Pool.tsx            # pair (ETH/ERC20), price P, seed amounts, range → SDK math
      Step3Mechanisms.tsx      # preset selector + per-module config (conditional fields)
      Step4Review.tsx          # human-readable summary + simulateContract result + gas
      Step5Sign.tsx            # (approve→permit if needed) → simulate → write → tx lifecycle
    governance/
      PoolLookup.tsx           # PoolId input OR token+pair+fee+tickSpacing → derive PoolId
      PhaseBadge.tsx           # Pre / Active / Frozen from launchPhaseOf
      OwnerGuard.tsx           # render write actions only if connected == governanceOwnerOf
      TaxPanel.tsx             # effective/initial/base tax; setBuyTaxOverride/setSellTaxOverride
      LockPanel.tsx            # lockConfigOf + relax/disable/switchToOr; isUnlocked + volume
      WhitelistPanel.tsx       # whitelistConfigOf + add/addMany/remove/relaxEnd; isAddressWhitelisted
    hook/                      # DEMO: Hook Transparency Layer (§5)
      HookBadge.tsx            # small chip: callback + mechanism a control exercises
      HookExplainer.tsx        # popover: what the hook does for this control, on-chain
      HookCallTrace.tsx        # post-TX: which callbacks fired + decoded effect (events)
      HookActivityPanel.tsx    # dashboard: live per-pool hook state read from views
    ui/
      Button.tsx               # idle/disabled/simulating/awaiting-signature/pending/success/error
      Address.tsx              # 0x1234…abcd + copy + explorer link
      Amount.tsx               # human units ↔ wei; tax % ↔ V4 units
      TxToast.tsx              # submitted → confirmed/reverted with decoded reason
  lib/
    config/
      abi/                     # COMMITTED trimmed ABIs (so Vercel build needs no Foundry)
        CampaignWrapper.json
        TokenLaunchHook.json
        Permit2.json
        ERC20.json
      contracts.generated.ts   # GENERATED per-chain {hook, wrapper, factory} addresses
      uniswap.ts               # canonical PoolManager/PositionManager per chain + Permit2 (mirror of HookDeployLib)
      chains.ts                # supported chains [1,8453,42161,130] + viem chains + fallback transports
    campaign/
      priceMath.ts             # v4-sdk: P + seed + range → sqrtPriceInit / ticks / liquidity / amountMax
      buildParams.ts           # human inputs → CampaignParams nested struct
      permit2.ts               # allowance check → nonce → PermitBatch sign → encode (PermitBatch,bytes)
      poolId.ts                # PoolId = keccak256(abi.encode(PoolKey)) for governance lookup
    validation/
      launchSchema.ts          # zod rules mirroring contract reverts (§7)
    hook/
      hookMap.ts               # DEMO: feature → {callback, mechanism, doc} mapping (§5)
    format.ts                  # truncateAddress, formatUnits/parseUnits wrappers, taxToPercent
  scripts/
    gen-contracts.ts           # prebuild: read broadcast JSON → contracts.generated.ts
  public/                      # favicon, og-image.png
  next.config.mjs
  package.json
  .env.local.example
```

### Where ABIs & addresses come from

`out/` (Foundry build) **is gitignored**, so the Vercel build must not depend on it. Two pieces:

1. **ABIs — committed, trimmed.** Copy the needed ABIs from `out/{C}.sol/{C}.json` into
   `web/lib/config/abi/` and commit them (`CampaignWrapper`, `TokenLaunchHook`, plus a minimal
   `Permit2` and `ERC20`). The Vercel build then needs **no Foundry toolchain**. Keep them in sync
   with a check-in step when contracts change.

2. **Deployed addresses — generated.** `scripts/gen-contracts.ts` runs as `"prebuild"` and reads
   `broadcast/DeployStack.s.sol/{chainId}/run-latest.json`, parsing `transactions[]` for
   `contractName ∈ {TokenLaunchHook, CampaignWrapper, TokenFactory}` → `contractAddress`. It emits:

   ```ts
   // web/lib/config/contracts.generated.ts (generated — do not edit)
   export const CONTRACTS = {
     1:     { hook: "0x…", wrapper: "0x…", factory: "0x…" },
     8453:  { hook: "0x…", wrapper: "0x…", factory: "0x…" },
     42161: { hook: "0x…", wrapper: "0x…", factory: "0x…" },
     130:   { hook: "0x…", wrapper: "0x…", factory: "0x…" },
   } as const;
   ```

   (Broadcast JSON for prod chains is committed; local chain 31337 is gitignored — never deployed to Vercel.)

3. **Canonical Uniswap + Permit2 — hardcoded** in `uniswap.ts`, mirroring
   `script/MineSalt.s.sol` `HookDeployLib.canonical()` (see Appendix B):

   ```ts
   export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const; // all chains
   ```

---

## 4. State / Data Flow

### 4.1 Form state

`react-hook-form` holds one form object across wizard steps; `WizardShell` persists it in
`sessionStorage` so a mid-wizard refresh doesn't wipe inputs. A zod resolver (`launchSchema.ts`)
validates per step before "Next" is enabled.

### 4.2 Price / tick / liquidity math (`lib/campaign/priceMath.ts`)

Human inputs → on-chain `uint`s, using the v4 SDK:

1. Build `sdk-core` `Token` for the launched token (18 decimals for new `StandardToken`s) and
   `Token`/`Ether` for the pair.
2. `sqrtPriceInit = encodeSqrtRatioX96(amount1, amount0)` per the v4 `currency1/currency0`
   convention. The wrapper forces `cfg.expectedInitialSqrtPrice = params.sqrtPriceInit`, so the
   frontend sets **only** `sqrtPriceInit`.
3. `tickSpacing`: chosen per fee tier (sane default 60). Bounds:
   `tickLower/tickUpper = nearestUsableTick(TickMath.getTickAtSqrtRatio(boundSqrt), tickSpacing)`.
4. `liquidity = Position.fromAmounts({ pool, tickLower, tickUpper, amount0, amount1, useFullPrecision: true }).liquidity`.
5. `amount0Max/amount1Max = position.mintAmountsWithSlippage(tolerance)` cast to `uint128`.

**New-token orientation caveat.** The wrapper sorts currencies by address
(`uint160(tokenAddr) < uint160(pairToken)`), but a *new* token's address isn't known until the
factory clones it inside the same TX — so the client cannot pre-sort by real address. Mitigation:
the wrapper **sweeps residual funds back to the deployer** (`SWEEP` actions + `_refund`), so the
frontend can set `amount0Max`/`amount1Max` with generous slippage headroom and rely on the refund
for the unused remainder. Present price/amounts in human token/pair terms; don't expose raw
orientation to the user.

### 4.3 Building `CampaignParams` (`lib/campaign/buildParams.ts`)

Assemble the nested struct matching `CampaignWrapper.CampaignParams` (Appendix A). **The frontend
does not encode `hookData`** — `launchCampaign` calls `MechanismConfig.encode(cfg)` internally, so
the frontend supplies `launchConfig` inside `CampaignParams` and lets viem ABI-encode the whole
tuple from the contract ABI on `writeContract`.

Leave wrapper-injected fields zero/false — the wrapper overwrites them:

| Field | Frontend sets | Why |
|---|---|---|
| `launchConfig.deployer` | `0x0` | wrapper sets `= msg.sender` |
| `launchConfig.tokenIsCurrency0` | `false` | wrapper sets from PoolKey sorting |
| `launchConfig.expectedInitialSqrtPrice` | `0` | wrapper sets `= params.sqrtPriceInit` |
| `fee` | `0x800000` if tax enabled, else static fee | dynamic-fee flag required by tax module |
| `lpRecipient` | connected address (default; editable) | receives the governance NFT |

### 4.4 Permit2 flow (`lib/campaign/permit2.ts`)

- **No signature (empty `permitData = 0x`)** when launching a **fresh token + native-ETH pair**:
  the new token is minted into the wrapper, ETH is forwarded as `msg.value`, nothing is pulled.
  Single `launchCampaign` write with `value = ETH seed`. This is the happy path.
- **Permit2 `PermitBatch`** when an ERC-20 must be pulled (existing token, or ERC-20 pair):
  1. Ensure `ERC20.allowance(owner, PERMIT2) ≥ amount`; if not, one-time `ERC20.approve(PERMIT2, max)` tx.
  2. Read Permit2 nonce via `allowance(owner, token, spender = wrapper)` → `(amount, expiration, nonce)`.
  3. Build `PermitBatch` (per token: `amount = amountMax`, `expiration`, `nonce`; `spender = wrapper`, `sigDeadline`).
  4. `signTypedData` with domain `{ name: "Permit2", chainId, verifyingContract: PERMIT2 }`.
  5. `permitData = encodeAbiParameters([PermitBatch tuple, "bytes"], [permitBatch, signature])`
     — must match `abi.decode(permitData, (IAllowanceTransfer.PermitBatch, bytes))` in the wrapper.

### 4.5 Simulate → write → lifecycle (`Step5Sign.tsx`)

1. **Always** `publicClient.simulateContract({ address: wrapper, abi, functionName: "launchCampaign", args: [params, permitData], value, account })` first. Decode custom errors
   (`TaxRequiresDynamicFee`, `CaptureFailed`, `NFTNotDelivered`, …) into human-readable messages.
2. On success → `writeContract` using the simulated request.
3. Lifecycle: `awaiting-signature` → `submitted (hash)` → `useWaitForTransactionReceipt` →
   `confirmed`/`reverted`. Parse the `CampaignLaunched` event for `pid` + `governanceTokenId`, then
   deep-link to `/governance?pool=<pid>`.

### 4.6 Governance reads/writes

- `poolId.ts` derives `PoolId = keccak256(abi.encode(PoolKey))` for lookups; the simpler default
  is to carry the `pid` from the launch event directly into the dashboard link.
- **Reads** (`readContract` on hook): `launchPhaseOf`, `governanceOwnerOf`,
  `effectiveBuyTaxOf`/`effectiveSellTaxOf`, `taxConfigOf`, `lockConfigOf`, `isUnlocked`,
  `cumulativeVolumeOf`, `whitelistConfigOf`, `isAddressWhitelisted`.
- **Writes** (gated by `OwnerGuard`: connected == `governanceOwnerOf(pid)` **and** phase == Active):
  `setBuyTaxOverride`/`setSellTaxOverride`, `relaxUnlockTime`/`relaxUnlockVolume`/
  `disableTimeCondition`/`disableVolumeCondition`/`switchToOr`,
  `addToWhitelist`/`addManyToWhitelist`/`removeFromWhitelist`/`relaxWhitelistEndTime`. Same
  simulate→write→receipt pattern, then refetch reads.

---

## 5. Hook Transparency Layer (Demo)

This is what makes the app a **demo for the hook**: every feature is annotated with the exact hook
functionality it triggers, and every transaction shows which callbacks actually fired on-chain.

### 5.1 Principle

No control is a black box. Wherever the user configures or triggers something, the UI displays:

- **Callback** — which hook entry point runs (`_beforeAddLiquidity`, `_beforeSwap`, `_afterSwap`, `_beforeRemoveLiquidity`).
- **Mechanism** — which module enforces it (Governance, M1 AntiSnipe, M2 BuySellTax, M3 LiquidityLock, M5 WhitelistPhase).
- **Effect** — one-line plain-language description of what the hook does at that point.

### 5.2 Feature → hook mapping (`lib/hook/hookMap.ts`)

A single source-of-truth data table drives all annotations:

| UI feature / control | Hook callback | Mechanism | What the hook does |
|---|---|---|---|
| Submit launch (first mint) | `_beforeAddLiquidity` (bootstrap) | Governance | Decodes `hookData`, captures the first LP NFT as governance NFT (`salt == tokenId`), validates `tx.origin`, init price, stores `EnabledMechanisms` + per-module config |
| Launch duration / phase | `_beforeAddLiquidity` + all setters | Governance | Sets `launchTime`/`launchEndTime`; `onlyGovernance` gating; `launchPhaseOf` Pre/Active/Frozen |
| Anti-snipe window + max buy | `_beforeSwap` | M1 AntiSnipe | Caps per-TX buy size during the window; blocks exact-out buys; sells unrestricted |
| Buy/sell tax + decay | `_beforeSwap` | M2 BuySellTax | Returns a dynamic LP fee (`uint24`) per swap from the linear tax decay; asymmetric buy vs sell |
| Liquidity lock (time/volume) | `_beforeRemoveLiquidity` + `_afterSwap` | M3 LiquidityLock | `_afterSwap` accumulates pair-side volume; `_beforeRemoveLiquidity` blocks gov-NFT exit until unlock (AND/OR) |
| Whitelist phase | `_beforeSwap` + `_beforeAddLiquidity` | M5 WhitelistPhase | Rejects non-whitelisted swaps/adds until `whitelistEndTime`; removes always allowed |
| Gov-NFT burn protection | `_beforeRemoveLiquidity` | Governance | Reverts decrease/burn of the gov NFT during the active phase |
| Tax override (dashboard) | governance setter → affects `_beforeSwap` | M2 BuySellTax | Ratchets the effective fee down for future swaps |
| Relax/disable lock (dashboard) | governance setter → affects `_beforeRemoveLiquidity` | M3 LiquidityLock | Loosens unlock conditions (earlier time / lower volume / OR / disable) |
| Manage whitelist (dashboard) | governance setter → affects `_beforeSwap` | M5 WhitelistPhase | Adds/removes addresses; shortens the gated window |

Each row also carries a short doc string and a link to the relevant `src/mechanisms/*.sol`.

### 5.3 Where it surfaces in the UI

- **Wizard.** Each mechanism sub-form (`Step3Mechanisms`) header shows a `HookBadge` (callback +
  mechanism) and a `HookExplainer` popover. The preset selector lists, per preset, which callbacks
  light up — so picking "Memecoin" visibly means "this enables `_beforeSwap` anti-snipe + tax and
  `_beforeRemoveLiquidity` lock".
- **Review (`Step4Review`).** A "Hook plan" summary: given the chosen config, list every callback
  that will run on this pool and what it will enforce — derived from `enabled` flags via `hookMap`.
- **Post-launch (`Step5Sign` / `TxToast`).** `HookCallTrace` parses the receipt's logs
  (`CampaignBootstrapped`, `*Initialized` events) and shows "the hook fired `_beforeAddLiquidity` →
  Governance bootstrap; captured NFT #1247; initialized M1/M2/M3" — proof the hook ran.
- **Governance dashboard.** `HookActivityPanel` reads the hook's view functions live
  (`launchPhaseOf`, `effectiveBuyTaxOf`/`effectiveSellTaxOf`, `cumulativeVolumeOf`, `isUnlocked`,
  `isAddressWhitelisted`) and renders, per mechanism, "current on-chain state + which callback
  produced it". Each governance action is badged with the callback it will influence.

### 5.4 Components

- `HookBadge` — compact chip `[_beforeSwap · M2 Tax]`; color-coded per callback.
- `HookExplainer` — popover with the plain-language effect + a `src/mechanisms/*.sol` link.
- `HookCallTrace` — receipt-driven, lists fired callbacks + decoded events after a TX.
- `HookActivityPanel` — dashboard widget, live view-function reads mapped back to callbacks.

A global **"Demo mode"** toggle (default on) controls verbosity: on = full badges/explainers/traces
for evaluation; off = a clean production launch UI. The toggle only affects presentation, never the
transaction built.

---

## 6. Web3 UX Best Practices

- **Connect-button states.** Disconnected → "Connect Wallet" (RainbowKit). Connected → truncated
  address + ENS + chain pill. Wrong chain → "Switch network". All onchain actions behind `ConnectGate`.
- **EOA-only banner (critical).** Before the wizard, `getBytecode(connectedAddress)`; if code length
  > 0, show a blocking banner: *"This launch must be sent from an EOA (MetaMask/Rabby).
  Smart-contract wallets are not supported for launch."* Block only the wizard, not governance.
- **Chain-switch guard.** Allow only chains in `[1, 8453, 42161, 130]`; offer `switchChain`; block
  actions until the active chain is supported.
- **Approval/permit stepper.** Explicit steps: (1) Approve Permit2 (if needed) → (2) Sign Permit2
  (gasless signature) → (3) Launch. Never collapse "approve" and "launch" into one ambiguous button.
  For the fresh-token + native-ETH path, skip steps 1–2 and show "No approval needed".
- **Per-button states.** Every onchain button: `idle / disabled (validation fails) / simulating /
  awaiting-signature / pending / success / error`. Disable in-flight; never allow double-submit.
- **Human units, never wei.** All inputs/outputs in human units (`parseUnits`/`formatUnits` at the
  boundary). Never surface raw wei or raw `uint160` sqrtPrice; show a derived human price and
  "you will seed ~X TOKEN + ~Y ETH".
- **Tax display.** Show tax as a percent. V4 fee units: `100000 = 10% = MAX_TAX`. Convert `uint24`
  ↔ `%` in the UI and validate against MAX.
- **Address UX.** `Address` component = `0x1234…abcd` + copy-to-clipboard + per-chain explorer link.
- **USD context (optional).** Show the ETH seed value in USD via a public price feed; behind a flag,
  never blocking.
- **RPC reliability.** viem transport `fallback([http(PRIMARY), http(PUBLIC_FALLBACK)])` per chain,
  with retry + timeout. Primary = env RPC (or `/api/rpc` proxy); fallback = a public endpoint.
- **Optimistic-but-verified.** Show "submitted" on hash, but only mark "done" after receipt + event
  parse. On a `reverted` receipt, show the decoded reason.
- **Pre-deploy metadata.** Per-route `metadata` (title, description, favicon, `og:image`). Provide
  `public/og-image.png`, a favicon, and a theme color. Set the product title, not "Next App".
- **Refund note.** Tell users the wrapper sweeps unused funds back to them, so over-approving
  `amountMax` is safe.

---

## 7. Client-side Validation (`lib/validation/launchSchema.ts`)

Mirror every contract revert so users never waste gas. (Constants verified against source — see Appendix.)

**Launch (wizard):**

| Rule | Source invariant | Revert prevented |
|---|---|---|
| `initialBuyTax, initialSellTax, baseTax ≤ 100_000` | `MAX_TAX` | `TaxExceedsMax` |
| `baseTax ≤ initialBuyTax` AND `baseTax ≤ initialSellTax` | decay floor ≤ start | `InvalidTaxConfig` |
| `manualBuyTax == 0 && manualSellTax == 0` at init | force-set, hidden from UI | `InvalidTaxConfig` |
| `enabled.tax ⇒ fee == 0x800000` | dynamic-fee flag required | `TaxRequiresDynamicFee` |
| `1 day ≤ launchDuration ≤ 365 days` | `MIN/MAX_LAUNCH_DURATION` | `InvalidLaunchDuration` |
| `antiSnipeDuration ≤ 1 day` | `MAX_ANTISNIPE_DURATION` | `InvalidAntiSnipeDuration` |
| if lock enabled: `timeEnabled || volumeEnabled` | at least one condition | `NoConditionsEnabled` |
| if `timeEnabled`: `unlockTime ≥ launchStart + launchDuration` | `unlockTime ≥ launchEndTime` | `UnlockTimeBeforeLaunchEnd` |
| if `volumeEnabled`: `unlockVolumeThreshold > 0` | — | init revert |
| if whitelist enabled: `launchStart < whitelistEndTime ≤ launchEndTime` | window in active phase | `InvalidWhitelistEndTime` |
| exactly one of {deploy-new, existing token}; if existing, validate ERC-20 (`decimals`/`symbol`) | token side | — |
| pair = native ETH (0x0) or a valid ERC-20 ≠ launched token | pool side | — |
| `sqrtPriceInit > 0`, `tickLower < tickUpper`, ticks aligned to `tickSpacing`, `liquidity > 0`, `amountMax ≥ mintAmounts` | v4 mint sanity | mint revert |

> `launchStart` is set at bootstrap (`block.timestamp` of the launch TX). Compute time-based bounds
> against an estimate of now and warn the user the exact value is fixed when the TX lands.

**Governance (dashboard):** tax overrides must **ratchet down** (`new ≤ effective…TaxOf`, and
strictly below any prior override → `CanOnlyLowerTax`); `relaxUnlockTime` strictly **earlier**;
`relaxUnlockVolume` strictly **lower** (and > 0); `relaxWhitelistEndTime` strictly **earlier**;
`disableTimeCondition`/`disableVolumeCondition` only if the other stays enabled
(`MustKeepOneCondition`); `switchToOr` only if currently AND (`AlreadyOr`). All actions require
`launchPhaseOf == 1 (Active)` and connected == owner.

---

## 8. Presets (`Step3Mechanisms.tsx`)

Pre-baked `EnabledMechanisms` combos; selection pre-fills toggles and shows/hides the relevant
config sub-forms. "Custom" exposes all four toggles.

| Preset | antiSnipe | tax | lock | whitelist |
|---|:--:|:--:|:--:|:--:|
| **Memecoin** | ✅ | ✅ | ✅ | — |
| **Fair Launch** | ✅ | ✅ | ✅ | — |
| **RWA / Permissioned** | — | — | ✅ | ✅ |
| **DAO Token** | — | ✅ | ✅ | — |
| **Custom** | toggle | toggle | toggle | toggle |

---

## 9. Vercel Deployment

- **Root Directory = `web/`** (Foundry repo is at the repo root; only `web/` is the Next app).
- **Build:** default `next build`, with `"prebuild": "tsx scripts/gen-contracts.ts"` for address
  codegen. Because ABIs are committed under `web/lib/config/abi/`, the build needs **no Foundry**.
- **Env vars:**
  - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — required by RainbowKit (even for injected-only).
  - `NEXT_PUBLIC_RPC_URL_1 / _8453 / _42161 / _130` — primary RPCs (public on client), **or** omit
    these and route through `/app/api/rpc` with server-only `RPC_URL_*` to keep keys private.
  - Public fallback RPCs hardcoded in `chains.ts` for the viem `fallback` transport.
- **Preview vs Prod:** preview deploys per PR/branch; production on the default branch. Same env set,
  different values if needed.
- **Security:** **no private keys anywhere** — all signing is client-side in the user's wallet. The
  server holds at most read-only RPC URLs. Never log signatures or addresses server-side.

---

## 10. Phased Implementation Roadmap

1. **Scaffold** — `web/` Next App Router + TS + Tailwind; `providers.tsx`, `chains.ts` (4 chains +
   fallback transports), landing page, global metadata, favicon/OG. Connect button working; EOA
   `getBytecode` check stubbed.
2. **Config & ABI gen** — commit trimmed ABIs; write `scripts/gen-contracts.ts`
   (broadcast JSON → `contracts.generated.ts`); hardcode `uniswap.ts` + Permit2; wire `"prebuild"`.
3. **Launch wizard core** — Steps 1–4. Implement `priceMath.ts` and `buildParams.ts`; the
   `launchSchema.ts` rules; Step 4 runs `simulateContract` and shows the decoded result. Happy path
   = fresh token + native ETH (empty `permitData`, single TX).
4. **Hook Transparency Layer (demo)** — `lib/hook/hookMap.ts` + `HookBadge`/`HookExplainer`/
   `HookCallTrace`; wire badges into the wizard mechanism forms + preset selector, the Review "Hook
   plan", and the post-TX trace. Demo-mode toggle. (§5)
5. **Permit2 path** — `permit2.ts` (allowance → nonce → `PermitBatch` sign → encode tuple);
   approve + sign steps in the stepper; wire existing-token / ERC-20-pair launches.
6. **Governance dashboard** — `poolId.ts`, read panels (phase/tax/lock/whitelist), `OwnerGuard`,
   write actions with ratchet-down validation, simulate→write→refetch; `HookActivityPanel` live reads.
7. **Polish & deploy** — button/error/address/amount components, RPC fallback, optional USD context,
   explorer links, metadata/OG, responsive; configure Vercel (root `web/`, env vars); preview → prod.

---

## 11. Out of Scope / Future

- **Trading / swap UI** against the launched pool (use Uniswap's own UI or the v4 swap SDK later).
- **Indexer / subgraph discovery feed** ("browse launches") — needs event indexing (The Graph / Ponder).
  For v1, users keep their own `pid`/links from the launch event.
- **Keeper bot** — any automated post-launch actions are off-chain infra, not frontend.
- **Smart-contract-wallet launch support** — blocked by the `tx.origin` anti-sandwich check; would
  require contract changes.
- **Advanced liquidity shapes / multi-position / multisig-governance UX.**

---

## Appendix A — Contract reference (verified against source)

### `CampaignWrapper.launchCampaign`
```solidity
function launchCampaign(CampaignParams calldata params, bytes calldata permitData)
    external payable nonReentrant
    returns (PoolKey memory key, uint256 governanceTokenId);

event CampaignLaunched(
    PoolId indexed pid, uint256 indexed governanceTokenId,
    address indexed deployer, address lpRecipient, MechanismConfig.LaunchConfig cfg);

// errors: TaxRequiresDynamicFee, CaptureFailed, NFTNotDelivered, NativeRefundFailed
```

### `CampaignParams` (`src/CampaignWrapper.sol:46`)
| Field | Type | Unit | Notes |
|---|---|---|---|
| `existingToken` | address | — | `0x0` → deploy new via factory |
| `tokenConfig` | `TokenDeployConfig` | — | used only if `existingToken == 0x0` |
| `pairToken` | address | — | `0x0` → native ETH |
| `fee` | uint24 | — | `0x800000` (dynamic) **required** if tax enabled |
| `tickSpacing` | int24 | — | pool tick spacing (default 60) |
| `sqrtPriceInit` | uint160 | Q64.96 | initial pool price |
| `tickLower` / `tickUpper` | int24 | — | governance LP range, aligned to `tickSpacing` |
| `liquidity` | uint128 | — | governance LP liquidity |
| `amount0Max` / `amount1Max` | uint128 | wei | settlement caps (residual swept back) |
| `lpRecipient` | address | — | receives the governance NFT |
| `launchConfig` | `LaunchConfig` | — | see below |

### `TokenDeployConfig` (`src/TokenFactory.sol:9`)
`name` (string), `symbol` (string), `totalSupply` (uint256, 18 decimals; minted to wrapper, then seeded/refunded).

### `MechanismConfig.LaunchConfig` (`src/lib/MechanismConfig.sol:23`) — field order matters for ABI tuple
| Field | Type | Unit | Frontend |
|---|---|---|---|
| `deployer` | address | — | leave `0x0` (wrapper injects `msg.sender`) |
| `launchDuration` | uint64 | seconds | `[1 day, 365 days]` |
| `tokenIsCurrency0` | bool | — | leave `false` (wrapper injects) |
| `expectedInitialSqrtPrice` | uint160 | Q64.96 | leave `0` (wrapper injects `= sqrtPriceInit`) |
| `enabled` | `EnabledMechanisms` | — | `{antiSnipe, tax, lock, whitelist}` bools |
| `antiSnipe` | `AntiSnipeConfig` | — | ignored unless `enabled.antiSnipe` |
| `tax` | `BuySellTaxConfig` | — | ignored unless `enabled.tax` |
| `lock` | `LiquidityLockConfig` | — | ignored unless `enabled.lock` |
| `whitelist` | `WhitelistPhaseConfig` | — | ignored unless `enabled.whitelist` |

### Module configs
**`AntiSnipeConfig`** (`AntiSnipeMechanism.sol:15`) — `antiSnipeDuration` (uint32 sec, 0 = disabled, **MAX 1 day**), `maxBuyAmountIn` (uint128 pair-wei, 0 = ban all buys).

**`BuySellTaxConfig`** (`BuySellTaxMechanism.sol:18`) — `initialBuyTax`, `initialSellTax`, `baseTax` (uint24, V4 fee units, **MAX_TAX = 100_000 = 10%**, `base ≤ initial`), `decayDuration` (uint32 sec, 0 = instant), `manualBuyTax`, `manualSellTax` (uint24, **must be 0 at init**; governance ratchets down). Decay: linear from `initial`→`base` over `decayDuration`.

**`LiquidityLockConfig`** (`LiquidityLockMechanism.sol:24`) — `logic` (enum `UnlockLogic { AND, OR }`), `timeEnabled` (bool), `volumeEnabled` (bool), `unlockTime` (uint64, **≥ launchEndTime**), `unlockVolumeThreshold` (uint128 pair-wei). Applies to the governance NFT only.

**`WhitelistPhaseConfig`** (`WhitelistPhaseMechanism.sol:17`) — `whitelistEndTime` (uint64, **`launchTime < whitelistEndTime ≤ launchEndTime`**).

### `TokenLaunchHook` views / setters (keyed by `PoolId`)
Views: `governanceTokenIdOf`, `governanceOwnerOf`, `launchPhaseOf` (0 Pre / 1 Active / 2 Frozen), `antiSnipeConfigOf`, `taxConfigOf`, `effectiveBuyTaxOf`, `effectiveSellTaxOf`, `lockConfigOf`, `cumulativeVolumeOf`, `isUnlocked`, `whitelistConfigOf`, `isAddressWhitelisted`, public mapping `enabled`.
Setters (`onlyGovernance`, Active phase): `setBuyTaxOverride`, `setSellTaxOverride`, `relaxUnlockTime`, `relaxUnlockVolume`, `disableTimeCondition`, `disableVolumeCondition`, `switchToOr`, `addToWhitelist`, `addManyToWhitelist`, `removeFromWhitelist`, `removeManyFromWhitelist`, `relaxWhitelistEndTime`.

---

## Appendix B — Chains & canonical addresses

Mirror of `script/MineSalt.s.sol` `HookDeployLib.canonical()` (verified against Uniswap v4
deployments, 2026-05-31). Permit2 is the same on every chain.

| Chain | ID | PoolManager | PositionManager |
|---|---|---|---|
| Ethereum Mainnet | 1 | `0x000000000004444c5dc75cB358380D2e3dE08A90` | `0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e` |
| Base | 8453 | `0x498581fF718922c3f8e6A244956aF099B2652b2b` | `0x7C5f5A4bBd8fD63184577525326123B519429bDc` |
| Arbitrum One | 42161 | `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32` | `0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869` |
| Unichain | 130 | `0x1F98400000000000000000000000000000000004` | `0x4529A01c7A0410167c5740C487A8DE60232617bf` |

**Permit2 (all chains):** `0x000000000022D473030F116dDEE9F6B43aC78BA3`

**Deployed (per chain):** `TokenLaunchHook`, `CampaignWrapper`, `TokenFactory` — read from
`broadcast/DeployStack.s.sol/{chainId}/run-latest.json`.
