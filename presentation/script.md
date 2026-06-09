# Narration script — 5-minute hackathon video

**Total target: 5:00.** Read at ~150 wpm. Cues in `[brackets]` are for the editor / screen, not read aloud.
Timecodes are cumulative (when each part should *start*). Slide numbers match `slides.md` (11 slides:
8 presentation + terminal + browser + roadmap).

---

## ACT 1 — Presentation · ~2:30  `[screen: Reveal deck, fullscreen]`

**[00:00 · Slide 1 — Title / Studio]**
Hi. This is **TokenLaunchHook Studio** — think of it as a *studio for Uniswap v4 launch hooks*. The
framework is: one shared hook plus pluggable mechanisms; what you'll see today is **one** hook built on it — a fair-launch hook — as the example. It does not require changes to the token contract.

**[00:18 · Slide 2 — The pains]**
As you remember from past bull run every token launch was a battlefield. Snipers grab the first block and dump on everyone. Sandwich bots tax every early buyer. Teams pull the liquidity. And nobody gets fair access. This hook answers each of those pains directly. The usual alternative was to bake the logic into the ERC-20 itself — more code, more audits — but every one of these pains happens in the *pool*, so the fix should belongs in the pool as well.

**[00:42 · Slide 3 — Insight]**
v4 hooks let you run code on every pool action. So we wrote one hook that enforces the launch rules on
swaps, liquidity adds, and removals. The ERC-20 stays a plain ERC-20 — you can even bring your own.

**[00:58 · Slide 4 — Four mechanisms]**
Four mechanisms, each wired to a specific callback. **Anti-snipe** caps the buy size during the launch
window. A **buy / sell tax** — Uniswap's dynamic LP fee — asymmetric and *decaying* to a floor, so it
protects at launch then fades. A **liquidity lock** stops the rug, by time and/or by traded volume. And
an optional **whitelist phase**. You enable whichever you want, per launch.

**[01:26 · Slide 5 — Governance]**
Who controls a launch? Whoever holds the **governance NFT** — which is just the deployer's own liquidity position. No owner address, no admin key. Every change is a one-way ratchet: you can only make it *fairer* — lower the tax, shorten the lock — never the reverse. When the launch window ends, all mechanisms are disabled and the pool continues to operate in normal swap mode.

**[01:48 · Slide 6 — Architecture]**
Under the hood: Four contracts, deployed once per chain. Every launch is a single **atomic transaction** multicall — optional ERC20 deployment (cheap EIP-1167 clone), pool init plus the seed mint, with all the module config passed in hookData..

**[02:04 · Slide 7 — Not just a launcher]**
And the front end isn't only a launcher — it's a runnable demo of the hook. Every control during the launch is badged with
v4-hook callback it fires. So you can see which mechanisms addressed by exact V4 hook call actions.

**[02:18 · Slide 8 — Status & on-chain proof]**
Rirht now: **147 tests pass** — fuzz tests on the tax-decay math, fork tests against the live
Uniswap v4 contracts — four core contracts plus five mechanism modules, and a **headless self-test** that
drives a real launch and swaps from a headless browser through an injected wallet, asserting every
mechanism on-chain. It's live on three chains including Ethereum mainnet. Two public transactions to
verify: an **all-modules launch** — twenty-two events in one tx — and a governance action authorized only
by holding the NFT.

---

## ACT 2 — Green tests · ~0:40  `[switch to terminal]`

**[02:35 · Slide 9 → terminal]**
But does it hold up? `[run: forge test -vvv]`

**[02:40]**
This is the full suite — **147 tests, all green.** Unit tests for each mechanism, **fuzz tests** that
prove the tax-decay math stays within bounds and only ever decreases, and **mainnet-fork tests** that run
against the live Uniswap v4 contracts. `[let the green summary sit on screen for a beat]`

---

## ACT 3 — Live demo · ~1:35  `[switch to browser: uhi9-token-launch-hook.vercel.app]`

**[03:20 · Slide 10 → landing / network selector]**
Here's the live studio. Up top, the network selector — we're on three chains. I'll switch to **Unichain
Sepolia** for the demo. `[pick Unichain Sepolia]`

**[03:30 · /launch]**
Let's launch a token. The wizard deploys a fresh ERC-20 from the factory, pairs it, and sets the price
from the seed amounts. `[fill token + pair + seed]` Now the mechanisms — I'll turn on anti-snipe and the
buy/sell tax; each shows the **hook callback** it will run. `[enable anti-snipe + tax]` Review shows the
price and the exact mint, and we sign — from a plain wallet, because the hook's anti-sandwich check needs
`tx.origin == msg.sender`. `[sign in Rabby]`

**[03:55 · post-launch trace]**
Done — one transaction. And here's the **call trace**: the hook fired `beforeAddLiquidity`, captured the
governance NFT, and armed the mechanisms.

**[04:07 · /governance]**
On the Governance page it discovers my campaign from my wallet's positions — live hook state read
straight from chain. As the NFT holder I can **relax** a parameter — lower the tax. `[lower tax → sign]`
One-way only; the hook rejects anything that isn't a relaxation.

**[04:25 · /swap]**
And trading. A normal buy goes through with the current tax applied. `[do a small buy]` But a buy bigger
than the anti-snipe cap — `[enter oversized amount]` — the hook **reverts**, decoded as *buy too large*.
The sniper protection is real, on-chain.

---

## CLOSE · ~0:15  `[Slide 11 — roadmap]`

**[04:50 · Slide 11 — roadmap]**
That's TokenLaunchHook Studio — fairness in the pool, not the token. And it's a studio, so here's where it
goes: a richer UI, more hooks — vesting, LBPs, lockers — and an opt-in **protocol fee** taken from
campaign revenue to sustain it. Thanks for watching.

**[05:05 · end]**

---

### Timing cushion
If you're running long, the safest cuts: trim Act 1 slide 7 (the "not just a launcher" / demo slide) to
one sentence, and in the demo skip the governance *relax* step — the launch plus the anti-snipe revert are
the money shots. If you're short, let the green `forge test` summary and the post-launch call trace linger.
