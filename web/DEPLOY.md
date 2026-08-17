# Deploying the frontend

Two independent targets:

| Target | URL | How | Built by |
| --- | --- | --- | --- |
| **stage** | `<project>.vercel.app` | Vercel, auto-deploy on push to `master` | Vercel |
| **prod** | `https://unilaunch.envelop.is` | Node standalone container behind Traefik on `88.99.35.38` | GitHub Actions (`.github/workflows/deploy-prod.yml`) |

The app deliberately does **not** live under `fundoria.envelop.is`. That domain is not ours: it is
GitLab Pages serving the `envelop/design-and-layout/ido-aggregator` landing, owned by another team,
whose `pages` job rewrites the site root on every push to their `main`. Putting our production app on
a sub-path of it would have meant an origin we do not control, a Cloudflare Origin Rule plus an SNI
override, and a `basePath` through the whole codebase — four coupled moving parts, any of which the
other team could break without knowing we existed. Hence our own subdomain and a plain
DNS → Traefik → container path. `fundoria.envelop.is/unilaunch` is a 404 and is expected to stay one.

---

# stage (Vercel)

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
- **`NEXT_OUTPUT_STANDALONE`** — **do not set it on Vercel.** It switches `next.config.mjs` to
  `output: "standalone"`, which is what the self-hosted prod container needs and what Vercel's own
  build pipeline does not expect. Unset, the Vercel build is byte-for-byte what it was before this
  variable existed.

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

---

# prod (unilaunch.envelop.is)

Self-hosted. A static export is impossible here: `app/swap/[chainId]/[pid]/page.tsx` is a dynamic
segment with no `generateStaticParams` (chain/pool ids are runtime input), and `app/api/rpc/route.ts`
is a `POST` route handler. So prod runs the app as a **Node server** — Next's `standalone` output —
in a container behind the shared Traefik on `88.99.35.38`, the same pattern as `unisafe.envelop.is`.

## Moving parts

| Where | What |
| --- | --- |
| `web/next.config.mjs` | `output: "standalone"` when `NEXT_OUTPUT_STANDALONE=1`; otherwise untouched (see the Vercel warning above) |
| `.github/workflows/deploy-prod.yml` | build on a GitHub runner, `rsync` the bundle to the host over SSH, swap the `current` symlink, recreate the container, wait for `healthy` |
| `deploy/prod/docker-compose.yaml` | the host compose file (`node:20-alpine`, `node server.js`, Traefik labels, healthcheck) |
| `deploy/prod/env.example` | template for the host-local `.env` (`RPC_URL_*`) |

Host layout, `/home/devops/unilaunch/`:

```
docker-compose.yaml
.env                      # mode 600, host-local, never in git or in the build
current -> releases/<id>  # symlink, swapped by the deploy job
releases/<id>/            # server.js, .next/, public/, node_modules/
```

Nothing is built on the host: the prod box has 2 vCPU and `next build` there would compete with the
other production containers.

## Repository secrets and variables (GitHub)

Secrets (`Settings → Secrets and variables → Actions → Secrets`):

| Secret | Value |
| --- | --- |
| `PROD_SSH_HOST` | `88.99.35.38` |
| `PROD_SSH_USER` | `devops` |
| `PROD_SSH_KEY` | private half of a deploy keypair whose public half is in `~devops/.ssh/authorized_keys` on the host |
| `PROD_SSH_KNOWN_HOSTS` | output of `ssh-keyscan 88.99.35.38` — pins the host key, so the job never trusts on first use |

Variables (optional, have defaults): `PROD_DEPLOY_PATH` (`/home/devops/unilaunch`),
`NEXT_PUBLIC_SITE_URL` (`https://unilaunch.envelop.is`).

RPC keys are **not** GitHub secrets — they live only in the host `.env`, because `/api/rpc` reads
them at request time, not at build time.

### Which chains the proxy serves

`/home/devops/unilaunch/.env` on the host fills `RPC_URL_1301`, `RPC_URL_130` and `RPC_URL_1` —
the three chains this project has contracts on. `RPC_URL_8453` and `RPC_URL_42161` are left unset on
purpose: `/api/rpc` answers `501` for them and the client falls back to its public endpoint, which is
the correct behaviour for a chain we do not deploy to.

Those endpoints are **shared with `unisafe_prod`** on the same box, which is where they came from.
1301 and 130 are QuickNode, and QuickNode meters per endpoint rather than per application, so a
traffic spike on either app spends the other's quota. That is fine at today's volume and worth
remembering the day it is not: if either app starts seeing `429`s, split the endpoints before
looking for a bug in the app. `RPC_URL_1` points at `rpc.envelop.is`, our own node, so it has no
third-party quota at all.

## Deploying

Automatic on push to `master` touching `web/**` or `broadcast/**` (markdown-only changes do not
trigger a build). Manual: **Actions → Deploy prod → Run workflow**.

By hand, if Actions is unavailable:

```bash
cd web
npm ci
NEXT_OUTPUT_STANDALONE=1 npm run build
rm -rf ../.release && mkdir -p ../.release
cp -r .next/standalone/. ../.release/
mkdir -p ../.release/.next/static && cp -r .next/static/. ../.release/.next/static/
cp -r public ../.release/public

REL="manual-$(date -u +%Y%m%d%H%M%S)"
rsync -az ../.release/ devops@88.99.35.38:/home/devops/unilaunch/releases/$REL/
ssh devops@88.99.35.38 "cd /home/devops/unilaunch \
  && ln -sfn /home/devops/unilaunch/releases/$REL current.new \
  && mv -T current.new current \
  && docker compose up -d --force-recreate"
```

`.next/static` and `public/` are copied explicitly on purpose — Next deliberately leaves them out of
the standalone tree, and forgetting them yields a page that renders with no CSS and no assets.

## Rolling back

Releases are kept (five most recent). Repoint the symlink at the previous one:

```bash
ssh devops@88.99.35.38 '
  cd /home/devops/unilaunch
  ls -1dt releases/*/            # newest first; current -> $(readlink current)
  ln -sfn /home/devops/unilaunch/releases/<previous-id> current.new
  mv -T current.new current
  docker compose up -d --force-recreate
'
```

`--force-recreate` is not optional: the bind mount source is the symlink, and dockerd resolves it
when the container is created — a plain `docker compose restart` would keep serving the old release.

## Verifying prod

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://unilaunch.envelop.is/                 # 200
curl -sS -o /dev/null -w '%{http_code}\n' https://unilaunch.envelop.is/launch           # 200
curl -sS https://unilaunch.envelop.is/ | grep -o '/_next/static/[^"]*\.js' | head -1    # asset path
curl -sS -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
  'https://unilaunch.envelop.is/api/rpc?chainId=1301'                                   # 200 with a key, 501 without
ssh devops@88.99.35.38 'docker inspect -f "{{.State.Status}} {{.State.Health.Status}}" unilaunch_prod'
```

Then run the functional checklist from the stage section against the prod URL.
