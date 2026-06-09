# TokenLaunchHook&nbsp;Studio

## A studio for Uniswap&nbsp;v4 launch hooks

<img class="diagram compact" src="diagrams/studio.svg" alt="Studio is a hook platform: TokenLaunchHook is one shipped example with pluggable mechanisms; more hooks can plug in" />

<p class="muted"><span class="pink">This is one example hook</span> · live on Ethereum · Unichain · Unichain Sepolia</p>

Note:
Hi — this is TokenLaunchHook Studio. Think of it as a studio for launch hooks: the framework is a single shared v4 hook plus pluggable mechanisms, and what you'll see today is *one* hook — a fair-launch hook — built on it as the example. Other hooks and other mechanisms can plug into the same studio. And it does all this as a Uniswap v4 hook, without ever changing the token contract. Let me show you the problem it solves first.

---

## A fix for the pains every campaign hits

<img class="diagram wide" src="diagrams/pains.svg" alt="Snipers, sandwich bots, rug pulls and unfair access all happen in the pool; one v4 hook answers each with a cap on buy size, a decaying tax, a liquidity lock and a whitelist phase" />

Note:
Every launch is a battlefield. Snipers grab the first block and dump on everyone. Sandwich bots tax every early buyer. Teams pull the liquidity. And nobody gets fair access — it's a free-for-all. These are the real pains of running a campaign, and this hook is built to answer each one — directly. The usual alternative is to bake anti-bot logic into the ERC-20 itself, which means more code to audit and a token that's hard to integrate. Our point: every one of these pains happens in the pool, so the fix should live in the pool — not in the token.

---

## The insight — rules in the *pool*, not the token

<img class="diagram" src="diagrams/pool-vs-token.svg" alt="A plain untouched ERC-20 is listed in a v4 pool whose TokenLaunchHook runs on every swap, add and remove, enforcing anti-snipe, tax, lock and whitelist" />

<p class="caption">The ERC-20 stays a plain ERC-20 — bring your own. The hook does the work at the swap, the mint, the exit.</p>

Note:
v4 hooks let you run code on every pool action. So we wrote one hook that enforces the launch rules on swaps, liquidity adds, and removals. The token is untouched — you can even bring your own existing ERC-20.

---

## Four mechanisms, wired to hook callbacks

<img class="diagram wide" src="diagrams/lifecycle.svg" alt="Each pool callback maps to mechanisms: beforeSwap runs anti-snipe, tax and whitelist; beforeAddLiquidity bootstraps and gates; afterSwap tracks volume; beforeRemoveLiquidity enforces the lock" />

<p class="muted">Tax uses v4's <em>dynamic LP fee</em> — caps at 10%, decays linearly. Anti-snipe window ≤ 1 day. Enable any subset, per launch.</p>

Note:
Four mechanisms, each wired to a specific hook callback. Anti-snipe caps buy size. The tax is a dynamic LP fee — asymmetric buy-versus-sell and it decays to a floor, so it's protective at launch and fades out. Liquidity lock keeps the deployer from rugging, by time and/or by traded volume. And an optional whitelist phase. You pick which ones to enable per launch.

---

## Governance = *own the NFT*

<img class="diagram tall" src="diagrams/governance.svg" alt="The first LP position is the governance NFT; the holder can only relax params (hook accepts) while tightening reverts with CanOnlyRelax; the NFT can be transferred to a Safe or DAO; all params freeze when the launch window ends" />

<p class="caption">First LP position = the governance NFT (<code>salt == tokenId</code>). No admin key — transfer it to a Safe or DAO.</p>

Note:
Who controls a launch? Whoever holds the governance NFT — and that NFT is just the deployer's own liquidity position. There's no owner address, no admin key. And crucially, every change is a one-way ratchet: you can only make things fairer — lower the tax, shorten the lock — never the reverse. After the launch window, it all freezes.

---

## Architecture — one atomic launch

<img class="diagram wide" src="diagrams/architecture.svg" alt="Sequence: deployer calls CampaignWrapper.launchCampaign, which optionally deploys an ERC-20 via TokenFactory, then PositionManager.multicall initializes the pool and mints; the first mint triggers the hook's beforeAddLiquidity which captures the governance NFT and arms mechanisms; the LP position returns to the deployer as the governance NFT" />

<p class="caption"><strong>TokenLaunchHook</strong> (one shared, mined-CREATE2 hook · per-pool state in <code>mapping(PoolId⇒…)</code>) · <strong>CampaignWrapper</strong> (atomic launch) · <strong>TokenFactory</strong> (optional cloner). Deployed once per chain, non-upgradeable.</p>

Note:
Three contracts, deployed once per chain. A single hook — mined to a CREATE2 address that encodes its permission flags — serves every launch. A launch is one atomic transaction: initialize the pool and mint the seed position in a single multicall, with all the module config passed in hookData. Non-upgradeable: a new version is a new deployment, not a proxy.

---

## Talking to wallets — *injected only*

