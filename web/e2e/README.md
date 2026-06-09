# E2E self-test harness — design & porting guide

A reusable pattern for **driving a dapp's real on-chain logic end-to-end from an automated agent**, with
a throwaway key on a testnet, no human in the loop. Two layers, both used here against a Uniswap v4
launch dapp on Unichain Sepolia (1301), but the structure is project-agnostic.

> Why this exists: so an agent (or CI) can *prove* a flow works by actually executing it — deploy a
> token, sign Permit2, send the launch tx, run swaps that trigger the hook — instead of asserting against
> mocks. Layer A exercises the real frontend **libraries**; Layer B exercises the real frontend **UI**.

---

## The two layers

| | Layer A — on-chain via libs | Layer B — headless UI |
|---|---|---|
| Entry | `npm run e2e:autolaunch` / `e2e:mechanisms` (`scripts/e2e-*.ts`) | `npm run e2e:ui` (`e2e/*.spec.ts`) |
| Runtime | Node (esbuild-bundled) | Playwright + headless chromium |
| What it proves | the launch/swap **libraries** + contracts | the **full UI wiring** (wallet → form → sign → send) |
| Wallet | viem account, direct | injected `window.ethereum` shim backed by the same key |
| Speed / reliability | fast, deterministic | slower, but real browser |

Build **A first** (deterministic, isolates contract issues), then **B** (catches UI-only regressions).

---

## Layer A — on-chain via the real frontend libs

A plain Node script that imports the app's own `lib/` functions (the exact code the UI runs) and drives
them against live contracts with a test key.

- **Bundling:** the libs transitively import `@uniswap/v4-sdk` / `permit2-sdk` (CJS). Raw `tsx`/`ts-node`
  chokes on their named exports, so bundle with **esbuild → CJS → node**:
  ```jsonc
  "e2e:autolaunch": "esbuild scripts/e2e-autolaunch.ts --bundle --platform=node --format=cjs \
     --tsconfig=tsconfig.json --outfile=.e2e/out.cjs && set -a && . ./.env.local && set +a && node .e2e/out.cjs"
  ```
  `--tsconfig` makes esbuild honour the `@/` path alias. `set -a && . ./.env.local` sources the key.
- **Shape:** read balance → deploy any prerequisite token → build the call with the real lib
  (`prepareAutoLaunch`, `buildPermitData`, …) → approve/sign → `simulateContract` → `writeContract` →
  wait → parse the result event. Two scripts:
  - **`scripts/e2e-autolaunch.ts`** — a single fresh-ERC20 + ERC-20 auto-launch (one tx, one signature).
  - **`scripts/e2e-mechanisms.ts`** — launches campaigns with **every module ON at the shortest legal
    windows** (~75 s), then drives real swaps + governance to assert each mechanism: whitelist gating
    (`NotWhitelisted`) + post-window opening, anti-snipe cap (`BuyTooLarge`) + expiry, asymmetric
    buy/sell tax via `TaxApplied` events decaying to base, and lock state (AND stays locked; OR unlocks
    once volume accrues). Quoter (`eth_call`, runs `beforeSwap`) for the revert assertions, Universal
    Router for the happy-path swaps. `MECH_CAMPAIGNS` sets how many configs to run. NB: `launchDuration`
    min is **1 day** and the gov-NFT is burn-protected until `launchEndTime`, so a *successful* gov-LP
    withdrawal can't be shown in a short run — assert the lock STATE (`lockUnlocked`) instead.

## Layer B — headless UI with an injected wallet shim

The realization that unblocks this: **a headless browser can sign real EIP-712 / send real txs** if you
inject a `window.ethereum` provider backed by a real key. No extension, no `wagmi` mock.

Three files (`e2e/`):

1. **`shim.ts`** — a real **EIP-1193 + EIP-6963** provider over a viem account. `request()` serves
   `eth_requestAccounts`/`eth_chainId` locally, signs `eth_sendTransaction` / `eth_signTypedData_v4` /
   `personal_sign` with the key, and forwards everything else (reads) to the RPC. Announces itself via
   `eip6963:announceProvider` so `wagmi`'s `injected()` connector discovers it like MetaMask. Exposes
   `window.__installE2EWallet({key, rpc, chainId})`.
