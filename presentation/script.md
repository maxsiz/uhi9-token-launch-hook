# Narration script — 5-minute hackathon video

**Total target: 5:00.** Read at ~150 wpm. Cues in `[brackets]` are for the editor / screen, not read aloud.
Timecodes are cumulative (when each part should *start*) — they now leave slack so you're never rushed.
Slide numbers match `slides.md` (11 slides: 8 presentation + terminal + browser + roadmap).

---

## ACT 1 — Presentation · ~2:30  `[screen: Reveal deck, fullscreen]`

**[00:00 · Slide 1 — Title / Studio]**
This is **TokenLaunchHook Studio** — a studio for Uniswap v4 launch hooks. Today, one hook built on it: a
fair-launch hook. The token contract is never touched.

**[00:18 · Slide 2 — The pains]**
Every token launch is a battlefield: snipers grab the first block, sandwich bots tax early buyers, teams
pull liquidity, nobody gets fair access. The usual fix bakes logic into the ERC-20 — more code, more
audits. But these pains happen in the *pool*, so the fix belongs there.

**[00:42 · Slide 3 — Insight]**
v4 hooks run code on every pool action. So one hook enforces the rules on swaps, adds, and removals — the
ERC-20 stays plain, bring your own.

**[00:58 · Slide 4 — Four mechanisms]**
Four mechanisms, each on a callback: **anti-snipe** caps buy size; a decaying **buy/sell tax** via the
dynamic LP fee; a **liquidity lock** by time or volume; an optional **whitelist**. Enable any subset.

**[01:26 · Slide 5 — Governance]**
Control is the **governance NFT** — just the deployer's own LP position, no admin key. Changes are a
one-way ratchet: only *fairer* — lower tax, shorter lock. When the window ends, mechanisms switch off and
the pool trades normally.

**[01:48 · Slide 6 — Architecture]**
Four contracts, deployed once per chain. A launch is one **atomic multicall** — optional EIP-1167 token
clone, pool init, seed mint — with all config passed in hookData.

**[02:04 · Slide 7 — Not just a launcher]**
And the front end isn't just a launcher — it's a live demo of the hook: every control is badged with the
v4 callback it fires, so you watch the mechanisms run, not just trust them.

**[02:18 · Slide 8 — Status & on-chain proof]**
And it's real: **147 tests** — fuzz and mainnet-fork — plus a headless self-test that drives a real launch
and swaps on-chain. Live on three chains. Two public txs to verify: an **all-modules launch** and a
governance action.

---

## ACT 2 — Green tests · ~0:40  `[switch to terminal]`

**[02:35 · Slide 9 → terminal]**
But does it hold up? `[run: forge test -vvv]`

**[02:40]**
The full suite — **147 tests, all green**: unit, fuzz on the tax-decay math, and mainnet-fork against live
Uniswap v4. `[let the green summary sit for a beat]`

---

## ACT 3 — Live demo · ~1:35  `[switch to browser: uhi9-token-launch-hook.vercel.app]`

**[03:20 · Slide 10 → landing / network selector]**
The live studio. Network selector up top — I'll switch to **Unichain Sepolia**. `[pick Unichain Sepolia]`

**[03:30 · /launch]**
Launch a token: the wizard deploys a fresh ERC-20, pairs it, prices it from the seeds. Turn on anti-snipe
and the tax — each shows its **hook callback**. `[enable anti-snipe + tax]` Review, then sign from a plain
wallet — the hook needs `tx.origin == msg.sender`. `[sign in Rabby]`

**[03:55 · post-launch trace]**
Done — one tx. The **call trace**: the hook fired `beforeAddLiquidity`, captured the gov NFT, armed the
mechanisms.

**[04:07 · /governance]**
Governance discovers my campaign from my wallet — live hook state from chain. As NFT holder I **relax** a
param — lower the tax. `[lower tax → sign]` One-way only; the hook rejects anything else.

**[04:25 · /swap]**
And trading: a normal buy applies the current tax. `[small buy]` A buy over the anti-snipe cap —
`[oversized amount]` — the hook **reverts**, *buy too large*. Real, on-chain.

---

## CLOSE · ~0:15  `[Slide 11 — roadmap]`

**[04:50 · Slide 11 — roadmap]**
That's TokenLaunchHook Studio — fairness in the pool, not the token. Next: a richer UI, more hooks, and an
opt-in **protocol fee** from campaign revenue. Thanks for watching.

**[05:05 · end]**

---

### Timing cushion
The narration is intentionally short — let pauses breathe. If you're still long, skip the governance
*relax* step; the launch plus the anti-snipe revert are the money shots. If short, let the green
`forge test` summary and the post-launch call trace linger.
