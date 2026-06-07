# TokenLaunchHook&nbsp;Studio

## Fair token launches, enforced by a Uniswap&nbsp;v4 hook

<p class="subtitle">One hook. Anti-snipe · tax · liquidity lock · whitelist — without touching the ERC-20.</p>

<p class="muted">Hackathon submission · live on Ethereum, Unichain &amp; Unichain Sepolia</p>

Note:
Hi — this is TokenLaunchHook Studio. It makes token launches fair, and it does it as a single Uniswap v4 hook, without changing the token contract. Let me show you the problem first.

---

## Every token launch is a battlefield

- 🤖 **Snipers** grab the first block and dump on everyone
- 🥪 **Sandwich bots** tax every early buyer
- 🪤 **Rug pulls** — the deployer yanks liquidity

Today "fairness" lives in *custom ERC-20 code* — extra surface, extra audits — or it doesn't exist at all.

Note:
Every launch gets sniped, sandwiched, or rugged. And the usual fix is to bake anti-bot logic into the token itself — which means more code to audit and a token that's hard to integrate. We thought: the unfairness happens in the pool, so the rules should live in the pool.

---

## The insight

Move the rules into the **pool**, not the token.

One Uniswap **v4 hook** enforces fair-launch rules for *any* token.

<p class="subtitle">The ERC-20 stays a plain ERC-20. The hook does the work — at the swap, at the mint, at the exit.</p>

Note:
v4 hooks let you run code on every pool action. So we wrote one hook that enforces the launch rules on swaps, liquidity adds, and removals. The token is untouched — you can even bring your own existing ERC-20.

---

## Four launch mechanisms

| Mechanism | What it does | Hook callback |
|---|---|---|
| **Anti-snipe** | caps single buy size during the window | `beforeSwap` |
| **Buy / sell tax** | asymmetric fee, *decays* to a base rate | `beforeSwap` |
| **Liquidity lock** | locks the deployer's LP by time / volume | `beforeRemove` + `afterSwap` |
| **Whitelist phase** | gated trading until a deadline | `beforeSwap` + `beforeAdd` |

<p class="muted">Tax uses v4's <em>dynamic LP fee</em> — caps at 10%, decays linearly. Anti-snipe window ≤ 1 day.</p>

Note:
Four mechanisms, each wired to a specific hook callback. Anti-snipe caps buy size. The tax is a dynamic LP fee — asymmetric buy-versus-sell and it decays to a floor, so it's protective at launch and fades out. Liquidity lock keeps the deployer from rugging, by time and/or by traded volume. And an optional whitelist phase. You pick which ones to enable per launch.

---

## Governance = *own the NFT*

- The **first LP position IS the governance NFT** — `salt == tokenId`
- Mutable params can only be **relaxed** — tax down, lock shorter
- All settings **freeze** when the launch window ends
- **No admin key** — transfer the NFT to a Safe or a DAO

Note:
Who controls a launch? Whoever holds the governance NFT — and that NFT is just the deployer's own liquidity position. There's no owner address, no admin key. And crucially, every change is a one-way ratchet: you can only make things fairer — lower the tax, shorten the lock — never the reverse. After the launch window, it all freezes.

---

## Architecture — 3 contracts, once per chain

- **TokenLaunchHook** — one shared hook; all per-pool state in `mapping(PoolId ⇒ …)`
- **CampaignWrapper** — launches a campaign in **one atomic tx** (`PositionManager.multicall`)
- **TokenFactory** — optional ERC-20 cloner

<p class="subtitle">One <strong>mined CREATE2</strong> hook address — permission flags live in the address bits — serves <em>every</em> launch on the chain. Non-upgradeable.</p>

Note:
Three contracts, deployed once per chain. A single hook — mined to a CREATE2 address that encodes its permission flags — serves every launch. A launch is one atomic transaction: initialize the pool and mint the seed position in a single multicall, with all the module config passed in hookData. Non-upgradeable: a new version is a new deployment, not a proxy.

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

- ✅ **135 passing tests** — unit, fuzz, **mainnet-fork**
- 🚀 Live on **Ethereum**, **Unichain**, **Unichain Sepolia** · studio on Vercel

**Proof, not slides:**

**Atomic launch** — [sepolia.uniscan.xyz · 0x0d02…fab5d ↗](https://sepolia.uniscan.xyz/tx/0x0d026ce58f40be357055c0f997ed87cb6cf82b6ce85d2ad04093be72302fab5d)
<br><span class="muted">one tx — pool init + seed mint + governance NFT captured + mechanisms armed</span>

**Governance** — [sepolia.uniscan.xyz · 0xc9b1…5b94ac ↗](https://sepolia.uniscan.xyz/tx/0xc9b1bcbc160f58705d6361b559aab69982b3110115ba20df03c318dbbc5b94ac)
<br><span class="muted">whitelist update — authorized only by holding the LP-NFT · no admin key</span>

Note:
And this isn't mockups. 135 tests pass — including fuzz tests on the tax-decay math and fork tests against live Uniswap v4. It's live on three chains including Ethereum mainnet. Here are two real, public transactions: the atomic launch — one transaction that initializes the pool, mints the seed liquidity, and captures the governance NFT — and a governance action, authorized purely by holding that NFT. Verify them yourself. Now let me prove it live: tests, then a launch.

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
- Non-upgradeable · live on mainnet · 135 tests green

<p class="muted">github.com/maxsiz/uhi9-token-launch-hook · uhi9-token-launch-hook.vercel.app</p>

Note:
To recap: fairness enforced in the pool, by one Uniswap v4 hook. Four mechanisms, NFT-based governance with no admin key, non-upgradeable, and live on mainnet today. Thanks for watching.
