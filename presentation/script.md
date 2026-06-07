# Narration script — 5-minute hackathon video

**Total target: 5:00.** Read at ~150 wpm. Cues in `[brackets]` are for the editor / screen, not read aloud.
Timecodes are cumulative (when each part should *start*).

---

## ACT 1 — Presentation · ~2:10  `[screen: Reveal deck, fullscreen]`

**[00:00 · Slide 1 — Title]**
Hi. This is **TokenLaunchHook Studio** — it makes token launches fair, and it does it as a single
Uniswap v4 hook, without ever touching the token contract.

**[00:18 · Slide 2 — Problem]**
Every token launch is a battlefield. Snipers grab the first block and dump on everyone. Sandwich bots
tax every early buyer. And too often the team just pulls the liquidity. Today the only fix is to bake
anti-bot logic into the ERC-20 itself — more code, more audits — or you get nothing.

**[00:42 · Slide 3 — Insight]**
Our insight: the unfairness happens in the *pool*, so the rules should live in the pool. With one
Uniswap **v4 hook**, we enforce fair-launch rules for *any* token. The ERC-20 stays a plain ERC-20.

**[01:00 · Slide 4 — Four mechanisms]**
The hook ships four mechanisms, each wired to a specific callback. **Anti-snipe** caps the buy size
during the launch window. A **buy / sell tax** — implemented as Uniswap's dynamic LP fee — is
asymmetric and *decays* to a floor, so it protects at launch and then fades. A **liquidity lock** stops
the deployer from rugging, by time and by traded volume. And an optional **whitelist phase**. You enable
whichever you want, per launch.

**[01:30 · Slide 5 — Governance]**
Who controls a launch? Whoever holds the **governance NFT** — and that NFT is simply the deployer's own
liquidity position. No owner address, no admin key. Every change is a one-way ratchet: you can only make
it *fairer* — lower the tax, shorten the lock — never the reverse. When the launch window ends,
everything freezes.

**[01:52 · Slides 6–7 — Architecture & Transparency]**
Under the hood: three small contracts, deployed once per chain. One mined hook address serves every
launch, and a launch is a single atomic transaction. And it's transparent — the studio badges every
action with the exact hook callback it triggers, and traces what the hook did after each transaction.

**[02:08 · Slide 8 — Status & on-chain proof]**
And this is real. It's live on three chains, including Ethereum mainnet. These two links are actual
public transactions: the atomic launch — pool, liquidity, and governance NFT in *one* tx — and a
governance action authorized only by holding that NFT. Verify them yourself.

---

## ACT 2 — Green tests · ~0:45  `[switch to terminal]`

**[02:20 · Slide 8 → terminal]**
But does it hold up? `[run: forge test -vvv]`

**[02:18]**
This is the full suite — **135 tests, all green.** Unit tests for each mechanism, **fuzz tests** that
prove the tax-decay math stays within bounds and only ever decreases, and **mainnet-fork tests** that
run against the live Uniswap v4 contracts. `[let the green summary sit on screen for a beat]`

---

## ACT 3 — Live demo · ~1:50  `[switch to browser: uhi9-token-launch-hook.vercel.app]`

**[02:55 · Landing / network selector]**
Here's the live studio. Up top, the network selector — we're deployed on three chains. I'll switch to
**Unichain Sepolia** for the demo. `[pick Unichain Sepolia]`

**[03:08 · /launch]**
Let's launch a token. The wizard deploys a fresh ERC-20 from the factory, pairs it, and sets the price
from the seed amounts. `[fill token + pair + seed]` Now the mechanisms — I'll turn on anti-snipe and the
buy/sell tax. Notice each one shows the **hook callback** it will run. `[enable anti-snipe + tax]` Review
shows the initial price and the exact mint, and we sign — from a plain wallet, because the hook's
anti-sandwich check needs `tx.origin == msg.sender`. `[sign in Rabby]`

**[03:45 · post-launch trace]**
Done — one transaction. And here's the **call trace**: the hook fired `beforeAddLiquidity`, captured the
governance NFT, and armed the mechanisms.

**[04:00 · /governance]**
On the Governance page it discovers my campaign from my wallet's positions. We see the live hook state —
phase, effective tax, lock — read straight from chain. As the NFT holder I can **relax** a parameter —
say, lower the tax. `[lower tax → sign]` One-way only; the hook rejects anything that isn't a relaxation.

**[04:30 · /swap]**
And trading. A normal buy goes through with the current tax applied. `[do a small buy]` But if I try a
buy bigger than the anti-snipe cap — `[enter oversized amount]` — the hook **reverts**, and we decode it:
*buy too large*. The sniper protection is real, on-chain.

---

## CLOSE · ~0:15  `[Slide 11 — recap]`

**[04:45]**
That's TokenLaunchHook Studio: fairness enforced by the pool, not the token. One v4 hook, NFT governance,
no admin key, non-upgradeable — and live on mainnet today. Thanks for watching.

**[05:00 · end]**

---

### Timing cushion
If you're running long, the safest cuts: trim Act 1 slides 6–7 to one sentence (already merged), and in
the demo skip the governance *relax* step — the launch + anti-snipe revert are the money shots.