<img class="diagram wide" src="diagrams/wallet-flow.svg" alt="Sequence: user clicks Launch; the studio asks wagmi to signTypedData (Permit2), which calls eth_signTypedData_v4 on the injected window.ethereum provider, the wallet prompts to sign and returns a gasless signature; then writeContract calls eth_sendTransaction, the wallet prompts to confirm and returns a tx hash; the private key never leaves the wallet" />

<p class="caption"><strong>wagmi + viem</strong> · <code>injected()</code> only (MetaMask / Rabby via <strong>EIP-6963</strong>) — no WalletConnect, no projectId. The key never leaves the wallet; the app only sends EIP-1193 requests.</p>

Note:
How does the studio talk to a wallet? Only through an injected provider — the window.ethereum object a browser extension like MetaMask or Rabby puts on the page, discovered via EIP-6963. No WalletConnect, no projectId. A launch is two wallet interactions: wagmi asks the provider to sign the Permit2 batch — a gasless EIP-712 signature — then to send the launch transaction. The private key never leaves the wallet; we only ever send EIP-1193 requests. The same shape is what our headless self-test injects to drive launches without an extension.

---

## Reads via RPC · writes via the wallet

<img class="diagram" src="diagrams/reads-vs-writes.svg" alt="The studio splits traffic: reads (balances, quotes, view calls) go through our RPC transports — same-origin /api/rpc proxy, then env RPC, then public fallback — to the chain; writes and signatures go through the injected wallet via eth_sendTransaction and eth_signTypedData_v4" />

<p class="caption">Reads go through our own RPC transports (<code>/api/rpc</code> proxy → env → public fallback); only <strong>signatures &amp; transactions</strong> go through the wallet — so the UI works even before you connect.</p>

Note:
One deliberate split: reads and writes take different paths. Every read — balances, quotes, view calls — goes through our own RPC transports: a same-origin proxy first, then an env RPC, then a public fallback. That means stable reads, no CORS, and a UI that works even before a wallet is connected. Only the things that actually need a key — signatures and transactions — go through the injected wallet. It keeps the app fast and the trust boundary clear.

---

## It's transparent by design

The studio shows **which hook callback fires** for every action.

- `HookBadge` on every control · `HookExplainer` popovers
- `HookCallTrace` — after a tx, *what the hook actually did*
- `HookActivityPanel` — live on-chain hook state

<p class="muted">It's not just an app — it's a legible, runnable demo of the hook.</p>

Note:
One more thing we cared about: legibility. Every button in the app is badged with the hook callback it triggers, and after each transaction we trace exactly what the hook did. So you can see the mechanism, not just trust it.

---

## Status — and it's all on-chain

- ✅ **147 passing tests** — unit · fuzz · **mainnet-fork**
- 🧩 **4 core contracts** (hook · wrapper · factory · **lens**) **+ 5 modules**
- 🤖 **Headless self-test** — real launch + swaps from a *headless browser*, every mechanism on-chain
- 🚀 Live on **Ethereum · Unichain · Unichain Sepolia** · studio on Vercel

**All-modules launch** — [0xf96a…4778 ↗](https://sepolia.uniscan.xyz/tx/0xf96af502a01754c02caee0ab22ebc1613e65bda6a890c688e9d59dc579324778) <span class="muted">· <strong>22 events</strong>: pool + seed mint + gov-NFT + all modules armed</span>

**Governance** — [0x760c…85c9b ↗](https://sepolia.uniscan.xyz/tx/0x760cc14b1dda04e69028cdbf28155329b3ef6ceadb916a4b4d0ed8c5fc985c9b) <span class="muted">· whitelist update · NFT-only, no admin key</span>

Note:
And this isn't mockups. 147 tests pass — including fuzz tests on the tax-decay math and fork tests against live Uniswap v4. Four core contracts plus five mechanism modules, and a headless self-test that drives a real launch and swaps from a headless browser through an injected wallet, asserting every mechanism on-chain. It's live on three chains including Ethereum mainnet. Here are two real, public transactions: an all-modules launch — one transaction that initializes the pool, mints the seed liquidity, captures the governance NFT, and arms every mechanism, twenty-two events in one tx — and a governance action authorized purely by holding that NFT. Verify them yourself. Now let me prove it live: tests, then a launch.

---

# ② Green tests

<p class="divider">▶</p>

<p class="subtitle">forge test -vvv</p>

Note:
[switch to terminal]

---

# ③ Live demo

<p class="divider">▶</p>

<p class="subtitle">launch → govern → trade</p>

Note:
[switch to browser]

---

## TokenLaunchHook Studio

**Fair launches, enforced by the pool — not the token.**

- One v4 hook · 4 mechanisms · NFT governance · no admin key
- Non-upgradeable · live on mainnet · 147 tests green

<p class="muted">github.com/maxsiz/uhi9-token-launch-hook · uhi9-token-launch-hook.vercel.app</p>

Note:
To recap: fairness enforced in the pool, by one Uniswap v4 hook. Four mechanisms, NFT-based governance with no admin key, non-upgradeable, and live on mainnet today. Thanks for watching.
