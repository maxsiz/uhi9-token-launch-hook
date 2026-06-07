# Deploying the frontend to Vercel

The web app lives in the `web/` subdirectory of the monorepo. Deploy it as a Next.js project with
**Root Directory = `web`**. Wallets are injected-only (MetaMask / Rabby) — no WalletConnect, so no
`projectId` is ever needed.

## One-time setup (Vercel dashboard)

1. **Add New → Project → Import** `github.com/maxsiz/uhi9-token-launch-hook`.
2. **Root Directory:** `web` (click *Edit* next to Root Directory and pick `web`). This is required —
   the repo is a monorepo and the app is not at the root.
3. **Framework Preset:** Next.js (auto-detected). Leave Build Command (`next build`) and Install
   Command (`npm install`) at defaults. **Node.js Version:** 20.x (or ≥ 18.17).
4. Add the environment variables below (all optional — the app runs without any of them).
5. **Deploy.** After this, every push to `master` triggers a production deploy automatically.

## Environment variables

Set these under **Project → Settings → Environment Variables** (Production, and Preview if you want
preview deploys configured too). All are optional.

| Variable | Example | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://<project>.vercel.app` | OpenGraph / metadata base (`app/layout.tsx`). Can be set after the first deploy once you know the URL. |
| `RPC_URL_1301` | your QuickNode/Alchemy **Unichain Sepolia** URL | Server-only RPC behind `/api/rpc`. `chains.ts` uses this proxy as the *primary* transport for chain 1301; without it the app falls back to the public `https://sepolia.unichain.org` endpoint (works, but may rate-limit). Keeps a paid key off the client. |
| `RPC_URL_1`, `RPC_URL_8453`, `RPC_URL_42161`, `RPC_URL_130` | per-chain paid RPC URLs | Same server-side proxy pattern for the other chains (only Unichain Sepolia has contracts today). |
| `NEXT_PUBLIC_RPC_URL_*` | per-chain public RPC URLs | Client-side RPC override if you'd rather not proxy. Public (visible in the bundle). |

### ⚠️ Do not set in production

- **`NEXT_PUBLIC_DEV_BURNER_ADDRESS`** — dev-only. It swaps real wallets for a wagmi `mock` connector
  bound to that address. Leaving it set in production breaks wallet connection for everyone. Keep it
  unset on Vercel.

There is **no** WalletConnect / `projectId` variable — wallets are injected-only.

## How the build resolves contract addresses

- `npm run build` runs a `prebuild` step (`tsx scripts/gen-contracts.ts`) that reads the committed
  Foundry broadcast JSON at the repo root (`../broadcast/DeployStack.s.sol/<chainId>/run-latest.json`)
  and regenerates `lib/config/contracts.generated.ts`. The `broadcast/` tree is committed, and Vercel
  checks out the whole repo, so the Unichain Sepolia (1301) addresses are populated on every build.
- If the broadcast tree is somehow absent on the build host, the prebuild **keeps the committed
  `contracts.generated.ts` unchanged** instead of zeroing it out — so a deploy never ships with empty
  contract addresses.
- The header version (`v0.1.0`) is read from `package.json` at build time via `next.config.mjs`
  (`env.NEXT_PUBLIC_APP_VERSION`). Bump `package.json` `version` to change it.

## Verifying a deploy

Open the deployed URL and check:

- Header shows the logo + `v<version>` and the network selector (Unichain Sepolia marked **live**).
- `/launch` builds a preview (initial price, ticks, amounts) through the wizard.
- `/governance` discovers a wallet's campaigns on 1301 and loads the CampaignLens summary.
- `/swap/<chainId>/<pid>` returns a quote.
- Connecting prompts a **real** MetaMask / Rabby (confirms the dev burner is not enabled).