2. **`global-setup.ts`** — esbuild-bundles `shim.ts` to a browser **IIFE** (`.e2e/shim.iife.js`).
3. **`launch.spec.ts`** — `context.addInitScript` injects the bundle + an install call (carrying the key)
   **before** app code runs, then drives the real wizard with role/label/placeholder selectors and
   asserts the on-chain result.

`playwright.config.ts`: `webServer: npm run dev`, `globalSetup`, long timeouts (real txs), `workers: 1`,
and it `delete`s any dev-mock env so the app uses `injected()` (the shim).

---

## Gotchas that cost real debugging time (bake these in)

1. **The browser shim must NOT hit a public RPC directly** — public endpoints `403` cross-origin browser
   requests. Route the shim through the app's **same-origin proxy** (`/api/rpc`, fed by a server-only
   `RPC_URL_<id>`), which relays server-side. Node-side (Layer A) has no CORS and can use the RPC直接.
2. **Don't use a load-balancer RPC for sequential txs.** The official `sepolia.unichain.org` is
   load-balanced; its nodes disagree on nonce (`latest=8` while `pending=0`) and lag on state
   propagation — txs revert intermittently as a generic `Error(string)`. Use a **single consistent
   backend** (e.g. `https://unichain-sepolia.drpc.org`) for both layers.
3. **Manage the nonce yourself.** Seed from `getTransactionCount(latest)`, pin it per tx, bump on
   success, and on rejection **parse the authoritative `next nonce N`** out of the node's error and jump
   to it (don't `+1`-crawl — it never catches up to a lagging node).
4. **Run one instance at a time.** Concurrent runs share the test account and race its nonce — the #1
   cause of phantom "Reverted: Error" failures.
5. **wagmi auto-connects the injected shim**, so there may be no "Connect" button — make that step
   conditional and just assert the connected state.
6. **EOA-only gates:** a key with an EIP-7702 delegation (`0xef0100…` code) trips "smart-contract wallet"
   checks. Use a clean EOA (`eth_getCode` → `0x`).
7. **Read flakes:** after a deploy, a follow-up read can hit a node that hasn't seen the contract yet
   ("returned no data 0x"). Poll `getCode` / retry reads.

---

## Accounts & secrets

- Generate throwaway keys with `cast wallet new`. **Testnet only**, never a real/mainnet wallet.
- Keep keys in gitignored `web/.env.local` (perms 600); commit only `.env.local.example`. Two accounts
  (`TEST_PK_1`/`TEST_PK_2`) so whitelist/permission flows can test one allowed + one denied actor.
- `.gitignore`: `/.e2e/`, `/test-results/`, `/playwright-report/`, `.env*.local`.

## Required env (`.env.local`)

```
TEST_PK_1=0x…   TEST_ADDR_1=0x…     # launcher / primary actor
TEST_PK_2=0x…   TEST_ADDR_2=0x…     # second actor (whitelist denied/allowed)
RPC_URL_1301=https://unichain-sepolia.drpc.org   # single consistent backend; feeds the /api/rpc proxy
```

## Porting checklist (to a new project)

1. Add `esbuild` + `@playwright/test` dev-deps; cache the chromium build (`npx playwright install chromium`).
2. Copy `e2e/{shim,env,global-setup}.ts` + `playwright.config.ts`; point `baseURL`/`webServer` at the app.
3. Pick a **single-backend** testnet RPC; wire a same-origin RPC proxy and set `RPC_URL_<id>`.
4. Write Layer-A scripts that import the app's own tx-building libs (esbuild-bundle them).
5. Write Layer-B specs with stable selectors (`getByRole`/`getByLabel`/`getByPlaceholder`); add `data-testid`s only if the DOM is ambiguous.
6. Carry over the nonce manager + the gotchas above.
